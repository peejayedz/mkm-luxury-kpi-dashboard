// Shared KPI logic. Used by the dashboard page and by the tests, so every tile
// number is exactly the length (or $ sum) of the list you see when you click it.

// ---------- time zone helpers (always the GHL account's time zone) ----------
const dtfCache = {};
function parts(ms, tz) {
  const f = dtfCache[tz] || (dtfCache[tz] = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }));
  const p = {};
  for (const x of f.formatToParts(new Date(ms))) p[x.type] = x.value;
  return { y: +p.year, m: +p.month, d: +p.day, h: +p.hour, mi: +p.minute, s: +p.second };
}
function offsetMs(ms, tz) {
  const p = parts(ms, tz);
  return Date.UTC(p.y, p.m - 1, p.d, p.h, p.mi, p.s) - Math.floor(ms / 1000) * 1000;
}
// UTC ms of local midnight y-m-d in tz
export function zonedMidnight(y, m, d, tz) {
  const guess = Date.UTC(y, m - 1, d);
  let t = guess - offsetMs(guess, tz);
  t = guess - offsetMs(t, tz);
  return t;
}
export function todayParts(tz, now = Date.now()) { return parts(now, tz); }
function addDays(y, m, d, n) { const t = new Date(Date.UTC(y, m - 1, d + n)); return [t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate()]; }

// Returns {from, to} as UTC ms, to exclusive.
export function presetRange(preset, tz, now = Date.now()) {
  const p = parts(now, tz);
  const day = (n) => { const [y, m, d] = addDays(p.y, p.m, p.d, n); return zonedMidnight(y, m, d, tz); };
  switch (preset) {
    case 'today': return { from: day(0), to: day(1) };
    case 'yesterday': return { from: day(-1), to: day(0) };
    case 'last7': return { from: day(-6), to: day(1) };
    case 'last30': return { from: day(-29), to: day(1) };
    case 'thisWeek': { const dow = new Date(Date.UTC(p.y, p.m - 1, p.d)).getUTCDay(); const back = (dow + 6) % 7; return { from: day(-back), to: day(1) }; }
    case 'thisMonth': return { from: zonedMidnight(p.y, p.m, 1, tz), to: day(1) };
    case 'lastMonth': { const [y, m] = p.m === 1 ? [p.y - 1, 12] : [p.y, p.m - 1]; return { from: zonedMidnight(y, m, 1, tz), to: zonedMidnight(p.y, p.m, 1, tz) }; }
    case 'thisYear': return { from: zonedMidnight(p.y, 1, 1, tz), to: day(1) };
    case 'all': return { from: 0, to: day(1) };
    default: throw new Error('unknown preset ' + preset);
  }
}
export function customRange(fromStr, toStr, tz) { // 'YYYY-MM-DD', inclusive dates
  const [fy, fm, fd] = fromStr.split('-').map(Number);
  const [ty, tm, td] = toStr.split('-').map(Number);
  const [ny, nm, nd] = addDays(ty, tm, td, 1);
  return { from: zonedMidnight(fy, fm, fd, tz), to: zonedMidnight(ny, nm, nd, tz) };
}
export function previousRange(r) { const len = r.to - r.from; return { from: r.from - len, to: r.from }; }

export function fmtDate(ms, tz, withTime = true) {
  if (!ms) return '';
  return new Intl.DateTimeFormat('en-US', { timeZone: tz, month: 'short', day: 'numeric', year: 'numeric', ...(withTime ? { hour: 'numeric', minute: '2-digit' } : {}) }).format(new Date(ms));
}

// ---------- lead sources (Mario's list, in display order) ----------
export const SOURCES = ['PPC', 'Mailers', 'M Software', 'Outbound', 'MLS', 'Referral', 'Drive By'];
const SOURCE_RULES = [
  [/^ppc|pay.?per.?click|ppc launch|google ads|facebook/i, 'PPC'],
  [/mailer|direct mail|postcard/i, 'Mailers'],
  [/m.?software/i, 'M Software'],
  [/outbound|cold.?call|cold call|skip.?trace/i, 'Outbound'],
  [/^mls$|\bmls\b|listed/i, 'MLS'],
  [/referr?al/i, 'Referral'],
  [/drive.?by|d4d|driving for dollars/i, 'Drive By'],
];
// Tag first (Ann tags every lead), then the GHL source field.
export function canonicalSource(tags = [], rawSource = '') {
  for (const t of tags) for (const [re, s] of SOURCE_RULES) if (re.test(t)) return s;
  for (const [re, s] of SOURCE_RULES) if (re.test(rawSource || '')) return s;
  return 'Unknown';
}

