"""
Scraper for businessforsale.com.au — broader coverage including some broker listings.
Broker detection is applied and flagged on each listing.
"""

from __future__ import annotations

import logging
import re
from datetime import date
from typing import List, Optional

from bs4 import BeautifulSoup

import config
from schema import BusinessListing
from .base_scraper import BaseScraper

logger = logging.getLogger(__name__)

BASE_URL = config.PLATFORM_URLS["businessforsale"]

# Category + state filtered search URLs
SEARCH_URLS = [
    f"{BASE_URL}/business-for-sale/qld/",
    f"{BASE_URL}/business-for-sale/nsw/",
    f"{BASE_URL}/business-for-sale/vic/",
]


class BusinessForSaleScraper(BaseScraper):
    platform_key = "businessforsale"

    async def scrape_all(self) -> List[BusinessListing]:
        listings: List[BusinessListing] = []

        async with self:
            for search_url in SEARCH_URLS:
                state = re.search(r"/(\w+)/$", search_url).group(1).upper()
                try:
                    urls = await self._collect_listing_urls(search_url)
                    logger.info(
                        "BusinessForSale %s: found %d listing URLs", state, len(urls)
                    )
                    for url in urls:
                        try:
                            listing = await self._scrape_listing(url, state)
                            if listing:
                                listings.append(listing)
                        except Exception as exc:
                            logger.warning(
                                "BusinessForSale: failed to scrape %s — %s", url, exc
                            )
                except Exception as exc:
                    logger.warning(
                        "BusinessForSale: failed index for %s — %s", state, exc
                    )

        logger.info("BusinessForSale: scraped %d listings", len(listings))
        return listings

    async def _collect_listing_urls(self, index_url: str) -> List[str]:
        urls: List[str] = []
        page = await self.new_page()
        current_page = 1

        while True:
            paged_url = f"{index_url}?page={current_page}"
            await self.goto(page, paged_url)
            soup = BeautifulSoup(await page.content(), "lxml")

            links = soup.select("h2.listing-title a, a.listing-link")
            if not links:
                break

            for link in links:
                href = link.get("href", "")
                if href:
                    full = BASE_URL + href if href.startswith("/") else href
                    urls.append(full)

            next_btn = soup.select_one("a.pagination-next, [rel='next']")
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

            def attr_text(label: str) -> str:
                """Find structured attribute rows like 'Revenue: $500k'."""
                for row in soup.select(".listing-attribute, .detail-row"):
                    label_el = row.select_one(".label, .attr-label, strong")
                    value_el = row.select_one(".value, .attr-value")
                    if label_el and label.lower() in label_el.get_text().lower():
                        return value_el.get_text(strip=True) if value_el else ""
                return ""

            title = text("h1")
            description = text(".listing-description, .business-description")
            asking_price_raw = attr_text("asking price") or text(".price")
            revenue_raw = attr_text("revenue") or attr_text("turnover")
            profit_raw = attr_text("profit") or attr_text("ebitda")
            sector_raw = attr_text("category") or attr_text("type")
            staff_raw = attr_text("staff") or attr_text("employees")
            reason_raw = attr_text("reason for sale")
            location_raw = text(".location, .suburb")

            # Broker detection
            broker_indicators = ["listed by agent", "selling agent", "business broker"]
            has_broker = any(
                ind in description.lower() for ind in broker_indicators
            ) or bool(soup.select_one(".agent-details, .broker-badge"))

            staff_count: Optional[int] = None
            if staff_raw:
                nums = re.findall(r"\d+", staff_raw)
                staff_count = int(nums[0]) if nums else None

            listing_date_raw = attr_text("listed") or attr_text("date listed")
            days_raw = attr_text("days on market")
            days_on_market: Optional[int] = None
            if days_raw:
                nums = re.findall(r"\d+", days_raw)
                days_on_market = int(nums[0]) if nums else None

            contact_name = text(".contact-name, .seller-name")
            email_el = soup.select_one("a[href^='mailto:']")
            phone_el = soup.select_one("a[href^='tel:']")

            return BusinessListing(
                listing_id=self.make_listing_id(self.platform_key, url),
                platform=self.platform_key,
                url=url,
                title=title,
                description=description,
                sector=sector_raw.lower() or self._infer_sector(title + " " + description),
                state=state,
                suburb=location_raw,
                asking_price=self.parse_price(asking_price_raw),
                revenue=self.parse_price(revenue_raw),
                profit=self.parse_price(profit_raw),
                staff_count=staff_count,
                reason_for_sale=reason_raw,
                has_broker=has_broker,
                listing_date=date.today(),
                days_on_market=days_on_market,
                contact_name=contact_name,
                contact_email=email_el["href"].replace("mailto:", "") if email_el else "",
                contact_phone=phone_el["href"].replace("tel:", "") if phone_el else "",
            )
        finally:
            await page.close()

    @staticmethod
    def _infer_sector(text: str) -> str:
        from scrapers.gumtree_scraper import GumtreeScraper
        return GumtreeScraper._infer_sector(text)
