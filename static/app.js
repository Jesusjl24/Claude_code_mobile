'use strict';

// ---------------------------------------------------------------------------
// Tab routing
// ---------------------------------------------------------------------------

function showTab(name) {
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  document.getElementById(`tab-${name}`).classList.add('active');
  document.querySelectorAll('.nav-btn').forEach(b => {
    if (b.textContent.toLowerCase().includes(name.slice(0, 4))) b.classList.add('active');
  });
  if (name === 'dashboard') { loadStats(); loadTopListings(); }
  if (name === 'listings')   loadListings();
  if (name === 'outreach')   loadOutreachQueue();
}

// ---------------------------------------------------------------------------
// API helpers
// ---------------------------------------------------------------------------

async function api(path, opts = {}) {
  const res = await fetch(path, opts);
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json();
}

function debounce(fn, ms) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

// ---------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------

async function loadStats() {
  try {
    const data = await api('/api/stats');
    setText('stat-total',    data.total,                  '.stat-value');
    setText('stat-scored',   data.scored,                 '.stat-value');
    setText('stat-top',      data.top_opportunities,      '.stat-value');
    setText('stat-pending',  data.pending_outreach_review,'.stat-value');
    setText('stat-meetings', data.meetings_scheduled,     '.stat-value');
  } catch (e) {
    console.error('Stats load failed', e);
  }
}

function setText(id, val, sel) {
  const el = document.getElementById(id);
  if (el) el.querySelector(sel || '*').textContent = val ?? '—';
}

async function loadTopListings() {
  try {
    const data = await api('/api/listings?min_score=60&limit=5&exclude_high_risk=true');
    const el = document.getElementById('top-listings');
    el.innerHTML = data.listings.length
      ? data.listings.map(renderListingCard).join('')
      : '<div class="empty-state">No scored listings yet — run the pipeline to get started.</div>';
  } catch (e) {
    console.error('Top listings load failed', e);
  }
}

// ---------------------------------------------------------------------------
// Pipeline
// ---------------------------------------------------------------------------

let _pollTimer = null;

async function runPipeline() {
  const btn = document.getElementById('run-btn');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> Running…';
  showBanner('Pipeline started — this may take a few minutes.', 'info');

  try {
    await api('/api/pipeline/run', { method: 'POST' });
    _pollTimer = setInterval(pollPipelineStatus, 3000);
  } catch (e) {
    showBanner(e.message === '409 Conflict' ? 'Pipeline already running.' : `Error: ${e.message}`, 'error');
    btn.disabled = false;
    btn.innerHTML = '▶ Run Pipeline';
  }
}

async function pollPipelineStatus() {
  try {
    const status = await api('/api/pipeline/status');
    if (!status.running) {
      clearInterval(_pollTimer);
      const btn = document.getElementById('run-btn');
      btn.disabled = false;
      btn.innerHTML = '▶ Run Pipeline';
      if (status.last_result?.error) {
        showBanner(`Pipeline failed: ${status.last_result.error}`, 'error');
      } else if (status.last_result) {
        const r = status.last_result;
        showBanner(
          `✓ Done — ${r.scraped} scraped, ${r.scored} scored, ${r.above_threshold} top opportunities, ${r.outreach_drafted} drafts queued.`,
          'success'
        );
      }
      loadStats();
      loadTopListings();
    }
  } catch (e) { /* ignore transient errors */ }
}

function showBanner(msg, type) {
  const el = document.getElementById('pipeline-banner');
  el.textContent = msg;
  el.className = `banner ${type}`;
  el.classList.remove('hidden');
}

// ---------------------------------------------------------------------------
// Listings
// ---------------------------------------------------------------------------

let _listingOffset = 0;
const _PAGE_SIZE = 20;

