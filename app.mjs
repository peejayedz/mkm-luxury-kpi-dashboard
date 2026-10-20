import { prepare, computeAll, bySource, byRep, funnel, sources, presetRange, customRange, previousRange, fmtDate, todayParts } from './kpi-core.mjs';

const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch {} },
  del(k) { try { localStorage.removeItem(k); } catch {} },
};

// ---------- KPI explanations (tile ⓘ and the "How this works" popup) ----------
const INFO = {
  newLeads: { t: 'New leads', what: 'Opportunities created in the selected dates.', how: 'Count of opportunities whose “Created on” date falls in the range.', src: 'GHL Opportunities (Seller Leads and M Software pipelines).', moves: 'A form, ad lead, import or a rep adding an opportunity.' },
  speedToLead: { t: 'Speed to lead', goal: 'Goal: 5 min or less', what: 'Average minutes from when the lead came in to the first outbound call to that lead.', how: 'For each lead: first outbound call time − opportunity created time. Answered or not, the first dial counts. If the lead called us first and we answered, it counts as 0. Leads not dialled yet are left out of the average and shown at the top of the list.', src: 'GHL call logs in Conversations.', moves: 'Calling new leads faster. Automated texts do not count — only a real dial.' },
  within5: { t: 'Called within 5 min', goal: 'Goal: 80%+', what: 'Share of dialled leads that got their first call within 5 minutes.', how: 'Leads with speed to lead ≤ 5 min ÷ leads that have been dialled.', src: 'GHL call logs.', moves: 'Calling every lead within 5 minutes of it coming in.' },
  contactRate: { t: 'Contact rate', goal: 'Goal: 80%+', what: 'Share of new leads we actually reached.', how: 'A lead counts as contacted at the first two-way contact: they replied by text, email or chat, a call connected for 60 seconds or more (either direction), or the card was moved to Engaged or later. Contacted ÷ new leads.', src: 'GHL Conversations + pipeline stage.', moves: 'Reaching the lead. Our own texts, voicemails and unanswered calls don’t count. A 60s floor screens out voicemail drops.' },
  contacted: { t: 'Contacted', what: 'New leads with two-way contact.', how: 'Same rule as Contact rate, shown as a count.', src: 'GHL Conversations + pipeline stage.', moves: 'A reply or a 60s+ call.' },
  engaged: { t: 'Engaged', what: 'New leads that reached Engaged or any later stage.', how: 'Stage is Engaged, Warm Leads, Perfect Presentation, Under Contract or Closed, or the deal is marked Won.', src: 'GHL pipeline stage.', moves: 'Moving the card to Engaged (or further).' },
  warm: { t: 'Warm leads', what: 'New leads that reached Warm Leads or later.', how: 'Stage is Warm Leads, Perfect Presentation, Under Contract or Closed, or Won.', src: 'GHL pipeline stage.', moves: 'Moving the card to Warm Leads.' },
  presentations: { t: 'Perfect presentations', what: 'New leads that reached the Perfect Presentation stage or later (the offer / appointment step).', how: 'Stage is Perfect Presentation, Under Contract or Closed, or Won. On M Software, “Proposal Sent” counts here.', src: 'GHL pipeline stage.', moves: 'Moving the card to Perfect Presentation.' },
  leadToPres: { t: 'Lead → presentation', what: 'Share of new leads that reached a presentation.', how: 'Perfect presentations ÷ new leads.', src: 'GHL pipeline stage.', moves: 'Getting more leads to the presentation step.' },
  contracts: { t: 'Under contract', what: 'New leads that went under contract (or closed).', how: 'Stage is Under Contract or Closed, or Won.', src: 'GHL pipeline stage.', moves: 'Moving the card to Under Contract.' },
  presToContract: { t: 'Presentation → contract', what: 'Share of presentations that turned into a contract.', how: 'Under contract ÷ perfect presentations.', src: 'GHL pipeline stage.', moves: 'Converting presentations.' },
  closed: { t: 'Closed deals', what: 'New leads whose deal closed.', how: 'Stage is Closed, or the opportunity status is Won.', src: 'GHL pipeline stage / status.', moves: 'Moving the card to Closed or marking it Won.' },
  revenue: { t: 'Revenue', what: 'Total value of closed deals.', how: 'Sum of the opportunity Value on closed deals. Shows $0 until values are typed into the opportunities.', src: 'GHL Opportunity Value.', moves: 'Entering the deal amount on the opportunity.' },
  contractToClose: { t: 'Contract → close', what: 'Share of contracts that closed.', how: 'Closed deals ÷ under contract.', src: 'GHL pipeline stage / status.', moves: 'Closing contracts.' },
  dials: { t: 'Dials', what: 'Outbound calls made in the selected dates.', how: 'Every outbound call logged in GHL, counted on the day it was made. The Sales rep filter shows the calls that rep made.', src: 'GHL call logs.', moves: 'Making calls from GHL (the phone system or app).' },
  dialsPerLead: { t: 'Dials per lead', what: 'Average follow-up effort per new lead.', how: 'Outbound calls to the new leads since they came in ÷ new leads.', src: 'GHL call logs.', moves: 'Calling leads more than once.' },
  missedRate: { t: 'Missed call rate', goal: 'Goal: 10% or less', what: 'Share of inbound calls from leads that nobody answered.', how: 'Inbound calls not completed ÷ all inbound calls, from lead contacts, in the selected dates. The list shows whether and how fast we called back.', src: 'GHL call logs.', moves: 'Answering inbound calls.' },
  dead: { t: 'Dead / lost', what: 'New leads marked dead, lost or undesirable.', how: 'Stage is “Dead | Lost | Undesirable Leads” or the status is Lost / Abandoned.', src: 'GHL pipeline stage / status.', moves: 'Closing out bad leads.' },
  booked: { t: 'Appointments booked', what: 'Appointments created in the selected dates.', how: 'Appointments on any GHL calendar, excluding cancelled / invalid.', src: 'GHL Calendars.', moves: 'Booking on a GHL calendar.' },
  showRate: { t: 'Show rate', what: 'Share of booked appointments marked Showed.', how: 'Showed ÷ booked.', src: 'GHL appointment status.', moves: 'Marking each appointment Showed or No-show.' },
  bySource: { t: 'Lead sources', what: 'The same KPIs split by where the lead came from.', how: 'Uses the opportunity’s Source (or the contact’s source when that’s blank). Blank sources show as “Unknown”. Similar spellings are merged (e.g. “Drive by” and “Drive By”).', src: 'GHL Opportunity Source / Contact Source.', moves: 'Setting the source when a lead is created. Click any number for the list.' },
  byRep: { t: 'Sales rep leaderboard', what: 'The same KPIs per sales rep, including new outbound reps as soon as they are GHL users.', how: 'Leads, contact rate, presentations, contracts and closed use the opportunity’s Owner (Assigned to). Dials and speed to lead use the calls that person made. Sorted by closed, then contracts, then leads.', src: 'GHL Users, Opportunity Owner, call logs.', moves: 'Assigning each lead to the rep working it.' },
};

