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

// ---------- stage meaning ----------
// rank: 0 new / not engaged, 1 engaged, 2 warm, 3 presentation, 4 under contract, 5 closed,
//      -1 long-term follow up (nurture), -2 dead / lost
const STAGE_RULES = [
  [/did not consent/i, 0], [/not engaged/i, 0], [/drip/i, 0], [/new lead/i, 0],
  [/long.?term|nurture/i, -1], [/dead|lost|undesirable|disqualif/i, -2],
  [/under contract|contract/i, 4], [/closed|won|funded/i, 5],
  [/presentation|proposal|appointment|offer/i, 3], [/warm/i, 2],
  [/engaged|contacted|conversation/i, 1],
];
export function stageRank(name) {
  for (const [re, r] of STAGE_RULES) if (re.test(name || '')) return r;
  return 0;
}
export const RANK_LABEL = { 0: 'New / not engaged', 1: 'Engaged', 2: 'Warm', 3: 'Presentation', 4: 'Under contract', 5: 'Closed', '-1': 'Long-term follow up', '-2': 'Dead / lost' };

export function prepare(data) {
  const stageById = {}, pipeById = {};
  for (const p of data.pipelines) { pipeById[p.id] = p; for (const s of p.stages) stageById[s.id] = { ...s, pipelineId: p.id, pipelineName: p.name, rank: stageRank(s.name) }; }
  const userById = Object.fromEntries(data.users.map(u => [u.id, u]));
  const leads = data.leads.map(l => {
    const st = stageById[l.stageId] || { name: 'Unknown stage', rank: 0 };
    let rank = st.rank;
    if (l.status === 'won') rank = 5;
    return { ...l, stageName: st.name, pipelineName: pipeById[l.pipelineId]?.name || '', rank,
      won: l.status === 'won' || rank === 5,
      lost: l.status === 'lost' || l.status === 'abandoned' || rank === -2,
      ownerName: l.assignedTo ? (userById[l.assignedTo]?.name || 'Former user') : 'Unassigned' };
  });
  const leadById = Object.fromEntries(leads.map(l => [l.id, l]));
  const calls = (data.calls || []).map(c => ({ ...c, lead: leadById[c.leadId], userName: c.userId ? (userById[c.userId]?.name || 'Former user') : 'Unassigned' }));
  const leadByContact = {};
  for (const l of leads) if (!leadByContact[l.contactId] || l.createdAt > leadByContact[l.contactId].createdAt) leadByContact[l.contactId] = l;
  const appts = (data.appointments || []).map(a => ({ ...a, lead: leadByContact[a.contactId], userName: a.assignedTo ? (userById[a.assignedTo]?.name || 'Former user') : 'Unassigned' }));
  return { ...data, leads, calls, appts, stageById, pipeById, userById };
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
const avg = arr => (arr.length ? arr.reduce((s, x) => s + x, 0) / arr.length : null);

export function computeAll(P, f) {
  const cohort = P.leads.filter(l => inRange(l.createdAt, f) && leadMatches(l, f));
  const contacted = cohort.filter(l => l.contactedAt || l.rank >= 1 || l.won);
  const engaged = cohort.filter(l => l.rank >= 1 || l.won);
  const warm = cohort.filter(l => l.rank >= 2 || l.won);
  const pres = cohort.filter(l => l.rank >= 3 || l.won);
  const contracts = cohort.filter(l => l.rank >= 4 || l.won);
  const closed = cohort.filter(l => l.won);
  const dead = cohort.filter(l => l.lost);
  const nurture = cohort.filter(l => l.rank === -1);
  const dialed = cohort.filter(l => l.speedToLeadMin != null);
  const within5 = dialed.filter(l => l.speedToLeadMin <= 5);
  const notDialed = cohort.filter(l => l.speedToLeadMin == null);

  // Calls are counted by call date; rep filter = who made/answered the call.
  const callMatches = c => inRange(c.at, f) && (!c.lead || leadMatches({ ...c.lead, assignedTo: c.lead.assignedTo }, { ...f, rep: 'all' })) &&
    (!f.rep || f.rep === 'all' || (f.rep === 'unassigned' ? !c.userId : c.userId === f.rep));
  const callsIn = P.calls.filter(callMatches);
  const dials = callsIn.filter(c => c.direction === 'outbound');
  const inbound = callsIn.filter(c => c.direction === 'inbound');
  const missed = inbound.filter(c => c.status !== 'completed');
  for (const m of missed) {
    const cb = P.calls.find(c => c.contactId === m.contactId && c.direction === 'outbound' && c.at > m.at);
    m.callbackAt = cb ? cb.at : null;
    m.callbackMin = cb ? Math.round((cb.at - m.at) / 60000) : null;
  }
  const apptMatches = a => inRange(a.createdAt, f) && (!a.lead || leadMatches(a.lead, f));
  const booked = P.appts.filter(a => apptMatches(a) && !/cancel|invalid/.test(a.status));
  const showed = booked.filter(a => /showed/.test(a.status));

  const sum = arr => arr.reduce((s, l) => s + (l.value || 0), 0);
  const t = {
    newLeads: { value: cohort.length, rows: cohort, kind: 'lead' },
    speedToLead: { value: avg(dialed.map(l => l.speedToLeadMin)), unit: 'min', rows: [...notDialed, ...[...dialed].sort((a, b) => b.speedToLeadMin - a.speedToLeadMin)], kind: 'stl', lowerIsBetter: true },
    within5: { value: pct(within5.length, dialed.length), unit: '%', rows: dialed, kind: 'stl', num: within5.length, den: dialed.length },
    contactRate: { value: pct(contacted.length, cohort.length), unit: '%', rows: cohort, kind: 'contact', num: contacted.length, den: cohort.length },
    contacted: { value: contacted.length, rows: contacted, kind: 'contact' },
    engaged: { value: engaged.length, rows: engaged, kind: 'lead' },
    warm: { value: warm.length, rows: warm, kind: 'lead' },
    presentations: { value: pres.length, rows: pres, kind: 'lead' },
    leadToPres: { value: pct(pres.length, cohort.length), unit: '%', rows: pres, kind: 'lead', num: pres.length, den: cohort.length },
    contracts: { value: contracts.length, rows: contracts, kind: 'lead' },
    presToContract: { value: pct(contracts.length, pres.length), unit: '%', rows: contracts, kind: 'lead', num: contracts.length, den: pres.length },
    closed: { value: closed.length, rows: closed, kind: 'money' },
    revenue: { value: sum(closed), unit: '$', rows: closed, kind: 'money' },
    contractToClose: { value: pct(closed.length, contracts.length), unit: '%', rows: closed, kind: 'money', num: closed.length, den: contracts.length },
    dead: { value: dead.length, rows: dead, kind: 'lead', lowerIsBetter: true },
    nurture: { value: nurture.length, rows: nurture, kind: 'lead' },
    dials: { value: dials.length, rows: dials, kind: 'call' },
    dialsPerLead: { value: cohort.length ? cohort.reduce((s, l) => s + (l.dialCount || 0), 0) / cohort.length : null, unit: 'x', rows: cohort, kind: 'stl' },
    missedRate: { value: pct(missed.length, inbound.length), unit: '%', rows: missed, kind: 'missed', num: missed.length, den: inbound.length, lowerIsBetter: true },
    booked: { value: booked.length, rows: booked, kind: 'appt' },
    showRate: { value: pct(showed.length, booked.length), unit: '%', rows: showed, kind: 'appt', num: showed.length, den: booked.length },
  };
  return { tiles: t, cohort, callsIn, booked };
}

// Breakdown tables: one row per source / per rep, each cell its own list.
function breakdownRow(P, f, extra) {
  const r = computeAll(P, { ...f, ...extra }).tiles;
  return { leads: r.newLeads, contacted: r.contacted, contactRate: r.contactRate, speedToLead: r.speedToLead, within5: r.within5, dials: r.dials, presentations: r.presentations, contracts: r.contracts, closed: r.closed, revenue: r.revenue };
}
export function bySource(P, f) {
  const names = [...new Set(P.leads.filter(l => inRange(l.createdAt, f) && leadMatches(l, { ...f, source: 'all' })).map(l => l.source))].sort();
  return names.map(n => ({ key: n, label: n, ...breakdownRow(P, f, { source: n }) })).sort((a, b) => b.leads.value - a.leads.value);
}
export function byRep(P, f) {
  const ids = new Set();
  for (const l of P.leads) if (inRange(l.createdAt, f) && leadMatches(l, { ...f, rep: 'all' })) ids.add(l.assignedTo || 'unassigned');
  for (const c of P.calls) if (inRange(c.at, f) && c.direction === 'outbound') ids.add(c.userId || 'unassigned');
  if (f.rep && f.rep !== 'all') { for (const id of [...ids]) if (id !== f.rep) ids.delete(id); }
  return [...ids].map(id => ({ key: id, label: id === 'unassigned' ? 'Unassigned' : (P.userById[id]?.name || 'Former user'), ...breakdownRow(P, f, { rep: id }) }))
    .sort((a, b) => (b.closed.value - a.closed.value) || (b.contracts.value - a.contracts.value) || (b.leads.value - a.leads.value) || (b.dials.value - a.dials.value));
}
export function funnel(P, f) {
  const t = computeAll(P, f).tiles;
  return [['New leads', t.newLeads], ['Contacted', t.contacted], ['Engaged', t.engaged], ['Warm', t.warm], ['Presentation', t.presentations], ['Under contract', t.contracts], ['Closed', t.closed]];
}
export const sources = P => [...new Set(P.leads.map(l => l.source))].sort();
