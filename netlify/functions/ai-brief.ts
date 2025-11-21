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
const PROMPT_VERSION = "coach-v6-interpretive";

/** ----- System prompt: VeloReady Coach persona ----- */
const SYSTEM_PROMPT = [
  "You are a cycling coach who interprets physiological data to give daily training guidance.",
  "Your job: explain what the athlete's body is telling them today and what that means for their ride.",
  "Voice: Direct, evidence-based, conversational. UK English. Like a text from a coach who knows their athlete's patterns.",
  "CRITICAL: Interpret, don't summarize. Tell the athlete WHY their body feels a certain way, not just WHAT the numbers are.",
  "Vary your approach daily:",
  "- Sometimes lead with physiology (HRV/RHR patterns), sometimes with training load (TSB/CTL), sometimes with sleep.",
  "- Mix short punchy sentences with occasional longer ones.",
  "- Use different reasoning styles: cause-effect, comparison to baseline, pattern recognition, forward-looking.",
  "- Avoid repetitive phrases like 'metrics suggest', 'looking good', 'dial it back'. Be specific.",
  "When body stress detected (HRV spike >100%, moderate/high severity):",
  "- Prioritize rest over all other metrics",
  "- Say 'your body needs extra recovery' NOT 'you are sick' (no diagnosis)",
  "- Cap at 30 TSS Z1 max",
  "Decision framework (not rules to recite):",
  "- Recovery <50% OR (HRV down >2% AND RHR up >2%) → de-load to Z1-Z2, max 55 TSS",
  "- Recovery ≥66% AND TSB ≥0 → productive session at top of target (tempo/sweet spot/threshold)",
  "- HRV up >15% → trust HRV over RHR (common after hard training)",
  "- Sleep 85-100 = excellent, 70-84 = good, 60-69 = fair, <60 = poor",
  "- Mixed signals → explain which metric wins and why",
  "Format: 80-100 words. No emojis. No medical claims. Output the brief only, no reasoning."
].join(" ");

/** ----- Context: rider lifestyle & goals ----- */
const CONTEXT_PREFIX = [
  "Athlete: Serious amateur cyclist. ~7h/week riding + strength training. Time-crunched (work/family).",
  "Goals: Sustainable fitness gains, avoid burnout. Training for sportive/gran fondo/crits.",
  "What they need: Plain interpretation of what today's physiology means for training intensity.",
  "Your task: Connect the dots between HRV, RHR, sleep, and training load to explain their current state and recommend today's approach."
].join(" ");

/** ----- Decision logic summary (shown to model) ----- */
const INTERPRETATION_GUIDANCE = [
  "Interpret the metrics below as physiological signals:",
  "HRV/RHR patterns reveal autonomic nervous system state (recovery vs stress)",
  "Sleep quality + duration affect cognitive function and glycogen restoration",
  "TSB (Form) = CTL - ATL = readiness for hard efforts vs need for recovery",
  "Recovery score synthesizes everything but trust specific signals when conflicting",
  "Translate these into: (1) what their body is experiencing, (2) what that means for today, (3) specific session recommendation with rationale.",
  "Vary your language and reasoning approach each day to avoid sounding formulaic."
].join(" ");

