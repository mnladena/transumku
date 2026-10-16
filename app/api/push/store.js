import { Redis } from "@upstash/redis";

// Push subscriptions live in one Redis hash: endpoint -> {sub, prefs, stops, sent}.
// Vercel's Upstash integration sets KV_REST_API_*; a plain Upstash database sets UPSTASH_REDIS_REST_*.
export const redis = new Redis({
  url: process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN,
});
