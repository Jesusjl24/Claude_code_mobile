"""Integration tests for the FastAPI endpoints using TestClient."""
import pytest
from pathlib import Path
from fastapi.testclient import TestClient


@pytest.fixture(autouse=True)
def temp_db(monkeypatch, tmp_path):
    """Redirect DB_PATH before the app module is loaded."""
    import database
    monkeypatch.setattr(database, "DB_PATH", tmp_path / "test_api.db")
    database.init_db()
    yield


@pytest.fixture
def client():
    from app import app
    return TestClient(app)


def test_index_returns_html(client):
    resp = client.get("/")
    assert resp.status_code == 200
    assert "text/html" in resp.headers["content-type"]


def test_stats_empty_db(client):
    resp = client.get("/api/stats")
    assert resp.status_code == 200
    data = resp.json()
    assert data["total"] == 0
    assert "top_opportunities" in data


def test_listings_empty(client):
    resp = client.get("/api/listings")
    assert resp.status_code == 200
    assert resp.json()["listings"] == []


def test_listing_not_found(client):
    resp = client.get("/api/listings/nonexistent_id")
    assert resp.status_code == 404


def test_pipeline_status(client):
    resp = client.get("/api/pipeline/status")
    assert resp.status_code == 200
    data = resp.json()
    assert "running" in data


def test_outreach_queue_empty(client):
    resp = client.get("/api/outreach/queue")
    assert resp.status_code == 200
    assert resp.json()["queue"] == []


def test_followups_due_empty(client):
    resp = client.get("/api/followups/due")
    assert resp.status_code == 200
    assert resp.json()["due"] == []


def test_upsert_and_retrieve_listing(client):
    """Write a listing directly to DB, then fetch via API."""
    import database
    from schema import BusinessListing, RiskLevel

    l = BusinessListing(
        listing_id="api_test_001",
        platform="noagentbusiness",
        url="https://example.com/api_test_001",
        title="Test Plumbing Business",
        sector="plumbing",
        state="QLD",
        asking_price=1_200_000,
        opportunity_score=72,
        risk_level=RiskLevel.LOW,
    )
    database.upsert_listing(l)

    resp = client.get("/api/listings")
    assert resp.status_code == 200
    data = resp.json()
    assert data["count"] == 1
    assert data["listings"][0]["listing_id"] == "api_test_001"


def test_listing_detail(client):
    import database
    from schema import BusinessListing

    l = BusinessListing(
        listing_id="api_detail_001",
        platform="gumtree",
        url="https://example.com/detail",
        title="Detail Test Business",
    )
    database.upsert_listing(l)

    resp = client.get("/api/listings/api_detail_001")
    assert resp.status_code == 200
    body = resp.json()
    assert body["listing"]["title"] == "Detail Test Business"
    assert "outreach_messages" in body


def test_outreach_approve_reject_flow(client):
    import database
    from schema import BusinessListing, OutreachMessage

    l = BusinessListing(
        listing_id="outreach_flow_001",
        platform="noagentbusiness",
        url="https://example.com/outreach_flow_001",
    )
    database.upsert_listing(l)

    msg = OutreachMessage(
        listing_id="outreach_flow_001",
        subject="Test Subject",
        body="Hello seller",
    )
    msg_id = database.save_outreach_message(msg)

    # Approve
    resp = client.post(
        "/api/outreach/outreach_flow_001/approve",
        json={"msg_id": msg_id},
    )
    assert resp.status_code == 200
    assert resp.json()["status"] == "approved"

    # Confirm status updated
    row = database.get_listing("outreach_flow_001")
    assert row["outreach_status"] == "approved"


def test_stats_reflect_upserted_listings(client):
    import database
    from schema import BusinessListing, RiskLevel

    for i in range(3):
        l = BusinessListing(
            listing_id=f"stats_test_{i}",
            platform="test",
            url=f"https://example.com/{i}",
            opportunity_score=70 if i < 2 else 30,
            risk_level=RiskLevel.LOW,
        )
        database.upsert_listing(l)

    resp = client.get("/api/stats")
    data = resp.json()
    assert data["total"] == 3
    assert data["top_opportunities"] == 2