// ---------- stage meaning ----------
// rank: 0 new / not engaged, 1 engaged, 2 warm, 3 presentation, 4 under contract, 5 closed (purchased),
//      -1 long-term follow up (nurture), -2 dead / lost
const STAGE_RULES = [
  [/did not consent/i, 0], [/not engaged/i, 0], [/drip/i, 0], [/new lead/i, 0],
  [/long.?term|nurture/i, -1], [/dead|lost|undesirable|disqualif/i, -2],
  [/under contract|contract/i, 4], [/closed|won|funded|purchased/i, 5],
  [/presentation|proposal|appointment|offer/i, 3], [/warm/i, 2],
  [/engaged|contacted|conversation/i, 1],
];
export function stageRank(name) {
  for (const [re, r] of STAGE_RULES) if (re.test(name || '')) return r;
  return 0;
}
export const OFFER_TAG = 'offer-made';

// Reps hidden from the dashboard (e.g. owners / admins). Their leads and calls still
// count in every total; on the leaderboard they are grouped as "Other (admins)".
export const OTHER_REP = '__other';
export function prepare(data, opts = {}) {
  const hidden = new Set(opts.hiddenReps || []);
  if (hidden.size) {
    const m = id => (id && hidden.has(id) ? OTHER_REP : id);
    data = { ...data,
      users: [...data.users.filter(u => !hidden.has(u.id)), { id: OTHER_REP, name: 'Other (admins)', hidden: true }],
      leads: data.leads.map(l => ({ ...l, assignedTo: m(l.assignedTo), firstDialBy: m(l.firstDialBy) })),
      calls: (data.calls || []).map(c => ({ ...c, userId: m(c.userId) })),
      appointments: (data.appointments || []).map(a => ({ ...a, assignedTo: m(a.assignedTo) })) };
  }
  const stageById = {}, pipeById = {};
  for (const p of data.pipelines) { pipeById[p.id] = p; for (const s of p.stages) stageById[s.id] = { ...s, pipelineId: p.id, pipelineName: p.name, rank: stageRank(s.name) }; }
  const userById = Object.fromEntries(data.users.map(u => [u.id, u]));
  const leads = data.leads.map(l => {
    const st = stageById[l.stageId] || { name: 'Unknown stage', rank: 0 };
    const tags = (l.tags || []).map(t => String(t).toLowerCase());
    let rank = st.rank;
    if (l.status === 'won') rank = 5;
    const won = l.status === 'won' || rank === 5;
    const contract = rank >= 4 || won;
    // Offer = the Offer Script form was submitted (tag), or the card reached Perfect Presentation or later.
    const offered = tags.includes(OFFER_TAG) || rank >= 3 || contract;
    const pipelineName = pipeById[l.pipelineId]?.name || '';
    const source = l.sourceOverride || canonicalSource(tags, /m.?software/i.test(pipelineName) ? 'M Software' : l.source);
    return { ...l, tags, source, stageName: st.name, pipelineName, rank, won, contract, offered,
      contacted: !!l.contactedAt || rank >= 1 || offered,
      lost: l.status === 'lost' || l.status === 'abandoned' || rank === -2,
      ownerName: l.assignedTo ? (userById[l.assignedTo]?.name || 'Former user') : 'Unassigned' };
  });
  const leadById = Object.fromEntries(leads.map(l => [l.id, l]));
  const calls = (data.calls || []).map(c => ({ ...c, lead: leadById[c.leadId], userName: c.userId ? (userById[c.userId]?.name || 'Former user') : 'Unassigned' }));
  const leadByContact = {};
  for (const l of leads) if (!leadByContact[l.contactId] || l.createdAt > leadByContact[l.contactId].createdAt) leadByContact[l.contactId] = l;
  const appts = (data.appointments || []).map(a => ({ ...a, lead: leadByContact[a.contactId], userName: a.assignedTo ? (userById[a.assignedTo]?.name || 'Former user') : 'Unassigned' }));
  // Voice AI calls: tie each to the contact's lead; "became a lead" = a lead for that contact created within 24h after the call.
  const leadsByContact = {};
  for (const l of leads) (leadsByContact[l.contactId] ||= []).push(l);
  const voice = (data.voiceCalls || []).map(v => {
    const ls = leadsByContact[v.contactId] || [];
    const became = ls.find(l => l.createdAt >= v.at - 10 * 6e4 && l.createdAt <= v.at + 864e5) || null;
    const lead = became || ls.slice().sort((a, b) => b.createdAt - a.createdAt)[0] || null;
    return { ...v, lead, becameLead: !!became, contactId: v.contactId, source: lead?.source || null };
  });
  return { ...data, leads, calls, appts, voice, stageById, pipeById, userById, money: null };
}

