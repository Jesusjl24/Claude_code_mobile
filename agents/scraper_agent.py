"""
Layer 1 — Scraper Agent

Orchestrates all platform scrapers, de-duplicates across platforms,
and returns a clean list of BusinessListing objects ready for scoring.
"""

from __future__ import annotations

import asyncio
import logging
from typing import List

from schema import BusinessListing
from scrapers import BusinessForSaleScraper, GumtreeScraper, NoAgentScraper
from utils.deduplication import Deduplicator

logger = logging.getLogger(__name__)


class ScraperAgent:
    """
    Runs all scrapers concurrently and produces a deduplicated listing pool.

    Usage::

        agent = ScraperAgent()
        listings = await agent.run()
    """

    def __init__(self) -> None:
        self._deduplicator = Deduplicator()

    async def run(self) -> List[BusinessListing]:
        """Execute all scrapers in parallel, merge, and deduplicate results."""
        logger.info("ScraperAgent: starting all platform scrapers")

        results = await asyncio.gather(
            self._run_scraper(NoAgentScraper()),
            self._run_scraper(GumtreeScraper()),
            self._run_scraper(BusinessForSaleScraper()),
            return_exceptions=True,
        )

        all_listings: List[BusinessListing] = []
        for platform_result in results:
            if isinstance(platform_result, Exception):
                logger.error("ScraperAgent: a scraper raised an exception — %s", platform_result)
            else:
                all_listings.extend(platform_result)

        logger.info(
            "ScraperAgent: %d raw listings before deduplication", len(all_listings)
        )

        unique_listings = self._deduplicator.deduplicate(all_listings)
        logger.info(
            "ScraperAgent: %d unique listings after deduplication", len(unique_listings)
        )
        return unique_listings

    @staticmethod
    async def _run_scraper(scraper) -> List[BusinessListing]:
        try:
            return await scraper.scrape_all()
        except Exception as exc:
            logger.error(
                "ScraperAgent: %s failed — %s",
                scraper.__class__.__name__,
                exc,
                exc_info=True,
            )
            raise