const ROWS = [
  ['Leads in', ['newLeads', 'speedToLead', 'within5', 'contactRate']],
  ['Pipeline', ['engaged', 'warm', 'presentations', 'leadToPres']],
  ['Results', ['contracts', 'closed', 'revenue', 'presToContract']],
  ['Activity & health', ['dials', 'dialsPerLead', 'missedRate', 'dead']],
];

// ---------- state ----------
let RAW = null, P = null, PII = null, KEY = null;
const st = { date: 'last7', from: '', to: '', source: 'all', rep: 'all', pipeline: 'all', compare: true };
try { Object.assign(st, JSON.parse(store.get('mkm.filters') || '{}')); } catch {}

// ---------- formatting ----------
const money = v => '$' + Math.round(v || 0).toLocaleString('en-US');
function fmtVal(t) {
  if (t.value == null) return '—';
  if (t.unit === '%') return (Math.round(t.value * 10) / 10) + '%';
  if (t.unit === '$') return money(t.value);
  if (t.unit === 'min') return (t.value < 10 ? (Math.round(t.value * 10) / 10) : Math.round(t.value)) + ' min';
  if (t.unit === 'x') return (Math.round(t.value * 10) / 10) + '×';
  return t.value.toLocaleString('en-US');
}
function dur(min) {
  if (min == null) return '';
  if (min < 60) return min + ' min';
  if (min < 1440) return (Math.round(min / 6) / 10) + ' hr';
  return (Math.round(min / 144) / 10) + ' days';
}
const tz = () => RAW.timezone;
const d = ms => fmtDate(ms, tz());

