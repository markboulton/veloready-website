import type { Handler } from "@netlify/functions";
import { getStore } from "@netlify/blobs";
import crypto from "node:crypto";


/** -------- In-memory cache fallback for local/dev -------- */
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


/** ---------- Prompt config ---------- */
const PROMPT_VERSION = "ridecoach-v3-scoring";


/** System: friendly, simple, Strava-like tone with improved scoring guidance */
const SYSTEM_PROMPT = [
  "You are 'VeloReady Coach', a concise, friendly cycling coach.",
  "Voice: simple, positive, UK English, no jargon; 2 short sentences per field; no emojis; no medical claims.",
  "Purpose: interpret ONE ride (power/heart rate/cadence/intervals/TSS/IF plus optional context) and give approachable guidance.",
  "Audience: time-crunched rider who likes data but wants clear takeaways. Keep it supportive and practical.",
  "",
  "EXECUTION SCORE RUBRIC (0-100):",
  "- 95-100: Perfect execution. Hit all targets, excellent pacing, optimal fueling, no drift.",
  "- 85-94: Strong execution. Minor imperfections (slight fade, small pacing error).",
  "- 75-84: Good execution. Met main goals but notable issues (drift >5%, pacing variability, under-fueled).",
  "- 60-74: Fair execution. Completed but significant issues (high drift, poor pacing, wrong zones).",
  "- 40-59: Poor execution. Major problems (blew up early, wrong intensity, abandoned).",
  "- 0-39: Failed execution. Did not complete or completely wrong effort.",
  "",
  "SCORING FACTORS:",
  "- Power consistency: Did they hold target watts? Variability? Early blow-ups?",
  "- Pacing: HR drift <3% = excellent, 3-6% = good, >6% = poor.",
  "- Zone distribution: Time in correct zones for workout type?",
  "- Context awareness: Smart effort given recovery/TSB? Or pushed when fatigued?",
  "- Fueling: IF ≥0.8 needs 60-90g/h. Under-fueled = lower score.",
  "",
  "Must:",
  "- Use plain words and short sentences. Avoid acronyms unless they are TSS/IF/FTP.",
  "- Always call out one highlight and one small improvement.",
  "- Use cause-effect phrasing like 'Because IF 0.86...' or 'Since HR drift is 7%...'.",
  "- Be specific with the score - use the full 0-100 range based on actual execution quality.",
  "- Output STRICT JSON with keys: headline, coachBrief, executionScore (0-100), strengths (array), limiters (array), nextHint, tags (array).",
  "Do not include extra keys or explanations."
].join(" ");


