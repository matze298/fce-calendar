"""Module to send reminder mails for appointments."""

import json
import os
from datetime import UTC, datetime, timedelta
from html import escape
from http.server import BaseHTTPRequestHandler
from pathlib import Path
from secrets import compare_digest
from typing import Any, cast

import resend
from dotenv import load_dotenv
from supabase import Client, create_client

from api.models import Assignment, WorkDate

# Load environment variables
load_dotenv(".env.local")


def _get_supabase_client() -> Client:
    """Initializes and returns a Supabase client."""
    url: str = os.getenv("NEXT_PUBLIC_SUPABASE_URL", "")
    key: str = os.getenv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "")
    if not url or not key:
        msg = "Supabase URL and Key must be set in environment variables"
        raise ValueError(msg)
    return create_client(url, key)


class handler(BaseHTTPRequestHandler):  # noqa:N801
    """Class to handle Vercel Cron requests."""

    def do_GET(self) -> None:
        """Handle GET requests from Vercel Cron."""
        self._process_request()

    def do_POST(self) -> None:
        """Handle POST requests from Vercel Cron."""
        self._process_request()

    def _process_request(self) -> None:
        """Core logic for verifying secret and sending reminders."""
        # 1. Security Check: CRON_SECRET verification
        auth_header = self.headers.get("Authorization")
        cron_secret = os.getenv("CRON_SECRET")

        # Without a configured secret there is no header worth accepting. Interpolating an unset
        # value would otherwise make "Bearer None" a valid credential.
        if not cron_secret or not auth_header or not compare_digest(auth_header, f"Bearer {cron_secret}"):
            self.send_response(401)
            self.end_headers()
            self.wfile.write(b"Unauthorized")
            return

        try:
            supabase = _get_supabase_client()
            resend.api_key = os.getenv("RESEND_API_KEY")

            # 2. Execution Logic: Target date is exactly 7 days from now
            target_date = (datetime.now(tz=UTC) + timedelta(days=7)).strftime("%Y-%m-%d")

            # Fetch all published assignments with member and workdate details
            response = (
                supabase.table("assignments")
                .select("*, members(name, email), work_dates(date, name, start_time)")
                .eq("status", "Published")
                .execute()
            )

            if not response.data:
                assignments: list[Assignment] = []
            else:
                assignments = [Assignment.from_dict(a) for a in cast("list[dict[str, Any]]", response.data)]

            due_reminders = [
                (a.members, a.work_dates)
                for a in assignments
                if a.members and a.work_dates and a.work_dates.date == target_date
            ]

            email_override = os.getenv("DEVELOPMENT_EMAIL_OVERRIDE")

            # Mailing the addresses in the members table has to be asked for. Any environment holding
            # a copy of the seed data holds addresses at real third-party domains, so a default that
            # sends wherever the table points would reach strangers from a developer's machine.
            if email_override:
                mode = "override"
            elif os.getenv("REMINDERS_LIVE", "").lower() == "true":
                mode = "live"
            else:
                mode = "dry-run"

            sent_count = 0
            suppressed_count = 0

            for member, work_date in due_reminders:
                email = email_override or member.email

                if not email or not member.name:
                    continue

                if mode == "dry-run":
                    suppressed_count += 1
                    continue

                self._send_reminder_email(email, member.name, work_date)
                sent_count += 1

            # Success Response
            self.send_response(200)
            self.send_header("Content-type", "application/json")
            self.end_headers()
            self.wfile.write(
                json.dumps(
                    {
                        "status": "success",
                        "mode": mode,
                        "target_date": target_date,
                        "sent_reminders": sent_count,
                        "suppressed_reminders": suppressed_count,
                    }
                ).encode()
            )

        except Exception as e:  # noqa: BLE001
            self.send_response(500)
            self.send_header("Content-type", "application/json")
            self.end_headers()
            self.wfile.write(json.dumps({"error": str(e)}).encode())

    def _send_reminder_email(self, to_email: str, name: str, work_date: WorkDate) -> None:
        """Sends a branded German-language reminder email via Resend."""
        formatted_date = datetime.strptime(work_date.date, "%Y-%m-%d").replace(tzinfo=UTC).strftime("%d.%m.%Y")

        # Load template from file
        template_path = Path(__file__).parent / "reminder_template.html"
        with Path(template_path).open(encoding="utf-8") as f:
            html_content = f.read()

        # Replace placeholders
        html_content = html_content.replace("{{name}}", escape(name))
        html_content = html_content.replace("{{formatted_date}}", formatted_date)
        html_content = html_content.replace("{{event_name_block}}", _event_name_block(work_date.name))
        html_content = html_content.replace("{{time_suffix}}", _time_suffix(work_date.start_time))

        params = {
            "from": "FCE Kalender <info@fcegenhausen.de>",
            "to": to_email,
            "subject": f"Erinnerung: Dein Einsatz am {formatted_date}",
            "html": html_content,
        }
        resend.Emails.send(params)  # ty:ignore[invalid-argument-type]


def _event_name_block(name: str | None) -> str:
    """Renders the event name as a kicker above the date, or nothing when unnamed."""
    if not name:
        return ""
    return (
        '<p style="margin: 0 0 6px 0; font-size: 13px; font-weight: bold; color: #555; '
        f'text-transform: uppercase; letter-spacing: 0.5px;">{escape(name)}</p>'
    )


def _time_suffix(start_time: str | None) -> str:
    """Renders a start time as a suffix for the date line, or nothing when there is none."""
    if not start_time:
        return ""
    return f", {start_time[:5]} Uhr"
