"""
SQLite database layer using the stdlib sqlite3 module — zero external dependencies.
Provides simple CRUD helpers consumed by the FastAPI app and pipeline agents.
"""

from __future__ import annotations

import json
import logging
import sqlite3
from contextlib import contextmanager
from pathlib import Path
from typing import List, Optional

from schema import BusinessListing, OutreachMessage, OutreachStatus, RiskLevel

logger = logging.getLogger(__name__)

DB_PATH = Path(__file__).parent / "business_finder.db"


def get_connection() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    return conn


@contextmanager
def db():
    conn = get_connection()
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


# ---------------------------------------------------------------------------
# Schema migration
# ---------------------------------------------------------------------------

def init_db() -> None:
    with db() as conn:
        conn.executescript("""
            CREATE TABLE IF NOT EXISTS listings (
                listing_id          TEXT PRIMARY KEY,
                platform            TEXT,
                url                 TEXT,
                scraped_at          TEXT,
                title               TEXT,
                sector              TEXT,
                state               TEXT,
                suburb              TEXT,
                description         TEXT,
                asking_price        REAL,
                revenue             REAL,
                profit              REAL,
                staff_count         INTEGER,
                reason_for_sale     TEXT,
                has_broker          INTEGER,
                listing_date        TEXT,
                days_on_market      INTEGER,
                contact_name        TEXT,
                contact_email       TEXT,
                contact_phone       TEXT,
                abn                 TEXT,
                business_age_years  INTEGER,
                director_names      TEXT,
                asic_entity_type    TEXT,
                opportunity_score   INTEGER,
                risk_level          TEXT,
                score_breakdown     TEXT,
                scoring_notes       TEXT,
                outreach_status     TEXT DEFAULT 'pending_review',
                outreach_draft      TEXT,
                follow_up_count     INTEGER DEFAULT 0,
                last_contact_date   TEXT,
                meeting_date        TEXT
            );

            CREATE TABLE IF NOT EXISTS outreach_messages (
                id              INTEGER PRIMARY KEY AUTOINCREMENT,
                listing_id      TEXT,
                subject         TEXT,
                body            TEXT,
                created_at      TEXT,
                approved        INTEGER DEFAULT 0,
                sent_at         TEXT,
                follow_up_number INTEGER DEFAULT 0,
                FOREIGN KEY (listing_id) REFERENCES listings(listing_id)
            );
        """)
    logger.info("Database initialised at %s", DB_PATH)


# ---------------------------------------------------------------------------
# Listings CRUD
# ---------------------------------------------------------------------------

def upsert_listing(listing: BusinessListing) -> None:
    row = {
        "listing_id": listing.listing_id,
        "platform": listing.platform,
        "url": listing.url,
        "scraped_at": listing.scraped_at.isoformat(),
        "title": listing.title,
        "sector": listing.sector,
        "state": listing.state,
        "suburb": listing.suburb,
        "description": listing.description,
        "asking_price": listing.asking_price,
        "revenue": listing.revenue,
        "profit": listing.profit,
        "staff_count": listing.staff_count,
        "reason_for_sale": listing.reason_for_sale,
        "has_broker": int(listing.has_broker),
        "listing_date": str(listing.listing_date) if listing.listing_date else None,
        "days_on_market": listing.days_on_market,
        "contact_name": listing.contact_name,
        "contact_email": listing.contact_email,
        "contact_phone": listing.contact_phone,
        "abn": listing.abn,
        "business_age_years": listing.business_age_years,
        "director_names": json.dumps(listing.director_names),
        "asic_entity_type": listing.asic_entity_type,
        "opportunity_score": listing.opportunity_score,
        "risk_level": listing.risk_level.value if listing.risk_level else None,
        "score_breakdown": json.dumps(listing.score_breakdown),
        "scoring_notes": listing.scoring_notes,
        "outreach_status": listing.outreach_status.value,
        "outreach_draft": listing.outreach_draft,
        "follow_up_count": listing.follow_up_count,
        "last_contact_date": str(listing.last_contact_date) if listing.last_contact_date else None,
        "meeting_date": str(listing.meeting_date) if listing.meeting_date else None,
    }
    cols = ", ".join(row.keys())
    placeholders = ", ".join(f":{k}" for k in row.keys())
    update_cols = ", ".join(
        f"{k}=excluded.{k}" for k in row.keys() if k != "listing_id"
    )
    sql = f"""
        INSERT INTO listings ({cols}) VALUES ({placeholders})
        ON CONFLICT(listing_id) DO UPDATE SET {update_cols}
    """
    with db() as conn:
        conn.execute(sql, row)


