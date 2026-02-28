"""
Scraping logic for Prosper Scout.
Uses saved site rules from sites.json to scrape business listings.
"""

import time
from urllib.parse import urlparse, urljoin

import requests
from bs4 import BeautifulSoup

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/120.0.0.0 Safari/537.36"
    )
}

REQUEST_DELAY = 0.5  # seconds between requests


def scrape_listings(url, site_rules):
    """
    Scrape business listings from an index page using saved site rules.

    Args:
        url: The index page URL to scrape.
        site_rules: Dict of rules for this domain from sites.json.

    Returns:
        A list of dicts, each containing:
          - name, price, location, description, url
    """
    parsed = urlparse(url)
    base_url = f"{parsed.scheme}://{parsed.netloc}"

    index_rules = site_rules.get("index_page", {})
    detail_rules = site_rules.get("detail_page", {})

    card_selector = index_rules.get("card_selector", "")
    link_label = index_rules.get("link_label", "")

    # Fetch the index page
    try:
        resp = requests.get(url, headers=HEADERS, timeout=15)
        resp.raise_for_status()
    except requests.RequestException as e:
        return {"error": f"Failed to fetch index page: {str(e)}"}

    soup = BeautifulSoup(resp.text, "html.parser")

    # Find all listing cards
    cards = soup.select(card_selector) if card_selector else []

    if not cards:
        return {"error": "No listing cards found with the saved selector."}

    # Extract detail page URLs from each card
    detail_urls = []
    for card in cards:
        detail_url = _extract_detail_url(card, link_label, base_url, url)
        if detail_url:
            detail_urls.append(detail_url)

    if not detail_urls:
        return {"error": "Found listing cards but could not extract any detail page URLs."}

    # Scrape each detail page
    listings = []
    for detail_url in detail_urls:
        time.sleep(REQUEST_DELAY)
        listing = _scrape_detail_page(detail_url, detail_rules)
        listing["url"] = detail_url
        listings.append(listing)

    return listings


def _extract_detail_url(card, link_label, base_url, page_url):
    """Extract the detail page URL from a listing card."""
    anchors = card.find_all("a", href=True)

    for a in anchors:
        text = a.get_text(strip=True)
        href = a["href"]

        # Match by anchor text if a link label is specified
        if link_label:
            if link_label.lower() in text.lower():
                return _resolve_url(href, base_url, page_url)
        else:
            # No label specified — take the first anchor with a real href
            if href and href != "#":
                return _resolve_url(href, base_url, page_url)

    # Fallback: return the first anchor link found
    if anchors:
        href = anchors[0]["href"]
        if href and href != "#":
            return _resolve_url(href, base_url, page_url)

    return None


def _resolve_url(href, base_url, page_url):
    """Resolve a relative URL to an absolute URL."""
    if href.startswith("http"):
        return href
    if href.startswith("/"):
        return urljoin(base_url, href)
    return urljoin(page_url, href)


def _scrape_detail_page(url, detail_rules):
    """
    Scrape a single detail page using the saved selectors.

    Returns a dict with name, price, location, description.
    All missing fields default to "Not Found".
    """
    result = {
        "name": "Not Found",
        "price": "Not Found",
        "location": "Not Found",
        "description": "Not Found",
    }

    try:
        resp = requests.get(url, headers=HEADERS, timeout=15)
        resp.raise_for_status()
    except requests.RequestException:
        return result

    soup = BeautifulSoup(resp.text, "html.parser")

    # Extract each field using its saved CSS selector
    field_map = {
        "name": "name_selector",
        "price": "price_selector",
        "location": "location_selector",
        "description": "description_selector",
    }

    for field, rule_key in field_map.items():
        selector = detail_rules.get(rule_key, "")
        if selector:
            el = soup.select_one(selector)
            if el:
                text = el.get_text(strip=True)
                if text:
                    result[field] = text

    return result