function person(contactId) {
  const p = PII?.contacts?.[contactId];
  return p || null;
}
function nameCell(row) {
  const cid = row.contactId || row.lead?.contactId;
  const p = person(cid);
  const label = p ? (p.name || PII.opps?.[row.id] || 'No name') : '🔒 Locked';
  const href = `${RAW.ghlBaseUrl}/v2/location/${RAW.locationId}/contacts/detail/${cid}`;
  return cid ? `<a href="${esc(href)}" target="_blank" rel="noopener">${esc(label)}</a>` : esc(label);
}
const phone = row => { const p = person(row.contactId || row.lead?.contactId); return p ? (p.phone ? `<a href="tel:${esc(p.phone)}">${esc(p.phone)}</a>` : '') : '•••'; };
const email = row => { const p = person(row.contactId || row.lead?.contactId); return p ? (p.email ? `<a href="mailto:${esc(p.email)}">${esc(p.email)}</a>` : '') : '•••'; };
const plainName = row => { const p = person(row.contactId || row.lead?.contactId); return p ? (p.name || '') : 'Locked'; };

// ---------- filters ----------
function range() {
  if (st.date === 'custom' && st.from && st.to) return customRange(st.from, st.to, tz());
  return presetRange(st.date === 'custom' ? 'last7' : st.date, tz());
}
function filt(r = range()) { return { ...r, source: st.source, rep: st.rep, pipeline: st.pipeline }; }

function fillSelect(el, opts, val) {
  el.innerHTML = opts.map(([v, l]) => `<option value="${esc(v)}">${esc(l)}</option>`).join('');
  el.value = opts.some(o => o[0] === val) ? val : opts[0][0];
  return el.value;
}
function setupFilters() {
  $('#fDate').value = st.date;
  st.source = fillSelect($('#fSource'), [['all', 'All sources'], ...sources(P).map(s => [s, s])], st.source);
  const reps = RAW.users.slice().sort((a, b) => a.name.localeCompare(b.name));
  st.rep = fillSelect($('#fRep'), [['all', 'All reps'], ...reps.map(u => [u.id, u.name]), ['unassigned', 'Unassigned']], st.rep);
  st.pipeline = fillSelect($('#fPipe'), [['all', 'All pipelines'], ...RAW.pipelines.map(p => [p.id, p.name])], st.pipeline);
  $('#fCompare').checked = st.compare;
  const t = todayParts(tz()); const today = `${t.y}-${String(t.m).padStart(2, '0')}-${String(t.d).padStart(2, '0')}`;
  if (!st.to) st.to = today; if (!st.from) st.from = today;
  $('#fFrom').value = st.from; $('#fTo').value = st.to;
  $('#customWrap').hidden = st.date !== 'custom';
  const on = () => {
    st.date = $('#fDate').value; st.source = $('#fSource').value; st.rep = $('#fRep').value; st.pipeline = $('#fPipe').value;
    st.compare = $('#fCompare').checked; st.from = $('#fFrom').value; st.to = $('#fTo').value;
    $('#customWrap').hidden = st.date !== 'custom';
    store.set('mkm.filters', JSON.stringify(st));
    render();
  };
  for (const id of ['#fDate', '#fSource', '#fRep', '#fPipe', '#fCompare', '#fFrom', '#fTo']) $(id).onchange = on;
}

// ---------- render ----------
let CUR = null;
function render() {
  const r = range(), f = filt(r);
  const cur = computeAll(P, f);
  const prev = st.compare && st.date !== 'all' ? computeAll(P, filt(previousRange(r))) : null;
  CUR = { f, cur };
  const last = new Date(r.to - 1);
  $('#rangeLabel').textContent = `${fmtDate(r.from || P.leads.reduce((m, l) => Math.min(m, l.createdAt), Date.now()), tz(), false)} – ${fmtDate(last.getTime(), tz(), false)}`;

  const rows = [...ROWS];
  if ((RAW.calendars || []).length) rows.push(['Appointments', ['booked', 'showRate']]);
  $('#rows').innerHTML = rows.map(([title, keys]) => `<section class="row"><h3>${esc(title)}</h3><div class="tiles">${keys.map(k => tileHtml(k, cur.tiles[k], prev?.tiles[k])).join('')}</div></section>`).join('');

  const fun = funnel(P, f), top = Math.max(1, fun[0][1].value);
  $('#funnel').innerHTML = fun.map(([lab, t], i) => `<button class="fbar" type="button" data-funnel="${i}"><span>${esc(lab)}</span><span class="track"><span class="fill" style="width:${(t.value / top) * 100}%"></span></span><span class="n">${t.value}${i ? ` · ${fun[0][1].value ? Math.round((t.value / fun[0][1].value) * 100) : 0}%` : ''}</span></button>`).join('');
  $('#funnel').onclick = e => { const b = e.target.closest('[data-funnel]'); if (b) { const [lab, t] = fun[+b.dataset.funnel]; openList(lab, t); } };

  breakdownTable('#repTable', byRep(P, f), 'Sales rep');
  breakdownTable('#srcTable', bySource(P, f), 'Lead source');

  const newest = [...cur.tiles.newLeads.rows].sort((a, b) => b.createdAt - a.createdAt);
  $('#leadTable').innerHTML = newest.length ? listTable('lead', newest.slice(0, 10)) : `<tr><td class="empty">No new leads in these dates.</td></tr>`;
  $('#allLeadsBtn').onclick = () => openList('New leads', cur.tiles.newLeads);
}

