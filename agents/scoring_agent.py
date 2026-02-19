"""
Layer 2 — Scoring Agent

For each listing the agent:
  1. Applies a deterministic, rules-based score against the Target Business Profile
  2. Calls the Claude API for a nuanced qualitative analysis of the description
  3. Optionally enriches with ABN / ASIC data
  4. Assigns a final opportunity_score (0–100) and risk_level

Listings below OUTREACH_SCORE_THRESHOLD are flagged but not discarded,
so the human reviewer can override.
"""

from __future__ import annotations

import json
import logging
from typing import List

import anthropic

import config
from schema import BusinessListing, RiskLevel
from utils.abn_lookup import ABNLookup

logger = logging.getLogger(__name__)

client = anthropic.Anthropic(api_key=config.ANTHROPIC_API_KEY)


class ScoringAgent:
    """
    Enriches and scores a list of BusinessListing objects.

    Usage::

        agent = ScoringAgent()
        scored = await agent.run(listings)
    """

    def __init__(self) -> None:
        self._abn_lookup = ABNLookup()

    async def run(self, listings: List[BusinessListing]) -> List[BusinessListing]:
        logger.info("ScoringAgent: scoring %d listings", len(listings))
        scored: List[BusinessListing] = []

        for listing in listings:
            try:
                scored_listing = await self._score(listing)
                scored.append(scored_listing)
            except Exception as exc:
                logger.warning(
                    "ScoringAgent: failed to score %s — %s", listing.listing_id, exc
                )
                listing.scoring_notes = f"Scoring failed: {exc}"
                scored.append(listing)

        scored.sort(key=lambda l: l.opportunity_score or 0, reverse=True)
        logger.info("ScoringAgent: scoring complete")
        return scored

    # ------------------------------------------------------------------
    # Core scoring logic
    # ------------------------------------------------------------------

    async def _score(self, listing: BusinessListing) -> BusinessListing:
        # Step 1 — Rules-based component scores
        breakdown = self._rules_score(listing)
        rules_score = int(
            sum(breakdown.values()) / len(breakdown) * 100
        )

        # Step 2 — Claude qualitative analysis
        ai_score, ai_notes, risk = await self._ai_score(listing)

        # Step 3 — ABN enrichment (best-effort)
        if listing.abn:
            try:
                enrichment = await self._abn_lookup.lookup(listing.abn)
                listing.business_age_years = enrichment.get("age_years")
                listing.director_names = enrichment.get("directors", [])
                listing.asic_entity_type = enrichment.get("entity_type", "")
            except Exception as exc:
                logger.debug("ABN lookup failed for %s: %s", listing.abn, exc)

        # Step 4 — Blend scores (70% rules, 30% AI)
        final_score = int(rules_score * 0.70 + ai_score * 0.30)

        listing.opportunity_score = final_score
        listing.score_breakdown = breakdown
        listing.scoring_notes = ai_notes
        listing.risk_level = risk
        return listing

    # ------------------------------------------------------------------
    # Rules-based scoring
    # ------------------------------------------------------------------

    def _rules_score(self, listing: BusinessListing) -> dict:
        """
        Returns a dict of criterion → score (each 0.0–1.0).
        Weights applied when blending.
        """
        w = config.SCORING_WEIGHTS

        scores = {}

        # Sector match
        sector_hit = any(
            s in listing.sector.lower() or s in listing.title.lower()
            for s in config.TARGET_SECTORS
        )
        scores["sector_match"] = w.sector_match if sector_hit else 0.0

        # Revenue in range
        if listing.revenue is not None:
            if config.REVENUE_MIN <= listing.revenue <= config.REVENUE_MAX:
                scores["revenue_in_range"] = w.revenue_in_range
            elif listing.revenue < config.REVENUE_MIN:
                scores["revenue_in_range"] = w.revenue_in_range * 0.3
            else:
                scores["revenue_in_range"] = w.revenue_in_range * 0.5
        else:
            scores["revenue_in_range"] = w.revenue_in_range * 0.4  # unknown → partial

        # Asking price in range
        if listing.asking_price is not None:
            if config.ASKING_PRICE_MIN <= listing.asking_price <= config.ASKING_PRICE_MAX:
                scores["price_in_range"] = w.price_in_range
            else:
                scores["price_in_range"] = 0.0
        else:
            scores["price_in_range"] = w.price_in_range * 0.4

        # No broker
        scores["no_broker"] = w.no_broker if not listing.has_broker else 0.0

        # Owner retiring signals
        description_lower = listing.description.lower() + listing.reason_for_sale.lower()
        positive_hit = any(sig in description_lower for sig in config.POSITIVE_SIGNALS)
        scores["owner_retiring"] = w.owner_retiring if positive_hit else 0.0

        # State match
        scores["state_match"] = (
            w.state_match if listing.state in config.TARGET_STATES else 0.0
        )

        return scores

    # ------------------------------------------------------------------
    # AI qualitative scoring
    # ------------------------------------------------------------------

    async def _ai_score(self, listing: BusinessListing):
        """
        Ask Claude to review the listing and return:
          - score 0–100
          - brief notes
          - risk level
        """
        prompt = f"""You are an expert business acquisition analyst evaluating a small-business listing
for a private buyer in Australia. Assess this listing against the Target Business Profile below.

TARGET BUSINESS PROFILE
- Revenue: A$1M–4M/year
- Asking price: A$500k–5M
- Profit target: ~A$400k/year
- Owner not essential to daily operations (management in place preferred)
- Owner ideally retiring with no succession plan
- No business broker involvement preferred
- Sectors: {', '.join(config.TARGET_SECTORS)}
- Geographic focus: QLD, NSW, VIC

LISTING DATA
Title: {listing.title}
Platform: {listing.platform}
State: {listing.state}
Sector: {listing.sector}
Asking Price: {listing.asking_price}
Revenue: {listing.revenue}
Profit: {listing.profit}
Staff Count: {listing.staff_count}
Reason for Sale: {listing.reason_for_sale}
Has Broker: {listing.has_broker}

DESCRIPTION (excerpt — first 1,000 chars):
{listing.description[:1_000]}

TASK
Respond ONLY with a valid JSON object with these exact keys:
{{
  "score": <integer 0–100>,
  "notes": "<2–4 sentence qualitative assessment>",
  "risk_level": "<low|medium|medium_high|high>"
}}

Scoring guidance:
- 80–100: Strong match across most criteria; pursue immediately
- 60–79: Good fit; worth further investigation
- 40–59: Partial fit; borderline — needs human review
- 0–39: Poor fit or unacceptable risk
"""

        try:
            response = client.messages.create(
                model=config.CLAUDE_MODEL,
                max_tokens=512,
                messages=[{"role": "user", "content": prompt}],
            )
            raw = response.content[0].text.strip()
            # Strip markdown fences if present
            if raw.startswith("```"):
                raw = raw.split("```")[1]
                if raw.startswith("json"):
                    raw = raw[4:]
            data = json.loads(raw)
            score = int(data.get("score", 50))
            notes = data.get("notes", "")
            risk_str = data.get("risk_level", "medium")
            risk = {
                "low": RiskLevel.LOW,
                "medium": RiskLevel.MEDIUM,
                "medium_high": RiskLevel.MEDIUM_HIGH,
                "high": RiskLevel.HIGH,
            }.get(risk_str, RiskLevel.MEDIUM)
            return score, notes, risk
        except Exception as exc:
            logger.warning("AI scoring failed for %s: %s", listing.listing_id, exc)
            return 40, f"AI scoring unavailable: {exc}", RiskLevel.MEDIUM
