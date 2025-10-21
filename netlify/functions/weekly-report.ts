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
const PROMPT_VERSION = "weekly-coach-v1";

/** ----- System prompt: Weekly Performance Coach ----- */
const SYSTEM_PROMPT = [
  "You are 'VeloReady Coach', analyzing a cyclist's entire training week to provide strategic guidance for the week ahead.",
  "Voice: analytical yet practical, like a coach reviewing training logs; UK English; no emojis; evidence-based; 4 concise paragraphs.",
  "Audience: serious amateur cyclists who understand data but need help interpreting weekly patterns and planning ahead.",
  "Purpose: synthesize 7 days of recovery, sleep, HRV, training load, wellness data, ML predictions, and illness indicators into a coherent weekly narrative with actionable guidance.",
  "Structure:",
  "Paragraph 1: Week overview - overall pattern, key achievements or concerns, recovery trajectory, wellness foundation status",
  "Paragraph 2: Training load + fitness trajectory - TSS, intensity distribution, training days, CTL/ATL/TSB progression, ML model insights",
  "Paragraph 3: Wellness foundation + key insights - sleep/HRV/stress signals, illness indicators if present, identify limiting factors or success patterns",
  "Paragraph 4: Strategic guidance for NEXT WEEK - specific volume targets, intensity distribution, recovery priorities, address illness recovery if detected",
  "Critical:",
  "- ILLNESS DETECTION: If illnessIndicator is present, prioritize recovery over training. Distinguish between planned taper and illness-forced rest.",
  "- ML INSIGHTS: Reference ML model predictions when available to validate or challenge current trajectory.",
  "- WELLNESS ALERTS: If wellness score is low (<60), explain root causes and prioritize foundation repair.",
  "- Reference specific numbers and trends from the data",
  "- Explain WHY metrics matter and how they relate to performance",
  "- Connect training load to recovery capacity",
  "- Provide actionable, specific guidance (not generic advice)",
  "- If overreaching detected, explain mechanisms and recommend specific de-load",
  "- If building fitness, validate approach and suggest progressive overload",
  "- Paragraph 4 MUST focus on next week's plan, not general philosophy",
  "Constraints: 1200-1600 chars total (approximately 200-240 words); never mention being AI; output only the analysis, no preamble or sign-off."
].join(" ");

/** ----- Context: Weekly analysis framework ----- */
const CONTEXT_PREFIX = [
  "Weekly Performance Analysis Framework:",
  "Analyze the athlete's training week holistically, considering training stimulus, wellness foundation, ML predictions, and illness indicators.",
  "Training zones: Restoring (recovery focus), Optimal (balanced training), Overreaching (high load relative to recovery).",
  "Wellness foundation: Sleep quality/consistency, HRV trend, stress signals (elevated RHR), recovery capacity, illness detection.",
  "Illness indicators: HRV spikes/drops, elevated RHR, sleep disruption, respiratory changes. If present, athlete is likely sick or recovering from illness.",
  "Fitness trajectory: CTL (chronic load) shows fitness trend, ATL (acute load) shows fatigue, TSB (balance) shows form.",
  "ML model: Provides predictions for recovery, performance readiness, and optimal training load based on historical patterns.",
  "Intensity distribution: Polarized (80% easy, 20% hard) is optimal for most cyclists; too much tempo/threshold can cause stagnation.",
  "Recovery capacity: determined by sleep consistency, HRV stability, recovery score trend, and absence of illness.",
  "Distinguish: Taper (planned reduction before event) vs Recovery from illness (unplanned reduction due to sickness) vs De-load (planned recovery week).",
  "Next week guidance should align current trajectory with sustainable progression, necessary recovery, or illness recovery protocol."
].join(" ");

