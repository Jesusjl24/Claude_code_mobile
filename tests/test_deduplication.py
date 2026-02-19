"""Tests for the cross-platform deduplication logic."""
import pytest
from schema import BusinessListing
from utils.deduplication import Deduplicator


def make_listing(listing_id, platform="test", asking_price=None, suburb="", sector=""):
    return BusinessListing(
        listing_id=listing_id,
        platform=platform,
        url=f"https://example.com/{listing_id}",
        asking_price=asking_price,
        suburb=suburb,
        sector=sector,
    )


def test_no_duplicates_passthrough():
    d = Deduplicator()
    listings = [
        make_listing("a_1", asking_price=500_000, suburb="Newtown", sector="plumbing"),
        make_listing("b_2", asking_price=750_000, suburb="Fitzroy", sector="accounting"),
    ]
    result = d.deduplicate(listings)
    assert len(result) == 2


def test_same_id_deduplicated():
    d = Deduplicator()
    listings = [
        make_listing("a_1", asking_price=500_000, suburb="Newtown", sector="plumbing"),
        make_listing("a_1", asking_price=500_000, suburb="Newtown", sector="plumbing"),  # dupe
    ]
    result = d.deduplicate(listings)
    assert len(result) == 1


def test_cross_platform_fingerprint_dedup():
    d = Deduplicator()
    listings = [
        make_listing("noagent_abc", "noagentbusiness", 1_000_000, "Surry Hills", "plumbing"),
        make_listing("gumtree_xyz", "gumtree",         1_000_000, "Surry Hills", "plumbing"),  # same biz
    ]
    result = d.deduplicate(listings)
    assert len(result) == 1


def test_missing_fields_no_fingerprint():
    """Listings with missing price/suburb/sector should not be fingerprinted against each other."""
    d = Deduplicator()
    listings = [
        make_listing("a_1"),
        make_listing("b_2"),  # both lack fields — different IDs, both kept
    ]
    result = d.deduplicate(listings)
    assert len(result) == 2