function tileHtml(k, t, p) {
  const info = INFO[k];
  let delta = '';
  if (p && t.value != null && p.value != null) {
    const diff = t.value - p.value;
    if (Math.abs(diff) > 1e-9) {
      const better = t.lowerIsBetter ? diff < 0 : diff > 0;
      const shown = t.unit === '%' ? `${Math.abs(Math.round(diff * 10) / 10)} pts` : t.unit === '$' ? money(Math.abs(diff)) : t.unit === 'min' ? `${Math.abs(Math.round(diff))} min` : t.unit === 'x' ? Math.abs(Math.round(diff * 10) / 10) : Math.abs(diff);
      delta = `<span class="delta ${better ? 'up' : 'down'}">${diff > 0 ? '▲' : '▼'} ${shown}</span>`;
    } else delta = '<span>no change</span>';
  } else if (p) delta = '<span>—</span>';
  const sub = t.den != null ? `${t.num} of ${t.den}` : '';
  return `<div class="tile" role="button" tabindex="0" data-tile="${k}" aria-label="${esc(info.t)}: ${esc(fmtVal(t))}. Open list">
    <button class="i" type="button" data-info="${k}" aria-label="How ${esc(info.t)} works">i</button>
    <span class="lab">${esc(info.t)}</span>${info.goal ? `<span class="goal">${esc(info.goal)}</span>` : ''}
    <span class="val">${fmtVal(t)}</span>
    <span class="meta"><span>${[sub, delta].filter(Boolean).join(' · ')}</span><span class="view">View list →</span></span></div>`;
}

function breakdownTable(sel, rows, first) {
  const cols = [['leads', 'Leads'], ['contacted', 'Contacted'], ['contactRate', 'Contact %'], ['speedToLead', 'Speed to lead'], ['within5', '≤5 min %'], ['dials', 'Dials'], ['presentations', 'Presentations'], ['contracts', 'Contracts'], ['closed', 'Closed'], ['revenue', 'Revenue']];
  if (!rows.length) { $(sel).innerHTML = `<tr><td class="empty">Nothing in these dates.</td></tr>`; return; }
  $(sel).innerHTML = `<thead><tr><th>${first}</th>${cols.map(c => `<th class="num">${c[1]}</th>`).join('')}</tr></thead><tbody>${rows.map((r, i) => `<tr><td>${esc(r.label)}</td>${cols.map(([k]) => `<td class="num"><button class="cell" type="button" data-b="${i}" data-k="${k}">${fmtVal(r[k])}</button></td>`).join('')}</tr>`).join('')}</tbody>`;
  $(sel).onclick = e => { const b = e.target.closest('[data-b]'); if (!b) return; const r = rows[+b.dataset.b]; const k = b.dataset.k; openList(`${r.label} · ${cols.find(c => c[0] === k)[1]}`, r[k]); };
}

