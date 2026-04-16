"""Module to send reminder mails for appointments."""

import json
import os
from datetime import UTC, datetime, timedelta
from http.server import BaseHTTPRequestHandler
from pathlib import Path
from typing import Any, cast

import resend
from dotenv import load_dotenv
from supabase import Client, create_client

from api.models import Assignment

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

        if not auth_header or auth_header != f"Bearer {cron_secret}":
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
                .select("*, members(name, email), work_dates(date)")
                .eq("status", "Published")
                .execute()
            )

            if not response.data:
                assignments: list[Assignment] = []
            else:
                assignments = [Assignment.from_dict(a) for a in cast("list[dict[str, Any]]", response.data)]

            target_assignments = [a for a in assignments if a.work_dates and a.work_dates.date == target_date]

            sent_count = 0
            email_override = os.getenv("DEVELOPMENT_EMAIL_OVERRIDE")

            for a in target_assignments:
                if not a.members:
                    continue

                email = email_override or a.members.email
                name = a.members.name

                if email and name:
                    self._send_reminder_email(email, name, target_date)
                    sent_count += 1

            # Success Response
            self.send_response(200)
            self.send_header("Content-type", "application/json")
            self.end_headers()
            self.wfile.write(
                json.dumps({"status": "success", "target_date": target_date, "sent_reminders": sent_count}).encode()
            )

        except Exception as e:  # noqa: BLE001
            self.send_response(500)
            self.send_header("Content-type", "application/json")
            self.end_headers()
            self.wfile.write(json.dumps({"error": str(e)}).encode())

    def _send_reminder_email(self, to_email: str, name: str, date: str) -> None:
        """Sends a branded German-language reminder email via Resend."""
        formatted_date = datetime.strptime(date, "%Y-%m-%d").replace(tzinfo=UTC).strftime("%d.%m.%Y")

        # Load template from file
        template_path = Path(__file__).parent / "reminder_template.html"
        with Path(template_path).open(encoding="utf-8") as f:
            html_content = f.read()

        # Replace placeholders
        html_content = html_content.replace("{{name}}", name)
        html_content = html_content.replace("{{formatted_date}}", formatted_date)

        params = {
            "from": "FCE Kalender <info@fcegenhausen.de>",
            "to": to_email,
            "subject": f"Erinnerung: Dein Einsatz am {formatted_date}",
            "html": html_content,
        }
        resend.Emails.send(params)  # ty:ignore[invalid-argument-type]
