import { ENV } from "./env";

export async function rpush(key: string, value: unknown) {
  return fetch(`${ENV.REDIS_URL}/rpush/${encodeURIComponent(key)}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${ENV.REDIS_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ value: JSON.stringify(value) }),
  }).then(r => r.json());
}

export async function lpop(key: string) {
  const res = await fetch(`${ENV.REDIS_URL}/lpop/${encodeURIComponent(key)}`, {
    headers: { Authorization: `Bearer ${ENV.REDIS_TOKEN}` },
  });
  const data = await res.json();
  if (!data || data.result == null) return null;
  try { return JSON.parse(data.result); } catch { return data.result; }
}

export async function llen(key: string) {
  const res = await fetch(`${ENV.REDIS_URL}/llen/${encodeURIComponent(key)}`, {
    headers: { Authorization: `Bearer ${ENV.REDIS_TOKEN}` },
  });
  return res.json().then(d => Number(d.result ?? 0));
}

export async function incrby(key: string, amount: number) {
  const res = await fetch(`${ENV.REDIS_URL}/incrby/${encodeURIComponent(key)}/${amount}`, {
    method: "POST", headers: { Authorization: `Bearer ${ENV.REDIS_TOKEN}` }
  });
  return res.json();
}

export async function get(key: string) {
  const res = await fetch(`${ENV.REDIS_URL}/get/${encodeURIComponent(key)}`, {
    headers: { Authorization: `Bearer ${ENV.REDIS_TOKEN}` },
  });
  const d = await res.json();
  return d?.result ?? null;
}

export async function setex(key: string, ttlSec: number, value: string) {
  const res = await fetch(`${ENV.REDIS_URL}/setex/${encodeURIComponent(key)}/${ttlSec}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${ENV.REDIS_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ value }),
  });
  return res.json();
}