// ---------- list modal ----------
const COLS = {
  lead: [['Name', nameCell, plainName], ['Phone', phone], ['Email', email], ['Source', r => esc(r.source), r => r.source], ['Created', r => d(r.createdAt), r => r.createdAt], ['Rep', r => esc(r.ownerName), r => r.ownerName], ['Stage', r => esc(r.stageName), r => r.rank], ['Status', r => statusChip(r), r => r.status], ['Value', r => money(r.value), r => r.value]],
  stl: [['Name', nameCell, plainName], ['Phone', phone], ['Created', r => d(r.createdAt), r => r.createdAt], ['First dial', r => r.firstDialAt ? d(r.firstDialAt) : '<span class="chip bad">Not called yet</span>', r => r.firstDialAt || 0], ['Speed to lead', r => r.speedToLeadMin == null ? '—' : `<span class="chip ${r.speedToLeadMin <= 5 ? 'good' : 'bad'}">${dur(r.speedToLeadMin)}</span>`, r => r.speedToLeadMin ?? 1e12], ['Dials', r => r.dialCount || 0, r => r.dialCount || 0], ['Rep', r => esc(r.ownerName), r => r.ownerName]],
  contact: [['Name', nameCell, plainName], ['Phone', phone], ['Email', email], ['Contacted at', r => r.contactedAt ? d(r.contactedAt) : '', r => r.contactedAt || 0], ['Method', r => esc(r.contactMethod || (r.rank >= 1 || r.won ? 'Stage moved' : '')), r => r.contactMethod || ''], ['Rep', r => esc(r.ownerName), r => r.ownerName], ['Response', r => respChip(r), r => respText(r)]],
  money: [['Name', nameCell, plainName], ['Phone', phone], ['Stage', r => esc(r.stageName), r => r.rank], ['Value', r => money(r.value), r => r.value], ['Rep', r => esc(r.ownerName), r => r.ownerName], ['Source', r => esc(r.source), r => r.source], ['Date in stage', r => d(r.statusChangedAt || r.stageChangedAt), r => r.statusChangedAt || r.stageChangedAt]],
  call: [['Name', nameCell, plainName], ['Phone', phone], ['Called at', r => d(r.at), r => r.at], ['Made by', r => esc(r.userName), r => r.userName], ['Result', r => esc(r.status || ''), r => r.status], ['Duration', r => r.duration ? `${Math.floor(r.duration / 60)}:${String(r.duration % 60).padStart(2, '0')}` : '0:00', r => r.duration], ['Lead stage', r => esc(r.lead?.stageName || ''), r => r.lead?.rank ?? -9]],
  missed: [['Name', nameCell, plainName], ['Phone', phone], ['Missed at', r => d(r.at), r => r.at], ['Called back?', r => r.callbackAt ? '<span class="chip good">Yes</span>' : '<span class="chip bad">No</span>', r => r.callbackAt ? 1 : 0], ['Callback at', r => r.callbackAt ? d(r.callbackAt) : '', r => r.callbackAt || 0], ['Callback wait', r => dur(r.callbackMin), r => r.callbackMin ?? 1e12], ['Lead stage', r => esc(r.lead?.stageName || ''), r => r.lead?.rank ?? -9], ['Rep', r => esc(r.lead?.ownerName || ''), r => r.lead?.ownerName || '']],
  appt: [['Name', nameCell, plainName], ['Phone', phone], ['Calendar', r => esc(r.calendarName), r => r.calendarName], ['Appointment', r => d(new Date(r.startTime).getTime()), r => new Date(r.startTime).getTime()], ['Booked on', r => d(new Date(r.createdAt).getTime()), r => new Date(r.createdAt).getTime()], ['Status', r => esc(r.status), r => r.status], ['Rep', r => esc(r.userName), r => r.userName]],
};
function statusChip(r) { const s = r.status; return `<span class="chip ${s === 'won' ? 'good' : s === 'lost' || s === 'abandoned' ? 'bad' : ''}">${esc(s)}</span>`; }
function respText(r) {
  if (/reply/i.test(r.contactMethod || '')) return 'Lead replied';
  if (r.contactedAt || r.rank >= 1 || r.won) return 'Successfully contacted';
  if (r.dialCount > 0) return 'Attempted, no response';
  return 'Not attempted yet';
}
function respChip(r) { const t = respText(r); return `<span class="chip ${/Success|replied/.test(t) ? 'good' : /Not attempted/.test(t) ? 'bad' : ''}">${t}</span>`; }

function listTable(kind, rows) {
  const cols = COLS[kind];
  return `<thead><tr>${cols.map(c => `<th>${c[0]}</th>`).join('')}</tr></thead><tbody>${rows.map(r => `<tr>${cols.map(c => `<td>${c[1](r)}</td>`).join('')}</tr>`).join('')}</tbody>`;
}

