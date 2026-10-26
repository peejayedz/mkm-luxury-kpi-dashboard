import { CONFIG } from './config.mjs?v=v2d';
import { OTHER_REP, SOURCES, prepare, attachMoney, spendInRange, computeAll, sourceScorecard, repScorecard, funnel, sources, presetRange, customRange, previousRange, fmtDate, todayParts } from './kpi-core.mjs?v=v2d';

const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch {} },
  del(k) { try { localStorage.removeItem(k); } catch {} },
};

// ---------- KPI explanations (tile ⓘ and the "How this works" popup) ----------
const INFO = {
  newLeads: { t: 'New leads', what: 'Leads that came in during the selected dates.', how: 'Count of opportunities whose “Created on” date falls in the range.', src: 'GHL Opportunities.', moves: 'A form, ad lead, mailer call-in, import, MLS offer or a rep adding a lead.' },
  speedToLead: { t: 'Speed to lead', goal: 'Goal: 5 min or less', what: 'Average minutes from when the lead came in to the first call to that lead.', how: 'For each lead: first outbound call time − lead created time. Answered or not, the first dial counts. If the lead called us first and we answered, it counts as 0. Leads not dialled yet are left out of the average and shown at the top of the list.', src: 'GHL call logs.', moves: 'Calling new leads faster. Automated texts don’t count — only a real dial.' },
  within5: { t: 'Called within 5 min', goal: 'Goal: 80%+', what: 'Share of dialled leads that got their first call within 5 minutes.', how: 'Leads with speed to lead ≤ 5 min ÷ leads that have been dialled.', src: 'GHL call logs.', moves: 'Calling every lead within 5 minutes.' },
  contactRate: { t: 'Contact ratio', goal: 'Goal: 80%+', what: 'Share of new leads we actually reached.', how: 'A lead counts as contacted at the first two-way contact: they replied, a call connected for 60 seconds or more, they booked an appointment, the card moved to Engaged or later, or an offer was made. Contacted ÷ new leads. Same rule as Premier Builders.', src: 'GHL Conversations + pipeline stage + Offer Script form.', moves: 'Reaching the lead. Our own texts, voicemails and unanswered calls don’t count.' },
  contacted: { t: 'Contacted', what: 'New leads with two-way contact.', how: 'Same rule as Contact ratio, shown as a count.', src: 'GHL Conversations + pipeline stage.', moves: 'A reply, a 60s+ call or an offer.' },
  offers: { t: 'Offers made', what: 'New leads we made an offer to.', how: 'The rep submitted the Offer Script form (tag “offer-made”), or the card reached Perfect Presentation or later. MLS offers logged with the MLS button count here too.', src: 'GHL Offer Script form / tag + pipeline stage.', moves: 'Making offers and logging them with the Offer Script.' },
  contactToOffer: { t: 'Contact → offer', goal: 'Starting goal: 40%', what: 'Of the leads we reached, how many got an offer.', how: 'Offers made ÷ contacted leads.', src: 'GHL.', moves: 'Turning conversations into offers.' },
  offerToContract: { t: 'Offer → contract', goal: 'Starting goal: 25%', what: 'Of the offers we made, how many went under contract.', how: 'Under contract (or purchased) ÷ offers made.', src: 'GHL pipeline stage.', moves: 'Moving the card to Under Contract.' },
  contractToPurchase: { t: 'Contract → purchase', goal: 'Starting goal: 70%', what: 'Of the contracts, how many we actually bought / closed.', how: 'Purchased ÷ under contract.', src: 'GHL pipeline stage / status.', moves: 'Moving the card to Closed (or marking it Won).' },
  contracts: { t: 'Under contract', what: 'New leads that went under contract (or closed).', how: 'Stage is Under Contract or Closed, or Won.', src: 'GHL pipeline stage.', moves: 'Moving the card to Under Contract.' },
  purchased: { t: 'Deals purchased', what: 'New leads whose deal closed — the acquisitions.', how: 'Stage is Closed, or the opportunity status is Won.', src: 'GHL pipeline stage / status.', moves: 'Moving the card to Closed or marking it Won.' },
  adSpend: { t: 'Ad spend', what: 'What you spent on marketing in the selected dates.', how: 'From the monthly budget sheet (one number per lead source per month). A month’s spend is spread evenly over its days, so “Last 7 days” in October gets 7/31 of October. Spend can’t be split by sales rep.', src: 'MKM Ad Spend sheet (you fill it in).', moves: 'Typing each month’s spend per source into the sheet.' },
  costPerLead: { t: 'Cost per lead', what: 'Average marketing cost of one lead.', how: 'Ad spend ÷ new leads, for the same dates and source.', src: 'Ad spend sheet + GHL.', moves: 'More leads for the same spend, or less spend.' },
  costPerAcq: { t: 'Cost per acquisition', what: 'Average marketing cost of one purchased deal.', how: 'Ad spend ÷ deals purchased.', src: 'Ad spend sheet + GHL.', moves: 'Closing more of the leads you pay for.' },
  totalProfit: { t: 'Total profit', what: 'Profit from the deals purchased.', how: 'Sum of the “Deal Profit” field on purchased deals. Deals without a profit typed in are listed but not added.', src: 'GHL opportunity field “Deal Profit”.', moves: 'Typing the profit on the opportunity when the deal makes money.' },
  profitPerDeal: { t: 'Profit per deal', what: 'Average profit per purchased deal (PPD).', how: 'Total profit ÷ deals that have a profit entered.', src: 'GHL “Deal Profit” field.', moves: 'Bigger spreads per deal.' },
  roas: { t: 'ROAS', goal: 'Return on ad spend', what: 'How many dollars of profit each $1 of ad spend brought back.', how: 'Total profit ÷ ad spend. Example: $30,000 spent, $300,000 profit = 10×.', src: 'Ad spend sheet + “Deal Profit” field.', moves: 'More profit from the same spend.' },
  dials: { t: 'Dials', what: 'Outbound calls made in the selected dates.', how: 'Every outbound call logged in GHL, counted on the day it was made. With a sales rep picked, it shows the calls that rep made.', src: 'GHL call logs.', moves: 'Making calls from GHL.' },
  dialsPerDay: { t: 'Dials per day', goal: 'Outbound reps', what: 'Average outbound calls per working day.', how: 'Dials ÷ weekdays (Mon–Fri) in the selected dates.', src: 'GHL call logs.', moves: 'Dialling more each day.' },
  connects: { t: 'Connects', what: 'Dials where the person picked up and talked 60 seconds or more.', how: 'Outbound calls completed with a duration of 60s+.', src: 'GHL call logs.', moves: 'Better lists, better call times.' },
  connectRate: { t: 'Connect rate', what: 'Share of dials that turned into a real conversation.', how: 'Connects ÷ dials.', src: 'GHL call logs.', moves: 'Better lists, better call times.' },
  dialsPerLead: { t: 'Dials per lead', what: 'Average follow-up effort per new lead.', how: 'Outbound calls to the new leads since they came in ÷ new leads.', src: 'GHL call logs.', moves: 'Calling leads more than once.' },
  missedRate: { t: 'Missed call rate', goal: 'Goal: 10% or less', what: 'Of the calls leads made to us, how many nobody picked up.', how: 'Inbound calls not answered ÷ all inbound calls from leads. The list shows whether and how fast we called back.', src: 'GHL call logs.', moves: 'Answering inbound calls (or calling back fast).' },
  dead: { t: 'Dead / lost', what: 'New leads marked dead, lost or undesirable.', how: 'Stage is “Dead | Lost | Undesirable Leads” or the status is Lost.', src: 'GHL pipeline stage / status.', moves: 'Closing out bad leads.' },
  booked: { t: 'Appointments booked', what: 'Appointments created in the selected dates.', how: 'Appointments on any GHL calendar, excluding cancelled or invalid ones.', src: 'GHL Calendars.', moves: 'Booking on a GHL calendar (by a rep or the Voice AI).' },
  showRate: { t: 'Show rate', what: 'Share of booked appointments marked Showed.', how: 'Showed ÷ booked.', src: 'GHL appointment status.', moves: 'Marking each appointment Showed or No-show.' },
  aiCalls: { t: 'AI calls handled', what: 'Calls the Voice AI agent picked up in the selected dates.', how: 'Every call in GHL’s Voice AI call log (inbound and outbound), counted on the call date. Test calls are left out.', src: 'GHL AI Agents → Voice AI call logs.', moves: 'Calls reaching the Voice AI numbers.' },
  aiAvgDuration: { t: 'Avg AI call length', what: 'How long a Voice AI call lasts on average.', how: 'Total talk time ÷ AI calls.', src: 'GHL Voice AI call logs.', moves: 'Callers staying on to answer the agent’s questions.' },
  aiTotalTime: { t: 'AI talk time', what: 'Total minutes the Voice AI spent on calls.', how: 'Sum of every AI call’s duration.', src: 'GHL Voice AI call logs.', moves: 'More or longer AI calls.' },
  aiCallers: { t: 'Unique AI callers', what: 'Different people who talked to the Voice AI.', how: 'Distinct contacts (or phone numbers) across the AI calls.', src: 'GHL Voice AI call logs.', moves: 'New callers. Repeat callers are counted once.' },
  aiBecameLead: { t: 'AI calls → new lead', what: 'AI calls where the caller became a lead.', how: 'The caller has a lead created from 10 minutes before to 24 hours after the call.', src: 'GHL Voice AI call logs + Opportunities.', moves: 'The agent qualifying callers and the intake workflow creating the lead.' },
  aiBooked: { t: 'Booked by AI', what: 'AI calls where the agent booked an appointment.', how: 'Calls whose triggered actions include an appointment booking.', src: 'GHL Voice AI “Actions triggered”.', moves: 'The agent’s booking action.' },
  aiTransferred: { t: 'Transferred to team', what: 'AI calls the agent handed to a person.', how: 'Calls whose triggered actions include a call transfer (“Transfer to a human”).', src: 'GHL Voice AI “Actions triggered”.', moves: 'The agent’s transfer action.' },
  aiShort: { t: 'Short AI calls', goal: 'Under 30 seconds', what: 'AI calls that ended within 30 seconds: hang-ups, wrong numbers, robocalls.', how: 'AI calls with a duration under 30 seconds.', src: 'GHL Voice AI call logs.', moves: 'Fewer hang-ups on the agent’s greeting.' },
  bySource: { t: 'Lead source scorecard', what: 'Every KPI for each lead source side by side, plus the whole company at the bottom.', how: 'Source comes from the lead’s source tag (ppc, mailers, m software, outbound, mls, referral, drive by) — Ann tags any lead that doesn’t come in tagged automatically. Untagged leads show as “Unknown”. Click a source name to filter the whole dashboard to it.', src: 'GHL tags + source field, ad spend sheet.', moves: 'Tagging every lead with one source.' },
  byRep: { t: 'Sales rep scorecard', what: 'Outbound activity and results per rep.', how: 'Dials, dials per day, connects and speed to lead use the calls that person made. Leads, contact ratio, offers, contracts and purchased use the lead’s owner (Assigned to).', src: 'GHL Users, opportunity owner, call logs.', moves: 'Assigning each lead to the rep working it.' },
};

