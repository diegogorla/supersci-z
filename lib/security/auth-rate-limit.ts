// Best-effort isolate limit supplements Supabase Auth's durable provider limits.
// It is deliberately bounded and never stores e-mail addresses or tokens.
const buckets = new Map<string, { count: number; until: number }>();
export function allowAuthAttempt(key: string, limit: number, now = Date.now()) {
  for (const [id, bucket] of buckets) if (bucket.until <= now) buckets.delete(id);
  const current = buckets.get(key);
  if (current) { if (current.count >= limit) return false; current.count++; return true; }
  if (buckets.size >= 10_000) return false;
  buckets.set(key, { count: 1, until: now + 10 * 60_000 });
  return true;
}
