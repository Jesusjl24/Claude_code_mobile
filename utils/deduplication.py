"""
Cross-platform deduplication.

Two listings are considered duplicates when:
  1. Their listing_id hashes match (same URL on same platform), OR
  2. They share the same asking_price + suburb + sector across different platforms
     (fuzzy business match — likely the same underlying business)
"""

from __future__ import annotations

import logging
from typing import List

from schema import BusinessListing

logger = logging.getLogger(__name__)


class Deduplicator:
    def deduplicate(self, listings: List[BusinessListing]) -> List[BusinessListing]:
        seen_ids: set = set()
        seen_fingerprints: set = set()
        unique: List[BusinessListing] = []

        for listing in listings:
            # Primary key dedup
            if listing.listing_id in seen_ids:
                continue
            seen_ids.add(listing.listing_id)

            # Cross-platform fuzzy dedup
            fp = self._fingerprint(listing)
            if fp and fp in seen_fingerprints:
                logger.debug(
                    "Dedup: skipping likely duplicate %s (fp=%s)",
                    listing.listing_id,
                    fp,
                )
                continue
            if fp:
                seen_fingerprints.add(fp)

            unique.append(listing)

        removed = len(listings) - len(unique)
        if removed:
            logger.info("Deduplicator: removed %d duplicates", removed)
        return unique

    @staticmethod
    def _fingerprint(listing: BusinessListing) -> str | None:
        """
        Build a fingerprint from price + suburb + sector.
        Returns None if too many fields are missing to fingerprint reliably.
        """
        if not listing.asking_price or not listing.suburb or not listing.sector:
            return None
        price_bucket = round(listing.asking_price / 50_000) * 50_000
        suburb_norm = listing.suburb.lower().strip()
        sector_norm = listing.sector.lower().strip()
        return f"{price_bucket}|{suburb_norm}|{sector_norm}"
