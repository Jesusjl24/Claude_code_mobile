"""Tests for the BusinessListing schema and validation helpers."""
import pytest
from schema import BusinessListing, OutreachStatus, RiskLevel


def test_listing_defaults():
    l = BusinessListing(listing_id="x_abc", platform="test", url="https://example.com")
    assert l.has_broker is False
    assert l.outreach_status == OutreachStatus.PENDING_REVIEW
    assert l.follow_up_count == 0


def test_currency_parsing_dollar_k():
    l = BusinessListing(
        listing_id="x_1", platform="test", url="https://example.com",
        asking_price="$1,200,000",
        revenue="$2.5M",
        profit="$400K",
    )
    assert l.asking_price == 1_200_000
    assert l.revenue == 2_500_000
    assert l.profit == 400_000


def test_currency_parsing_poa():
    l = BusinessListing(
        listing_id="x_2", platform="test", url="https://example.com",
        asking_price="POA",
        revenue="N/A",
    )
    assert l.asking_price is None
    assert l.revenue is None


def test_to_sheets_row_length():
    l = BusinessListing(listing_id="x_3", platform="test", url="https://example.com")
    row = l.to_sheets_row()
    headers = BusinessListing.sheets_headers()
    assert len(row) == len(headers)


def test_risk_level_enum():
    l = BusinessListing(
        listing_id="x_4", platform="test", url="https://example.com",
        risk_level=RiskLevel.MEDIUM_HIGH,
    )
    assert l.risk_level == RiskLevel.MEDIUM_HIGH
    assert l.risk_level.value == "medium_high"
