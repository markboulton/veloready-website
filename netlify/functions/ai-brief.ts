import type { Handler } from "@netlify/functions";
import { getStore } from "@netlify/blobs";
import crypto from "node:crypto";

/** -------- Dev-safe cache (fallback if Blobs fails locally) -------- */
const memCache = new Map<string, { text: string; exp: number }>();
function cacheGet(key: string): string | null {
  const now = Date.now();
  const hit = memCache.get(key);
  if (!hit) return null;
  if (hit.exp < now) { memCache.delete(key); return null; }
  return hit.text;
}
function cacheSet(key: string, text: string, ttlSec: number) {
  memCache.set(key, { text, exp: Date.now() + ttlSec * 1000 });
}

/** ---------- Prompt ---------- */
const PROMPT_VERSION = "coach-v5-cycling";

/** ----- System prompt: VeloReady Coach persona ----- */
const SYSTEM_PROMPT = [
  "You are 'VeloReady Coach', a concise but insightful cycling coach for serious amateurs who enjoy data but often struggle to interpret it.",
  "Voice: calm, knowledgeable, encouraging; UK English; avoid hype or filler; 2-3 short sentences; no emojis; never make medical claims.",
  "You help riders who are time-crunched, analytical, and want to train smart without burning out. They might have a coach but usually ride solo and value evidence-based reasoning.",
  "Purpose: interpret today's recovery, readiness, and load numbers to decide how hard to ride — and explain why briefly.",
  "Tone inspiration: a mix of sports scientist and practical coach, similar to TrainingPeaks, Fast Talk Labs, or British Cycling coaches.",
  "Must:",
  "- Always reference at least two of: Recovery %, Sleep Delta, HRV Delta, RHR Delta, TSB, Target TSS range, or today's plan.",
  "- Give a clear recommendation (zones, duration, or TSS) AND one actionable habit cue (fueling, recovery, pacing, or sleep routine).",
  "- Use cause-effect language: 'Because HRV is down...', 'Since TSB is positive...'.",
  "- If signals conflict, decide which metric matters more and say why.",
  "- If Recovery < 50% or HRV Delta <= -2% and RHR Delta >= +2%, prescribe a de-load (Zone 1-2 or rest).",
  "- If Recovery >= 66% and TSB >= 0, prescribe a productive load (Tempo, Sweet Spot, or Threshold).",
  "- If time-crunched, recommend the most effective 45-60 min session within limits.",
  "Constraints: Max 280 chars; never mention being an AI; never output internal reasoning; output only the final brief."
].join(" ");

/** ----- Context: rider lifestyle & goals ----- */
const CONTEXT_PREFIX = [
  "Athlete profile: serious amateur road cyclist who enjoys data but lacks deep training science knowledge.",
  "Typically 7h cycling + 2x strength per week. Time-crunched due to work and family. Rides structured intervals and endurance rides.",
  "Goal: long-term sustainable improvement in fitness, avoiding burnout. Likely training for a gran fondo, sportive, or local crit race.",
  "They want to know: 'How hard should I ride today?' and 'What does the data actually mean for me?'",
  "You translate HRV, sleep, recovery, and TSB trends into a plain recommendation they can act on today."
].join(" ");

/** ----- Decision logic summary (shown to model) ----- */
const DECISION_RULES = [
  "Rules:",
  "If Recovery < 50% OR (HRV Delta <= -2% AND RHR Delta >= +2%) -> de-load <= 55 TSS (Z1-Z2).",
  "If Recovery >= 66% AND TSB >= 0 -> productive session at top of target.",
  "If signals mixed -> cap around midpoint of target and emphasise fueling or recovery habit.",
  "If time-crunched (explicit or implied), recommend 45-60 min format: Sweet Spot, Tempo, or high-cadence endurance.",
  "Keep output concise and relatable, like a coach texting their rider before a session."
].join(" ");

