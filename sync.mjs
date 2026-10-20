// MKM Luxury KPI dashboard — GHL sync job.
// Runs in GitHub Actions. Reads GHL with a read-only Private Integration token,
// writes data.json: public lead metrics + contact details encrypted with the team passphrase.
import { writeFileSync } from 'node:fs';
import { webcrypto as crypto } from 'node:crypto';
import { CONFIG } from './config.mjs';

const TOKEN = process.env.GHL_TOKEN;
const PASS = process.env.DASHBOARD_PASSPHRASE;
const LOC = process.env.GHL_LOCATION_ID || CONFIG.locationId;
const API = process.env.GHL_API_BASE || 'https://services.leadconnectorhq.com';
if (!TOKEN) throw new Error('GHL_TOKEN secret is missing');
if (!PASS) throw new Error('DASHBOARD_PASSPHRASE secret is missing');

const sleep = ms => new Promise(r => setTimeout(r, ms));
let calls = 0;
async function ghl(path, params = {}, version = '2021-07-28') {
  const url = new URL(API + path);
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, v);
  for (let attempt = 0; attempt < 5; attempt++) {
    calls++;
    if (calls % 8 === 0) await sleep(1100); // stay well under 100 req / 10 s
    const res = await fetch(url, { headers: { Authorization: `Bearer ${TOKEN}`, Version: version, Accept: 'application/json' } });
    if (res.status === 429 || res.status >= 500) { await sleep(2000 * (attempt + 1)); continue; }
    const text = await res.text();
    if (!res.ok) {
      const err = new Error(`GHL ${res.status} on ${path}: ${text.slice(0, 300)}`);
      err.status = res.status; throw err;
    }
    return text ? JSON.parse(text) : {};
  }
  throw new Error(`GHL kept failing on ${path}`);
}
// Optional endpoints: a missing scope should not kill the whole sync.
async function optional(label, fn, fallback) {
  try { return await fn(); } catch (e) { warnings.push(`${label}: ${e.message}`); console.warn('WARN', label, e.message); return fallback; }
}
const warnings = [];

// ---------- fetch ----------
const location = await optional('location', async () => (await ghl(`/locations/${LOC}`)).location || {}, {});
const timezone = location.timezone || CONFIG.timezoneFallback;

const pipelines = (await ghl('/opportunities/pipelines', { locationId: LOC })).pipelines || [];

let users = await optional('users', async () => (await ghl('/users/', { locationId: LOC })).users || [], []);
if (!users.length) users = CONFIG.knownUsers || [];


const opps = [];
{
  let page = 1, startAfter, startAfterId;
  while (true) {
    const r = await ghl('/opportunities/search', { location_id: LOC, limit: 100, page, startAfter, startAfterId, status: 'all' });
    const batch = r.opportunities || [];
    opps.push(...batch);
    const m = r.meta || {};
    if (batch.length < 100 || !(m.nextPage || m.startAfterId)) break;
    page++; startAfter = m.startAfter; startAfterId = m.startAfterId;
    if (page > 200) break;
  }
}
console.log(`opportunities: ${opps.length}`);

// Contact details (source + tags) for each lead's contact
const contactIds = [...new Set(opps.map(o => o.contactId || o.contact?.id).filter(Boolean))];
const contacts = {};
for (const id of contactIds) {
  contacts[id] = await optional(`contact ${id}`, async () => (await ghl(`/contacts/${id}`)).contact || {}, {});
}

// Calls + messages per contact (for speed-to-lead, contact detection, dials, missed calls)
const messagesByContact = {};
for (const id of contactIds) {
  messagesByContact[id] = await optional(`conversations ${id}`, async () => {
    const convs = (await ghl('/conversations/search', { locationId: LOC, contactId: id, limit: 20 })).conversations || [];
    const out = [];
    for (const c of convs) {
      let lastMessageId;
      for (let i = 0; i < 20; i++) {
        const r = await ghl(`/conversations/${c.id}/messages`, { limit: 100, lastMessageId });
        const box = r.messages || {};
        const list = Array.isArray(box) ? box : (box.messages || []);
        out.push(...list);
        if (!box.nextPage || !box.lastMessageId || list.length === 0) break;
        lastMessageId = box.lastMessageId;
      }
    }
    return out;
  }, []);
}

// Appointments (calendars may not exist yet)
const calendars = await optional('calendars', async () => (await ghl('/calendars/', { locationId: LOC })).calendars || [], []);
const appointments = [];
{
  const start = Date.now() - 400 * 864e5, end = Date.now() + 120 * 864e5;
  for (const cal of calendars) {
    const ev = await optional(`events ${cal.id}`, async () => (await ghl('/calendars/events', { locationId: LOC, calendarId: cal.id, startTime: start, endTime: end })).events || [], []);
    for (const e of ev) appointments.push({ id: e.id, calendarId: cal.id, calendarName: cal.name, contactId: e.contactId, startTime: e.startTime, createdAt: e.dateAdded || e.createdAt || e.startTime, status: (e.appointmentStatus || e.status || '').toLowerCase(), assignedTo: e.assignedUserId || null });
  }
}

// ---------- normalise ----------
const isCall = m => /CALL/i.test(m.messageType || '') || m.type === 1;
const callStatus = m => String(m.meta?.call?.status || m.status || '').toLowerCase();
const callDuration = m => Number(m.meta?.call?.duration ?? m.meta?.callDuration ?? 0) || 0;
const ts = s => (s ? new Date(s).getTime() : null);
const STOP_RE = /^\s*(stop|unsubscribe|cancel|end|quit)\s*$/i;