const ROWS = [
  ['Leads in', ['newLeads', 'speedToLead', 'within5', 'contactRate']],
  ['Deal funnel', ['offers', 'contactToOffer', 'offerToContract', 'contractToPurchase']],
  ['Money', ['adSpend', 'costPerLead', 'costPerAcq', 'roas'], true],
  ['Results', ['contracts', 'purchased', 'totalProfit', 'profitPerDeal']],
  ['Activity & health', ['dials', 'dialsPerLead', 'missedRate', 'dead']],
  ['Voice AI', ['aiCalls', 'aiAvgDuration', 'aiTotalTime', 'aiCallers', 'aiBecameLead', 'aiBooked', 'aiTransferred', 'aiShort'], 'voice'],
];

// ---------- state ----------
let RAW = null, P = null, PII = null, KEY = null;
const st = { date: 'last7', from: '', to: '', source: 'all', rep: 'all', pipeline: 'all', compare: true };
try { Object.assign(st, JSON.parse(store.get('mkm.filters') || '{}')); } catch {}

// ---------- formatting ----------
const money = v => '$' + Math.round(v || 0).toLocaleString('en-US');
function fmtVal(t) {
  if (t.money && t.locked) return '🔒';
  if (t.value == null) return '—';
  if (t.unit === 'dur') { const sec = Math.round(t.value); return sec >= 60 ? `${Math.floor(sec / 60)}m ${String(sec % 60).padStart(2, '0')}s` : `${sec}s`; }
  if (t.unit === 'n1') return (Math.round(t.value * 10) / 10).toLocaleString('en-US');
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
  const srcList = sources(P);
  if (st.source !== 'all' && !srcList.includes(st.source)) st.source = 'all';
  $('#fSource').innerHTML = [['all', 'All sources'], ...srcList.map(s => [s, s])].map(([v, l]) => `<button type="button" class="chipbtn" data-src="${esc(v)}" aria-pressed="${st.source === v}">${esc(l)}</button>`).join('');
  $('#fSource').onclick = e => { const b = e.target.closest('[data-src]'); if (!b) return; setSource(b.dataset.src); };
  const reps = P.users.filter(u => u.id !== OTHER_REP).sort((a, b) => a.name.localeCompare(b.name));
  const hasOther = P.leads.some(l => l.assignedTo === OTHER_REP) || P.calls.some(c => c.userId === OTHER_REP);
  st.rep = fillSelect($('#fRep'), [['all', 'All reps'], ...reps.map(u => [u.id, u.name]), ...(hasOther ? [[OTHER_REP, 'Other (admins)']] : []), ['unassigned', 'Unassigned']], st.rep);
  st.pipeline = 'all';
  $('#fCompare').checked = st.compare;
  const t = todayParts(tz()); const today = `${t.y}-${String(t.m).padStart(2, '0')}-${String(t.d).padStart(2, '0')}`;
  if (!st.to) st.to = today; if (!st.from) st.from = today;
  $('#fFrom').value = st.from; $('#fTo').value = st.to;
  $('#customWrap').hidden = st.date !== 'custom';
  const on = () => {
    st.date = $('#fDate').value; st.rep = $('#fRep').value;
    st.compare = $('#fCompare').checked; st.from = $('#fFrom').value; st.to = $('#fTo').value;
    $('#customWrap').hidden = st.date !== 'custom';
    store.set('mkm.filters', JSON.stringify(st));
    render();
  };
  for (const id of ['#fDate', '#fRep', '#fCompare', '#fFrom', '#fTo']) $(id).onchange = on;
}
function setSource(v) {
  st.source = v; store.set('mkm.filters', JSON.stringify(st));
  for (const b of document.querySelectorAll('#fSource [data-src]')) b.setAttribute('aria-pressed', String(b.dataset.src === v));
  render();
}