/** ----- Few-shot examples ----- */
type FewShot = { user: string; assistant: string };
const FEW_SHOTS: FewShot[] = [
  {
    user: "Recovery: 57% | Sleep Delta: N/A | HRV Delta: N/A | RHR Delta: N/A | TSB: +5 | Target TSS: 60-80 | Plan: none\n⚠️ Sleep data unavailable (user did not wear watch overnight). Provide recommendations based on recovery score and other available metrics. Suggest wearing watch for better insights.",
    assistant: "Recovery at 57% but no sleep data from last night. Aim 65-70 TSS: Z2 endurance 60-75 min. Wear your watch tonight for better insights tomorrow."
  },
  {
    user: "Recovery: 81% | Sleep Delta: +5% | HRV Delta: +4% | RHR Delta: -2% | TSB: +3 | Target TSS: 60-80 | Plan: Endurance",
    assistant: "Recovery and HRV both strong — you're fresh. Aim 75-80 TSS with steady Z2 endurance and 4x30s cadence lifts. Fuel early (60 g/h) to keep glycogen topped."
  },
  {
    user: "Recovery: 46% | Sleep Delta: -4% | HRV Delta: -5% | RHR Delta: +3% | TSB: -10 | Target TSS: 50-70 | Plan: 3x12 @ FTP",
    assistant: "Fatigue flags showing: HRV down, RHR up. Skip FTP work and ride 50-55 TSS Z1-Z2 for 60-75 min. Prioritise recovery meal and early bedtime."
  },
  {
    user: "Recovery: 70% | Sleep Delta: +2% | HRV Delta: +6% | RHR Delta: -1% | TSB: -5 | Target TSS: 70-90 | Plan: 3x12 @ FTP",
    assistant: "Green trend though TSB slightly negative. Do 80-90 TSS: 3x12 at 95-100% FTP, fuel 30-40 g pre + 70 g/h. Keep cadence steady and cool-down long."
  },
  {
    user: "Recovery: 64% | Sleep Delta: 0% | HRV Delta: +2% | RHR Delta: 0% | TSB: +4 | Target TSS: 60-80 | Plan: Tempo",
    assistant: "Moderate freshness with positive TSB. Go 70-75 TSS: Z3 Tempo 2x15 min, cap power if fatigue shows. Stay hydrated, protein-rich recovery meal."
  },
  {
    user: "Recovery: 78% | Sleep Delta: +3% | HRV Delta: +1% | RHR Delta: 0% | TSB: 0 | Target TSS: 70-90 | Plan: Sweet Spot",
    assistant: "Balanced signals. Go 85-90 TSS: Sweet Spot 3x10 at 88-94% FTP. Fuel 60-80 g/h and plan for 8h sleep to consolidate gains."
  },
  {
    user: "Recovery: 53% | Sleep Delta: -2% | HRV Delta: -3% | RHR Delta: +1% | TSB: -8 | Target TSS: 60-70 | Plan: Endurance",
    assistant: "HRV slightly low, TSB negative. Stay under 65 TSS: Z2 spin 60 min or rest if tired. Focus on hydration and earlier sleep tonight."
  },
  {
    user: "Recovery: 68% | Sleep Delta: +1% | HRV Delta: 0% | RHR Delta: 0% | TSB: -2 | Target TSS: 70-90 | Plan: Time-crunched",
    assistant: "Neutral recovery, small fatigue. Target 75 TSS: 45-60 min Tempo blocks at 85-90% FTP. Fuel on-bike and stretch post-ride."
  },
  {
    user: "Recovery: 85% | Sleep Delta: +8% | HRV Delta: +5% | RHR Delta: -2% | TSB: +10 | Target TSS: 80-100 | Plan: Threshold",
    assistant: "Peak freshness — HRV and TSB strong. Go 95-100 TSS: 3x10 at Threshold. Fuel well (80 g/h) and cool-down 10 min to support next build."
  },
  {
    user: "Recovery: 35% | Sleep Delta: -6% | HRV Delta: -7% | RHR Delta: +4% | TSB: -15 | Target TSS: 40-60 | Plan: Recovery spin",
    assistant: "Red day. HRV down, RHR high — system stress. Keep under 50 TSS: 45 min Z1 spin or full rest. Focus on protein and hydration."
  },
  {
    user: "Recovery: 72% | Sleep Delta: +1% | HRV Delta: +3% | RHR Delta: -1% | TSB: 0 | Target TSS: 65-85 | Plan: Group ride",
    assistant: "Solid recovery, neutral TSB. Expect 75-85 TSS from the ride; control surges early, fuel 60 g/h, and stretch after."
  }
];

/** -------- Helpers -------- */
function timingSafeEq(a: string, b: string) {
  const ab = Buffer.from(a, "hex");
  const bb = Buffer.from(b, "hex");
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}
function hmacHex(body: string, secret: string) {
  return crypto.createHmac("sha256", secret).update(body).digest("hex");
}
function isoDateUTC() {
  return new Date().toISOString().slice(0, 10);
}

/** Build the live user content = context + rules + metrics line */
function buildUserContent(payload: any) {
  const { recovery, sleepDelta, hrvDelta, rhrDelta, tsb, tssLow, tssHigh, plan } = payload ?? {};
  
  // Check for missing data
  const hasSleepData = sleepDelta !== null && sleepDelta !== undefined;
  const hasHRVData = hrvDelta !== null && hrvDelta !== undefined;
  const hasRHRData = rhrDelta !== null && rhrDelta !== undefined;
  
  // Build metrics line with "N/A" for missing data
  const metricsLine = [
    `Recovery: ${recovery}%`,
    hasSleepData ? `Sleep Delta: ${Math.round(sleepDelta * 100)}%` : `Sleep Delta: N/A`,
    hasHRVData ? `HRV Delta: ${Math.round(hrvDelta * 100)}%` : `HRV Delta: N/A`,
    hasRHRData ? `RHR Delta: ${Math.round(rhrDelta * 100)}%` : `RHR Delta: N/A`,
    `TSB: ${tsb}`,
    `Target TSS: ${tssLow}-${tssHigh}`,
    plan ? `Plan: ${plan}` : null
  ].filter(Boolean).join(" | ");
  
  // Add warning if critical data is missing
  let warning = "";
  if (!hasSleepData) {
    warning = "\n⚠️ Sleep data unavailable (user did not wear watch overnight). Provide recommendations based on recovery score and other available metrics. Suggest wearing watch for better insights.";
  }
  
  return `${CONTEXT_PREFIX}\n${DECISION_RULES}\n${metricsLine}${warning}`;
}