/** Few-shots: diverse scoring examples across the full range */
type FewShot = { user: string; assistant: string };
const FEW_SHOTS: FewShot[] = [
  {
    user:
      "title: Sweet Spot 3x12 | tss: 82 | if: 0.86 | np: 275 | avgPower: 248 | ftp: 320 | hr.avg: 152 | hr.max: 178 | hr.lfhddriftPct: 2.5 | cadence.avg: 91 | " +
      "intervals: [{label:'SS1',durSec:720,avgP:300,avgHR:160,cad:92},{label:'SS2',durSec:720,avgP:302,avgHR:163,cad:91},{label:'SS3',durSec:720,avgP:298,avgHR:165,cad:90}] | " +
      "fueling.carb_g_per_h: 70 | rpe: 7 | context: {recoveryPct: 72, tsb: -6}",
    assistant: JSON.stringify({
      headline: "Textbook sweet spot execution",
      coachBrief:
        "Because IF 0.86 and TSS 82 match the target perfectly, this hit the mark. HR drift under 3% shows excellent pacing and fueling.",
      executionScore: 94,
      strengths: ["Consistent reps", "Cadence ~90 rpm", "Fueling on point", "Low HR drift"],
      limiters: ["Tiny fade in final interval"],
      nextHint: "Add 1 min recovery before the final rep to hold form.",
      tags: ["sweet-spot", "on-plan", "steady"]
    })
  },
  {
    user:
      "title: Group ride | tss: 95 | if: 0.9 | np: 285 | avgPower: 232 | ftp: 310 | hr.lfhddriftPct: 8 | spikes>120%FTP: many | fueling.carb_g_per_h: 35 | rpe: 8",
    assistant: JSON.stringify({
      headline: "Big day with too many spikes",
      coachBrief:
        "Since HR drift is 8% and fueling was 35 g/h, the late heaviness makes sense. Hold back in the first 30 min and aim 60–80 g/h.",
      executionScore: 62,
      strengths: ["Strong surges", "Good intent"],
      limiters: ["Under-fueled", "High variability", "Poor pacing"],
      nextHint: "Smooth the first 30 min and fuel earlier.",
      tags: ["group-ride", "variable", "underfueled"]
    })
  },
  {
    user:
      "title: Recovery spin | tss: 32 | if: 0.55 | np: 170 | avgPower: 155 | ftp: 300 | hr.lfhddriftPct: 1 | fueling.carb_g_per_h: 20 | rpe: 2 | context: {recoveryPct: 38, tsb: -12}",
    assistant: JSON.stringify({
      headline: "Perfect recovery ride",
      coachBrief:
        "Because recovery is low, the light spin was exactly right. HR drift under 2% confirms you stayed truly easy.",
      executionScore: 98,
      strengths: ["Kept it easy", "Low drift", "Smart choice given fatigue"],
      limiters: [],
      nextHint: "Stay aerobic tomorrow unless legs bounce back.",
      tags: ["recovery", "smart-choice"]
    })
  },
  {
    user:
      "title: Tempo 2x20 | tss: 76 | if: 0.83 | np: 260 | avgPower: 240 | ftp: 300 | hr.lfhddriftPct: 6.5 | fueling.carb_g_per_h: 45 | rpe: 7",
    assistant: JSON.stringify({
      headline: "Solid tempo with pacing drift",
      coachBrief:
        "Because HR drift is 6.5% at tempo, you started a bit hot. Open easier, keep cadence smooth, and fuel 60–80 g/h.",
      executionScore: 76,
      strengths: ["Time in zone", "Even cadence"],
      limiters: ["Paced a touch hard", "Fueling a bit light"],
      nextHint: "Start 5 W lower for the first 10 min, then settle.",
      tags: ["tempo", "pacing", "fueling"]
    })
  },
  {
    user:
      "title: VO2 Max 5x5 | tss: 92 | if: 0.95 | np: 310 | avgPower: 285 | ftp: 320 | hr.avg: 168 | hr.max: 182 | hr.lfhddriftPct: 3 | " +
      "intervals: [{label:'V1',durSec:300,avgP:340,avgHR:175},{label:'V2',durSec:300,avgP:335,avgHR:178},{label:'V3',durSec:300,avgP:330,avgHR:180},{label:'V4',durSec:300,avgP:325,avgHR:181},{label:'V5',durSec:300,avgP:315,avgHR:182}] | " +
      "fueling.carb_g_per_h: 80 | rpe: 9 | context: {recoveryPct: 85, tsb: 8}",
    assistant: JSON.stringify({
      headline: "Outstanding VO2 execution",
      coachBrief:
        "Because you held 340-315W across all five reps with HR drift under 3%, this was near-perfect. Fueling at 80g/h supported the effort beautifully.",
      executionScore: 96,
      strengths: ["Consistent high power", "Excellent fueling", "Minimal fade"],
      limiters: [],
      nextHint: "Next VO2 session, try holding 5W higher on rep 5.",
      tags: ["vo2max", "intervals", "excellent"]
    })
  },
  {
    user:
      "title: Failed threshold attempt | tss: 45 | if: 0.72 | np: 230 | avgPower: 195 | ftp: 320 | hr.lfhddriftPct: 12 | fueling.carb_g_per_h: 25 | rpe: 9 | context: {recoveryPct: 42, tsb: -15}",
    assistant: JSON.stringify({
      headline: "Abandoned - fatigue caught up",
      coachBrief:
        "Since recovery was 42% and TSB -15, your body wasn't ready for threshold. HR drift of 12% confirms this. Smart to stop early.",
      executionScore: 48,
      strengths: ["Listened to your body"],
      limiters: ["Started too fatigued", "Under-fueled", "Ignored recovery signals"],
      nextHint: "Take 2 easy days, then reassess with fresh legs.",
      tags: ["abandoned", "fatigue", "recovery-needed"]
    })
  }
];


/** -------- Helpers -------- */
type ChatMessage = { role: "system" | "user" | "assistant"; content: string };


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


/** Build the user content with a simple instruction + ride summary JSON */
function buildUserContent(payload: any) {
  const summary = {
    rideId: payload.rideId,
    title: payload.title,
    startTimeUtc: payload.startTimeUtc,
    durationSec: payload.durationSec,
    distanceKm: payload.distanceKm,
    elevationGainM: payload.elevationGainM,
    tss: payload.tss,
    if: payload.if,
    np: payload.np,
    avgPower: payload.avgPower,
    ftp: payload.ftp,
    hr: payload.hr,
    cadence: payload.cadence,
    timeInZonesSec: payload.timeInZonesSec,
    intervals: payload.intervals,
    fueling: payload.fueling,
    rpe: payload.rpe,
    notes: payload.notes,
    context: payload.context,
    goal: payload.goal
  };
  return (
    "Return STRICT JSON with keys: headline, coachBrief, executionScore (0-100), strengths (array), limiters (array), nextHint, tags (array). " +
    "Use simple, friendly language. One win and one tweak. Use the full 0-100 scoring range based on execution quality. No extra keys.\n\n" +
    JSON.stringify(summary)
  );
}


