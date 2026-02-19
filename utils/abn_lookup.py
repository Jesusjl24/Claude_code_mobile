"""
ABN / ASIC enrichment via the ABR (Australian Business Register) public API.
Requires a free ABR API key: https://abr.business.gov.au/Documentation/AbrWebServiceDescription

Falls back gracefully if no key is configured or the lookup fails.
"""

from __future__ import annotations

import logging
from datetime import date, datetime
from typing import Any

import httpx

import config

logger = logging.getLogger(__name__)

ABR_ENDPOINT = (
    "https://abr.business.gov.au/json/AbnDetails.aspx"
    "?abn={abn}&callback=callback&guid={guid}"
)


class ABNLookup:
    def __init__(self) -> None:
        self._enabled = bool(config.ABN_LOOKUP_API_KEY)
        if not self._enabled:
            logger.info("ABNLookup: no API key configured — enrichment disabled")

    async def lookup(self, abn: str) -> dict[str, Any]:
        """
        Return enrichment dict with keys:
          age_years, directors, entity_type
        Returns empty dict on failure.
        """
        if not self._enabled:
            return {}

        abn_clean = abn.replace(" ", "")
        url = ABR_ENDPOINT.format(abn=abn_clean, guid=config.ABN_LOOKUP_API_KEY)

        try:
            async with httpx.AsyncClient(timeout=10) as client:
                response = await client.get(url)
                response.raise_for_status()
                # ABR returns JSONP — strip wrapper
                text = response.text.strip()
                if text.startswith("callback("):
                    text = text[9:-1]
                import json
                data = json.loads(text)

            result: dict[str, Any] = {}

            # Entity type
            entity_type = data.get("entityTypeName", "")
            result["entity_type"] = entity_type

            # Business age from ABN registration date
            abn_status_date = data.get("ABNStatusFromDate", "")
            if abn_status_date:
                try:
                    reg_date = datetime.strptime(abn_status_date[:10], "%Y%m%d").date()
                    result["age_years"] = (date.today() - reg_date).days // 365
                except ValueError:
                    pass

            # Directors (only available for companies — not sole traders)
            # The public ABR API does not expose directors; ASIC Connect would need auth.
            # Leave as empty list; placeholder for future ASIC integration.
            result["directors"] = []

            return result

        except Exception as exc:
            logger.debug("ABNLookup failed for ABN %s: %s", abn, exc)
            return {}
