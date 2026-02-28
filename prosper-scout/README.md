# Prosper Scout

Business listing scraper and report generator for acquisition research.

Prosper Scout lets you teach it how to scrape any business-for-sale listing website, then extract structured data and export it as CSV or PDF reports.

## Features

- **Scrape** — Paste a listings index URL and extract business names, prices, locations, descriptions, and direct links
- **Manage Sites** — View and delete saved scraping configurations
- **Learn New Site** — Teach the app how to scrape a new website with auto-detection and manual CSS selector overrides
- **Export** — Download results as CSV or PDF

## Installation

1. Clone the repository and navigate to the project directory:

```bash
cd prosper-scout
```

2. Create a virtual environment (recommended):

```bash
python -m venv venv
source venv/bin/activate   # On Windows: venv\Scripts\activate
```

3. Install dependencies:

```bash
pip install -r requirements.txt
```

## Running the App

```bash
python app.py
```

The app will start on `http://127.0.0.1:5000`. Open that URL in your browser.

On first run, an empty `sites.json` file will be created automatically if one does not already exist.

## How to Use

1. **Learn a site first** — Go to the "Learn New Site" tab, paste the URL of a listings index page, and let the app auto-detect scraping patterns. Review and save the rules.
2. **Scrape listings** — Go to the "Scrape" tab, paste the same type of index page URL, and click "Start Scrape".
3. **Export results** — Use the "Export as CSV" or "Export as PDF" buttons at the bottom of the results table.

## Project Structure

```
prosper-scout/
├── app.py                  # Flask backend
├── scraper.py              # Scraping logic
├── site_learner.py         # Site detection and rules engine
├── report_generator.py     # CSV and PDF export
├── sites.json              # Persistent site rules storage
├── templates/
│   └── index.html          # Single page UI
└── requirements.txt
```

## Tech Stack

- **Backend:** Python / Flask
- **Frontend:** Single HTML file with vanilla JS
- **Scraping:** requests + BeautifulSoup4
- **PDF Generation:** ReportLab
- **CSV Generation:** Python built-in `csv` module
