"""Tests for the fairness module."""

from api.generate import generate_assignments
from api.models import Member, WorkDate


def test_seniors_assigned_to_important_shifts() -> None:
    """Verify Seniors are assigned to Important shifts."""
    members = [
        Member.from_dict(
            {
                "id": "1",
                "name": "Senior Max",
                "email": "max@fce.de",
                "seniority_level": "Senior",
                "historical_shifts": 5,
                "availability": "Any",
            }
        ),
        Member.from_dict(
            {
                "id": "2",
                "name": "Junior Tom",
                "email": "tom@fce.de",
                "seniority_level": "Junior",
                "historical_shifts": 0,
                "availability": "Any",
            }
        ),
    ]
    work_dates = [
        WorkDate.from_dict(
            {
                "id": "101",
                "date": "2024-05-01",
                "is_important_shift": True,
                "required_people": 1,
            }
        )
    ]

    assignments = generate_assignments(members, work_dates)

    assert len(assignments) == 1
    assert assignments[0].member_id == "1"  # Senior Max should be picked despite more historical shifts


def test_historical_shift_sorting_fairness() -> None:
    """Verify historical shift sorting (fairness) works perfectly."""
    members = [
        Member.from_dict(
            {
                "id": "1",
                "name": "Member A",
                "email": "a@fce.de",
                "seniority_level": "Junior",
                "historical_shifts": 10,
                "availability": "Any",
            }
        ),
        Member.from_dict(
            {
                "id": "2",
                "name": "Member B",
                "email": "b@fce.de",
                "seniority_level": "Junior",
                "historical_shifts": 2,
                "availability": "Any",
            }
        ),
        Member.from_dict(
            {
                "id": "3",
                "name": "Member C",
                "email": "c@fce.de",
                "seniority_level": "Junior",
                "historical_shifts": 5,
                "availability": "Any",
            }
        ),
    ]
    # Weekday shift (Phase 3)
    work_dates = [
        WorkDate.from_dict(
            {
                "id": "101",
                "date": "2024-05-02",
                "is_important_shift": False,
                "is_weekend": False,
                "required_people": 1,
            }
        )
    ]

    assignments = generate_assignments(members, work_dates)

    assert len(assignments) == 1
    assert assignments[0].member_id == "2"  # Member B has fewest historical shifts


def test_weekend_constraints_respected() -> None:
    """Verify weekend constraints are respected."""
    members = [
        Member.from_dict(
            {
                "id": "1",
                "name": "Weekday Only",
                "email": "weekday@fce.de",
                "seniority_level": "Junior",
                "historical_shifts": 0,
                "availability": "Weekdays",
            }
        ),
        Member.from_dict(
            {
                "id": "2",
                "name": "Weekend Only",
                "email": "weekend@fce.de",
                "seniority_level": "Junior",
                "historical_shifts": 0,
                "availability": "Weekends",
            }
        ),
    ]
    work_dates = [
        WorkDate.from_dict(
            {
                "id": "101",
                "date": "2024-05-04",
                "is_important_shift": False,
                "is_weekend": True,
                "required_people": 1,
            }
        )
    ]

    assignments = generate_assignments(members, work_dates)

    assert len(assignments) == 1
    assert assignments[0].member_id == "2"  # Only Member 2 is eligible for weekends


def test_cooldown_period_respected() -> None:
    """Verify that the 3-week cooldown period is respected."""
    # Member with 0 historical shifts, but ALREADY has a shift in the current plan
    # and a second member with more historical shifts.
    members = [
        Member.from_dict(
            {
                "id": "1",
                "name": "Member A",
                "email": "a@fce.de",
                "seniority_level": "Junior",
                "historical_shifts": 0,
                "availability": "Any",
            }
        ),
        Member.from_dict(
            {
                "id": "2",
                "name": "Member B",
                "email": "b@fce.de",
                "seniority_level": "Junior",
                "historical_shifts": 10,
                "availability": "Any",
            }
        ),
    ]
    # Two dates, 1 week apart
    work_dates = [
        WorkDate.from_dict(
            {
                "id": "101",
                "date": "2024-05-01",
                "is_important_shift": False,
                "is_weekend": False,
                "required_people": 1,
            }
        ),
        WorkDate.from_dict(
            {
                "id": "102",
                "date": "2024-05-08",
                "is_important_shift": False,
                "is_weekend": False,
                "required_people": 1,
            }
        ),
    ]

    assignments = generate_assignments(members, work_dates, cooldown_days=21)

    assert len(assignments) == 2
    # First date should go to Member A (0 shifts)
    # Second date should go to Member B (10 shifts) because Member A is in cooldown (only 7 days since last shift)
    assert assignments[0].member_id == "1"
    assert assignments[1].member_id == "2"