let M = null;
function openList(title, tile) {
  M = { title, tile, kind: tile.kind === 'lead' && false ? 'lead' : tile.kind, q: '', sort: null, dir: 1, page: 0, rep: 'all', src: 'all' };
  const total = tile.rows.length;
  const people = new Set(tile.rows.map(r => r.contactId || r.lead?.contactId)).size;
  const sumVal = tile.kind === 'money' ? ` · total ${money(tile.rows.reduce((s, r) => s + (r.value || 0), 0))}` : '';
  $('#mTitle').textContent = title;
  $('#mSub').textContent = `${total} ${total === 1 ? 'row' : 'rows'}${people !== total ? ` (${people} unique people)` : ''}${sumVal} · ${$('#rangeLabel').textContent}${PII ? '' : ' · contact details locked'}`;
  drawList();
  $('#modal').showModal();
}
function drawList() {
  const cols = COLS[M.kind];
  const repOf = r => r.ownerName || r.userName || r.lead?.ownerName || '';
  const srcOf = r => r.source || r.lead?.source || '';
  let rows = M.tile.rows.filter(r => (M.rep === 'all' || repOf(r) === M.rep) && (M.src === 'all' || srcOf(r) === M.src));
  if (M.q) { const q = M.q.toLowerCase(); rows = rows.filter(r => cols.some(c => String((c[2] || c[1])(r) ?? '').replace(/<[^>]+>/g, '').toLowerCase().includes(q))); }
  if (M.sort != null) { const c = cols[M.sort]; const key = c[2] || (r => String(c[1](r)).replace(/<[^>]+>/g, '')); rows = [...rows].sort((a, b) => { const x = key(a), y = key(b); return (x > y ? 1 : x < y ? -1 : 0) * M.dir; }); }
  const pages = Math.max(1, Math.ceil(rows.length / 25)); M.page = Math.min(M.page, pages - 1);
  const pageRows = rows.slice(M.page * 25, M.page * 25 + 25);
  const reps = [...new Set(M.tile.rows.map(repOf).filter(Boolean))].sort();
  const srcs = [...new Set(M.tile.rows.map(srcOf).filter(Boolean))].sort();
  $('#mBody').innerHTML = `<div class="mtools">
      <input type="search" id="mQ" placeholder="Search this list" value="${esc(M.q)}" aria-label="Search this list">
      <select id="mRep" aria-label="Filter by rep"><option value="all">All reps</option>${reps.map(r => `<option ${r === M.rep ? 'selected' : ''}>${esc(r)}</option>`).join('')}</select>
      ${srcs.length ? `<select id="mSrc" aria-label="Filter by source"><option value="all">All sources</option>${srcs.map(r => `<option ${r === M.src ? 'selected' : ''}>${esc(r)}</option>`).join('')}</select>` : ''}
      <span class="muted small">${rows.length} shown</span>
      <button class="btn small" id="mCsv" type="button">Export CSV</button>
    </div>
    <div class="tablewrap"><table class="grid"><thead><tr>${cols.map((c, i) => `<th data-s="${i}" aria-sort="${M.sort === i ? (M.dir > 0 ? 'ascending' : 'descending') : 'none'}">${c[0]}${M.sort === i ? (M.dir > 0 ? ' ▲' : ' ▼') : ''}</th>`).join('')}</tr></thead>
    <tbody>${pageRows.length ? pageRows.map(r => `<tr>${cols.map(c => `<td>${c[1](r)}</td>`).join('')}</tr>`).join('') : `<tr><td class="empty" colspan="${cols.length}">Nothing to show.</td></tr>`}</tbody></table></div>
    <div class="pager"><button class="btn small" id="mPrev" type="button" ${M.page ? '' : 'disabled'}>Previous</button><span>Page ${M.page + 1} of ${pages}</span><button class="btn small" id="mNext" type="button" ${M.page < pages - 1 ? '' : 'disabled'}>Next</button></div>`;
  const q = $('#mQ'); q.oninput = () => { M.q = q.value; M.page = 0; const pos = q.selectionStart; drawList(); const n = $('#mQ'); n.focus(); n.setSelectionRange(pos, pos); };
  $('#mRep').onchange = e => { M.rep = e.target.value; M.page = 0; drawList(); };
  if ($('#mSrc')) $('#mSrc').onchange = e => { M.src = e.target.value; M.page = 0; drawList(); };
  $('#mPrev').onclick = () => { M.page--; drawList(); };
  $('#mNext').onclick = () => { M.page++; drawList(); };
  $('#mBody thead').onclick = e => { const th = e.target.closest('[data-s]'); if (!th) return; const i = +th.dataset.s; M.dir = M.sort === i ? -M.dir : 1; M.sort = i; drawList(); };
  $('#mCsv').onclick = () => {
    const strip = h => String(h ?? '').replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
    const csv = [cols.map(c => c[0]), ...rows.map(r => cols.map(c => strip(c[1](r))))].map(line => line.map(v => /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v).join(',')).join('\n');
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    a.download = `${M.title.replace(/[^\w]+/g, '-').toLowerCase()}.csv`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };
}

