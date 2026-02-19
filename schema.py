"""
Shared data models for the Business Finder pipeline.
All agents communicate using these Pydantic models.
"""

from __future__ import annotations

from datetime import date, datetime
from enum import Enum
from typing import List, Optional

from pydantic import BaseModel, Field, field_validator


class RiskLevel(str, Enum):
    LOW = "low"
    MEDIUM = "medium"
    MEDIUM_HIGH = "medium_high"
    HIGH = "high"           # excluded from outreach


class OutreachStatus(str, Enum):
    PENDING_REVIEW = "pending_review"
    APPROVED = "approved"
    SENT = "sent"
    REPLIED = "replied"
    MEETING_SCHEDULED = "meeting_scheduled"
    NOT_INTERESTED = "not_interested"
    REJECTED = "rejected"   # human reviewer rejected draft


class BusinessListing(BaseModel):
    """
    Normalised representation of a business-for-sale listing scraped from any platform.
    """

    # --- Identity ---
    listing_id: str = Field(description="Unique ID: <platform>_<hash of URL>")
    platform: str = Field(description="Source platform key, e.g. 'noagentbusiness'")
    url: str
    scraped_at: datetime = Field(default_factory=datetime.utcnow)

    # --- Core listing fields ---
    title: str = ""
    sector: str = ""
    state: str = ""
    suburb: str = ""
    description: str = ""

    # --- Financials ---
    asking_price: Optional[float] = None      # AUD
    revenue: Optional[float] = None            # AUD annual
    profit: Optional[float] = None             # AUD annual EBITDA
    staff_count: Optional[int] = None

    # --- Qualitative ---
    reason_for_sale: str = ""
    has_broker: bool = False
    listing_date: Optional[date] = None
    days_on_market: Optional[int] = None

    # --- Contact ---
    contact_name: str = ""
    contact_email: str = ""
    contact_phone: str = ""

    # --- Enrichment (populated by Scoring Agent) ---
    abn: str = ""
    business_age_years: Optional[int] = None
    director_names: List[str] = Field(default_factory=list)
    asic_entity_type: str = ""

    # --- Scoring (populated by Scoring Agent) ---
    opportunity_score: Optional[int] = None   # 0–100
    risk_level: Optional[RiskLevel] = None
    score_breakdown: dict = Field(default_factory=dict)
    scoring_notes: str = ""

    # --- Outreach (populated by Outreach Agent) ---
    outreach_status: OutreachStatus = OutreachStatus.PENDING_REVIEW
    outreach_draft: str = ""
    follow_up_count: int = 0
    last_contact_date: Optional[date] = None
    meeting_date: Optional[date] = None

    @field_validator("asking_price", "revenue", "profit", mode="before")
    @classmethod
    def parse_currency(cls, v):
        """Strip $ and commas from currency strings; handle M/K suffixes."""
        if isinstance(v, str):
            v = v.replace("$", "").replace(",", "").strip()
            if not v or v.lower() in ("n/a", "poa", "tba", ""):
                return None
            multiplier = 1
            upper = v.upper()
            if upper.endswith("M"):
                multiplier = 1_000_000
                v = v[:-1].strip()
            elif upper.endswith("K"):
                multiplier = 1_000
                v = v[:-1].strip()
            try:
                return float(v) * multiplier
            except ValueError:
                return None
        return v

    def to_sheets_row(self) -> list:
        """Serialise to a flat list for Google Sheets ingestion."""
        return [
            self.listing_id,
            self.platform,
            self.url,
            self.scraped_at.isoformat(),
            self.title,
            self.sector,
            self.state,
            self.suburb,
            self.asking_price or "",
            self.revenue or "",
            self.profit or "",
            self.staff_count or "",
            self.reason_for_sale,
            "Yes" if self.has_broker else "No",
            str(self.listing_date or ""),
            self.days_on_market or "",
            self.contact_name,
            self.contact_email,
            self.contact_phone,
            self.abn,
            self.business_age_years or "",
            ", ".join(self.director_names),
            self.opportunity_score or "",
            self.risk_level.value if self.risk_level else "",
            self.scoring_notes,
            self.outreach_status.value,
        ]

    @staticmethod
    def sheets_headers() -> list:
        return [
            "Listing ID", "Platform", "URL", "Scraped At",
            "Title", "Sector", "State", "Suburb",
            "Asking Price", "Revenue", "Profit", "Staff Count",
            "Reason for Sale", "Has Broker",
            "Listing Date", "Days on Market",
            "Contact Name", "Contact Email", "Contact Phone",
            "ABN", "Business Age (Years)", "Directors",
            "Opportunity Score", "Risk Level", "Scoring Notes",
            "Outreach Status",
        ]


class OutreachMessage(BaseModel):
    """Draft outreach message generated for a specific listing."""
    listing_id: str
    subject: str
    body: str
    created_at: datetime = Field(default_factory=datetime.utcnow)
    approved: bool = False
    sent_at: Optional[datetime] = None
    follow_up_number: int = 0   # 0 = initial; 1,2,3 = follow-ups