// Money lives in the encrypted part of data.json. Call after unlocking.
// money: { deals: {oppId: {profit, value}}, spend: [{month:'YYYY-MM', source, amount}] }
export function attachMoney(P, money) {
  P.money = money || null;
  for (const l of P.leads) {
    const d = money?.deals?.[l.id];
    l.profit = d ? (d.profit ?? null) : null;
    l.dealValue = d ? (d.value ?? null) : null;
  }
  return P;
}

// Monthly spend spread evenly over the month's days, so "Last 7 days" gets 7/31 of October.
export function spendInRange(P, f, tz) {
  if (!P.money) return null;
  let total = 0, any = false;
  for (const row of P.money.spend || []) {
    if (f.source && f.source !== 'all' && row.source !== f.source) continue;
    any = true;
    const [y, m] = row.month.split('-').map(Number);
    const start = zonedMidnight(y, m, 1, tz);
    const end = m === 12 ? zonedMidnight(y + 1, 1, 1, tz) : zonedMidnight(y, m + 1, 1, tz);
    const overlap = Math.max(0, Math.min(end, f.to) - Math.max(start, f.from));
    total += (Number(row.amount) || 0) * (overlap / (end - start));
  }
  return any ? total : null;
}

// ---------- filtering ----------
// filters: {from, to, source:'all'|name, rep:'all'|'unassigned'|userId, pipeline:'all'|id}
function leadMatches(l, f) {
  if (f.source && f.source !== 'all' && l.source !== f.source) return false;
  if (f.pipeline && f.pipeline !== 'all' && l.pipelineId !== f.pipeline) return false;
  if (f.rep && f.rep !== 'all') { if (f.rep === 'unassigned' ? l.assignedTo : l.assignedTo !== f.rep) return false; }
  return true;
}
const inRange = (t, f) => t != null && t >= f.from && t < f.to;
const pct = (a, b) => (b ? (a / b) * 100 : null);
const div = (a, b) => (a == null || !b ? null : a / b);
const avg = arr => (arr.length ? arr.reduce((s, x) => s + x, 0) / arr.length : null);
const weekdays = f => { let n = 0; for (let t = f.from; t < f.to; t += 864e5) { const d = new Date(t + 12 * 36e5).getUTCDay(); if (d && d !== 6) n++; } return Math.max(1, n); };

