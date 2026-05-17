/*
 * Lightweight GitHub repo metadata fetch with localStorage cache.
 *
 * The unauthenticated REST API gives 60 requests/hour/IP, which is more than
 * enough for a landing page — we additionally cache the result in
 * localStorage for `CACHE_TTL_MS` so repeat visits don't pay the network cost
 * at all.
 *
 * Fails silently. Callers should render a graceful fallback when `stars` is
 * `null` (private repo, network down, rate-limited, etc.).
 */

const CACHE_KEY = 'zerocode.github.stars';
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;

interface CacheEntry {
  repo: string;
  stars: number;
  ts: number;
}

export interface RepoStats {
  stars: number | null;
  source: 'cache' | 'live' | 'unavailable';
}

function readCache(repo: string): CacheEntry | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const entry = JSON.parse(raw) as CacheEntry;
    if (entry.repo !== repo) return null;
    if (Date.now() - entry.ts > CACHE_TTL_MS) return null;
    return entry;
  } catch { return null; }
}

function writeCache(entry: CacheEntry): void {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(entry)); } catch { /* noop */ }
}

export async function fetchRepoStars(repo: string): Promise<RepoStats> {
  const cached = readCache(repo);
  if (cached) return { stars: cached.stars, source: 'cache' };

  try {
    const r = await fetch(`https://api.github.com/repos/${repo}`, {
      headers: { Accept: 'application/vnd.github+json' },
    });
    if (!r.ok) return { stars: null, source: 'unavailable' };
    const data = await r.json() as { stargazers_count?: number };
    const stars = typeof data.stargazers_count === 'number' ? data.stargazers_count : null;
    if (stars != null) writeCache({ repo, stars, ts: Date.now() });
    return { stars, source: 'live' };
  } catch {
    return { stars: null, source: 'unavailable' };
  }
}

export function formatStars(n: number): string {
  if (n < 1000) return String(n);
  if (n < 10000) return (n / 1000).toFixed(1).replace(/\.0$/, '') + 'k';
  if (n < 1000000) return Math.round(n / 1000) + 'k';
  return (n / 1000000).toFixed(1) + 'M';
}