/** Validate model JSON safely */
type RideSummary = {
  headline: string;
  coachBrief: string;
  executionScore: number;
  strengths: string[];
  limiters: string[];
  nextHint: string;
  tags: string[];
};
function sanitizeSummary(x: any): RideSummary {
  const safe = (v: any, d: any) => (v === undefined || v === null ? d : v);
  const arr = (v: any) => (Array.isArray(v) ? v.filter((s) => typeof s === "string") : []);
  const score = Number.isFinite(x?.executionScore) ? Math.max(0, Math.min(100, Math.round(x.executionScore))) : 50;
  return {
    headline: String(safe(x?.headline, "Ride imported")),
    coachBrief: String(safe(x?.coachBrief, "Summary unavailable.")),
    executionScore: score,
    strengths: arr(x?.strengths),
    limiters: arr(x?.limiters),
    nextHint: String(safe(x?.nextHint, "Review pacing, fueling, and sleep.")),
    tags: arr(x?.tags)
  };
}


/** OpenAI call */
async function callOpenAI(userContent: string): Promise<RideSummary> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("no OPENAI_API_KEY");


  const fewShotMsgs: ChatMessage[] = FEW_SHOTS.flatMap((ex) => [
    { role: "user" as const, content: ex.user },
    { role: "assistant" as const, content: ex.assistant }
  ]);


  const messages: ChatMessage[] = [
    { role: "system" as const, content: SYSTEM_PROMPT },
    ...fewShotMsgs,
    { role: "user" as const, content: userContent }
  ];


  const r = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}` , "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      temperature: 0.4,  // Increased from 0.3 for more variety
      max_tokens: 250,   // Increased from 220 for more detailed responses
      top_p: 1,
      // If available on your account, you can add:
      // response_format: { type: "json_object" },
      messages
    })
  });
  if (!r.ok) {
    const err = await r.text().catch(() => "");
    throw new Error(`openai_error_${r.status}: ${err}` );
  }
  const j = await r.json();
  const raw = j.choices?.[0]?.message?.content?.trim() || "";
  let parsed: any;
  try {
    parsed = JSON.parse(raw);
  } catch {
    const m = raw.match(/\{[\s\S]*\}$/);
    parsed = m ? JSON.parse(m[0]) : null;
  }
  if (!parsed) throw new Error("no_json");
  return sanitizeSummary(parsed);
}


/** Deterministic fallback */
function fallbackSummary(): RideSummary {
  return {
    headline: "Ride imported",
    coachBrief: "Summary unavailable — showing basic stats only.",
    executionScore: 50,
    strengths: [],
    limiters: [],
    nextHint: "Retry later.",
    tags: ["fallback"]
  };
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
    const sentSig =
      (event.headers["x-signature"] as string | undefined) ||
      (event.headers["X-Signature"] as string | undefined) ||
      "";
    const user =
      ((event.headers["x-user"] as string | undefined) ||
        (event.headers["X-User"] as string | undefined) ||
        "") + "";
    if (!user) return { statusCode: 400, body: "Missing X-User" };
    if (!sentSig) return { statusCode: 401, body: "Missing X-Signature" };


    const calc = hmacHex(rawBody, secret);
    if (!timingSafeEq(calc, sentSig)) return { statusCode: 401, body: "Invalid signature" };


    let payload: any = {};
    try {
      payload = rawBody ? JSON.parse(rawBody) : {};
    } catch {
      return { statusCode: 400, body: "Invalid JSON" };
    }
    const rideId = String(payload.rideId || "unknown");
    const ttl = Number(process.env.CACHE_TTL_SECONDS || 86400 * 30);
    const cacheKey = `${user}:${rideId}:${PROMPT_VERSION}` ;


    try {
      const store = getStore({ name: "ai-ride-summary" });
      const cached = await store.get(cacheKey, { type: "text" });
      if (cached) {
        return { statusCode: 200, headers: { "Content-Type": "application/json" }, body: cached };
      }


      const userContent = buildUserContent(payload);
      let summary: RideSummary;
      try { summary = await callOpenAI(userContent); } catch { summary = fallbackSummary(); }
      const body = JSON.stringify({ ...summary, version: PROMPT_VERSION, cached: false });


      await store.set(cacheKey, body, { ttl });
      return { statusCode: 200, headers: { "Content-Type": "application/json" }, body };
    } catch (blobErr: any) {
      console.warn("Blobs unavailable, using in-memory cache:", blobErr?.message || blobErr);
      const cached = cacheGet(cacheKey);
      if (cached) {
        return { statusCode: 200, headers: { "Content-Type": "application/json" }, body: cached };
      }
      const userContent = buildUserContent(payload);
      let summary: RideSummary;
      try { summary = await callOpenAI(userContent); } catch { summary = fallbackSummary(); }
      const body = JSON.stringify({ ...summary, version: PROMPT_VERSION, cached: false, cache: "mem" });
      cacheSet(cacheKey, body, ttl);
      return { statusCode: 200, headers: { "Content-Type": "application/json" }, body };
    }
  } catch (e: any) {
    console.error("ai-ride-summary error:", e?.stack || e);
    return { statusCode: 500, body: e?.message || "server_error" };
  }
};