export function computeAll(P, f, tz = P.timezone) {
  const cohort = P.leads.filter(l => inRange(l.createdAt, f) && leadMatches(l, f));
  const contacted = cohort.filter(l => l.contacted);
  const offers = cohort.filter(l => l.offered);
  const contracts = cohort.filter(l => l.contract);
  const purchased = cohort.filter(l => l.won);
  const dead = cohort.filter(l => l.lost);
  const dialed = cohort.filter(l => l.speedToLeadMin != null);
  const within5 = dialed.filter(l => l.speedToLeadMin <= 5);
  const notDialed = cohort.filter(l => l.speedToLeadMin == null);

  // A dial not tied to a lead yet is cold outreach → it belongs to Outbound.
  const callMatches = c => inRange(c.at, f) &&
    (c.lead ? leadMatches(c.lead, { ...f, rep: 'all' }) : (!f.source || f.source === 'all' || f.source === 'Outbound') && (!f.pipeline || f.pipeline === 'all')) &&
    (!f.rep || f.rep === 'all' || (f.rep === 'unassigned' ? !c.userId : c.userId === f.rep));
  const callsIn = P.calls.filter(callMatches);
  const dials = callsIn.filter(c => c.direction === 'outbound');
  const connects = dials.filter(c => c.status === 'completed' && c.duration >= 60);
  const inbound = callsIn.filter(c => c.direction === 'inbound');
  const missed = inbound.filter(c => c.status !== 'completed');
  for (const m of missed) {
    const cb = P.calls.find(c => c.contactId === m.contactId && c.direction === 'outbound' && c.at > m.at);
    m.callbackAt = cb ? cb.at : null;
    m.callbackMin = cb ? Math.round((cb.at - m.at) / 60000) : null;
  }

  const apptMatches = a => inRange(Date.parse(a.createdAt) || a.createdAt, f) && (!a.lead || leadMatches(a.lead, f));
  const booked = (P.appts || []).filter(a => apptMatches(a) && !/cancel|invalid/.test(a.status));
  const showed = booked.filter(a => /showed/.test(a.status));
  // Voice AI: by call date; source via the caller's lead (calls with no lead only count under All sources). Not split by rep.
  const vIn = (P.voice || []).filter(v => inRange(v.at, f) && (!f.source || f.source === 'all' || v.source === f.source));
  const vDur = vIn.map(v => v.duration || 0);
  const vBooked = vIn.filter(v => v.booked), vTransfer = vIn.filter(v => v.transferred), vLead = vIn.filter(v => v.becameLead), vShort = vIn.filter(v => (v.duration || 0) < 30);
  const vCallers = new Set(vIn.map(v => v.contactId || v.fromNumber)).size;

  // Money: locked until the passphrase is entered. Spend isn't split by rep.
  const locked = !P.money;
  const repFiltered = f.rep && f.rep !== 'all';
  const spend = locked || repFiltered ? null : spendInRange(P, f, tz);
  const withProfit = purchased.filter(l => l.profit != null);
  const totalProfit = locked ? null : withProfit.reduce((s, l) => s + l.profit, 0);
  const money = (v, extra = {}) => ({ value: v, money: true, locked, repFiltered, ...extra });

  const t = {
    newLeads: { value: cohort.length, rows: cohort, kind: 'lead' },
    speedToLead: { value: avg(dialed.map(l => l.speedToLeadMin)), unit: 'min', rows: [...notDialed, ...[...dialed].sort((a, b) => b.speedToLeadMin - a.speedToLeadMin)], kind: 'stl', lowerIsBetter: true },
    within5: { value: pct(within5.length, dialed.length), unit: '%', rows: dialed, kind: 'stl', num: within5.length, den: dialed.length },
    contactRate: { value: pct(contacted.length, cohort.length), unit: '%', rows: cohort, kind: 'contact', num: contacted.length, den: cohort.length },
    contacted: { value: contacted.length, rows: contacted, kind: 'contact' },
    offers: { value: offers.length, rows: offers, kind: 'deal' },
    contactToOffer: { value: pct(offers.length, contacted.length), unit: '%', rows: offers, kind: 'deal', num: offers.length, den: contacted.length },
    offerToContract: { value: pct(contracts.length, offers.length), unit: '%', rows: contracts, kind: 'deal', num: contracts.length, den: offers.length },
    contractToPurchase: { value: pct(purchased.length, contracts.length), unit: '%', rows: purchased, kind: 'deal', num: purchased.length, den: contracts.length },
    contracts: { value: contracts.length, rows: contracts, kind: 'deal' },
    purchased: { value: purchased.length, rows: purchased, kind: 'deal' },
    adSpend: { ...money(spend), unit: '$', rows: [], kind: 'spend' },
    costPerLead: { ...money(div(spend, cohort.length)), unit: '$', rows: cohort, kind: 'lead', lowerIsBetter: true },
    costPerAcq: { ...money(div(spend, purchased.length)), unit: '$', rows: purchased, kind: 'deal', lowerIsBetter: true },
    totalProfit: { ...money(totalProfit), unit: '$', rows: purchased, kind: 'deal' },
    profitPerDeal: { ...money(locked ? null : div(totalProfit, withProfit.length)), unit: '$', rows: purchased, kind: 'deal' },
    roas: { ...money(div(totalProfit, spend)), unit: 'x', rows: purchased, kind: 'deal' },
    dials: { value: dials.length, rows: dials, kind: 'call' },
    dialsPerDay: { value: dials.length / weekdays(f), unit: 'n1', rows: dials, kind: 'call' },
    connects: { value: connects.length, rows: connects, kind: 'call' },
    connectRate: { value: pct(connects.length, dials.length), unit: '%', rows: connects, kind: 'call', num: connects.length, den: dials.length },
    dialsPerLead: { value: cohort.length ? cohort.reduce((s, l) => s + (l.dialCount || 0), 0) / cohort.length : null, unit: 'x', rows: cohort, kind: 'stl' },
    missedRate: { value: pct(missed.length, inbound.length), unit: '%', rows: missed, kind: 'missed', num: missed.length, den: inbound.length, lowerIsBetter: true },
    dead: { value: dead.length, rows: dead, kind: 'lead', lowerIsBetter: true },
    booked: { value: booked.length, rows: booked, kind: 'appt' },
    showRate: { value: pct(showed.length, booked.length), unit: '%', rows: showed, kind: 'appt', num: showed.length, den: booked.length },
    aiCalls: { value: vIn.length, rows: vIn, kind: 'voice', voice: true },
    aiAvgDuration: { value: vIn.length ? vDur.reduce((a, b) => a + b, 0) / vIn.length : null, unit: 'dur', rows: vIn, kind: 'voice', voice: true },
    aiTotalTime: { value: vDur.reduce((a, b) => a + b, 0), unit: 'dur', rows: vIn, kind: 'voice', voice: true },
    aiCallers: { value: vCallers, rows: vIn, kind: 'voice', voice: true, countIsPeople: true },
    aiBecameLead: { value: vLead.length, rows: vLead, kind: 'voice', voice: true },
    aiBooked: { value: vBooked.length, rows: vBooked, kind: 'voice', voice: true },
    aiTransferred: { value: vTransfer.length, rows: vTransfer, kind: 'voice', voice: true },
    aiShort: { value: vShort.length, rows: vShort, kind: 'voice', voice: true, lowerIsBetter: true },
  };
  return { tiles: t, cohort, callsIn };
}

