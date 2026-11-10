import fs from 'node:fs';
import { prepare, attachMoney, computeAll, funnel, executiveSummary, todayParts, zonedMidnight, previousRange, fmtDate } from '../kpi-core.mjs';
import { CONFIG } from '../config.mjs';

const RAW = JSON.parse(fs.readFileSync(new URL('../data.json', import.meta.url), 'utf8'));
const tz = RAW.timezone || CONFIG.timezoneFallback;
const P = prepare(RAW, { hiddenReps: CONFIG.hiddenReps, businessHours: CONFIG.businessHours, excludeTags: CONFIG.excludeTags });

// Optional: names and ad spend need the team passphrase (env MKM_PASSPHRASE). Without it the report has no names or spend.
let pii = null;
const pass = process.env.MKM_PASSPHRASE || '';
if (pass) {
  try {
    const b = s => Buffer.from(s, 'base64');
    const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(pass), 'PBKDF2', false, ['deriveKey']);
    const key = await crypto.subtle.deriveKey({ name: 'PBKDF2', salt: b(RAW.pii.salt), iterations: RAW.pii.iterations, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['decrypt']);
    pii = JSON.parse(new TextDecoder().decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b(RAW.pii.iv) }, key, b(RAW.pii.ct))));
    attachMoney(P, pii.money);
  } catch { pii = null; }
}

// Period: Monday = last week (Mon–Sun); any other day = yesterday. Override with REPORT_MODE=daily|weekly.
const now = Number(process.env.REPORT_NOW) || Date.now(), t = todayParts(tz, now);
const today0 = zonedMidnight(t.y, t.m, t.d, tz);
const dow = new Date(Date.UTC(t.y, t.m - 1, t.d)).getUTCDay();
const weekly = process.env.REPORT_MODE ? process.env.REPORT_MODE === 'weekly' : dow === 1;
const back = new Date(Date.UTC(t.y, t.m - 1, t.d - (weekly ? 7 : 1)));
const from = zonedMidnight(back.getUTCFullYear(), back.getUTCMonth() + 1, back.getUTCDate(), tz);
const r = { from, to: today0 };
const f = { ...r, source: 'all', rep: 'all', pipeline: 'all' };
const cur = computeAll(P, f, tz), prev = computeAll(P, { ...f, ...previousRange(r) }, tz);
const T = cur.tiles, Q = prev.tiles;

const r1 = v => (v == null ? null : Math.round(v * 10) / 10);
const time = ms => new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: weekly ? 'short' : undefined, hour: 'numeric', minute: '2-digit' }).format(ms);
const name = l => (pii?.contacts?.[l.contactId]?.name || null);
const bySource = rows => rows.reduce((o, l) => ((o[l.source] = (o[l.source] || 0) + 1), o), {});
const tile = (k, src = T) => { const x = src[k]; return x ? { value: r1(x.value), ...(x.den != null ? { num: x.num, den: x.den } : {}) } : null; };

const leads = [...T.newLeads.rows].sort((a, b) => a.createdAt - b.createdAt).map(l => ({
  name: name(l), source: l.source, came_in: (l.t0 || l.createdAt) < r.from ? new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(l.t0) : time(l.t0 || l.createdAt), came_in_by_call: !!l.arrivedAt, after_hours: l.afterHours,
  called_in_biz_min: l.stlBiz, booked_before_call: l.bookedFirst, not_called_yet: l.stlBiz == null && !l.bookedFirst,
  dials: l.dialCount || 0, reached: l.contacted, how_reached: l.contactMethod || null, stage: l.stageName,
  offer_made: l.offered, under_contract: l.contract, closed: l.won, owner: l.ownerName,
}));
const excluded = T.excluded.rows.map(l => ({ name: name(l), source: l.source, reason: l.excluded, came_in: time(l.createdAt) }));
const missed = T.missedRate.rows.map(c => ({ name: c.contactId ? name({ contactId: c.contactId }) : null, at: time(c.at), status: c.status, called_back_min: c.callbackMin ?? null }));

// Pipeline right now (all time, open cards): useful for "what's in play".
const openNow = P.leads.filter(l => !l.excluded && l.status === 'open');
const stageCount = s => openNow.filter(l => l.stageName === s).length;

const S = executiveSummary(T, funnel(P, f, tz), { repName: CONFIG.mainRepName || 'Ann' });
const out = {
  period: { mode: weekly ? 'weekly' : 'daily', label: weekly ? `${fmtDate(r.from, tz, false)} – ${fmtDate(r.to - 1, tz, false)}` : fmtDate(r.from, tz, false), timezone: tz, from_ms: r.from, to_ms: r.to },
  computed_at_ms: now, generated_at_ms: RAW.generatedAt,
  data_as_of: fmtDate(RAW.generatedAt, tz, true), data_age_hours: r1((now - RAW.generatedAt) / 36e5),
  names_and_spend_unlocked: !!pii,
  leads: { new: T.newLeads.value, prev_period: Q.newLeads.value, by_source: bySource(T.newLeads.rows), not_counted: T.excluded.value },
  speed: { avg_business_min: tile('speedToLead'), prev_avg_business_min: tile('speedToLead', Q), within_5_min_pct: tile('within5'), not_called_yet: T.notCalled.value,
    waited_30_plus: T.newLeads.rows.filter(l => l.stlBiz != null && l.stlBiz >= 30).length,
    after_hours_leads: T.afterLeads.value, after_hours_avg_min_from_9am: tile('afterSpeed') },
  contact: { contact_ratio_pct: tile('contactRate'), reached: T.contacted.value },
  calls: { dials: T.dials.value, connects_60s_plus: T.connects.value, inbound_missed: missed.length, missed_rate_pct: tile('missedRate'), returning_callers: T.returning.value },
  appointments: { booked: T.booked.value, show_rate_pct: tile('showRate') },
  sales_from_these_leads: { offers: T.offers.value, contracts: T.contracts.value, closed: T.purchased.value, dead: T.dead.value,
    contact_to_offer_pct: tile('contactToOffer'), offer_to_contract_pct: tile('offerToContract') },
  pipeline_now: { engaged: stageCount('Engaged'), warm: stageCount('Warm Leads'), offer_out_perfect_presentation: stageCount('Perfect Presentation'), under_contract: stageCount('Under Contract') },
  voice_ai: RAW.voiceAvailable ? { calls: T.aiCalls.value, transferred: T.aiTransferred.value, booked: T.aiBooked.value, became_lead: T.aiBecameLead.value, under_30s: T.aiShort.value } : 'not available',
  money: pii ? { ad_spend: r1(T.adSpend.value), cost_per_lead: r1(T.costPerLead.value) } : 'locked (no passphrase)',
  lead_list: leads, not_counted_list: excluded, missed_calls: missed,
  dashboard_summary: { going_well: S.good.map(x => x.text), needs_attention: S.attention.map(x => x.text), focus: S.focus },
  warnings: RAW.warnings || [],
};
console.log(JSON.stringify(out, null, 2));
