"""Data models for the FCE Schichtkalender."""

from dataclasses import asdict, dataclass
from typing import Any


@dataclass
class Member:
    """Represents a club member."""

    id: str
    name: str
    email: str
    seniority_level: str
    availability: str
    historical_shifts: int = 0
    exempt: bool = False
    is_approved: bool = False
    is_admin: bool = False
    telegram_chat_id: str | None = None
    # Internal state for scheduling
    current_shifts: int = 0

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "Member":
        """Creates a Member instance from a dictionary."""
        return cls(
            id=data["id"],
            name=data["name"],
            email=data["email"],
            seniority_level=data["seniority_level"],
            availability=data["availability"],
            historical_shifts=data.get("historical_shifts", 0),
            exempt=data.get("exempt", False),
            is_approved=data.get("is_approved", False),
            is_admin=data.get("is_admin", False),
            telegram_chat_id=data.get("telegram_chat_id"),
            current_shifts=data.get("historical_shifts", 0),
        )


@dataclass
class WorkDate:
    """Represents a date with required shifts."""

    id: str
    date: str
    required_people: int = 1
    is_important_shift: bool = False
    is_weekend: bool = False

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "WorkDate":
        """Creates a WorkDate instance from a dictionary."""
        return cls(
            id=data["id"],
            date=data["date"],
            required_people=data.get("required_people", 1),
            is_important_shift=data.get("is_important_shift", False),
            is_weekend=data.get("is_weekend", False),
        )


@dataclass
class Assignment:
    """Represents a shift assignment."""

    member_id: str
    workdate_id: str
    status: str = "Draft"
    id: str | None = None
    # Joined data
    members: Member | None = None
    work_dates: WorkDate | None = None

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "Assignment":
        """Creates an Assignment instance from a dictionary."""
        member = None
        if data.get("members"):
            # Handle partial member data from joins
            member_data = data["members"]
            member = Member(
                id=data.get("member_id", ""),
                name=member_data.get("name", ""),
                email=member_data.get("email", ""),
                seniority_level=member_data.get("seniority_level", "Standard"),
                availability=member_data.get("availability", "Any"),
            )

        work_date = None
        if data.get("work_dates"):
            wd_data = data["work_dates"]
            work_date = WorkDate(id=data.get("workdate_id", ""), date=wd_data.get("date", ""))

        return cls(
            id=data.get("id"),
            member_id=data["member_id"],
            workdate_id=data["workdate_id"],
            status=data.get("status", "Draft"),
            members=member,
            work_dates=work_date,
        )

    def to_dict(self, *, exclude_ids: bool = False) -> dict[str, Any]:
        """Converts the assignment to a dictionary for Supabase."""
        d = asdict(self)
        # Remove joined objects and None id if requested
        d.pop("members", None)
        d.pop("work_dates", None)
        if exclude_ids or self.id is None:
            d.pop("id", None)
        return d
