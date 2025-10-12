import { ENV } from "./env";
import { incrby, get, setex } from "./redis";

// Keys: rl:overall:15m, rl:nonupload:15m, rl:overall:day, rl:nonupload:day
export async function budgetOk(kind: "nonupload"|"overall", cost = 1) {
  const fifteenKey = `rl:${kind}:15m`;
  const dayKey = `rl:${kind}:day`;
  const [f, d] = await Promise.all([get(fifteenKey), get(dayKey)]);
  const fNum = Number(f ?? 0), dNum = Number(d ?? 0);
  const fCap = kind === "nonupload" ? ENV.RATE_NONUPLOAD_15M : ENV.RATE_OVERALL_15M;
  const dCap = kind === "nonupload" ? ENV.RATE_NONUPLOAD_DAILY : ENV.RATE_OVERALL_DAILY;
  return (fNum + cost) <= fCap && (dNum + cost) <= dCap;
}

export async function consume(kind: "nonupload"|"overall", cost = 1) {
  const fifteenKey = `rl:${kind}:15m`;
  const dayKey = `rl:${kind}:day`;

  // Ensure TTLs exist: 15m window and until midnight UTC for daily
  const fTtlSet = await get(`${fifteenKey}:ttl`);
  if (!fTtlSet) await setex(`${fifteenKey}:ttl`, 14 * 60, "1"); // helper TTL marker
  await incrby(fifteenKey, cost);

  const now = new Date();
  const midnightUTC = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()+1, 0,0,0);
  const secToMidnight = Math.max(60, Math.floor((midnightUTC - now.getTime())/1000));
  const dTtlSet = await get(`${dayKey}:ttl`);
  if (!dTtlSet) await setex(`${dayKey}:ttl`, secToMidnight, "1");
  await incrby(dayKey, cost);
}