// ---------- info + how this works ----------
function infoBlock(k) {
  const i = INFO[k];
  return `<dl><dt>What it shows</dt><dd>${esc(i.what)}</dd><dt>How it’s calculated</dt><dd>${esc(i.how)}</dd>${i.goal ? `<dt>Target</dt><dd>${esc(i.goal.replace('Goal: ', ''))}</dd>` : ''}<dt>Where the data comes from</dt><dd>${esc(i.src)}</dd><dt>What moves it</dt><dd>${esc(i.moves)}</dd></dl>`;
}
function openInfo(k) {
  $('#mTitle').textContent = INFO[k].t;
  $('#mSub').textContent = 'How this number works';
  $('#mBody').innerHTML = `<div class="help">${infoBlock(k)}${CUR?.cur.tiles[k] ? `<p><button class="btn small" id="infoList" type="button">See the ${CUR.cur.tiles[k].rows.length} rows behind it →</button></p>` : ''}</div>`;
  if ($('#infoList')) $('#infoList').onclick = () => openList(INFO[k].t, CUR.cur.tiles[k]);
  $('#modal').showModal();
}
function openHow() {
  $('#mTitle').textContent = 'How this dashboard works';
  $('#mSub').textContent = 'Plain-English guide to every number';
  const keys = ROWS.flatMap(r => r[1]).concat((RAW?.calendars || []).length ? ['booked', 'showRate'] : []);
  $('#mBody').innerHTML = `<div class="help">
    <h3>The basics</h3>
    <ul>
      <li><b>Where the numbers come from:</b> GoHighLevel (MKM Luxury). A sync runs every hour and reads opportunities, contacts, users, calls and calendars. Nothing is changed in GHL.</li>
      <li><b>Dates:</b> every lead number uses the date the lead was <i>created</i>, so the rates line up (e.g. contact rate = contacted ÷ new leads from the same dates). Calls use the call date. Times are in the account’s time zone (${esc(RAW?.timezone || '')}).</li>
      <li><b>Filters:</b> Lead source, Sales rep and Pipeline apply to every tile, the funnel and the tables.</li>
      <li><b>Compare:</b> the ▲▼ under each number compares to the same length of time just before (green = better).</li>
      <li><b>Click any number</b> to see exactly which leads or calls make it up. The tile number always equals the list length.</li>
      <li><b>Contact details</b> are encrypted on this public page. Unlock with the team passphrase; tick “Remember me” on your own device so you don’t have to type it every time.</li>
      <li><b>Stages:</b> a lead counts toward a stage when it is in that stage or any later one (Engaged → Warm Leads → Perfect Presentation → Under Contract → Closed). GHL only keeps a card’s current stage, so a lead moved back to Long Term Follow Up no longer counts as Warm.</li>
    </ul>
    <h3>Sales reps</h3>${infoBlock('byRep')}
    <h3>Lead sources</h3>${infoBlock('bySource')}
    ${keys.map(k => `<h3>${esc(INFO[k].t)}</h3>${infoBlock(k)}`).join('')}
  </div>`;
  $('#modal').showModal();
}

