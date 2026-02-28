"""
Site detection and rules engine for Prosper Scout.
Analyses index and detail pages to auto-detect scraping selectors.
"""

import re
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

# Australian state abbreviations and postcode pattern
AU_STATE_PATTERN = re.compile(
    r"\b(NSW|VIC|QLD|SA|WA|TAS|NT|ACT)\b|\b\d{4}\b"
)

CURRENCY_PATTERN = re.compile(r"\$[\d,]+\.?\d*")


def fetch_page(url):
    """Fetch a page and return a BeautifulSoup object."""
    resp = requests.get(url, headers=HEADERS, timeout=15)
    resp.raise_for_status()
    return BeautifulSoup(resp.text, "html.parser")


def analyse_index_page(url):
    """
    Analyse an index/listings page to detect listing cards and detail links.

    Returns a dict with:
      - domain: the base domain
      - card_selector: CSS selector for the repeating listing card
      - link_label: anchor text used for detail page links
      - sample_urls: up to 3 sample detail page URLs
      - card_count: number of cards detected
    """
    soup = fetch_page(url)
    parsed = urlparse(url)
    domain = parsed.netloc
    base_url = f"{parsed.scheme}://{parsed.netloc}"

    # Strategy: find repeating container elements that each contain at least
    # one anchor link.  We look for common listing wrapper patterns.
    best_selector = None
    best_cards = []
    best_link_label = None

    # Candidate parent tags and common class-name fragments for listing cards
    card_class_hints = [
        "listing", "card", "property", "result", "item", "business",
        "product", "entry", "post", "ad-card", "search-result",
    ]

    # Pass 1: look for elements whose class name contains a card-like hint
    for hint in card_class_hints:
        candidates = soup.find_all(
            True, class_=lambda c: c and hint in " ".join(c).lower() if c else False
        )
        if len(candidates) >= 2:
            # Check that these contain anchor tags
            sample = candidates[0]
            if sample.find("a", href=True):
                # Build a CSS selector from the element
                tag = sample.name
                classes = [
                    cls for cls in sample.get("class", [])
                    if hint in cls.lower()
                ]
                if classes:
                    selector = f"{tag}.{'.'.join(classes)}"
                    if len(candidates) > len(best_cards):
                        best_cards = candidates
                        best_selector = selector

    # Pass 2: if nothing found, look for repeated <li> or <div> with links
    if not best_cards:
        for tag_name in ["li", "div", "article", "section"]:
            elements = soup.find_all(tag_name)
            # Group by class signature
            class_groups = {}
            for el in elements:
                cls_key = tuple(sorted(el.get("class", [])))
                if cls_key and el.find("a", href=True):
                    class_groups.setdefault(cls_key, []).append(el)

            for cls_key, group in class_groups.items():
                if len(group) >= 2 and len(group) > len(best_cards):
                    best_cards = group
                    best_selector = f"{tag_name}.{'.'.join(cls_key)}"

    if not best_cards:
        return {
            "success": False,
            "domain": domain,
            "message": (
                "Could not auto-detect listing patterns on this page. "
                "Try a different URL or check that the page loaded correctly."
            ),
        }

    # Detect the link label from the first card
    sample_urls = []
    link_labels = {}

    for card in best_cards:
        anchors = card.find_all("a", href=True)
        for a in anchors:
            text = a.get_text(strip=True)
            href = a["href"]
            if text and len(text) > 1:
                link_labels[text] = link_labels.get(text, 0) + 1

            # Collect sample URLs
            if href.startswith("http"):
                full_url = href
            elif href.startswith("/"):
                full_url = urljoin(base_url, href)
            else:
                full_url = urljoin(url, href)

            if full_url not in sample_urls and full_url != url:
                sample_urls.append(full_url)

    # Pick the most common anchor text as the link label
    best_link_label = None
    if link_labels:
        best_link_label = max(link_labels, key=link_labels.get)

    # If no clear label found, default to matching any link in the card
    if not best_link_label:
        best_link_label = ""

    return {
        "success": True,
        "domain": domain,
        "card_selector": best_selector,
        "link_label": best_link_label,
        "sample_urls": sample_urls[:3],
        "card_count": len(best_cards),
    }


