"""Tests for the send reminders functionality."""

import os
from datetime import UTC, datetime, timedelta
from unittest.mock import ANY, MagicMock, patch

from api.cron.send_reminders import handler


class TestHandler:
    """Tests for the cron job handler."""

    def test_process_request(self) -> None:
        """Tests the process request function."""
        # GIVEN a target date 7 days from now
        target_date = (datetime.now(tz=UTC) + timedelta(days=7)).strftime("%Y-%m-%d")
        # GIVEN mocked return values from supabase
        database_return = MagicMock(
            data=[
                {
                    "members": {"name": "Test User", "email": "test@example.com"},
                    "work_dates": {"date": target_date},
                    "status": "Published",
                }
            ]
        )
        # GIVEN mocked env content
        mock_secrets = {"CRON_SECRET": "test_secret", "RESEND_API_KEY": "test_key"}

        # GIVEN a mocked Email-sender function
        # GIVEN a patched supabase-client, Emails send function and getenv
        with (
            patch("api.cron.send_reminders._get_supabase_client") as mock_supabase_factory,
            patch.dict(os.environ, mock_secrets, clear=True),
        ):
            # GIVEN a mock handler (self) and database response
            h = MagicMock(spec=handler)
            h.headers = MagicMock()
            h.wfile = MagicMock()
            h.headers.get.return_value = "Bearer test_secret"
            mock_supabase_factory.return_value.table().select().eq().execute.return_value = database_return

            # WHEN processing the request
            handler._process_request(h)

            # THEN reminder mails have been sent
            h._send_reminder_email.assert_called_once_with("test@example.com", "Test User", target_date)

            # THEN the request sended a response with code 200
            h.send_response.assert_called_with(200)

    def test_unauthorized_request(self) -> None:
        """Tests that unauthorized requests are rejected."""
        # GIVEN mocked credentials
        mock_secrets = {"CRON_SECRET": "test_secret"}

        # GIVEN a patched environment and a mock handler
        with patch.dict(os.environ, mock_secrets, clear=False):
            h = MagicMock(spec=handler)
            h.headers = MagicMock()
            h.wfile = MagicMock()
            h.headers.get.return_value = "Bearer wrong_secret"

            # WHEN processing the request
            handler._process_request(h)

            # THEN the request sent a response with code 401
            h.send_response.assert_called_with(401)

    def test_send_reminder_email(self) -> None:
        """Tests the send_reminder_email function."""
        # GIVEN a target date
        target_date = datetime(2023, 1, 9, 9, tzinfo=UTC).strftime("%Y-%m-%d")

        # GIVEN a mocked Email-sender function
        with patch("resend.Emails.send") as mock_resend:
            # GIVEN a mock handler instance
            h = MagicMock(spec=handler)

            # WHEN sending a reminder email
            handler._send_reminder_email(h, "test@example.com", "Test User", target_date)

            # THEN resend has been called
            mock_resend.assert_called_once()

            mock_resend.assert_called_with(
                {
                    "from": "FCE Kalender <info@fcegenhausen.de>",
                    "to": "test@example.com",
                    "subject": "Erinnerung: Dein Einsatz am "
                    f"{datetime.strptime(target_date, '%Y-%m-%d').replace(tzinfo=UTC).strftime('%d.%m.%Y')}",
                    "html": ANY,
                }
            )