/** ----- Few-shot examples ----- */
type FewShot = { user: string; assistant: string };
const FEW_SHOTS: FewShot[] = [
  {
    user: "Recovery: 57% | Sleep Delta: N/A | HRV Delta: N/A | RHR Delta: N/A | TSB: +5 | Target TSS: 60-80 | Plan: none\n⚠️ Sleep data unavailable (user did not wear watch overnight). Provide recommendations based on recovery score and other available metrics. Suggest wearing watch for better insights.",
    assistant: "Without sleep data, I can only read recovery at 57% — borderline. Play it safe: 65 TSS Z2 endurance for 60–75 minutes. Wear your watch tonight so we can see the full picture tomorrow."
  },
  {
    user: "Recovery: 81% | Sleep: 88/100 | HRV Delta: +4% | RHR Delta: -2% | TSB: +3 | Target TSS: 60-80 | Plan: Endurance",
    assistant: "Your parasympathetic system is humming — HRV elevated, RHR dropping, sleep quality strong. Body's primed for work. Take 75–80 TSS: steady Z2 with 4×30s cadence bursts. Fuel early to capitalise."
  },
  {
    user: "Recovery: 46% | Sleep Delta: -4% | HRV Delta: -5% | RHR Delta: +3% | TSB: -10 | Target TSS: 50-70 | Plan: 3x12 @ FTP",
    assistant: "Skip the FTP session. HRV suppressed, heart rate elevated, sleep short — textbook incomplete recovery. Spin easy for 50 TSS in Z1–Z2, then prioritise food and an early night."
  },
  {
    user: "Recovery: 70% | Sleep: 82/100 | HRV Delta: +6% | RHR Delta: -1% | TSB: -5 | Target TSS: 70-90 | Plan: 3x12 @ FTP",
    assistant: "TSB is slightly negative but HRV trend overrides that — you're absorbing training well. Proceed with 80–90 TSS: 3×12 min at 95–100% FTP. Keep fueling tight (60–70 g/h) and extend your cool-down."
  },
  {
    user: "Recovery: 64% | Sleep Delta: 0% | HRV Delta: +2% | RHR Delta: 0% | TSB: +4 | Target TSS: 60-80 | Plan: Tempo",
    assistant: "Neutral physiology, positive form. Nothing spectacular but nothing broken. Tempo session fits: 70 TSS, 2×15 min Z3. Cap power early if legs feel heavy. Protein-rich meal after."
  },
  {
    user: "Recovery: 78% | Sleep: 86/100 | HRV Delta: +1% | RHR Delta: 0% | TSB: 0 | Target TSS: 70-90 | Plan: Sweet Spot",
    assistant: "Solid overnight restoration and balanced load. Sweet Spot session works perfectly today: 85 TSS, 3×10 min at 88–94% FTP. Fuel on the bike (60–80 g/h) and bank 8 hours sleep to lock in the stimulus."
  },
  {
    user: "Recovery: 53% | Sleep: 68/100 | HRV Delta: -3% | RHR Delta: +1% | TSB: -8 | Target TSS: 60-70 | Plan: Endurance",
    assistant: "Sleep quality dropped and autonomic markers are off. Fatigue is accumulating — TSB confirms it. Ease back to 60 TSS Z2 or rest entirely. Hydrate well and aim for earlier bedtime."
  },
  {
    user: "Recovery: 85% | Sleep: 94/100 | HRV Delta: +5% | RHR Delta: -2% | TSB: +10 | Target TSS: 80-100 | Plan: Threshold",
    assistant: "Peak readiness: CNS is fresh, glycogen restored, form positive. Perfect day for quality. Push 95–100 TSS with 3×10 min threshold. Fuel aggressively (80 g/h) and cool down thoroughly to set up tomorrow."
  },
  {
    user: "Recovery: 35% | Sleep: 58/100 | HRV Delta: -7% | RHR Delta: +4% | TSB: -15 | Target TSS: 40-60 | Plan: Recovery spin",
    assistant: "Your body is deeply fatigued. Sleep disrupted, HRV crushed, RHR spiking — sympathetic overdrive. Rest day or 30–40 TSS Z1 spin maximum. Focus on nutrition and get to bed early tonight."
  },
  {
    user: "Recovery: 72% | Sleep: 79/100 | HRV Delta: +3% | RHR Delta: -1% | TSB: 0 | Target TSS: 65-85 | Plan: Group ride",
    assistant: "Decent recovery with positive autonomic signals. Group ride should land around 75–85 TSS naturally. Control early surges, stay fueled (60 g/h), and stretch afterward to keep legs supple."
  },
  {
    user: "Recovery: 96% | Sleep: 98/100 | HRV Delta: +126% | RHR Delta: +9% | TSB: +37 | Target TSS: 40-52 | Plan: none",
    assistant: "Massive HRV rebound (+126%) after rest block — parasympathetic system fully restored even with RHR slightly up. This is supercompensation. Ride 50 TSS Z2–Z3 to reactivate without digging deep. Keep it aerobic."
  },
  {
    user: "Recovery: 68% | Sleep Delta: +1% | HRV Delta: 0% | RHR Delta: 0% | TSB: -2 | Target TSS: 70-90 | Plan: Time-crunched",
    assistant: "Everything's flat — no red flags but no green lights either. You can work, just keep it controlled. 75 TSS in 45–60 minutes: tempo blocks at 85–90% FTP. Fuel during and stretch after."
  },
  {
    user: "Recovery: 44% | Sleep: 62/100 | HRV Delta: -4% | RHR Delta: +2% | TSB: -6 | Target TSS: 50-65 | Plan: none",
    assistant: "Poor sleep combined with suppressed HRV and rising heart rate — you're not recovered from recent load. Keep it to 50–55 TSS maximum, Zone 1 only. Consider full rest if you feel flat on the bike."
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
  const { recovery, sleepDelta, sleepScore, hrvDelta, rhrDelta, tsb, tssLow, tssHigh, plan, illnessIndicator } = payload ?? {};
  
  // Check for missing data
  const hasSleepScore = sleepScore !== null && sleepScore !== undefined;
  const hasSleepDelta = sleepDelta !== null && sleepDelta !== undefined;
  const hasHRVData = hrvDelta !== null && hrvDelta !== undefined;
  const hasRHRData = rhrDelta !== null && rhrDelta !== undefined;
  
  // Build sleep metric: prefer comprehensive score over delta
  let sleepMetric: string;
  if (hasSleepScore) {
    sleepMetric = `Sleep: ${sleepScore}/100`;
  } else if (hasSleepDelta) {
    sleepMetric = `Sleep Delta: ${sleepDelta >= 0 ? '+' : ''}${sleepDelta.toFixed(1)}h`;
  } else {
    sleepMetric = `Sleep: N/A`;
  }
  
  // Build body stress indicator string if present
  let stressMetric = "";
  if (illnessIndicator && illnessIndicator.severity) {
    const signals = illnessIndicator.signals || [];
    const signalTypes = signals.map((s: any) => s.type).join(", ");
    stressMetric = ` | ⚠️ Body Stress: ${illnessIndicator.severity.toUpperCase()} (${Math.round(illnessIndicator.confidence * 100)}% confidence) - Signals: ${signalTypes}`;
  }
  
  // Build metrics line with "N/A" for missing data
  const metricsLine = [
    `Recovery: ${recovery}%`,
    sleepMetric,
    hasHRVData ? `HRV Delta: ${hrvDelta >= 0 ? '+' : ''}${Math.round(hrvDelta)}%` : `HRV Delta: N/A`,
    hasRHRData ? `RHR Delta: ${rhrDelta >= 0 ? '+' : ''}${Math.round(rhrDelta)}%` : `RHR Delta: N/A`,
    `TSB: ${tsb >= 0 ? '+' : ''}${tsb}`,
    `Target TSS: ${tssLow}-${tssHigh}`,
    plan ? `Plan: ${plan}` : null
  ].filter(Boolean).join(" | ") + stressMetric;
  
  // Add warning if critical data is missing
  let warning = "";
  if (!hasSleepScore && !hasSleepDelta) {
    warning = "\n⚠️ Sleep data unavailable (user did not wear watch overnight). Provide recommendations based on recovery score and other available metrics. Suggest wearing watch for better insights.";
  }
  
  return `${CONTEXT_PREFIX}\n${INTERPRETATION_GUIDANCE}\n\nToday's metrics:\n${metricsLine}${warning}`;
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
      temperature: 0.6,
      max_tokens: 180,  // ~100 words (increased from 240 which was limiting output)
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
  return text;
}

function fallbackText(payload: any): string {
  const { recovery = 0, hrvDelta = 0, rhrDelta = 0, tsb = 0, tssLow = 60, tssHigh = 90 } = payload || {};
  const green = recovery >= 66;
  const amber = recovery >= 33 && recovery < 66;
  const color = green ? "Green" : amber ? "Amber" : "Red";
  const hrvTrend = hrvDelta >= 0.02 ? "HRV up" : hrvDelta <= -0.02 ? "HRV down" : "HRV steady";
  const rhrTrend = rhrDelta <= -0.02 ? "RHR down" : rhrDelta >= 0.02 ? "RHR up" : "RHR steady";
  const loadHint = tsb < -10 ? "Dial back slightly." : tsb > 10 ? "Consider more load." : "Stay the course.";
  return `${color} - ${hrvTrend}, ${rhrTrend}. Aim ${tssLow}-${tssHigh} TSS. ${loadHint}`;
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
    
    // Check if sleep data is missing or body stress detected - use different cache keys
    const { sleepScore, sleepDelta, illnessIndicator } = payload ?? {};
    const hasMissingData = (sleepScore === null || sleepScore === undefined) && (sleepDelta === null || sleepDelta === undefined);
    const hasStress = illnessIndicator && illnessIndicator.severity;
    const cacheKeySuffix = hasStress ? "stress" : hasMissingData ? "no-sleep" : "full";
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