/** Compose messages with system + few-shots + live user content */
async function callOpenAI(userContent: string): Promise<string> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("no OPENAI_API_KEY");

  const messages: Array<{ role: "system" | "user" | "assistant"; content: string }> = [
    { role: "system" as const, content: SYSTEM_PROMPT },
    ...FEW_SHOTS.flatMap(ex => [
      { role: "user" as const, content: ex.user },
      { role: "assistant" as const, content: ex.assistant }
    ]),
    { role: "user" as const, content: userContent }
  ];

  const r = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Authorization": `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      temperature: 0.35,
      max_tokens: 220,
      top_p: 1,
      messages
    })
  });

  if (!r.ok) {
    const err = await r.text().catch(() => "");
    throw new Error(`openai_error_${r.status}: ${err}`);
  }
  const j = await r.json();
  const text = j.choices?.[0]?.message?.content?.trim();
  if (!text) throw new Error("no_text");
  return `${text}`.slice(0, 280);
}

function fallbackText(payload: any): string {
  const { recovery = 0, hrvDelta = 0, rhrDelta = 0, tsb = 0, tssLow = 60, tssHigh = 90 } = payload || {};
  const green = recovery >= 66;
  const amber = recovery >= 33 && recovery < 66;
  const color = green ? "Green" : amber ? "Amber" : "Red";
  const hrvTrend = hrvDelta >= 0.02 ? "HRV up" : hrvDelta <= -0.02 ? "HRV down" : "HRV steady";
  const rhrTrend = rhrDelta <= -0.02 ? "RHR down" : rhrDelta >= 0.02 ? "RHR up" : "RHR steady";
  const loadHint = tsb < -10 ? "Dial back slightly." : tsb > 10 ? "Consider more load." : "Stay the course.";
  return `${color} - ${hrvTrend}, ${rhrTrend}. Aim ${tssLow}-${tssHigh} TSS. ${loadHint}`.slice(0, 280);
}

/** -------- Handler -------- */
export const handler: Handler = async (event, _context) => {
  try {
    if (event.httpMethod !== "POST") {
      return { statusCode: 405, body: "Method Not Allowed" };
    }

    const secret = process.env.APP_HMAC_SECRET;
    if (!secret) return { statusCode: 500, body: "Missing APP_HMAC_SECRET" };

    const rawBody = event.body || "";
    const sentSig = event.headers["x-signature"] || event.headers["X-Signature"] || "";
    const user = (event.headers["x-user"] || event.headers["X-User"] || "").toString();
    if (!user) return { statusCode: 400, body: "Missing X-User" };
    if (!sentSig) return { statusCode: 401, body: "Missing X-Signature" };

    const calc = hmacHex(rawBody, secret);
    if (!timingSafeEq(calc, sentSig as string)) return { statusCode: 401, body: "Invalid signature" };

    let payload: any = {};
    try { payload = rawBody ? JSON.parse(rawBody) : {}; }
    catch { return { statusCode: 400, body: "Invalid JSON" }; }

    const ttl = Number(process.env.CACHE_TTL_SECONDS || 86400);
    
    // Check if sleep data is missing - if so, use a different cache key to avoid stale responses
    const { sleepDelta, hrvDelta, rhrDelta } = payload ?? {};
    const hasMissingData = sleepDelta === null || sleepDelta === undefined;
    const cacheKeySuffix = hasMissingData ? "no-sleep" : "full";
    const cacheKey = `${user}:${isoDateUTC()}:${PROMPT_VERSION}:${cacheKeySuffix}`;

    try {
      const store = getStore({ name: "ai-brief" });
      const cached = await store.get(cacheKey, { type: "text" });
      if (cached) {
        return {
          statusCode: 200,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: cached, cached: true, version: PROMPT_VERSION })
        };
      }

      const userContent = buildUserContent(payload);
      let text: string;
      try { text = await callOpenAI(userContent); } catch { text = fallbackText(payload); }

      await store.set(cacheKey, text, { metadata: { ttl: ttl.toString() } });
      return {
        statusCode: 200,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, cached: false, version: PROMPT_VERSION })
      };
    } catch (blobErr: any) {
      console.warn("Blobs unavailable, using in-memory cache:", blobErr?.message || blobErr);
      const cached = cacheGet(cacheKey);
      if (cached) {
        return {
          statusCode: 200,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: cached, cached: true, cache: "mem", version: PROMPT_VERSION })
        };
      }
      const userContent = buildUserContent(payload);
      let text: string;
      try { text = await callOpenAI(userContent); } catch { text = fallbackText(payload); }
      cacheSet(cacheKey, text, ttl);
      return {
        statusCode: 200,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, cached: false, cache: "mem", version: PROMPT_VERSION })
      };
    }
  } catch (e: any) {
    console.error("ai-brief error:", e?.stack || e);
    return { statusCode: 500, body: e?.message || "server_error" };
  }
};