async function loadListings(reset = true) {
  if (reset) {
    _listingOffset = 0;
    document.getElementById('listings-container').innerHTML = '';
  }
  const state   = document.getElementById('filter-state').value;
  const sector  = document.getElementById('filter-sector').value;
  const score   = document.getElementById('filter-score').value;
  const hideRisk= document.getElementById('filter-risk').checked;

  let url = `/api/listings?limit=${_PAGE_SIZE}&offset=${_listingOffset}&exclude_high_risk=${hideRisk}`;
  if (state)  url += `&state=${encodeURIComponent(state)}`;
  if (sector) url += `&sector=${encodeURIComponent(sector)}`;
  if (score)  url += `&min_score=${score}`;

  try {
    const data = await api(url);
    const container = document.getElementById('listings-container');
    if (data.listings.length === 0 && _listingOffset === 0) {
      container.innerHTML = '<div class="empty-state">No listings found. Adjust filters or run the pipeline.</div>';
    } else {
      container.insertAdjacentHTML('beforeend', data.listings.map(renderListingCard).join(''));
    }
    const btn = document.getElementById('load-more-btn');
    btn.style.display = data.listings.length === _PAGE_SIZE ? 'flex' : 'none';
    _listingOffset += data.listings.length;
  } catch (e) {
    console.error('Listings load failed', e);
  }
}

function loadMore() {
  loadListings(false);
}

function renderListingCard(l) {
  const score = l.opportunity_score;
  const scoreClass = score >= 70 ? 'score-high' : score >= 50 ? 'score-mid' : score != null ? 'score-low' : 'score-none';
  const scoreLabel = score != null ? score : '?';
  const price  = l.asking_price  ? `$${fmtNum(l.asking_price)}`  : 'POA';
  const rev    = l.revenue       ? `Rev $${fmtNum(l.revenue)}`   : '';
  const broker = l.has_broker    ? '<span class="tag tag-red">Broker</span>' : '<span class="tag tag-green">No broker</span>';
  const risk   = l.risk_level    ? `<span class="tag">${l.risk_level.replace('_', '-')}</span>` : '';
  const state  = l.state         ? `<span class="tag tag-blue">${l.state}</span>` : '';
  const sector = l.sector        ? `<span class="tag">${l.sector}</span>` : '';

  return `
  <div class="listing-card" onclick="openListing('${l.listing_id}')">
    <div class="listing-score ${scoreClass}">${scoreLabel}</div>
    <div class="listing-body">
      <div class="listing-title">${esc(l.title || 'Untitled listing')}</div>
      <div class="listing-meta">${price}${rev ? ' · ' + rev : ''} · ${l.platform || ''}</div>
      <div class="listing-tags">${broker}${state}${sector}${risk}</div>
    </div>
  </div>`;
}

// ---------------------------------------------------------------------------
// Listing detail modal
// ---------------------------------------------------------------------------