def get_listings(
    min_score: Optional[int] = None,
    state: Optional[str] = None,
    sector: Optional[str] = None,
    exclude_high_risk: bool = False,
    limit: int = 200,
    offset: int = 0,
) -> List[dict]:
    clauses = []
    params: dict = {"limit": limit, "offset": offset}

    if min_score is not None:
        clauses.append("opportunity_score >= :min_score")
        params["min_score"] = min_score
    if state:
        clauses.append("state = :state")
        params["state"] = state
    if sector:
        clauses.append("sector LIKE :sector")
        params["sector"] = f"%{sector}%"
    if exclude_high_risk:
        clauses.append("(risk_level IS NULL OR risk_level != 'high')")

    where = ("WHERE " + " AND ".join(clauses)) if clauses else ""
    sql = f"""
        SELECT * FROM listings {where}
        ORDER BY opportunity_score DESC NULLS LAST
        LIMIT :limit OFFSET :offset
    """
    with db() as conn:
        rows = conn.execute(sql, params).fetchall()
    return [dict(r) for r in rows]


def get_listing(listing_id: str) -> Optional[dict]:
    with db() as conn:
        row = conn.execute(
            "SELECT * FROM listings WHERE listing_id = ?", (listing_id,)
        ).fetchone()
    return dict(row) if row else None


def update_outreach_status(listing_id: str, status: OutreachStatus) -> None:
    with db() as conn:
        conn.execute(
            "UPDATE listings SET outreach_status = ? WHERE listing_id = ?",
            (status.value, listing_id),
        )


def count_listings() -> dict:
    with db() as conn:
        total = conn.execute("SELECT COUNT(*) FROM listings").fetchone()[0]
        scored = conn.execute(
            "SELECT COUNT(*) FROM listings WHERE opportunity_score IS NOT NULL"
        ).fetchone()[0]
        top = conn.execute(
            "SELECT COUNT(*) FROM listings WHERE opportunity_score >= 60"
        ).fetchone()[0]
        pending_outreach = conn.execute(
            "SELECT COUNT(*) FROM listings WHERE outreach_status = 'pending_review'"
        ).fetchone()[0]
        meetings = conn.execute(
            "SELECT COUNT(*) FROM listings WHERE outreach_status = 'meeting_scheduled'"
        ).fetchone()[0]
    return {
        "total": total,
        "scored": scored,
        "top_opportunities": top,
        "pending_outreach_review": pending_outreach,
        "meetings_scheduled": meetings,
    }


# ---------------------------------------------------------------------------
# Outreach messages CRUD
# ---------------------------------------------------------------------------

def save_outreach_message(msg: OutreachMessage) -> int:
    with db() as conn:
        cur = conn.execute(
            """INSERT INTO outreach_messages
               (listing_id, subject, body, created_at, approved, follow_up_number)
               VALUES (?, ?, ?, ?, ?, ?)""",
            (
                msg.listing_id,
                msg.subject,
                msg.body,
                msg.created_at.isoformat(),
                int(msg.approved),
                msg.follow_up_number,
            ),
        )
        return cur.lastrowid


def get_outreach_messages(listing_id: str) -> List[dict]:
    with db() as conn:
        rows = conn.execute(
            "SELECT * FROM outreach_messages WHERE listing_id = ? ORDER BY id",
            (listing_id,),
        ).fetchall()
    return [dict(r) for r in rows]


def approve_outreach_message(msg_id: int) -> None:
    with db() as conn:
        conn.execute(
            "UPDATE outreach_messages SET approved = 1 WHERE id = ?", (msg_id,)
        )


def get_pending_outreach_queue() -> List[dict]:
    """Return listings that have a draft ready for human review."""
    with db() as conn:
        rows = conn.execute("""
            SELECT l.*, m.id as msg_id, m.subject, m.body as draft_body
            FROM listings l
            JOIN outreach_messages m ON l.listing_id = m.listing_id
            WHERE l.outreach_status = 'pending_review'
              AND m.approved = 0
            ORDER BY l.opportunity_score DESC NULLS LAST
        """).fetchall()
    return [dict(r) for r in rows]
