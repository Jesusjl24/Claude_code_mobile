"""Tests for the SQLite database layer using a temporary DB."""
import os
import pytest
from pathlib import Path

# Point at a temp DB before importing database module
_TEST_DB = Path(__file__).parent / "test_business_finder.db"


@pytest.fixture(autouse=True)
def temp_db(monkeypatch, tmp_path):
    """Redirect the DB_PATH to a throw-away temp file for each test."""
    import database
    test_db = tmp_path / "test.db"
    monkeypatch.setattr(database, "DB_PATH", test_db)
    database.init_db()
    yield
    # cleanup handled by tmp_path fixture


def _sample_listing(listing_id="test_abc123"):
    from schema import BusinessListing
    return BusinessListing(
        listing_id=listing_id,
        platform="noagentbusiness",
        url=f"https://example.com/{listing_id}",
        title="Plumbing Business QLD",
        sector="plumbing",
        state="QLD",
        asking_price=1_500_000,
        revenue=2_000_000,
        profit=400_000,
    )


def test_upsert_and_retrieve():
    import database
    listing = _sample_listing()
    database.upsert_listing(listing)

    row = database.get_listing(listing.listing_id)
    assert row is not None
    assert row["listing_id"] == listing.listing_id
    assert row["sector"] == "plumbing"
    assert row["asking_price"] == 1_500_000


def test_upsert_idempotent():
    import database
    listing = _sample_listing()
    database.upsert_listing(listing)
    listing.title = "Updated Title"
    database.upsert_listing(listing)  # should not raise

    row = database.get_listing(listing.listing_id)
    assert row["title"] == "Updated Title"


def test_get_listings_filter_state():
    import database
    from schema import BusinessListing

    for state in ("QLD", "VIC", "NSW"):
        l = BusinessListing(
            listing_id=f"x_{state}",
            platform="test",
            url=f"https://example.com/{state}",
            state=state,
        )
        database.upsert_listing(l)

    rows = database.get_listings(state="QLD")
    assert all(r["state"] == "QLD" for r in rows)
    assert len(rows) == 1


def test_get_listings_filter_score():
    import database
    from schema import BusinessListing, RiskLevel

    for score in (30, 65, 80):
        l = BusinessListing(
            listing_id=f"x_{score}",
            platform="test",
            url=f"https://example.com/{score}",
            opportunity_score=score,
            risk_level=RiskLevel.LOW,
        )
        database.upsert_listing(l)

    rows = database.get_listings(min_score=60)
    assert all(r["opportunity_score"] >= 60 for r in rows)
    assert len(rows) == 2


def test_count_listings():
    import database
    listing = _sample_listing()
    database.upsert_listing(listing)
    counts = database.count_listings()
    assert counts["total"] >= 1


def test_outreach_status_update():
    import database
    from schema import OutreachStatus
    listing = _sample_listing()
    database.upsert_listing(listing)
    database.update_outreach_status(listing.listing_id, OutreachStatus.APPROVED)
    row = database.get_listing(listing.listing_id)
    assert row["outreach_status"] == "approved"


def test_save_and_retrieve_outreach_message():
    import database
    from schema import OutreachMessage
    listing = _sample_listing()
    database.upsert_listing(listing)

    msg = OutreachMessage(
        listing_id=listing.listing_id,
        subject="Test subject",
        body="Hello there",
    )
    msg_id = database.save_outreach_message(msg)
    assert msg_id > 0

    messages = database.get_outreach_messages(listing.listing_id)
    assert len(messages) == 1
    assert messages[0]["subject"] == "Test subject"


def test_approve_outreach_message():
    import database
    from schema import OutreachMessage
    listing = _sample_listing()
    database.upsert_listing(listing)

    msg = OutreachMessage(listing_id=listing.listing_id, subject="s", body="b")
    msg_id = database.save_outreach_message(msg)
    database.approve_outreach_message(msg_id)

    messages = database.get_outreach_messages(listing.listing_id)
    assert messages[0]["approved"] == 1