// One row per lead source (all 7 always shown, in Mario's order) + the whole company.
export function sourceScorecard(P, f, tz) {
  const names = [...SOURCES];
  if (P.leads.some(l => l.source === 'Unknown' && inRange(l.createdAt, f))) names.push('Unknown');
  const rows = names.map(n => ({ key: n, label: n, ...computeAll(P, { ...f, source: n }, tz).tiles }));
  rows.push({ key: 'all', label: 'Whole company', total: true, ...computeAll(P, { ...f, source: 'all' }, tz).tiles });
  return rows;
}
export function repScorecard(P, f, tz) {
  const ids = new Set();
  for (const l of P.leads) if (inRange(l.createdAt, f) && leadMatches(l, { ...f, rep: 'all' })) ids.add(l.assignedTo || 'unassigned');
  for (const c of P.calls) if (inRange(c.at, f) && c.direction === 'outbound') ids.add(c.userId || 'unassigned');
  if (f.rep && f.rep !== 'all') { for (const id of [...ids]) if (id !== f.rep) ids.delete(id); }
  return [...ids].map(id => ({ key: id, label: id === 'unassigned' ? 'Unassigned' : (P.userById[id]?.name || 'Former user'), ...computeAll(P, { ...f, rep: id }, tz).tiles }))
    .sort((a, b) => (b.purchased.value - a.purchased.value) || (b.offers.value - a.offers.value) || (b.dials.value - a.dials.value) || (b.newLeads.value - a.newLeads.value));
}
export function funnel(P, f, tz) {
  const t = computeAll(P, f, tz).tiles;
  return [['New leads', t.newLeads], ['Contacted', t.contacted], ['Offer made', t.offers], ['Under contract', t.contracts], ['Purchased', t.purchased]];
}
export const sources = P => [...SOURCES, ...(P.leads.some(l => l.source === 'Unknown') ? ['Unknown'] : [])];
