"""
Follow-up sequence manager.

Tracks when the next follow-up is due for each contacted listing
and returns a list of listings ready for their next touch.
"""

from __future__ import annotations

from datetime import date, timedelta
from typing import List

import config
import database


class FollowUpManager:
    """Query the DB for listings whose next follow-up date has arrived."""

    def get_due_followups(self) -> List[dict]:
        """Return listings that are due for a follow-up today."""
        listings = database.get_listings(limit=1000)
        due = []
        today = date.today()

        for listing in listings:
            if listing["outreach_status"] not in ("sent", "replied"):
                continue

            follow_up_count = listing.get("follow_up_count", 0)
            if follow_up_count >= len(config.FOLLOW_UP_INTERVALS_DAYS):
                continue  # Sequence exhausted

            last_contact_raw = listing.get("last_contact_date")
            if not last_contact_raw:
                continue

            last_contact = date.fromisoformat(last_contact_raw)
            interval = config.FOLLOW_UP_INTERVALS_DAYS[follow_up_count]
            next_contact = last_contact + timedelta(days=interval)

            if today >= next_contact:
                listing["next_follow_up_number"] = follow_up_count + 1
                due.append(listing)

        return due
