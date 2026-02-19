"""
Abstract base class shared by all platform scrapers.
Uses Playwright for JavaScript-rendered pages and provides common helpers.
"""

from __future__ import annotations

import hashlib
import logging
import random
import time
from abc import ABC, abstractmethod
from typing import List, Optional

from playwright.async_api import (
    Browser,
    BrowserContext,
    Page,
    Playwright,
    async_playwright,
)
from tenacity import retry, stop_after_attempt, wait_exponential

import config
from schema import BusinessListing

logger = logging.getLogger(__name__)


class BaseScraper(ABC):
    """
    Common scaffolding for all platform scrapers.

    Each subclass must implement:
      - ``platform_key``:  short string identifier, e.g. 'gumtree'
      - ``scrape_all()``:  async generator that yields BusinessListing objects
    """

    platform_key: str = ""

    def __init__(self) -> None:
        self._playwright: Optional[Playwright] = None
        self._browser: Optional[Browser] = None
        self._context: Optional[BrowserContext] = None

    # ------------------------------------------------------------------
    # Lifecycle
    # ------------------------------------------------------------------

    async def __aenter__(self) -> "BaseScraper":
        self._playwright = await async_playwright().start()
        self._browser = await self._playwright.chromium.launch(
            headless=config.SCRAPER_HEADLESS,
            args=["--no-sandbox", "--disable-setuid-sandbox"],
        )
        self._context = await self._browser.new_context(
            user_agent=random.choice(config.SCRAPER_USER_AGENTS),
            locale="en-AU",
            timezone_id="Australia/Sydney",
            viewport={"width": 1280, "height": 800},
        )
        return self

    async def __aexit__(self, *_) -> None:
        if self._context:
            await self._context.close()
        if self._browser:
            await self._browser.close()
        if self._playwright:
            await self._playwright.stop()

    # ------------------------------------------------------------------
    # Abstract interface
    # ------------------------------------------------------------------

    @abstractmethod
    async def scrape_all(self) -> List[BusinessListing]:
        """Return a list of normalised BusinessListing objects."""
        ...

    # ------------------------------------------------------------------
    # Shared helpers
    # ------------------------------------------------------------------

    async def new_page(self) -> Page:
        """Open a fresh tab with stealth-ish settings."""
        assert self._context is not None, "Scraper not started — use async with."
        page = await self._context.new_page()
        # Prevent bot-detection fingerprinting via navigator properties
        await page.add_init_script(
            "Object.defineProperty(navigator,'webdriver',{get:()=>undefined})"
        )
        return page

    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=2, max=10),
        reraise=True,
    )
    async def goto(self, page: Page, url: str) -> None:
        """Navigate with retry logic and a polite delay."""
        await page.goto(url, timeout=config.SCRAPER_TIMEOUT_MS, wait_until="domcontentloaded")
        time.sleep(random.uniform(1.5, 3.5))

    @staticmethod
    def make_listing_id(platform: str, url: str) -> str:
        """Deterministic ID from platform + URL."""
        digest = hashlib.sha256(url.encode()).hexdigest()[:12]
        return f"{platform}_{digest}"

    @staticmethod
    def parse_price(text: str) -> Optional[float]:
        """Extract a numeric AUD value from messy text."""
        import re
        text = text.upper().replace(",", "").replace("$", "").strip()
        multiplier = 1
        if "M" in text:
            multiplier = 1_000_000
            text = text.replace("M", "")
        elif "K" in text:
            multiplier = 1_000
            text = text.replace("K", "")
        numbers = re.findall(r"\d+(?:\.\d+)?", text)
        if numbers:
            return float(numbers[0]) * multiplier
        return None

    @staticmethod
    def extract_state(text: str) -> str:
        """Return the first Australian state abbreviation found in text."""
        import re
        match = re.search(r"\b(QLD|NSW|VIC|WA|SA|TAS|ACT|NT)\b", text.upper())
        return match.group(1) if match else ""
