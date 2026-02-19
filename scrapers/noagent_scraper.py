"""
Scraper for noagentbusiness.com.au — the highest-priority platform.
All listings on this site are broker-free by design, so has_broker=False always.
"""

from __future__ import annotations

import logging
import re
from datetime import date
from typing import List

from bs4 import BeautifulSoup

import config
from schema import BusinessListing
from .base_scraper import BaseScraper

logger = logging.getLogger(__name__)

BASE_URL = config.PLATFORM_URLS["noagentbusiness"]
LISTING_GRID_URL = f"{BASE_URL}/businesses-for-sale"


class NoAgentScraper(BaseScraper):
    """
    Scrapes noagentbusiness.com.au listing index pages and individual listing pages.

    Site structure (as of 2026):
      - Index pages paginated with ?page=N query param
      - Each card links to /businesses-for-sale/<slug>
    """

    platform_key = "noagentbusiness"

    async def scrape_all(self) -> List[BusinessListing]:
        listings: List[BusinessListing] = []

        async with self:
            index_urls = await self._collect_listing_urls()
            logger.info("NoAgent: found %d listing URLs", len(index_urls))

            for url in index_urls:
                try:
                    listing = await self._scrape_listing(url)
                    if listing:
                        listings.append(listing)
                except Exception as exc:
                    logger.warning("NoAgent: failed to scrape %s — %s", url, exc)

        logger.info("NoAgent: scraped %d listings", len(listings))
        return listings

    # ------------------------------------------------------------------
    # Private helpers
    # ------------------------------------------------------------------

    async def _collect_listing_urls(self) -> List[str]:
        """Paginate through the index and collect all detail-page URLs."""
        urls: List[str] = []
        page = await self.new_page()
        current_page = 1

        while True:
            url = f"{LISTING_GRID_URL}?page={current_page}"
            await self.goto(page, url)

            soup = BeautifulSoup(await page.content(), "lxml")
            # Cards typically use <a class="listing-card"> or similar
            cards = soup.select("a[href*='/businesses-for-sale/']")
            if not cards:
                break  # No more pages

            new_urls = [
                BASE_URL + a["href"] if a["href"].startswith("/") else a["href"]
                for a in cards
                if "/businesses-for-sale/" in a["href"]
                and a["href"] != "/businesses-for-sale"
            ]

            if not new_urls:
                break

            urls.extend(new_urls)
            current_page += 1

        await page.close()
        return list(set(urls))  # deduplicate within platform

    async def _scrape_listing(self, url: str) -> BusinessListing | None:
        """Extract all fields from a single listing detail page."""
        page = await self.new_page()
        try:
            await self.goto(page, url)
            soup = BeautifulSoup(await page.content(), "lxml")

            def text(selector: str) -> str:
                el = soup.select_one(selector)
                return el.get_text(strip=True) if el else ""

            title = text("h1") or text(".listing-title")
            description = text(".listing-description") or text(".description")
            asking_price_raw = text(".asking-price") or text("[data-field='price']")
            revenue_raw = text("[data-field='revenue']") or text(".revenue")
            profit_raw = text("[data-field='profit']") or text(".ebitda")
            location_raw = text(".location") or text("[data-field='location']")
            sector_raw = text(".category") or text("[data-field='category']")
            staff_raw = text("[data-field='staff']") or text(".staff-count")
            reason_raw = text("[data-field='reason-for-sale']") or text(".reason")
            contact_name = text(".seller-name") or text(".contact-name")
            contact_email_el = soup.select_one("a[href^='mailto:']")
            contact_phone_el = soup.select_one("a[href^='tel:']")

            staff_count = None
            if staff_raw:
                nums = re.findall(r"\d+", staff_raw)
                staff_count = int(nums[0]) if nums else None

            return BusinessListing(
                listing_id=self.make_listing_id(self.platform_key, url),
                platform=self.platform_key,
                url=url,
                title=title,
                description=description,
                sector=sector_raw.lower(),
                state=self.extract_state(location_raw),
                suburb=location_raw,
                asking_price=self.parse_price(asking_price_raw),
                revenue=self.parse_price(revenue_raw),
                profit=self.parse_price(profit_raw),
                staff_count=staff_count,
                reason_for_sale=reason_raw,
                has_broker=False,  # Guaranteed by platform design
                listing_date=date.today(),  # No reliable date field on site
                contact_name=contact_name,
                contact_email=contact_email_el["href"].replace("mailto:", "")
                if contact_email_el
                else "",
                contact_phone=contact_phone_el["href"].replace("tel:", "")
                if contact_phone_el
                else "",
            )
        finally:
            await page.close()
