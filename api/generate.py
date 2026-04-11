import os
import json
from http.server import BaseHTTPRequestHandler
from supabase import create_client, Client
from dotenv import load_dotenv

# Load credentials from .env.local
load_dotenv('.env.local')

# Supabase configuration
url: str = os.getenv("NEXT_PUBLIC_SUPABASE_URL", "")
key: str = os.getenv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "")
supabase: Client = create_client(url, key)

class handler(BaseHTTPRequestHandler):
    def do_POST(self):
        try:
            # 1. Fetch data from Supabase
            members_response = supabase.table("members").select("*").eq("exempt", False).execute()
            dates_response = supabase.table("work_dates").select("*").order("date").execute()

            members = members_response.data
            work_dates = dates_response.data

            if not members or not work_dates:
                self._send_error(400, "Missing members or work dates in database")
                return

            # Keep track of shift counts in memory during the process
            for m in members:
                m['current_shifts'] = m.get('historical_shifts', 0)

            assignments = []

            # PHASE 1: Fill 'Important' shifts with Senior members
            important_dates = [d for d in work_dates if d.get('is_important_shift')]
            for date in important_dates:
                eligible_seniors = [m for m in members if m.get('seniority_level') == 'Senior']
                self._assign_members_to_date(date, eligible_seniors, assignments)

            # PHASE 2: Fill remaining weekend dates
            weekend_dates = [d for d in work_dates if d.get('is_weekend') and not d.get('is_important_shift')]
            for date in weekend_dates:
                eligible_members = [m for m in members if m.get('availability') in ['Weekends', 'Any']]
                self._assign_members_to_date(date, eligible_members, assignments)

            # PHASE 3: Fill remaining weekday dates
            remaining_dates = [d for d in work_dates if not d.get('is_weekend') and not d.get('is_important_shift')]
            for date in remaining_dates:
                eligible_members = [m for m in members if m.get('availability') in ['Weekdays', 'Any']]
                self._assign_members_to_date(date, eligible_members, assignments)

            # Save results to database as 'Draft'
            if assignments:
                supabase.table("assignments").delete().eq("status", "Draft").execute()
                supabase.table("assignments").insert(assignments).execute()

            # Success Response
            self.send_response(200)
            self.send_header('Content-type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({
                "status": "success",
                "assignments_count": len(assignments)
            }).encode())

        except Exception as e:
            self._send_error(500, str(e))

    def _assign_members_to_date(self, date, eligible_pool, assignments):
        """Helper to pick members from a pool and update counts."""
        needed = date.get('required_people', 1)
        already_assigned = [a for a in assignments if a['workdate_id'] == date['id']]
        remaining_needed = max(0, needed - len(already_assigned))
        
        if remaining_needed <= 0:
            return

        # FAIRNESS RULE: Sort by historical_shifts (Ascending)
        sorted_pool = sorted(eligible_pool, key=lambda x: x['current_shifts'])
        chosen_members = sorted_pool[:remaining_needed]
        
        for m in chosen_members:
            assignments.append({
                "member_id": m['id'],
                "workdate_id": date['id'],
                "status": "Draft"
            })
            m['current_shifts'] += 1

    def _send_error(self, code, message):
        self.send_response(code)
        self.send_header('Content-type', 'application/json')
        self.end_headers()
        self.wfile.write(json.dumps({"error": message}).encode())