function titleCase(s) { return s.toLowerCase().replace(/\b\w/g, c => c.toUpperCase()); }
function normSource(o, c) {
  const raw = (o.source || c.source || '').trim();
  if (!raw) return 'Unknown';
  const alias = CONFIG.sourceAliases[raw.toLowerCase()];
  return alias || titleCase(raw);
}

const callsOut = [];
const leads = opps.map(o => {
  const cid = o.contactId || o.contact?.id;
  const c = contacts[cid] || {};
  const created = ts(o.createdAt);
  const msgs = (messagesByContact[cid] || []).map(m => ({ ...m, _t: ts(m.dateAdded) })).filter(m => m._t).sort((a, b) => a._t - b._t);
  const after = msgs.filter(m => m._t >= created - 60e3);
  const firstDial = after.find(m => isCall(m) && m.direction === 'outbound');
  const contactEvt = after.find(m =>
    (isCall(m) && callStatus(m) === 'completed' && callDuration(m) >= 60) ||
    (!isCall(m) && m.direction === 'inbound' && !STOP_RE.test(m.body || '') && !/activity|email_open|click/i.test(m.messageType || '')));
  let contactMethod = null;
  if (contactEvt) {
    if (isCall(contactEvt)) contactMethod = contactEvt.direction === 'inbound' ? 'Inbound call' : 'Answered call';
    else if (/SMS/i.test(contactEvt.messageType)) contactMethod = 'SMS reply';
    else if (/EMAIL/i.test(contactEvt.messageType)) contactMethod = 'Email reply';
    else contactMethod = 'Other channel';
  }
  let stl = null;
  if (firstDial) stl = Math.max(0, Math.round((firstDial._t - created) / 60000));
  if (contactEvt && isCall(contactEvt) && contactEvt.direction === 'inbound' && (!firstDial || contactEvt._t < firstDial._t)) stl = 0;
  const dials = after.filter(m => isCall(m) && m.direction === 'outbound');
  for (const m of msgs.filter(isCall)) {
    callsOut.push({ id: m.id, contactId: cid, leadId: o.id, at: m._t, direction: m.direction, status: callStatus(m), duration: callDuration(m), userId: m.userId || null });
  }
  return {
    id: o.id,
    contactId: cid,
    pipelineId: o.pipelineId,
    stageId: o.pipelineStageId,
    status: (o.status || 'open').toLowerCase(),
    value: Number(o.monetaryValue) || 0,
    source: normSource(o, c),
    assignedTo: o.assignedTo || null,
    createdAt: created,
    stageChangedAt: ts(o.lastStageChangeAt) || ts(o.updatedAt),
    statusChangedAt: ts(o.lastStatusChangeAt),
    lostReason: o.lostReasonId || null,
    firstDialAt: firstDial ? firstDial._t : null,
    firstDialBy: firstDial ? firstDial.userId || null : null,
    speedToLeadMin: stl,
    contactedAt: contactEvt ? contactEvt._t : null,
    contactMethod,
    dialCount: dials.length,
    tags: (c.tags || o.contact?.tags || []).map(t => String(t).toLowerCase()),
  };
});
// de-duplicate calls (a contact with two opportunities)
const seen = new Set();
const callList = callsOut.filter(c => (seen.has(c.id) ? false : (seen.add(c.id), true)));

// ---------- encrypt contact details ----------
const pii = { contacts: {}, opps: {} };
for (const o of opps) pii.opps[o.id] = o.name || '';
for (const id of contactIds) {
  const c = contacts[id] || {};
  const oc = opps.find(o => (o.contactId || o.contact?.id) === id)?.contact || {};
  pii.contacts[id] = {
    name: c.contactName || [c.firstName, c.lastName].filter(Boolean).join(' ') || oc.name || '',
    email: c.email || oc.email || '',
    phone: c.phone || oc.phone || '',
  };
}
const enc = new TextEncoder();
// Salt is fixed per dashboard so a "remembered" device key keeps working across syncs.
const salt = enc.encode(CONFIG.kdfSalt);
const iv = crypto.getRandomValues(new Uint8Array(12));
const baseKey = await crypto.subtle.importKey('raw', enc.encode(PASS), 'PBKDF2', false, ['deriveKey']);
const key = await crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: CONFIG.kdfIterations, hash: 'SHA-256' }, baseKey, { name: 'AES-GCM', length: 256 }, false, ['encrypt']);
const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(JSON.stringify(pii))));
const b64 = u => Buffer.from(u).toString('base64');

const out = {
  generatedAt: Date.now(),
  locationId: LOC,
  locationName: location.name || CONFIG.locationName,
  timezone,
  ghlBaseUrl: CONFIG.ghlBaseUrl,
  pipelines: pipelines.map(p => ({ id: p.id, name: p.name, stages: (p.stages || []).map(s => ({ id: s.id, name: s.name })) })),
  users: users.map(u => ({ id: u.id, name: u.name || [u.firstName, u.lastName].filter(Boolean).join(' ') })),
  calendars: calendars.map(c => ({ id: c.id, name: c.name })),
  leads,
  calls: callList,
  appointments,
  warnings,
  pii: { v: 1, salt: b64(salt), iv: b64(iv), ct: b64(ct), iterations: CONFIG.kdfIterations },
};
writeFileSync('data.json', JSON.stringify(out));
console.log(`wrote data.json: ${leads.length} leads, ${callList.length} calls, ${appointments.length} appointments, ${users.length} users, ${warnings.length} warnings, ${calls} API calls`);
