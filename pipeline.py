"""
End-to-end pipeline orchestrator.

Runs the three agents in sequence:
  1. ScraperAgent  → discovers & normalises listings
  2. ScoringAgent  → scores & enriches each listing
  3. OutreachAgent → drafts personalised messages for top listings

All results are persisted to SQLite as each stage completes,
so partial progress is not lost if a later stage fails.
"""

from __future__ import annotations

import asyncio
import logging

import database
from agents.scraper_agent import ScraperAgent
from agents.scoring_agent import ScoringAgent
from agents.outreach_agent import OutreachAgent

logger = logging.getLogger(__name__)


async def run_full_pipeline() -> dict:
    """
    Execute the full pipeline and return a summary dict.
    Safe to call from FastAPI background tasks or CLI.
    """
    logger.info("Pipeline: starting full run")
    summary: dict = {}

    # --- Stage 1: Scraping ---
    scraper = ScraperAgent()
    raw_listings = await scraper.run()
    summary["scraped"] = len(raw_listings)
    logger.info("Pipeline: %d listings scraped", len(raw_listings))

    # Persist raw listings immediately
    for listing in raw_listings:
        database.upsert_listing(listing)

    # --- Stage 2: Scoring ---
    scorer = ScoringAgent()
    scored_listings = await scorer.run(raw_listings)
    summary["scored"] = len(scored_listings)

    # Persist scored listings
    for listing in scored_listings:
        database.upsert_listing(listing)

    above_threshold = [
        l for l in scored_listings
        if (l.opportunity_score or 0) >= 60
    ]
    summary["above_threshold"] = len(above_threshold)
    logger.info(
        "Pipeline: %d listings scored, %d above threshold",
        len(scored_listings),
        len(above_threshold),
    )

    # --- Stage 3: Outreach drafting ---
    outreach = OutreachAgent()
    await outreach.run(scored_listings)
    summary["outreach_drafted"] = len(above_threshold)

    logger.info("Pipeline: complete — %s", summary)
    return summary


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    database.init_db()
    result = asyncio.run(run_full_pipeline())
    print("Pipeline complete:", result)