// ---------- render ----------
let CUR = null;
function render() {
  const r = range(), f = filt(r);
  const cur = computeAll(P, f, tz());
  const prev = st.compare && st.date !== 'all' ? computeAll(P, filt(previousRange(r)), tz()) : null;
  CUR = { f, cur };
  const last = new Date(r.to - 1);
  $('#rangeLabel').textContent = `${fmtDate(r.from || P.leads.reduce((m, l) => Math.min(m, l.createdAt), Date.now()), tz(), false)} – ${fmtDate(last.getTime(), tz(), false)}`;

  const rows = [...ROWS];
  const scope = st.source === 'all' ? 'Whole company' : st.source;
  $('#scopeLabel').textContent = scope;
  if ((RAW.calendars || []).length) rows.splice(rows.findIndex(r => r[0] === 'Activity & health') + 1, 0, ['Appointments', ['booked', 'showRate']]);
  const voiceNote = !RAW.voiceAvailable ? ' <span class="muted small">· needs the Voice AI permission on the GHL token</span>' : st.rep !== 'all' ? ' <span class="muted small">· AI calls aren’t tied to a rep, so this shows all of them</span>' : st.source !== 'all' ? ' <span class="muted small">· calls from callers with a ' + esc(st.source) + ' lead</span>' : '';
  $('#rows').innerHTML = rows.map(([title, keys, isMoney]) => `<section class="row${isMoney === 'voice' ? ' voice' : ''}"><h3>${esc(title)}${isMoney === 'voice' ? voiceNote : ''}${isMoney === true && !PII ? ' <button class="info-link" type="button" data-unlock-money>🔒 Unlock to see money</button>' : ''}${isMoney === true && PII && st.rep !== 'all' ? ' <span class="muted small">· spend isn’t split by rep</span>' : ''}</h3><div class="tiles">${keys.map(k => tileHtml(k, cur.tiles[k], prev?.tiles[k])).join('')}</div></section>`).join('');

  const fun = funnel(P, f, tz()), top = Math.max(1, fun[0][1].value);
  $('#funnel').innerHTML = fun.map(([lab, t], i) => `<button class="fbar" type="button" data-funnel="${i}"><span>${esc(lab)}</span><span class="track"><span class="fill" style="width:${(t.value / top) * 100}%"></span></span><span class="n">${t.value}${i ? ` · ${fun[0][1].value ? Math.round((t.value / fun[0][1].value) * 100) : 0}%` : ''}</span></button>`).join('');
  $('#funnel').onclick = e => { const b = e.target.closest('[data-funnel]'); if (b) { const [lab, t] = fun[+b.dataset.funnel]; openList(lab, t); } };

  scoreTable('#srcTable', sourceScorecard(P, f, tz()), 'Lead source', SRC_COLS, true);
  scoreTable('#repTable', repScorecard(P, f, tz()), 'Sales rep', REP_COLS, false);

  const newest = [...cur.tiles.newLeads.rows].sort((a, b) => b.createdAt - a.createdAt);
  $('#leadTable').innerHTML = !newest.length ? `<tr><td class="empty">No new leads in these dates.</td></tr>`
    : PII ? listTable('lead', newest.slice(0, 10))
    : `<tr><td class="empty">${newest.length} new lead${newest.length > 1 ? 's' : ''} in these dates. <button class="btn small primary" type="button" id="leadUnlock">🔒 Unlock to see the list</button></td></tr>`;
  if ($('#leadUnlock')) $('#leadUnlock').onclick = () => openList('New leads', cur.tiles.newLeads);
  $('#allLeadsBtn').onclick = () => openList('New leads', cur.tiles.newLeads);
}

