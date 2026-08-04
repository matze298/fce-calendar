"""Tests for the data models."""

from api.models import Assignment, WorkDate


def test_work_date_reads_optional_name_and_start_time() -> None:
    """Verify the optional name and start time are read from a Supabase row."""
    # GIVEN a work_dates row carrying a name and a start time
    row = {
        "id": "101",
        "date": "2026-09-12",
        "name": "Heimspiel gegen TSV Musterdorf",
        "start_time": "15:30:00",
        "required_people": 2,
        "is_weekend": True,
    }

    # WHEN building a WorkDate from it
    work_date = WorkDate.from_dict(row)

    # THEN both optional fields are carried over
    assert work_date.name == "Heimspiel gegen TSV Musterdorf"
    assert work_date.start_time == "15:30:00"


def test_work_date_defaults_optional_fields_to_none() -> None:
    """Verify a row without the optional columns yields None for both."""
    # GIVEN a work_dates row without a name or a start time
    row = {"id": "102", "date": "2026-09-15", "required_people": 1}

    # WHEN building a WorkDate from it
    work_date = WorkDate.from_dict(row)

    # THEN both optional fields are None
    assert work_date.name is None
    assert work_date.start_time is None


def test_assignment_carries_joined_name_and_start_time() -> None:
    """Verify joined work date details survive Assignment parsing."""
    # GIVEN an assignment row with a joined work_dates payload
    row = {
        "member_id": "1",
        "workdate_id": "101",
        "status": "Published",
        "work_dates": {"date": "2026-09-12", "name": "Sommerfest", "start_time": "15:30:00"},
    }

    # WHEN building an Assignment from it
    assignment = Assignment.from_dict(row)

    # THEN the joined work date exposes the name and the start time
    assert assignment.work_dates is not None
    assert assignment.work_dates.name == "Sommerfest"
    assert assignment.work_dates.start_time == "15:30:00"
