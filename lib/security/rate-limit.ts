/**
 * Lightweight per-process rate limiter. Use a shared edge/API gateway limiter
 * in production because serverless instances do not share memory.
 */
type Bucket = { count: number; resetAt: number };
const buckets = new Map<string, Bucket>();
export function rateLimit(key: string, limit = 12, windowMs = 60_000): boolean {
  const now = Date.now();
  for (const [entry, bucket] of buckets) if (bucket.resetAt <= now) buckets.delete(entry);
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) { buckets.set(key, { count: 1, resetAt: now + windowMs }); return true; }
  if (bucket.count >= limit) return false;
  bucket.count += 1;
  return true;
}
export function clientKey(request: Request): string {
  return request.headers.get("x-vercel-forwarded-for")?.split(",")[0]?.trim()
    || request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
}
