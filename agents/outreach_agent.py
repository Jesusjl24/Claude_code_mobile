"""
Layer 3 — Outreach Agent

For each high-scoring listing the agent:
  1. Selects the most appropriate base template
  2. Uses Claude to personalise the message for the specific business / seller
  3. Saves the draft to the DB with status = pending_review
  4. Does NOT send without human approval (OUTREACH_REVIEW_REQUIRED gate)
"""

from __future__ import annotations

import logging
import random
from typing import List

import anthropic

import config
import database
from outreach.templates import INITIAL_TEMPLATES, FOLLOW_UP_TEMPLATES, Template
from schema import BusinessListing, OutreachMessage, OutreachStatus

logger = logging.getLogger(__name__)

client = anthropic.Anthropic(api_key=config.ANTHROPIC_API_KEY)


class OutreachAgent:
    """
    Generates personalised outreach drafts and queues them for human review.

    Usage::

        agent = OutreachAgent()
        await agent.run(scored_listings)
    """

    async def run(self, listings: List[BusinessListing]) -> None:
        """
        Generate initial outreach drafts for listings that:
          - Score at or above OUTREACH_SCORE_THRESHOLD
          - Are not already contacted or excluded
          - Have a contact email or phone
        """
        candidates = [
            l for l in listings
            if (l.opportunity_score or 0) >= config.OUTREACH_SCORE_THRESHOLD
            and l.outreach_status == OutreachStatus.PENDING_REVIEW
            and l.risk_level and l.risk_level.value != "high"
            and (l.contact_email or l.contact_phone)
        ]

        logger.info("OutreachAgent: generating drafts for %d candidates", len(candidates))

        for listing in candidates:
            try:
                template = self._pick_template(listing)
                draft = await self._personalise(listing, template)
                msg = OutreachMessage(
                    listing_id=listing.listing_id,
                    subject=draft["subject"],
                    body=draft["body"],
                    follow_up_number=0,
                )
                database.save_outreach_message(msg)
                listing.outreach_draft = draft["body"]
                database.upsert_listing(listing)
                logger.info("OutreachAgent: draft queued for %s", listing.listing_id)
            except Exception as exc:
                logger.warning(
                    "OutreachAgent: failed for %s — %s", listing.listing_id, exc
                )

    async def generate_follow_up(self, listing_dict: dict, follow_up_number: int) -> None:
        """Draft a follow-up message for a previously contacted listing."""
        idx = min(follow_up_number - 1, len(FOLLOW_UP_TEMPLATES) - 1)
        template = FOLLOW_UP_TEMPLATES[idx]

        # Reconstruct a minimal BusinessListing for personalisation
        listing = BusinessListing(
            listing_id=listing_dict["listing_id"],
            platform=listing_dict.get("platform", ""),
            url=listing_dict.get("url", ""),
            title=listing_dict.get("title", ""),
            sector=listing_dict.get("sector", ""),
            state=listing_dict.get("state", ""),
            contact_name=listing_dict.get("contact_name", ""),
            contact_email=listing_dict.get("contact_email", ""),
            outreach_status=OutreachStatus.SENT,
        )

        draft = await self._personalise(listing, template)
        msg = OutreachMessage(
            listing_id=listing.listing_id,
            subject=draft["subject"],
            body=draft["body"],
            follow_up_number=follow_up_number,
        )
        database.save_outreach_message(msg)
        logger.info(
            "OutreachAgent: follow-up #%d queued for %s",
            follow_up_number,
            listing.listing_id,
        )

    # ------------------------------------------------------------------
    # Private helpers
    # ------------------------------------------------------------------

    @staticmethod
    def _pick_template(listing: BusinessListing) -> Template:
        """Select the best template based on listing signals."""
        desc_lower = listing.description.lower() + listing.reason_for_sale.lower()

        if any(s in desc_lower for s in ["under management", "semi-absentee", "absentee"]):
            return INITIAL_TEMPLATES[2]  # absentee_management_angle
        if any(s in desc_lower for s in ["retiring", "succession", "health"]):
            return INITIAL_TEMPLATES[1]  # no_succession_empathy
        return random.choice(INITIAL_TEMPLATES[:2])

    async def _personalise(self, listing: BusinessListing, template: Template) -> dict:
        """Ask Claude to personalise a template for the specific listing."""
        # Build a pre-filled version of the template as starting point
        prefilled_subject = (
            template.subject
            .replace("{sector}", listing.sector or "business")
            .replace("{business_name}", listing.title or "your business")
            .replace("{state}", listing.state or "your state")
        )
        prefilled_body = (
            template.body
            .replace("{contact_name}", listing.contact_name or "there")
            .replace("{business_name}", listing.title or "your business")
            .replace("{sector}", listing.sector or "business")
            .replace("{state}", listing.state or "your state")
            .replace("{sender_name}", config.SENDER_NAME)
            .replace("{sender_phone}", "")
            .replace("{personalised_hook}", self._generate_hook(listing))
        )

        if not config.ANTHROPIC_API_KEY:
            # No API key — return pre-filled template as-is
            return {"subject": prefilled_subject, "body": prefilled_body}

        prompt = f"""You are helping a serious, respectful private buyer personalise an outreach
email to a small business owner who is selling their business.

LISTING CONTEXT
Title: {listing.title}
Sector: {listing.sector}
State: {listing.state}
Asking Price: {listing.asking_price}
Revenue: {listing.revenue}
Reason for Sale: {listing.reason_for_sale}
Description (first 600 chars): {listing.description[:600]}

DRAFT EMAIL TO IMPROVE
Subject: {prefilled_subject}
---
{prefilled_body}

INSTRUCTIONS
- Improve the personalisation using specific details from the listing context
- Keep the tone warm, professional, and human — never corporate or salesy
- Keep the email concise (under 200 words for the body)
- Do NOT change the core structure or key sentences
- Respond ONLY with JSON: {{"subject": "...", "body": "..."}}
"""
        try:
            response = client.messages.create(
                model=config.CLAUDE_MODEL,
                max_tokens=1024,
                messages=[{"role": "user", "content": prompt}],
            )
            import json
            raw = response.content[0].text.strip()
            if raw.startswith("```"):
                raw = raw.split("```")[1]
                if raw.startswith("json"):
                    raw = raw[4:]
            data = json.loads(raw)
            return {
                "subject": data.get("subject", prefilled_subject),
                "body": data.get("body", prefilled_body),
            }
        except Exception as exc:
            logger.warning("Personalisation failed: %s — using prefilled template", exc)
            return {"subject": prefilled_subject, "body": prefilled_body}

    @staticmethod
    def _generate_hook(listing: BusinessListing) -> str:
        """Generate a brief personalised hook sentence fragment."""
        if listing.sector:
            return f"the reputation {listing.sector} businesses in {listing.state or 'your area'} can build over time"
        if listing.revenue:
            return f"the strong revenue profile and what that says about the quality of the customer base"
        return "the clear systems and team you've put in place"
