"""Tests for the fairness module."""

from api.generate import generate_assignments


def test_seniors_assigned_to_important_shifts() -> None:
    """Verify Seniors are assigned to Important shifts."""
    members = [
        {"id": 1, "name": "Senior Max", "seniority_level": "Senior", "historical_shifts": 5, "availability": "Any"},
        {"id": 2, "name": "Junior Tom", "seniority_level": "Junior", "historical_shifts": 0, "availability": "Any"},
    ]
    work_dates = [{"id": 101, "date": "2024-05-01", "is_important_shift": True, "required_people": 1}]

    assignments = generate_assignments(members, work_dates)

    assert len(assignments) == 1
    assert assignments[0]["member_id"] == 1  # Senior Max should be picked despite more historical shifts


def test_historical_shift_sorting_fairness() -> None:
    """Verify historical shift sorting (fairness) works perfectly."""
    members = [
        {"id": 1, "name": "Member A", "seniority_level": "Junior", "historical_shifts": 10, "availability": "Any"},
        {"id": 2, "name": "Member B", "seniority_level": "Junior", "historical_shifts": 2, "availability": "Any"},
        {"id": 3, "name": "Member C", "seniority_level": "Junior", "historical_shifts": 5, "availability": "Any"},
    ]
    # Weekday shift (Phase 3)
    work_dates = [
        {"id": 101, "date": "2024-05-02", "is_important_shift": False, "is_weekend": False, "required_people": 1}
    ]

    assignments = generate_assignments(members, work_dates)

    assert len(assignments) == 1
    assert assignments[0]["member_id"] == 2  # Member B has fewest historical shifts


def test_weekend_constraints_respected() -> None:
    """Verify weekend constraints are respected."""
    members = [
        {
            "id": 1,
            "name": "Weekday Only",
            "seniority_level": "Junior",
            "historical_shifts": 0,
            "availability": "Weekdays",
        },
        {
            "id": 2,
            "name": "Weekend Only",
            "seniority_level": "Junior",
            "historical_shifts": 0,
            "availability": "Weekends",
        },
    ]
    work_dates = [
        {"id": 101, "date": "2024-05-04", "is_important_shift": False, "is_weekend": True, "required_people": 1}
    ]

    assignments = generate_assignments(members, work_dates)

    assert len(assignments) == 1
    assert assignments[0]["member_id"] == 2  # Only Member 2 is eligible for weekends
