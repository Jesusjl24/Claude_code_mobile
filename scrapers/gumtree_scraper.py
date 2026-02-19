"""
Scraper for gumtree.com.au — businesses & franchises for sale category.
Gumtree has heavier bot detection; uses random delays and rotating user-agents.
"""

from __future__ import annotations

import logging
import re
from datetime import date, timedelta
from typing import List, Optional

from bs4 import BeautifulSoup

import config
from schema import BusinessListing
from .base_scraper import BaseScraper

logger = logging.getLogger(__name__)

BASE_URL = "https://www.gumtree.com.au"
# Target states with Gumtree location slugs
STATE_URLS = {
    "QLD": f"{BASE_URL}/s-businesses-franchises-for-sale/qld/k0c18320l3005668",
    "NSW": f"{BASE_URL}/s-businesses-franchises-for-sale/nsw/k0c18320l3002770",
    "VIC": f"{BASE_URL}/s-businesses-franchises-for-sale/vic/k0c18320l3000261",
}


class GumtreeScraper(BaseScraper):
    platform_key = "gumtree"

    async def scrape_all(self) -> List[BusinessListing]:
        listings: List[BusinessListing] = []

        async with self:
            for state, index_url in STATE_URLS.items():
                try:
                    state_listings = await self._scrape_state(state, index_url)
                    listings.extend(state_listings)
                except Exception as exc:
                    logger.warning("Gumtree: failed scraping %s — %s", state, exc)

        logger.info("Gumtree: scraped %d listings", len(listings))
        return listings

    async def _scrape_state(self, state: str, index_url: str) -> List[BusinessListing]:
        urls = await self._collect_listing_urls(index_url)
        logger.info("Gumtree %s: found %d listing URLs", state, len(urls))

        results: List[BusinessListing] = []
        for url in urls:
            try:
                listing = await self._scrape_listing(url, state)
                if listing:
                    results.append(listing)
            except Exception as exc:
                logger.warning("Gumtree: failed to scrape %s — %s", url, exc)
        return results

    async def _collect_listing_urls(self, index_url: str) -> List[str]:
        urls: List[str] = []
        page = await self.new_page()
        current_page = 1

        while True:
            paged_url = f"{index_url}?page={current_page}"
            await self.goto(page, paged_url)
            soup = BeautifulSoup(await page.content(), "lxml")

            cards = soup.select("a.user-ad-row, a.user-ad-collection-new-design")
            if not cards:
                break

            for card in cards:
                href = card.get("href", "")
                if href:
                    full_url = BASE_URL + href if href.startswith("/") else href
                    urls.append(full_url)

            # Check for next page link
            next_btn = soup.select_one("a[data-gumtree-pagination='next']")
            if not next_btn:
                break
            current_page += 1

        await page.close()
        return list(set(urls))

    async def _scrape_listing(self, url: str, state: str) -> Optional[BusinessListing]:
        page = await self.new_page()
        try:
            await self.goto(page, url)
            soup = BeautifulSoup(await page.content(), "lxml")

            def text(selector: str) -> str:
                el = soup.select_one(selector)
                return el.get_text(strip=True) if el else ""

            title = text("h1.user-ad-detail-title")
            description = text(".user-ad-description")
            price_raw = text(".user-ad-price")
            location_raw = text(".user-ad-details__details-item--location")

            # Gumtree doesn't have structured revenue/profit fields; parse from description
            revenue = self._extract_from_description(description, "revenue", "turnover")
            profit = self._extract_from_description(description, "profit", "ebitda")
            staff_count = self._extract_staff(description)
            reason = self._extract_reason(description)

            # Detect broker language
            desc_lower = description.lower()
            has_broker = any(
                word in desc_lower
                for word in ["agent", "broker", "listed by", "on behalf"]
            )

            # Posted date → days on market
            date_text = text(".user-ad-details__details-item--date-posted")
            listing_date, days_on_market = self._parse_posted_date(date_text)

            contact_el = soup.select_one("a[href^='mailto:']")
            phone_el = soup.select_one("a[href^='tel:']")

            return BusinessListing(
                listing_id=self.make_listing_id(self.platform_key, url),
                platform=self.platform_key,
                url=url,
                title=title,
                description=description,
                sector=self._infer_sector(title + " " + description),
                state=state,
                suburb=location_raw,
                asking_price=self.parse_price(price_raw),
                revenue=revenue,
                profit=profit,
                staff_count=staff_count,
                reason_for_sale=reason,
                has_broker=has_broker,
                listing_date=listing_date,
                days_on_market=days_on_market,
                contact_email=contact_el["href"].replace("mailto:", "")
                if contact_el
                else "",
                contact_phone=phone_el["href"].replace("tel:", "")
                if phone_el
                else "",
            )
        finally:
            await page.close()

    # ------------------------------------------------------------------
    # Description parsing helpers
    # ------------------------------------------------------------------

    def _extract_from_description(self, text: str, *keywords: str) -> Optional[float]:
        """Find the first dollar amount following any of the given keywords."""
        pattern = r"(?:" + "|".join(keywords) + r")[^\$\d]*\$?([\d,]+(?:\.\d+)?)\s*([MmKk]?)"
        match = re.search(pattern, text, re.IGNORECASE)
        if not match:
            return None
        raw = match.group(1).replace(",", "") + match.group(2).upper()
        return self.parse_price(raw)

    def _extract_staff(self, text: str) -> Optional[int]:
        match = re.search(r"(\d+)\s+(?:full[- ]time|part[- ]time|staff|employee)", text, re.I)
        return int(match.group(1)) if match else None

    def _extract_reason(self, text: str) -> str:
        match = re.search(
            r"reason for sale[:\s]+([^\.]+\.)", text, re.IGNORECASE
        )
        return match.group(1).strip() if match else ""

    def _parse_posted_date(self, text: str):
        today = date.today()
        if not text:
            return None, None
        text_lower = text.lower()
        if "today" in text_lower:
            return today, 0
        if "yesterday" in text_lower:
            return today - timedelta(days=1), 1
        match = re.search(r"(\d+)\s+day", text_lower)
        if match:
            days = int(match.group(1))
            return today - timedelta(days=days), days
        return None, None

    @staticmethod
    def _infer_sector(text: str) -> str:
        """Infer sector from title/description using known keywords."""
        text_lower = text.lower()
        sector_map = {
            "plumbing": ["plumb"],
            "electrical": ["electri"],
            "laundromat": ["laundromat", "laundry"],
            "accounting": ["account", "bookkeep", "taxation", "tax"],
            "landscaping": ["landscap", "garden", "lawn"],
            "waste management": ["waste", "rubbish", "recycl"],
            "car wash": ["car wash", "carwash", "detailing"],
            "nail salon": ["nail salon", "nail bar", "beauty"],
            "junk removal": ["junk", "rubbish removal", "skip"],
            "light industrial": ["manufactur", "fabricat", "industrial"],
            "trades": ["trade", "construction", "building"],
        }
        for sector, keywords in sector_map.items():
            if any(kw in text_lower for kw in keywords):
                return sector
        return "other"
