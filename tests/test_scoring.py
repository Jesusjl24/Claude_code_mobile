"""Tests for the rules-based scoring component of ScoringAgent (no Claude API needed)."""
import pytest
from schema import BusinessListing, RiskLevel
from agents.scoring_agent import ScoringAgent


@pytest.fixture
def agent():
    return ScoringAgent()


def make_listing(**kwargs):
    defaults = dict(
        listing_id="test_score_1",
        platform="noagentbusiness",
        url="https://example.com/test",
        title="Plumbing Business for Sale",
        sector="plumbing",
        state="QLD",
        asking_price=1_500_000,
        revenue=2_000_000,
        profit=400_000,
        has_broker=False,
        description="Owner retiring, no succession plan. Business runs under management.",
        reason_for_sale="Owner retiring",
    )
    defaults.update(kwargs)
    return BusinessListing(**defaults)


def test_perfect_match_scores_high(agent):
    listing = make_listing()
    breakdown = agent._rules_score(listing)
    total = sum(breakdown.values())
    # All criteria met → should be close to 1.0 (i.e. 100%)
    assert total > 0.85


def test_broker_reduces_score(agent):
    no_broker = agent._rules_score(make_listing(has_broker=False))
    with_broker = agent._rules_score(make_listing(has_broker=True))
    assert no_broker["no_broker"] > with_broker["no_broker"]


def test_wrong_state_reduces_score(agent):
    qld = agent._rules_score(make_listing(state="QLD"))
    wa  = agent._rules_score(make_listing(state="WA"))
    assert qld["state_match"] > wa["state_match"]


def test_revenue_out_of_range_partial_score(agent):
    in_range  = agent._rules_score(make_listing(revenue=2_000_000))   # in range
    too_low   = agent._rules_score(make_listing(revenue=100_000))     # too low
    too_high  = agent._rules_score(make_listing(revenue=10_000_000))  # too high
    assert in_range["revenue_in_range"] > too_low["revenue_in_range"]
    assert in_range["revenue_in_range"] > too_high["revenue_in_range"]


def test_unknown_revenue_partial_score(agent):
    """Missing revenue should give partial credit, not zero."""
    no_rev = agent._rules_score(make_listing(revenue=None))
    assert no_rev["revenue_in_range"] > 0


def test_price_out_of_range_zero(agent):
    """Price outside $500k–$5M should score zero."""
    too_cheap = agent._rules_score(make_listing(asking_price=100_000))
    too_dear  = agent._rules_score(make_listing(asking_price=10_000_000))
    assert too_cheap["price_in_range"] == 0.0
    assert too_dear["price_in_range"] == 0.0


def test_positive_signals_detected(agent):
    """Description containing positive signals should score owner_retiring weight."""
    with_signal = agent._rules_score(
        make_listing(description="Owner retiring, no succession plan", reason_for_sale="")
    )
    without_signal = agent._rules_score(
        make_listing(description="Seeking strategic buyer", reason_for_sale="")
    )
    assert with_signal["owner_retiring"] > without_signal["owner_retiring"]


def test_sector_mismatch_zero(agent):
    mismatch = agent._rules_score(make_listing(sector="fashion retail", title="Fashion shop"))
    assert mismatch["sector_match"] == 0.0


def test_unknown_sector_but_title_match(agent):
    """Sector field blank but title contains a target keyword."""
    l = make_listing(sector="", title="Electrical Contracting Business QLD")
    breakdown = agent._rules_score(l)
    assert breakdown["sector_match"] > 0