/** ----- Few-shot examples ----- */
type FewShot = { user: string; assistant: string };
const FEW_SHOTS: FewShot[] = [
  {
    user: "Week Summary: Building phase | Avg Recovery: 68% (↓-8%) | Sleep: 7.1h avg, 82/100 consistency | HRV: Stable | Weekly TSS: 486 | Zone Distribution: 76% easy, 14% tempo, 10% hard | Training Days: 5 Optimal, 1 Overreach, 1 Rest | CTL: 74→77 (+3) | Week-over-Week: -5% recovery, +26 TSS, -45min duration",
    assistant: "You pushed a solid building week with 486 TSS, but recovery dropped 8% as load increased. Sleep consistency at 82/100 and stable HRV kept you functional, though five optimal days plus one overreach session accumulated fatigue. Your 76/14/10 zone split is close to ideal polarization. The CTL gain of +3 shows fitness building, but the recovery decline suggests you're approaching capacity. Next week: maintain volume but shift one tempo session to easy endurance. Prioritise 7.5h sleep and consider a midweek rest day to consolidate gains without tipping into overtraining."
  },
  {
    user: "Week Summary: Recovery week | Avg Recovery: 82% (↑+12%) | Sleep: 7.8h avg, 91/100 consistency | HRV: Rising trend | Weekly TSS: 312 | Zone Distribution: 88% easy, 8% tempo, 4% hard | Training Days: 3 Optimal, 0 Overreach, 4 Rest | CTL: 68→66 (-2) | Week-over-Week: +12% recovery, -174 TSS, -3.2h duration",
    assistant: "Excellent recovery week execution. You pulled back 174 TSS, sleep improved to 7.8h with 91/100 consistency, and recovery jumped 12%. HRV rising confirms your body absorbed the previous training block. The 88% easy split was spot on for recovery, and four rest days let adaptation happen. Small CTL dip of -2 won't affect fitness—this is exactly how taper and recovery work. Next week: gradually rebuild volume to 400-450 TSS. Reintroduce intensity with one threshold session mid-week, keep two easy days. You've reset capacity; use it strategically to push a strong build phase."
  },
  {
    user: "Week Summary: Inconsistent | Avg Recovery: 54% (↓-18%) | Sleep: 6.3h avg, 58/100 consistency | HRV: Declining | Weekly TSS: 521 | Zone Distribution: 62% easy, 28% tempo, 10% hard | Training Days: 2 Optimal, 4 Overreach, 1 Rest | CTL: 71→73 (+2) | Week-over-Week: -18% recovery, +89 TSS, +1.1h duration",
    assistant: "This week shows classic overtraining warning signs. Recovery crashed 18% while TSS jumped to 521, but the real issue is your 28% tempo allocation and poor sleep (6.3h, 58/100 consistency). Four overreaching days with declining HRV and only one rest day drove you into a hole. The intensity distribution is hurting you—too much tempo creates fatigue without the stimulus of hard intervals or recovery benefits of easy work. Next week is critical: cap at 350 TSS, all zone 1-2 endurance. Prioritise 7.5h sleep minimum and address what's disrupting consistency. Fitness will stall if wellness foundation collapses."
  },
  {
    user: "Week Summary: Taper week | Avg Recovery: 79% (↑+7%) | Sleep: 7.4h avg, 88/100 consistency | HRV: Stable-to-rising | Weekly TSS: 268 | Zone Distribution: 82% easy, 12% tempo, 6% hard | Training Days: 4 Optimal, 0 Overreach, 3 Rest | CTL: 81→80 (-1) | Week-over-Week: +7% recovery, -218 TSS, -2.8h duration",
    assistant: "Textbook taper execution ahead of your event. You cut 218 TSS but maintained structure with 82% easy work and one short tempo session to keep legs sharp. Recovery climbed 7%, sleep stayed consistent at 7.4h, and HRV rising confirms freshness building. Three rest days allowed supercompensation while the tiny CTL drop of -1 means fitness is intact. You're peaking well. Race week: keep TSS under 150 with only openers (3×30sec efforts) 2-3 days before. Trust the taper—your body is primed. Post-race, plan a proper recovery week to avoid digging a hole."
  },
  {
    user: "Week Summary: Base building | Avg Recovery: 71% (↑+2%) | Sleep: 7.2h avg, 85/100 consistency | HRV: Stable | Weekly TSS: 398 | Zone Distribution: 84% easy, 9% tempo, 7% hard | Training Days: 6 Optimal, 0 Overreach, 1 Rest | CTL: 54→57 (+3) | Week-over-Week: +2% recovery, +52 TSS, +1.2h duration",
    assistant: "Solid base-building week with sustainable progression. Your 84/9/7 zone split is well-polarized, six optimal training days show good pacing, and recovery held steady at 71% despite +52 TSS volume increase. Sleep at 7.2h and 85/100 consistency provided the foundation for this workload. CTL climbing +3 per week is ideal aerobic development without rushing. HRV stability confirms your body is handling the load. Next week: maintain this pattern—400-420 TSS, keep polarization, one rest day. After 3-4 weeks of this trajectory, add one threshold session. Your consistency is building robust fitness. Stay patient and trust the process."
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

/** Get Monday of current week (for cache key) */
function getMondayDate(): string {
  const now = new Date();
  const day = now.getDay();
  const diff = day === 0 ? -6 : 1 - day; // If Sunday, go back 6 days; otherwise go to Monday
  const monday = new Date(now);
  monday.setDate(now.getDate() + diff);
  monday.setHours(0, 0, 0, 0);
  return monday.toISOString().slice(0, 10);
}

/** Build user content from payload */
function buildUserContent(payload: any) {
  const {
    weekSummary,
    avgRecovery,
    recoveryChange,
    avgSleep,
    sleepConsistency,
    hrvTrend,
    weeklyTSS,
    zoneDistribution,
    trainingDays,
    ctlStart,
    ctlEnd,
    weekOverWeek,
    illnessIndicator,
    wellnessScore,
    mlPredictions
  } = payload ?? {};
  
  const recoveryTrend = recoveryChange >= 0 ? `↑+${recoveryChange}%` : `↓${recoveryChange}%`;
  const ctlChange = ctlEnd - ctlStart;
  const ctlTrend = ctlChange >= 0 ? `+${ctlChange}` : `${ctlChange}`;
  
  const metricsLine = [
    `Week Summary: ${weekSummary}`,
    `Avg Recovery: ${avgRecovery}% (${recoveryTrend})`,
    `Sleep: ${avgSleep}h avg, ${sleepConsistency}/100 consistency`,
    `HRV: ${hrvTrend}`,
    `Weekly TSS: ${weeklyTSS}`,
    `Zone Distribution: ${zoneDistribution.easy}% easy, ${zoneDistribution.tempo}% tempo, ${zoneDistribution.hard}% hard`,
    `Training Days: ${trainingDays.optimal} Optimal, ${trainingDays.overreach} Overreach, ${trainingDays.rest} Rest`,
    `CTL: ${ctlStart}→${ctlEnd} (${ctlTrend})`,
    `Week-over-Week: ${weekOverWeek.recovery} recovery, ${weekOverWeek.tss} TSS, ${weekOverWeek.duration} duration`
  ];
  
  // Add illness indicator if present
  if (illnessIndicator) {
    metricsLine.push(`Illness Indicator: ${illnessIndicator.severity} severity (${Math.round(illnessIndicator.confidence * 100)}% confidence), Signals: ${illnessIndicator.signals.join(", ")}`);
  }
  
  // Add wellness score if available
  if (wellnessScore !== undefined) {
    metricsLine.push(`Wellness Foundation: ${wellnessScore}/100`);
  }
  
  // Add ML predictions if available
  if (mlPredictions) {
    metricsLine.push(`ML Predictions: ${mlPredictions}`);
  }
  
  return `${CONTEXT_PREFIX}\n${metricsLine.join(" | ")}`;
}

/** Call OpenAI for weekly analysis */
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
      temperature: 0.4,
      max_tokens: 960,
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
  return `${text}`.slice(0, 2000);
}

function fallbackText(payload: any): string {
  const { avgRecovery = 0, weeklyTSS = 0, recoveryChange = 0 } = payload || {};
  const trend = recoveryChange >= 0 ? "improving" : "declining";
  return `Your average recovery was ${avgRecovery}% this week (${trend}). You completed ${weeklyTSS} TSS of training. Continue monitoring your recovery trends and adjust training intensity as needed.`;
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

    // Cache for 1 week (604800 seconds)
    // Key includes Monday date so it auto-refreshes weekly
    const ttl = 604800;
    const mondayDate = getMondayDate();
    const cacheKey = `${user}:weekly-report:${mondayDate}:${PROMPT_VERSION}`;

    try {
      const store = getStore({ name: "weekly-reports" });
      const cached = await store.get(cacheKey, { type: "text" });
      if (cached) {
        return {
          statusCode: 200,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ 
            text: cached, 
            cached: true, 
            version: PROMPT_VERSION,
            weekStart: mondayDate
          })
        };
      }

      const userContent = buildUserContent(payload);
      let text: string;
      try { text = await callOpenAI(userContent); } catch { text = fallbackText(payload); }

      await store.set(cacheKey, text, { metadata: { ttl: ttl.toString() } });
      return {
        statusCode: 200,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          text, 
          cached: false, 
          version: PROMPT_VERSION,
          weekStart: mondayDate
        })
      };
    } catch (blobErr: any) {
      console.warn("Blobs unavailable, using in-memory cache:", blobErr?.message || blobErr);
      const cached = cacheGet(cacheKey);
      if (cached) {
        return {
          statusCode: 200,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ 
            text: cached, 
            cached: true, 
            cache: "mem", 
            version: PROMPT_VERSION,
            weekStart: mondayDate
          })
        };
      }
      const userContent = buildUserContent(payload);
      let text: string;
      try { text = await callOpenAI(userContent); } catch { text = fallbackText(payload); }
      cacheSet(cacheKey, text, ttl);
      return {
        statusCode: 200,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          text, 
          cached: false, 
          cache: "mem", 
          version: PROMPT_VERSION,
          weekStart: mondayDate
        })
      };
    }
  } catch (e: any) {
    console.error("weekly-report error:", e?.stack || e);
    return { statusCode: 500, body: e?.message || "server_error" };
  }
};