function tileHtml(k, t, p) {
  const info = INFO[k];
  let delta = '';
  if (p && t.value != null && p.value != null) {
    const diff = t.value - p.value;
    if (Math.abs(diff) > 1e-9) {
      const better = t.lowerIsBetter ? diff < 0 : diff > 0;
      const shown = t.unit === '%' ? `${Math.abs(Math.round(diff * 10) / 10)} pts` : t.unit === '$' ? money(Math.abs(diff)) : t.unit === 'min' ? `${Math.abs(Math.round(diff))} min` : t.unit === 'x' ? Math.abs(Math.round(diff * 10) / 10) : t.unit === 'dur' ? fmtVal({ value: Math.abs(diff), unit: 'dur' }) : t.unit === 'n1' ? Math.abs(Math.round(diff * 10) / 10) : Math.abs(diff);
      delta = `<span class="delta ${better ? 'up' : 'down'}">${diff > 0 ? '▲' : '▼'} ${shown}</span>`;
    } else delta = '<span>no change</span>';
  } else if (p) delta = '<span>—</span>';
  if ((t.money && (t.locked || t.value == null)) || (t.voice && !RAW.voiceAvailable)) delta = '';
  const sub = t.voice && !RAW.voiceAvailable ? 'Not connected yet' : t.money && !t.locked && t.kind === 'spend' && t.value == null && !t.repFiltered ? 'No spend entered yet' : t.money && t.locked ? 'Passphrase needed' : t.money && t.repFiltered && t.value == null ? 'Not split by rep' : t.den != null ? `${t.num} of ${t.den}` : '';
  return `<div class="tile" role="button" tabindex="0" data-tile="${k}" aria-label="${esc(info.t)}: ${esc(fmtVal(t))}. Open list">
    <button class="i" type="button" data-info="${k}" aria-label="How ${esc(info.t)} works">i</button>
    <span class="lab">${esc(info.t)}</span>${info.goal ? `<span class="goal">${esc(info.goal)}</span>` : ''}
    <span class="val">${fmtVal(t)}</span>
    <span class="meta"><span>${[sub, delta].filter(Boolean).join(' · ')}</span><span class="view">View list →</span></span></div>`;
}