def analyse_detail_page(url):
    """
    Analyse a single detail/listing page to auto-detect field selectors.

    Returns a dict with detected selectors and preview values for:
      - name (business name / headline)
      - price
      - location
      - description
    """
    soup = fetch_page(url)

    result = {
        "name": {"selector": "", "value": "Not Found"},
        "price": {"selector": "", "value": "Not Found"},
        "location": {"selector": "", "value": "Not Found"},
        "description": {"selector": "", "value": "Not Found"},
    }

    # --- Name: look for h1/h2 headings ---
    for tag in ["h1", "h2"]:
        headings = soup.find_all(tag)
        for h in headings:
            text = h.get_text(strip=True)
            if text and len(text) > 3:
                selector = _build_selector(h)
                result["name"] = {"selector": selector, "value": text}
                break
        if result["name"]["value"] != "Not Found":
            break

    # --- Price: look for currency patterns ---
    # First try elements with price-related class names
    price_class_hints = ["price", "cost", "amount", "value"]
    for hint in price_class_hints:
        elements = soup.find_all(
            True,
            class_=lambda c: c and any(hint in cls.lower() for cls in c) if c else False
        )
        for el in elements:
            text = el.get_text(strip=True)
            if CURRENCY_PATTERN.search(text):
                selector = _build_selector(el)
                result["price"] = {"selector": selector, "value": text}
                break
        if result["price"]["value"] != "Not Found":
            break

    # Fallback: search all text for currency
    if result["price"]["value"] == "Not Found":
        for el in soup.find_all(True):
            text = el.get_text(strip=True)
            if CURRENCY_PATTERN.search(text) and len(text) < 100:
                selector = _build_selector(el)
                result["price"] = {"selector": selector, "value": text}
                break

    # --- Location: look for location/address/suburb class names ---
    loc_hints = ["location", "suburb", "address", "region", "area", "city"]
    for hint in loc_hints:
        elements = soup.find_all(
            True,
            class_=lambda c: c and any(hint in cls.lower() for cls in c) if c else False
        )
        for el in elements:
            text = el.get_text(strip=True)
            if text and len(text) > 2:
                selector = _build_selector(el)
                result["location"] = {"selector": selector, "value": text}
                break
        if result["location"]["value"] != "Not Found":
            break

    # Fallback: look for Australian state/postcode patterns
    if result["location"]["value"] == "Not Found":
        for el in soup.find_all(["span", "div", "p", "address"]):
            text = el.get_text(strip=True)
            if AU_STATE_PATTERN.search(text) and len(text) < 150:
                selector = _build_selector(el)
                result["location"] = {"selector": selector, "value": text}
                break

    # --- Description: find the largest block of paragraph text ---
    paragraphs = soup.find_all("p")
    best_p = None
    best_len = 0
    for p in paragraphs:
        text = p.get_text(strip=True)
        if len(text) > best_len:
            best_len = len(text)
            best_p = p

    if best_p and best_len > 20:
        selector = _build_selector(best_p)
        text = best_p.get_text(strip=True)
        # Truncate preview to 300 chars
        preview = text[:300] + ("..." if len(text) > 300 else "")
        result["description"] = {"selector": selector, "value": preview}

    # If no good <p>, try divs with description-like class names
    if result["description"]["value"] == "Not Found":
        desc_hints = ["description", "desc", "summary", "content", "body", "detail"]
        for hint in desc_hints:
            elements = soup.find_all(
                True,
                class_=lambda c: c and any(hint in cls.lower() for cls in c) if c else False
            )
            for el in elements:
                text = el.get_text(strip=True)
                if len(text) > 50:
                    selector = _build_selector(el)
                    preview = text[:300] + ("..." if len(text) > 300 else "")
                    result["description"] = {"selector": selector, "value": preview}
                    break
            if result["description"]["value"] != "Not Found":
                break

    return result


def _build_selector(element):
    """Build a CSS selector string for a given BeautifulSoup element."""
    tag = element.name
    el_id = element.get("id")
    classes = element.get("class", [])

    if el_id:
        return f"{tag}#{el_id}"
    if classes:
        return f"{tag}.{'.'.join(classes)}"
    return tag
