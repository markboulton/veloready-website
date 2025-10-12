import { get } from "../lib/redis";

export async function handler() {
  const fNon = Number(await get("rl:nonupload:15m") ?? 0);
  const dNon = Number(await get("rl:nonupload:day") ?? 0);
  const fAll = Number(await get("rl:overall:15m") ?? 0);
  const dAll = Number(await get("rl:overall:day") ?? 0);

  console.log(JSON.stringify({ window15m: { nonupload: fNon, overall: fAll }, day: { nonupload: dNon, overall: dAll } }));
  return { statusCode: 200, body: "ok" };
}