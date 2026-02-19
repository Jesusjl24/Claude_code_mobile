"""
FastAPI web application — Business Finder MVP.

Serves the responsive single-page UI and a REST API consumed by the frontend.
Run with:  uvicorn app:app --host 0.0.0.0 --port 8000 --reload
"""

from __future__ import annotations

import asyncio
import logging
from typing import Optional

from fastapi import BackgroundTasks, FastAPI, HTTPException, Query
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from fastapi.requests import Request
from pydantic import BaseModel

import database
import pipeline
from outreach.follow_up import FollowUpManager
from schema import OutreachStatus

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(name)s — %(message)s",
)
logger = logging.getLogger(__name__)

# Initialise DB on startup
database.init_db()

app = FastAPI(
    title="Business Finder",
    description="AI-powered small business acquisition discovery tool",
    version="1.0.0",
)

app.mount("/static", StaticFiles(directory="static"), name="static")
templates = Jinja2Templates(directory="templates")

# ---------------------------------------------------------------------------
# Pipeline state (simple in-memory flag for MVP)
# ---------------------------------------------------------------------------

_pipeline_running = False
_last_pipeline_result: Optional[dict] = None


# ---------------------------------------------------------------------------
# UI routes
# ---------------------------------------------------------------------------

@app.get("/", response_class=HTMLResponse)
async def index(request: Request):
    return templates.TemplateResponse(request, "index.html")


# ---------------------------------------------------------------------------
# API — Dashboard
# ---------------------------------------------------------------------------

@app.get("/api/stats")
async def get_stats():
    return database.count_listings()


# ---------------------------------------------------------------------------
# API — Pipeline
# ---------------------------------------------------------------------------

@app.post("/api/pipeline/run")
async def run_pipeline(background_tasks: BackgroundTasks):
    global _pipeline_running
    if _pipeline_running:
        raise HTTPException(status_code=409, detail="Pipeline already running")
    _pipeline_running = True
    background_tasks.add_task(_execute_pipeline)
    return {"status": "started"}


@app.get("/api/pipeline/status")
async def pipeline_status():
    return {
        "running": _pipeline_running,
        "last_result": _last_pipeline_result,
    }


async def _execute_pipeline():
    global _pipeline_running, _last_pipeline_result
    try:
        _last_pipeline_result = await pipeline.run_full_pipeline()
    except Exception as exc:
        logger.error("Pipeline error: %s", exc, exc_info=True)
        _last_pipeline_result = {"error": str(exc)}
    finally:
        _pipeline_running = False


# ---------------------------------------------------------------------------
# API — Listings
# ---------------------------------------------------------------------------

@app.get("/api/listings")
async def list_listings(
    min_score: Optional[int] = Query(None, description="Minimum opportunity score"),
    state: Optional[str] = Query(None),
    sector: Optional[str] = Query(None),
    exclude_high_risk: bool = Query(True),
    limit: int = Query(50, le=200),
    offset: int = Query(0),
):
    rows = database.get_listings(
        min_score=min_score,
        state=state,
        sector=sector,
        exclude_high_risk=exclude_high_risk,
        limit=limit,
        offset=offset,
    )
    return {"listings": rows, "count": len(rows)}


@app.get("/api/listings/{listing_id}")
async def get_listing(listing_id: str):
    row = database.get_listing(listing_id)
    if not row:
        raise HTTPException(status_code=404, detail="Listing not found")
    messages = database.get_outreach_messages(listing_id)
    return {"listing": row, "outreach_messages": messages}


# ---------------------------------------------------------------------------
# API — Outreach review queue
# ---------------------------------------------------------------------------

@app.get("/api/outreach/queue")
async def outreach_queue():
    return {"queue": database.get_pending_outreach_queue()}


class ApproveRequest(BaseModel):
    msg_id: int


@app.post("/api/outreach/{listing_id}/approve")
async def approve_outreach(listing_id: str, body: ApproveRequest):
    database.approve_outreach_message(body.msg_id)
    database.update_outreach_status(listing_id, OutreachStatus.APPROVED)
    return {"status": "approved", "listing_id": listing_id}


@app.post("/api/outreach/{listing_id}/reject")
async def reject_outreach(listing_id: str, body: ApproveRequest):
    database.update_outreach_status(listing_id, OutreachStatus.REJECTED)
    return {"status": "rejected", "listing_id": listing_id}


# ---------------------------------------------------------------------------
# API — Follow-ups
# ---------------------------------------------------------------------------

@app.get("/api/followups/due")
async def due_followups():
    manager = FollowUpManager()
    return {"due": manager.get_due_followups()}
