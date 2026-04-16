"""Generates the working plan."""

import json
import os
from datetime import UTC, datetime
from http.server import BaseHTTPRequestHandler
from typing import Any, cast

from dotenv import load_dotenv
from supabase import Client, create_client


def get_supabase_client() -> Client:
    """Initializes and returns a Supabase client."""
    url: str = os.getenv("NEXT_PUBLIC_SUPABASE_URL", "")
    key: str = os.getenv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "")
    if not url or not key:
        msg = "Supabase URL and Key must be set in environment variables"
        raise ValueError(msg)
    return create_client(url, key)


def get_scheduler_settings(supabase: Client) -> dict[str, Any]:
    """Fetches scheduler settings from the Supabase settings table."""
    settings_response = supabase.table("settings").select("*").limit(1).execute()
    if settings_response.data and len(settings_response.data) > 0:
        return cast("dict[str, Any]", settings_response.data[0])
    # Fallback to default if no settings are found (should not happen if seeded)
    return {"cooldown_days": 21}


def generate_assignments(
    members: list[dict[str, Any]], work_dates: list[dict[str, Any]], cooldown_days: int = 21
) -> list[dict[str, Any]]:
    """Generates the shift assignments."""
    # Keep track of shift counts in memory during the process
    for m in members:
        m["current_shifts"] = m.get("historical_shifts", 0)

    assignments: list[dict[str, Any]] = []

    # Map workdate_id to actual date for cooldown calculation
    date_map = {d["id"]: datetime.strptime(d["date"], "%Y-%m-%d").astimezone(UTC) for d in work_dates}

    # PHASE 1: Fill 'Important' shifts with Senior members
    important_dates = [d for d in work_dates if d.get("is_important_shift")]
    for date in important_dates:
        eligible_seniors = [m for m in members if m.get("seniority_level") == "Senior"]
        _assign_members_to_date(date, eligible_seniors, assignments, date_map, cooldown_days)

    # PHASE 2: Fill remaining weekend dates
    weekend_dates = [d for d in work_dates if d.get("is_weekend") and not d.get("is_important_shift")]
    for date in weekend_dates:
        eligible_members = [m for m in members if m.get("availability") in ["Weekends", "Any"]]
        _assign_members_to_date(date, eligible_members, assignments, date_map, cooldown_days)

    # PHASE 3: Fill remaining weekday dates
    remaining_dates = [d for d in work_dates if not d.get("is_weekend") and not d.get("is_important_shift")]
    for date in remaining_dates:
        eligible_members = [m for m in members if m.get("availability") in ["Weekdays", "Any"]]
        _assign_members_to_date(date, eligible_members, assignments, date_map, cooldown_days)

    return assignments


def _assign_members_to_date(
    date: dict[str, Any],
    eligible_pool: list[dict[str, Any]],
    assignments: list[dict[str, Any]],
    date_map: dict[int, datetime],
    cooldown_days: int,
) -> None:
    """Helper to pick members from a pool and update counts."""
    needed = date.get("required_people", 1)
    already_assigned = [a for a in assignments if a["workdate_id"] == date["id"]]
    remaining_needed = max(0, needed - len(already_assigned))

    if remaining_needed <= 0:
        return

    current_date = date_map[date["id"]]

    def is_in_cooldown(member_id: int) -> bool:
        """Check if member has an assignment within the cooldown window."""
        member_assignments = [a for a in assignments if a["member_id"] == member_id]
        for a in member_assignments:
            assigned_date = date_map[a["workdate_id"]]
            if abs((current_date - assigned_date).days) < cooldown_days:
                return True
        return False

    # Filter pool by cooldown
    cooldown_free_pool = [m for m in eligible_pool if not is_in_cooldown(m["id"])]

    # If no one is available without cooldown, we must pick from the full eligible pool
    # to ensure the shift is filled (Soft constraint fallback)
    final_pool = cooldown_free_pool or eligible_pool

    # FAIRNESS RULE: Sort by historical_shifts (Ascending)
    sorted_pool = sorted(final_pool, key=lambda x: x["current_shifts"])
    chosen_members = sorted_pool[:remaining_needed]

    for m in chosen_members:
        assignments.append({"member_id": m["id"], "workdate_id": date["id"], "status": "Draft"})
        m["current_shifts"] += 1


class handler(BaseHTTPRequestHandler):  # noqa: N801
    """Class to handle HTTP requests."""

    def do_POST(self) -> None:
        """Post request handler."""
        try:
            # Load credentials from .env.local
            load_dotenv(".env.local")
            supabase = get_supabase_client()

            # 1. Fetch data from Supabase
            members_response = supabase.table("members").select("*").eq("exempt", False).execute()  # noqa: FBT003
            dates_response = supabase.table("work_dates").select("*").order("date").execute()

            members = cast("list[dict[str, Any]]", members_response.data)
            work_dates = cast("list[dict[str, Any]]", dates_response.data)

            if not members or not work_dates:
                self._send_error(400, "Missing members or work dates in database")
                return

            # 2. Fetch cooldown days from the settings table
            settings = get_scheduler_settings(supabase)
            cooldown_days = settings.get("cooldown_days", 21)  # Default to 21 if not found

            assignments = generate_assignments(members, work_dates, cooldown_days=cooldown_days)

            # Save results to database as 'Draft'
            if assignments:
                supabase.table("assignments").delete().eq("status", "Draft").execute()
                supabase.table("assignments").insert(assignments).execute()

            # Success Response
            self.send_response(200)
            self.send_header("Content-type", "application/json")
            self.end_headers()
            self.wfile.write(json.dumps({"status": "success", "assignments_count": len(assignments)}).encode())

        except Exception as e:  # noqa: BLE001
            self._send_error(500, str(e))

    def _send_error(self, code: int, message: str) -> None:
        self.send_response(code)
        self.send_header("Content-type", "application/json")
        self.end_headers()
        self.wfile.write(json.dumps({"error": message}).encode())