// ---------- encryption / unlock ----------
const b64d = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
async function deriveKey(pass) {
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(pass), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', salt: b64d(RAW.pii.salt), iterations: RAW.pii.iterations, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, true, ['decrypt']);
}
async function decryptWith(key) {
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b64d(RAW.pii.iv) }, key, b64d(RAW.pii.ct));
  return JSON.parse(new TextDecoder().decode(pt));
}
async function tryRemembered() {
  const raw = store.get('mkm.key');
  if (!raw) return false;
  try {
    const key = await crypto.subtle.importKey('raw', b64d(raw), 'AES-GCM', true, ['decrypt']);
    PII = await decryptWith(key); KEY = key; return true;
  } catch { store.del('mkm.key'); return false; } // passphrase was changed → ask again
}
function lockUi() {
  $('#lockBtn').textContent = PII ? 'Lock' : 'Unlock contacts';
  $('#lockBtn').title = PII ? 'Hide contact details and forget this device' : 'Enter the team passphrase';
}
function setupUnlock() {
  const eye = $('#eye'), pass = $('#pass');
  eye.onclick = () => {
    const show = pass.type === 'password';
    pass.type = show ? 'text' : 'password';
    eye.setAttribute('aria-pressed', String(show));
    eye.setAttribute('aria-label', show ? 'Hide passphrase' : 'Show passphrase'); eye.title = eye.getAttribute('aria-label');
    $('#eyeIcon').setAttribute('d', show
      ? 'M2 4.3 3.3 3l17.7 17.7-1.3 1.3-3.2-3.2A11 11 0 0 1 12 19C6.5 19 2.7 14.9 1.5 12a13 13 0 0 1 4-5.1L2 4.3Zm10 3.7a4 4 0 0 1 4 4l-.1.8-4.7-4.7.8-.1Zm0-3c5.5 0 9.3 4.1 10.5 7a13 13 0 0 1-3.4 4.6l-2.9-2.9A5.5 5.5 0 0 0 9.3 6.8L7.7 5.2A11 11 0 0 1 12 5Z'
      : 'M12 5C6.5 5 2.7 9.1 1.5 12c1.2 2.9 5 7 10.5 7s9.3-4.1 10.5-7C21.3 9.1 17.5 5 12 5Zm0 11a4 4 0 1 1 0-8 4 4 0 0 1 0 8Z');
    pass.focus();
  };
  $('#unlockForm').onsubmit = async e => {
    e.preventDefault();
    $('#uErr').hidden = true; $('#unlockGo').disabled = true; $('#unlockGo').textContent = 'Unlocking…';
    try {
      const key = await deriveKey(pass.value);
      PII = await decryptWith(key); KEY = key;
      if ($('#remember').checked) store.set('mkm.key', btoa(String.fromCharCode(...new Uint8Array(await crypto.subtle.exportKey('raw', key)))));
      else store.del('mkm.key');
      pass.value = ''; $('#unlock').close(); lockUi(); render();
    } catch { $('#uErr').hidden = false; pass.select(); }
    finally { $('#unlockGo').disabled = false; $('#unlockGo').textContent = 'Unlock'; }
  };
  $('#lockBtn').onclick = () => {
    if (PII) { PII = null; KEY = null; store.del('mkm.key'); lockUi(); render(); }
    else { $('#uErr').hidden = true; pass.type = 'password'; $('#unlock').showModal(); pass.focus(); }
  };
}

// ---------- boot ----------
async function load() {
  const res = await fetch('data.json?t=' + Date.now(), { cache: 'no-store' });
  if (!res.ok) throw new Error(res.status === 404 ? 'No data yet — the first sync hasn’t finished. Check back in a few minutes.' : 'Could not load data (' + res.status + ')');
  RAW = await res.json();
  P = prepare(RAW);
  const mins = Math.round((Date.now() - RAW.generatedAt) / 60000);
  $('#syncInfo').textContent = `Last synced ${mins < 1 ? 'just now' : mins < 60 ? mins + ' min ago' : fmtDate(RAW.generatedAt, RAW.timezone)} · ${RAW.leads.length} leads in GHL`;
  $('#tzName').textContent = RAW.timezone;
  $('#warn').hidden = !(RAW.warnings || []).length;
  if (RAW.warnings?.length) $('#warn').textContent = `Some data could not be read on the last sync (${RAW.warnings.length} item${RAW.warnings.length > 1 ? 's' : ''}). Numbers may be incomplete — check the token’s scopes.`;
}
async function boot() {
  document.addEventListener('click', e => {
    const info = e.target.closest('[data-info]'); if (info) { e.stopPropagation(); openInfo(info.dataset.info); return; }
    const tile = e.target.closest('[data-tile]'); if (tile) { openList(INFO[tile.dataset.tile].t, CUR.cur.tiles[tile.dataset.tile]); return; }
    if (e.target.closest('[data-close]')) e.target.closest('dialog').close();
  });
  document.addEventListener('keydown', e => { const tile = e.target.closest?.('[data-tile]'); if (tile && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); tile.click(); } });
  for (const dl of document.querySelectorAll('dialog')) dl.addEventListener('click', e => { if (e.target === dl) dl.close(); });
  $('#howBtn').onclick = openHow;
  setupUnlock();
  try {
    await load();
    await tryRemembered();
    lockUi(); setupFilters(); render();
  } catch (err) {
    $('#syncInfo').textContent = err.message;
    $('#rows').innerHTML = `<div class="banner">${esc(err.message)}</div>`;
  }
  $('#refreshBtn').onclick = async () => {
    $('#refreshBtn').disabled = true;
    try { await load(); if (KEY) PII = await decryptWith(KEY).catch(() => null); lockUi(); setupFilters(); render(); }
    catch (err) { $('#syncInfo').textContent = err.message; }
    finally { $('#refreshBtn').disabled = false; }
  };
}
boot();