async function openListing(id) {
  try {
    const data = await api(`/api/listings/${id}`);
    const l = data.listing;
    const msgs = data.outreach_messages;

    const price  = l.asking_price ? `$${fmtNum(l.asking_price)}` : 'POA';
    const rev    = l.revenue      ? `$${fmtNum(l.revenue)}`      : '—';
    const profit = l.profit       ? `$${fmtNum(l.profit)}`       : '—';

    document.getElementById('modal-content').innerHTML = `
      <div class="modal-title">${esc(l.title || 'Untitled listing')}</div>
      <div class="modal-url"><a href="${esc(l.url)}" target="_blank" rel="noopener">${esc(l.platform)} ↗</a></div>
      <div class="detail-grid">
        <div class="detail-item"><label>Score</label><div class="val">${l.opportunity_score ?? '—'} / 100</div></div>
        <div class="detail-item"><label>Risk</label><div class="val">${l.risk_level ?? '—'}</div></div>
        <div class="detail-item"><label>Asking Price</label><div class="val">${price}</div></div>
        <div class="detail-item"><label>Revenue</label><div class="val">${rev}</div></div>
        <div class="detail-item"><label>Profit</label><div class="val">${profit}</div></div>
        <div class="detail-item"><label>Staff</label><div class="val">${l.staff_count ?? '—'}</div></div>
        <div class="detail-item"><label>State</label><div class="val">${l.state || '—'}</div></div>
        <div class="detail-item"><label>Sector</label><div class="val">${l.sector || '—'}</div></div>
        <div class="detail-item"><label>Broker</label><div class="val">${l.has_broker ? 'Yes' : 'No'}</div></div>
        <div class="detail-item"><label>Days on Market</label><div class="val">${l.days_on_market ?? '—'}</div></div>
        <div class="detail-item"><label>Contact</label><div class="val">${esc(l.contact_name || l.contact_email || '—')}</div></div>
        <div class="detail-item"><label>Outreach</label><div class="val">${l.outreach_status ?? '—'}</div></div>
      </div>
      ${l.scoring_notes ? `<div class="section-title">AI Notes</div><p style="font-size:.85rem;margin-bottom:16px">${esc(l.scoring_notes)}</p>` : ''}
      ${l.description ? `<div class="section-title">Description</div><div class="description-block">${esc(l.description.slice(0, 1000))}${l.description.length > 1000 ? '…' : ''}</div>` : ''}
      ${msgs.length ? `<div class="section-title" style="margin-top:16px">Outreach Drafts</div>${msgs.map(m => `<div class="outreach-body" style="margin-top:8px"><strong>${esc(m.subject)}</strong>\n\n${esc(m.body)}</div>`).join('')}` : ''}
    `;
    document.getElementById('modal-overlay').classList.remove('hidden');
  } catch (e) {
    console.error('Modal load failed', e);
  }
}

function closeModal() {
  document.getElementById('modal-overlay').classList.add('hidden');
}

// ---------------------------------------------------------------------------
// Outreach queue
// ---------------------------------------------------------------------------

async function loadOutreachQueue() {
  try {
    const data = await api('/api/outreach/queue');
    const el = document.getElementById('outreach-queue');
    if (!data.queue.length) {
      el.innerHTML = '<div class="empty-state">No messages pending review. Run the pipeline and score listings first.</div>';
      return;
    }
    el.innerHTML = data.queue.map(q => `
      <div class="outreach-card" id="ocard-${q.listing_id}">
        <div class="outreach-header">${esc(q.title || q.listing_id)}</div>
        <div class="outreach-subject">Subject: ${esc(q.subject || '')}</div>
        <div class="outreach-body">${esc(q.draft_body || '')}</div>
        <div class="outreach-actions">
          <button class="btn btn-success" onclick="approveOutreach('${q.listing_id}', ${q.msg_id})">✓ Approve</button>
          <button class="btn btn-danger"  onclick="rejectOutreach('${q.listing_id}',  ${q.msg_id})">✕ Reject</button>
        </div>
      </div>
    `).join('');
  } catch (e) {
    console.error('Outreach queue load failed', e);
  }
}

async function approveOutreach(listingId, msgId) {
  try {
    await api(`/api/outreach/${listingId}/approve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ msg_id: msgId }),
    });
    document.getElementById(`ocard-${listingId}`)?.remove();
    loadStats();
  } catch (e) {
    alert('Approve failed: ' + e.message);
  }
}

async function rejectOutreach(listingId, msgId) {
  try {
    await api(`/api/outreach/${listingId}/reject`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ msg_id: msgId }),
    });
    document.getElementById(`ocard-${listingId}`)?.remove();
  } catch (e) {
    alert('Reject failed: ' + e.message);
  }
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

function esc(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function fmtNum(n) {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'M';
  if (n >= 1_000)     return (n / 1_000).toFixed(0) + 'k';
  return String(n);
}

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------

document.addEventListener('DOMContentLoaded', () => {
  loadStats();
  loadTopListings();
  // Poll pipeline status on load in case server restarted mid-run
  api('/api/pipeline/status').then(s => {
    if (s.running) {
      showBanner('Pipeline is running…', 'info');
      _pollTimer = setInterval(pollPipelineStatus, 3000);
    }
  }).catch(() => {});
});
