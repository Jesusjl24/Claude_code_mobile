"""
Prosper Scout — Flask backend.
Business listing scraper and report generator for acquisition research.
"""

import json
import os
from datetime import date
from urllib.parse import urlparse

from flask import Flask, jsonify, render_template, request, send_file
import io

from scraper import scrape_listings
from site_learner import analyse_detail_page, analyse_index_page
from report_generator import generate_csv, generate_pdf

app = Flask(__name__)

SITES_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "sites.json")


def _load_sites():
    """Load site rules from sites.json, creating it if it doesn't exist."""
    if not os.path.exists(SITES_FILE):
        with open(SITES_FILE, "w") as f:
            json.dump({}, f)
        return {}
    with open(SITES_FILE, "r") as f:
        return json.load(f)


def _save_sites(data):
    """Save site rules to sites.json."""
    with open(SITES_FILE, "w") as f:
        json.dump(data, f, indent=2)


# ── Routes ───────────────────────────────────────────────────────────────────


@app.route("/")
def index():
    return render_template("index.html")


@app.route("/api/scrape", methods=["POST"])
def api_scrape():
    """Scrape listings from a URL using saved site rules."""
    body = request.get_json(silent=True)
    if not body or not body.get("url"):
        return jsonify({"error": "Missing 'url' in request body."}), 400

    url = body["url"].strip()
    parsed = urlparse(url)
    domain = parsed.netloc

    if not domain:
        return jsonify({"error": "Invalid URL provided."}), 400

    sites = _load_sites()

    if domain not in sites:
        return jsonify({
            "error": "site_not_configured",
            "message": (
                "This website hasn't been configured yet. "
                "Go to the Learn New Site tab to teach Prosper Scout how to scrape it."
            ),
        }), 404

    site_rules = sites[domain]

    try:
        result = scrape_listings(url, site_rules)
    except Exception as e:
        return jsonify({"error": f"Scraping failed: {str(e)}"}), 500

    if isinstance(result, dict) and "error" in result:
        return jsonify(result), 500

    # Increment scrape count
    sites[domain]["scrape_count"] = sites[domain].get("scrape_count", 0) + 1
    _save_sites(sites)

    return jsonify({"listings": result})


@app.route("/api/analyse-index", methods=["POST"])
def api_analyse_index():
    """Analyse an index page to detect listing patterns."""
    body = request.get_json(silent=True)
    if not body or not body.get("url"):
        return jsonify({"error": "Missing 'url' in request body."}), 400

    url = body["url"].strip()

    try:
        result = analyse_index_page(url)
    except Exception as e:
        return jsonify({
            "error": f"Failed to analyse page: {str(e)}"
        }), 500

    return jsonify(result)


@app.route("/api/analyse-detail", methods=["POST"])
def api_analyse_detail():
    """Analyse a detail page to detect field selectors."""
    body = request.get_json(silent=True)
    if not body or not body.get("url"):
        return jsonify({"error": "Missing 'url' in request body."}), 400

    url = body["url"].strip()

    try:
        result = analyse_detail_page(url)
    except Exception as e:
        return jsonify({
            "error": f"Failed to analyse detail page: {str(e)}"
        }), 500

    return jsonify(result)


@app.route("/api/save-site", methods=["POST"])
def api_save_site():
    """Save site rules to sites.json."""
    body = request.get_json(silent=True)
    if not body:
        return jsonify({"error": "Missing request body."}), 400

    domain = body.get("domain", "").strip()
    if not domain:
        return jsonify({"error": "Missing 'domain' in request body."}), 400

    index_page = body.get("index_page", {})
    detail_page = body.get("detail_page", {})

    if not index_page.get("card_selector"):
        return jsonify({"error": "Missing card_selector in index_page rules."}), 400

    sites = _load_sites()

    sites[domain] = {
        "date_added": date.today().isoformat(),
        "scrape_count": 0,
        "index_page": {
            "card_selector": index_page.get("card_selector", ""),
            "link_label": index_page.get("link_label", ""),
        },
        "detail_page": {
            "name_selector": detail_page.get("name_selector", ""),
            "price_selector": detail_page.get("price_selector", ""),
            "location_selector": detail_page.get("location_selector", ""),
            "description_selector": detail_page.get("description_selector", ""),
        },
    }

    _save_sites(sites)

    return jsonify({"success": True, "message": f"Rules saved for {domain}."})


@app.route("/api/sites", methods=["GET"])
def api_get_sites():
    """Return all entries in sites.json."""
    sites = _load_sites()
    return jsonify(sites)


@app.route("/api/sites/<path:domain>", methods=["DELETE"])
def api_delete_site(domain):
    """Remove a domain from sites.json."""
    sites = _load_sites()

    if domain not in sites:
        return jsonify({"error": f"Domain '{domain}' not found."}), 404

    del sites[domain]
    _save_sites(sites)

    return jsonify({"success": True, "message": f"Removed rules for {domain}."})


@app.route("/api/export/csv", methods=["POST"])
def api_export_csv():
    """Export listings as a CSV file download."""
    body = request.get_json(silent=True)
    if not body or not body.get("listings"):
        return jsonify({"error": "Missing 'listings' in request body."}), 400

    listings = body["listings"]

    try:
        filename, csv_string = generate_csv(listings)
    except Exception as e:
        return jsonify({"error": f"CSV generation failed: {str(e)}"}), 500

    output = io.BytesIO()
    output.write(csv_string.encode("utf-8"))
    output.seek(0)

    return send_file(
        output,
        mimetype="text/csv",
        as_attachment=True,
        download_name=filename,
    )


@app.route("/api/export/pdf", methods=["POST"])
def api_export_pdf():
    """Export listings as a PDF file download."""
    body = request.get_json(silent=True)
    if not body or not body.get("listings"):
        return jsonify({"error": "Missing 'listings' in request body."}), 400

    listings = body["listings"]

    try:
        filename, pdf_bytes = generate_pdf(listings)
    except Exception as e:
        return jsonify({"error": f"PDF generation failed: {str(e)}"}), 500

    output = io.BytesIO(pdf_bytes)
    output.seek(0)

    return send_file(
        output,
        mimetype="application/pdf",
        as_attachment=True,
        download_name=filename,
    )


if __name__ == "__main__":
    # Ensure sites.json exists on first run
    _load_sites()
    app.run(debug=True, host="0.0.0.0", port=5000, use_reloader=False)