const SRC_COLS = [['newLeads', 'Leads'], ['adSpend', 'Spend'], ['costPerLead', 'Cost / lead'], ['contactRate', 'Contact %'], ['speedToLead', 'Speed to lead'], ['offers', 'Offers'], ['contactToOffer', 'Contact→offer'], ['offerToContract', 'Offer→contract'], ['contractToPurchase', 'Contract→purchase'], ['purchased', 'Deals'], ['costPerAcq', 'Cost / acq.'], ['totalProfit', 'Profit'], ['profitPerDeal', 'Profit / deal'], ['roas', 'ROAS']];
const REP_COLS = [['dials', 'Dials'], ['dialsPerDay', 'Dials / day'], ['connects', 'Connects'], ['connectRate', 'Connect %'], ['newLeads', 'Leads owned'], ['contactRate', 'Contact %'], ['speedToLead', 'Speed to lead'], ['offers', 'Offers'], ['contracts', 'Contracts'], ['purchased', 'Purchased']];
function scoreTable(sel, rows, first, cols, isSource) {
  if (!rows.length) { $(sel).innerHTML = `<tr><td class="empty">Nothing in these dates.</td></tr>`; return; }
  const nameCellHtml = r => isSource && !r.total ? `<button class="cell srcname" type="button" data-pick="${esc(r.key)}" title="Show only ${esc(r.label)}">${esc(r.label)}</button>` : esc(r.label);
  $(sel).innerHTML = `<thead><tr><th>${first}</th>${cols.map(c => `<th class="num">${c[1]}</th>`).join('')}</tr></thead><tbody>${rows.map((r, i) => `<tr class="${r.total ? 'total' : ''}${isSource && st.source === r.key ? ' picked' : ''}"><td>${nameCellHtml(r)}</td>${cols.map(([k]) => `<td class="num">${r[k].kind === 'spend' || r[k].value == null && !r[k].locked ? fmtVal(r[k]) : `<button class="cell" type="button" data-b="${i}" data-k="${k}">${fmtVal(r[k])}</button>`}</td>`).join('')}</tr>`).join('')}</tbody>`;
  $(sel).onclick = e => {
    const pick = e.target.closest('[data-pick]'); if (pick) { setSource(pick.dataset.pick); window.scrollTo({ top: 0, behavior: 'smooth' }); return; }
    const b = e.target.closest('[data-b]'); if (!b) return; const r = rows[+b.dataset.b]; const k = b.dataset.k; openList(`${r.label} · ${cols.find(c => c[0] === k)[1]}`, r[k]);
  };
}

