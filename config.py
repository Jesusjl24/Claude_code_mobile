"""
Central configuration for the Business Finder tool.
All tuneable parameters live here so agents stay decoupled from hard-coded values.
"""

from __future__ import annotations

import os
from dataclasses import dataclass, field
from typing import List

from dotenv import load_dotenv

load_dotenv()


# ---------------------------------------------------------------------------
# API / credentials
# ---------------------------------------------------------------------------

ANTHROPIC_API_KEY: str = os.getenv("ANTHROPIC_API_KEY", "")
GOOGLE_SHEETS_CREDENTIALS_FILE: str = os.getenv(
    "GOOGLE_SHEETS_CREDENTIALS_FILE", "credentials.json"
)
GOOGLE_SHEET_ID: str = os.getenv("GOOGLE_SHEET_ID", "")
ABN_LOOKUP_API_KEY: str = os.getenv("ABN_LOOKUP_API_KEY", "")  # ASIC / ABR API

# ---------------------------------------------------------------------------
# Target Business Profile (TBP) — scoring anchor
# ---------------------------------------------------------------------------

REVENUE_MIN: float = 1_000_000   # AUD
REVENUE_MAX: float = 4_000_000   # AUD
PROFIT_TARGET: float = 400_000   # AUD annual
ASKING_PRICE_MIN: float = 500_000
ASKING_PRICE_MAX: float = 5_000_000
TARGET_STATES: List[str] = ["QLD", "VIC", "NSW"]
TARGET_SECTORS: List[str] = [
    "plumbing",
    "electrical",
    "laundromat",
    "accounting",
    "landscaping",
    "waste management",
    "car wash",
    "nail salon",
    "junk removal",
    "light industrial",
    "trades",
]

# Positive signals used by the Scoring Agent
POSITIVE_SIGNALS: List[str] = [
    "owner retiring",
    "retiring",
    "no broker",
    "no agent",
    "under management",
    "management in place",
    "systems in place",
    "succession",
    "lifestyle change",
    "health reasons",
    "semi-absentee",
    "absentee",
]

# Negative signals (increase risk score)
NEGATIVE_SIGNALS: List[str] = [
    "key person",
    "owner operator",
    "owner-operator",
    "owner dependent",
    "licence required",
    "regulatory",
    "union",
    "highly specialised",
    "declining",
]


# ---------------------------------------------------------------------------
# Scoring weights — must sum to 1.0
# ---------------------------------------------------------------------------

@dataclass
class ScoringWeights:
    sector_match: float = 0.20
    revenue_in_range: float = 0.20
    price_in_range: float = 0.15
    no_broker: float = 0.20
    owner_retiring: float = 0.15
    state_match: float = 0.10

    def validate(self) -> None:
        total = (
            self.sector_match
            + self.revenue_in_range
            + self.price_in_range
            + self.no_broker
            + self.owner_retiring
            + self.state_match
        )
        if abs(total - 1.0) > 0.001:
            raise ValueError(f"Scoring weights must sum to 1.0 (got {total:.3f})")


SCORING_WEIGHTS = ScoringWeights()
SCORING_WEIGHTS.validate()

# Minimum score (0–100) to be considered for outreach
OUTREACH_SCORE_THRESHOLD: int = 55

# ---------------------------------------------------------------------------
# Scraping
# ---------------------------------------------------------------------------

SCRAPER_HEADLESS: bool = True
SCRAPER_TIMEOUT_MS: int = 30_000
SCRAPER_USER_AGENTS: List[str] = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
]

PLATFORM_URLS: dict = {
    "noagentbusiness": "https://www.noagentbusiness.com.au",
    "gumtree": "https://www.gumtree.com.au/s-businesses-franchises-for-sale/",
    "businessforsale": "https://www.businessforsale.com.au",
}

# ---------------------------------------------------------------------------
# Outreach
# ---------------------------------------------------------------------------

SENDER_NAME: str = os.getenv("SENDER_NAME", "")
SENDER_EMAIL: str = os.getenv("SENDER_EMAIL", "")
OUTREACH_REVIEW_REQUIRED: bool = True   # Human checkpoint before sending
FOLLOW_UP_INTERVALS_DAYS: List[int] = [4, 10, 21]  # Days after initial contact

# Claude model used for all AI agents
CLAUDE_MODEL: str = "claude-opus-4-6"
