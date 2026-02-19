# Business Finder — MVP

An AI-powered pipeline that discovers, scores, and drafts outreach for broker-free small business acquisition opportunities across Queensland, Victoria, and NSW.

---

## What it does

| Layer | Agent | Description |
|---|---|---|
| 1 | **Scraper Agent** | Scrapes noagentbusiness.com.au, Gumtree, and businessforsale.com.au; deduplicates across platforms |
| 2 | **Scoring Agent** | Rules-based + Claude AI scoring against your Target Business Profile (0–100) |
| 3 | **Outreach Agent** | Generates personalised, behaviourally-informed outreach drafts; queues for human review before sending |

---

## Quick start

### 1. Clone & install

```bash
git clone <repo>
cd Claude_code_mobile
pip install -r requirements.txt
playwright install chromium   # one-time browser install
```

### 2. Configure

Copy `.env.example` to `.env` and fill in your values:

```bash
cp .env.example .env
```

```
ANTHROPIC_API_KEY=sk-ant-...     # Required — for scoring + outreach personalisation
SENDER_NAME=Your Name            # Used in outreach message signatures
SENDER_EMAIL=you@example.com
ABN_LOOKUP_API_KEY=              # Optional — free key from abr.business.gov.au
```

### 3. Run the web app

```bash
uvicorn app:app --host 0.0.0.0 --port 8000 --reload
```

Then open **http://localhost:8000** in any browser — works on mobile and desktop.

To make it accessible from your phone on the same network, find your machine's local IP:

```bash
# macOS / Linux
ipconfig getifaddr en0   # or: ip addr show
```

Then open `http://<your-ip>:8000` from your phone.

---

## Using the app

### Dashboard
- Shows pipeline stats: total listings, scored, top opportunities, outreach queue, meetings booked
- **Run Pipeline** button kicks off a full scrape → score → draft cycle (runs in background)

### Listings
- Browse all scraped listings sorted by opportunity score
- Filter by state, sector, or minimum score
- Tap any card to see full detail, AI notes, and outreach drafts

### Outreach Queue
- Review AI-drafted messages before they go anywhere
- **Approve** locks the draft as ready-to-send; **Reject** discards it
- No message is ever sent without your explicit approval

---

## Project structure

```
business-finder/
├── app.py                  FastAPI web server + REST API
├── pipeline.py             End-to-end pipeline orchestrator
├── config.py               All tuneable parameters (TBP, weights, URLs)
├── schema.py               Shared Pydantic models
├── database.py             SQLite persistence layer
│
├── agents/
│   ├── scraper_agent.py    Orchestrates all scrapers
│   ├── scoring_agent.py    Rules + Claude scoring
│   └── outreach_agent.py   Message drafting + follow-up
│
├── scrapers/
│   ├── base_scraper.py     Playwright base class
│   ├── noagent_scraper.py  noagentbusiness.com.au
│   ├── gumtree_scraper.py  gumtree.com.au (QLD/NSW/VIC)
│   └── businessforsale_scraper.py
│
├── outreach/
│   ├── templates.py        3 initial + 3 follow-up message templates
│   └── follow_up.py        Sequence scheduling
│
├── utils/
│   ├── deduplication.py    Cross-platform listing dedup
│   └── abn_lookup.py       ABR / ASIC enrichment (optional)
│
├── static/                 CSS + JS frontend
├── templates/              Jinja2 HTML template
└── tests/                  37 unit + integration tests (pytest)
```

---

## Running tests

```bash
pytest tests/ -v
```

All 37 tests run without network access or API keys.

---

## Configuration reference (`config.py`)

| Parameter | Default | Description |
|---|---|---|
| `REVENUE_MIN / MAX` | $1M – $4M | TBP revenue range |
| `ASKING_PRICE_MIN / MAX` | $500k – $5M | TBP price range |
| `OUTREACH_SCORE_THRESHOLD` | 55 | Min score to generate a draft |
| `FOLLOW_UP_INTERVALS_DAYS` | [4, 10, 21] | Days between follow-ups |
| `OUTREACH_REVIEW_REQUIRED` | True | Human gate before sending |
| `CLAUDE_MODEL` | claude-opus-4-6 | Model for scoring + personalisation |

---

## Target Business Profile

- **Revenue:** $1M – $4M/year
- **Profit:** ~$400k/year
- **Asking price:** $500k – $5M
- **Geography:** QLD, VIC, NSW
- **Sectors:** Plumbing, electrical, laundromats, accounting, landscaping, waste management, car washes, nail salons, junk removal, light industrial/trades
- **Signals:** Owner retiring, no succession plan, no broker, business runs under management

---

## Scoring weights

| Criterion | Weight |
|---|---|
| No broker | 20% |
| Sector match | 20% |
| Revenue in range | 20% |
| Owner retiring signals | 15% |
| Price in range | 15% |
| State match | 10% |

Final score = 70% rules-based + 30% Claude qualitative analysis.

---

## Notes & caveats

- **Scraper maintenance:** Gumtree and other platforms change their HTML regularly. Selectors in the scrapers will need periodic updates.
- **Playwright browsers:** Run `playwright install chromium` once after pip install. On a headless server, the `SCRAPER_HEADLESS=True` default is correct.
- **Legal:** Respect each platform's robots.txt and terms of service. This tool is for personal research use.
- **Outreach:** All messages are queued for human review. The tool never sends without your approval.