// ---------- list modal ----------
const COLS = {
  lead: [['Name', nameCell, plainName], ['Phone', phone], ['Email', email], ['Source', r => esc(r.source), r => r.source], ['Created', r => d(r.createdAt), r => r.createdAt], ['Rep', r => esc(r.ownerName), r => r.ownerName], ['Stage', r => esc(r.stageName), r => r.rank], ['Status', r => statusChip(r), r => r.status]],
  stl: [['Name', nameCell, plainName], ['Phone', phone], ['Created', r => d(r.createdAt), r => r.createdAt], ['First dial', r => r.firstDialAt ? d(r.firstDialAt) : '<span class="chip bad">Not called yet</span>', r => r.firstDialAt || 0], ['Speed to lead', r => r.speedToLeadMin == null ? '—' : `<span class="chip ${r.speedToLeadMin <= 5 ? 'good' : 'bad'}">${dur(r.speedToLeadMin)}</span>`, r => r.speedToLeadMin ?? 1e12], ['Dials', r => r.dialCount || 0, r => r.dialCount || 0], ['Rep', r => esc(r.ownerName), r => r.ownerName]],
  contact: [['Name', nameCell, plainName], ['Phone', phone], ['Email', email], ['Contacted at', r => r.contactedAt ? d(r.contactedAt) : '', r => r.contactedAt || 0], ['Method', r => esc(r.contactMethod || (r.rank >= 1 || r.won ? 'Stage moved' : '')), r => r.contactMethod || ''], ['Rep', r => esc(r.ownerName), r => r.ownerName], ['Response', r => respChip(r), r => respText(r)]],
  deal: [['Name', nameCell, plainName], ['Phone', phone], ['Source', r => esc(r.source), r => r.source], ['Stage', r => esc(r.stageName), r => r.rank], ['Offer', r => r.offered ? '<span class="chip good">Yes</span>' : '', r => r.offered ? 1 : 0], ['Profit', r => r.profit == null ? (r.won ? '<span class="chip bad">Not entered</span>' : '') : money(r.profit), r => r.profit ?? -1], ['Rep', r => esc(r.ownerName), r => r.ownerName], ['Date in stage', r => d(r.statusChangedAt || r.stageChangedAt), r => r.statusChangedAt || r.stageChangedAt]],
  call: [['Name', nameCell, plainName], ['Phone', phone], ['Called at', r => d(r.at), r => r.at], ['Made by', r => esc(r.userName), r => r.userName], ['Result', r => esc(r.status || ''), r => r.status], ['Duration', r => r.duration ? `${Math.floor(r.duration / 60)}:${String(r.duration % 60).padStart(2, '0')}` : '0:00', r => r.duration], ['Lead stage', r => esc(r.lead?.stageName || ''), r => r.lead?.rank ?? -9]],
  missed: [['Name', nameCell, plainName], ['Phone', phone], ['Missed at', r => d(r.at), r => r.at], ['Called back?', r => r.callbackAt ? '<span class="chip good">Yes</span>' : '<span class="chip bad">No</span>', r => r.callbackAt ? 1 : 0], ['Callback at', r => r.callbackAt ? d(r.callbackAt) : '', r => r.callbackAt || 0], ['Callback wait', r => dur(r.callbackMin), r => r.callbackMin ?? 1e12], ['Lead stage', r => esc(r.lead?.stageName || ''), r => r.lead?.rank ?? -9], ['Rep', r => esc(r.lead?.ownerName || ''), r => r.lead?.ownerName || '']],
  voice: [['Caller', nameCell, plainName], ['Phone', r => { const p = person(r.contactId); return p ? (p.phone ? esc(p.phone) : esc(r.fromNumber || '')) : '•••'; }], ['Called at', r => d(r.at), r => r.at], ['Agent', r => esc(r.agentName || ''), r => r.agentName || ''], ['Length', r => fmtVal({ value: r.duration || 0, unit: 'dur' }), r => r.duration || 0], ['Actions', r => [r.transferred ? '<span class="chip">Transferred</span>' : '', r.booked ? '<span class="chip good">Booked</span>' : ''].join(' ') || '', r => (r.transferred ? 1 : 0) + (r.booked ? 2 : 0)], ['New lead?', r => r.becameLead ? '<span class="chip good">Yes</span>' : '', r => r.becameLead ? 1 : 0], ['Lead source', r => esc(r.source || ''), r => r.source || ''], ['Summary', r => esc(PII?.voice?.[r.id] || ''), r => PII?.voice?.[r.id] || '']],
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
let PENDING = null; // list to open right after a successful unlock
function openList(title, tile) {
  if (!PII) { PENDING = [title, tile]; openUnlock('Enter the team passphrase to open this list.'); return; }
  M = { title, tile, kind: tile.kind === 'lead' && false ? 'lead' : tile.kind, q: '', sort: null, dir: 1, page: 0, rep: 'all', src: 'all' };
  const total = tile.rows.length;
  const people = new Set(tile.rows.map(r => r.contactId || r.lead?.contactId)).size;
  if (tile.kind === 'spend') { openSpend(title); return; }
  const sumVal = tile.kind === 'deal' && tile.rows.some(r => r.profit != null) ? ` · profit ${money(tile.rows.reduce((s, r) => s + (r.profit || 0), 0))}` : '';
  $('#mTitle').textContent = title;
  $('#mSub').textContent = `${total} ${total === 1 ? 'row' : 'rows'}${people !== total ? ` (${people} unique people)` : ''}${sumVal} · ${$('#rangeLabel').textContent}${PII ? '' : ' · contact details locked'}`;
  drawList();
  $('#modal').showModal();
}
function openSpend(title) {
  const f = CUR.f, rows = [];
  for (const row of P.money?.spend || []) {
    if (f.source !== 'all' && row.source !== f.source) continue;
    const [y, m] = row.month.split('-').map(Number);
    const one = computeSpendRow(row, f);
    if (one > 0.005) rows.push({ ...row, inRange: one, label: new Date(Date.UTC(y, m - 1, 15)).toLocaleString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' }) });
  }
  const total = rows.reduce((s, r) => s + r.inRange, 0);
  $('#mTitle').textContent = title; $('#mSub').textContent = `${$('#rangeLabel').textContent} · ${money(total)} in these dates`;
  $('#mBody').innerHTML = `<div class="tablewrap"><table class="grid"><thead><tr><th>Month</th><th>Lead source</th><th class="num">Monthly budget</th><th class="num">Counted in these dates</th></tr></thead><tbody>${rows.length ? rows.map(r => `<tr><td>${esc(r.label)}</td><td>${esc(r.source)}</td><td class="num">${money(r.amount)}</td><td class="num">${money(r.inRange)}</td></tr>`).join('') : '<tr><td class="empty" colspan="4">No spend entered for these dates.</td></tr>'}</tbody></table></div>
    <p class="muted small">Monthly spend is spread evenly over the month’s days. ${CONFIG.spendSheetUrl ? `<a href="${esc(CONFIG.spendSheetUrl)}" target="_blank" rel="noopener">Open the ad spend sheet →</a>` : ''}</p>`;
  $('#modal').showModal();
}
function computeSpendRow(row, f) { return spendInRange({ money: { spend: [row] } }, { ...f, source: 'all' }, tz()); }
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
  const keys = ROWS.flatMap(r => r[1]).concat(['dialsPerDay', 'connects', 'connectRate']).concat((RAW?.calendars || []).length ? ['booked', 'showRate'] : []);
  $('#mBody').innerHTML = `<div class="help">
    <h3>The basics</h3>
    <ul>
      <li><b>Where the numbers come from:</b> GoHighLevel (MKM Luxury). A sync runs every hour and reads opportunities, contacts, users, calls and calendars. Nothing is changed in GHL.</li>
      <li><b>Dates:</b> every lead number uses the date the lead was <i>created</i>, so the rates line up (e.g. contact rate = contacted ÷ new leads from the same dates). Calls use the call date. Times are in the account’s time zone (${esc(RAW?.timezone || '')}).</li>
      <li><b>Whole company or one source:</b> “All sources” shows the whole company. Click PPC, Mailers, M Software, Outbound, MLS, Referral or Drive By to see every number for just that source. The scorecard at the bottom shows all sources side by side.</li>
      <li><b>Sales rep:</b> pick a rep to see their dials, contacts, offers and deals. Spend isn’t split by rep.</li>
      <li><b>Compare:</b> the ▲▼ under each number compares to the same length of time just before (green = better).</li>
      <li><b>Click any number</b> to see exactly which leads or calls make it up. The tile number always equals the list length.</li>
      <li><b>Money and lead lists need the passphrase.</b> Anyone with the link sees the lead numbers; spend, profit, ROAS and the lists (names, phones, emails) ask for the team passphrase. Tick “Remember me” on your own device so you don’t have to type it every time, and use Lock to forget it.</li>
      <li><b>Funnel:</b> New lead → Contacted → Offer made → Under contract → Purchased. A lead counts toward a step when it reached that step or any later one.</li>
      <li><b>Voice AI:</b> read from GHL’s Voice AI call log (agent ${esc([...new Set((P?.voice || []).map(v => v.agentName).filter(Boolean))].join(', ') || 'not connected')}). Calls count on the call date; a call counts toward a lead source when the caller has a lead from that source.</li>
      <li><b>Money:</b> spend comes from the monthly ad spend sheet; profit from the “Deal Profit” field on each purchased deal. Cost per lead = spend ÷ leads, cost per acquisition = spend ÷ deals, ROAS = profit ÷ spend.</li>
    </ul>
    <h3>Lead source scorecard</h3>${infoBlock('bySource')}
    <h3>Sales rep scorecard</h3>${infoBlock('byRep')}
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
    setPII(await decryptWith(key)); KEY = key; return true;
  } catch { store.del('mkm.key'); return false; } // passphrase was changed → ask again
}
function setPII(v) { PII = v; attachMoney(P, PII?.money || null); }
function lockUi() {
  $('#lockBtn').textContent = PII ? 'Lock' : 'Unlock';
  $('#lockBtn').title = PII ? 'Hide contact details and forget this device' : 'Enter the team passphrase';
}
function openUnlock(msg) {
  const pass = $('#pass');
  $('#uMsg').textContent = msg || 'Lead lists, spend and profit are encrypted. Enter the team passphrase to see them. The lead numbers work without it.';
  $('#uErr').hidden = true;
  if (pass.type === 'text') $('#eye').click(); // start hidden, icon in sync
  $('#unlock').showModal(); pass.focus();
}
function setupUnlock() {
  $('#unlock').addEventListener('close', () => { if (!PII) PENDING = null; });
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
      setPII(await decryptWith(key)); KEY = key;
      if ($('#remember').checked) store.set('mkm.key', btoa(String.fromCharCode(...new Uint8Array(await crypto.subtle.exportKey('raw', key)))));
      else store.del('mkm.key');
      pass.value = ''; $('#unlock').close(); lockUi(); render();
      if (PENDING) { const [t, tl] = PENDING; PENDING = null; openList(t, tl); }
    } catch { $('#uErr').hidden = false; pass.select(); }
    finally { $('#unlockGo').disabled = false; $('#unlockGo').textContent = 'Unlock'; }
  };
  $('#lockBtn').onclick = () => {
    if (PII) { setPII(null); KEY = null; store.del('mkm.key'); lockUi(); render(); }
    else openUnlock();
  };
}

// ---------- boot ----------
async function load() {
  if (window.__MKM_DATA__) RAW = window.__MKM_DATA__;
  else {
    const res = await fetch('data.json?t=' + Date.now(), { cache: 'no-store' });
    if (!res.ok) throw new Error(res.status === 404 ? 'No data yet — the first sync hasn’t finished. Check back in a few minutes.' : 'Could not load data (' + res.status + ')');
    RAW = await res.json();
  }
  P = prepare(RAW, { hiddenReps: CONFIG.hiddenReps });
  if (PII) attachMoney(P, PII.money || null);
  const mins = Math.round((Date.now() - RAW.generatedAt) / 60000);
  $('#syncInfo').textContent = `Last synced ${mins < 1 ? 'just now' : mins < 60 ? mins + ' min ago' : fmtDate(RAW.generatedAt, RAW.timezone)} · ${RAW.leads.length} leads in GHL`;
  $('#tzName').textContent = RAW.timezone;
  $('#warn').hidden = !(RAW.warnings || []).length;
  if (RAW.warnings?.length) {
    const plain = w => /voice ai/i.test(w) && /401|scope|authori/i.test(w) ? 'Voice AI: the GHL token needs the Voice AI permissions (View Voice AI Dashboard, View Voice AI Agents).'
      : /ad spend sheet/i.test(w) ? 'Ad spend sheet: ' + w.replace(/^ad spend sheet:?\s*/i, '')
      : /401|scope|authori/i.test(w) ? 'The GHL token is missing a permission: ' + w.split(':')[0] + '.' : w;
    const msgs = [...new Set(RAW.warnings.map(plain))];
    $('#warn').innerHTML = `<b>Last sync notes:</b> ${msgs.slice(0, 3).map(esc).join(' · ')}${msgs.length > 3 ? ` · and ${msgs.length - 3} more` : ''}`;
  }
}
async function boot() {
  document.addEventListener('click', e => {
    if (e.target.closest('[data-unlock-money]')) { openUnlock('Enter the team passphrase to see spend, profit and ROAS.'); return; }
    const info = e.target.closest('[data-info]'); if (info) { e.stopPropagation(); openInfo(info.dataset.info); return; }
    const tile = e.target.closest('[data-tile]'); if (tile) { openList(INFO[tile.dataset.tile].t, CUR.cur.tiles[tile.dataset.tile]); return; }
    if (e.target.closest('[data-close]')) e.target.closest('dialog').close();
  });
  document.addEventListener('keydown', e => { const tile = e.target.closest?.('[data-tile]'); if (tile && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); tile.click(); } });
  for (const dl of document.querySelectorAll('dialog')) dl.addEventListener('click', e => { if (e.target === dl) dl.close(); });
  $('#howBtn').onclick = openHow;
  if (CONFIG.mlsOfferFormUrl) { $('#mlsBtn').href = CONFIG.mlsOfferFormUrl; $('#mlsBtn').hidden = false; }
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
    try { await load(); if (KEY) setPII(await decryptWith(KEY).catch(() => null)); lockUi(); setupFilters(); render(); }
    catch (err) { $('#syncInfo').textContent = err.message; }
    finally { $('#refreshBtn').disabled = false; }
  };
}
boot();
