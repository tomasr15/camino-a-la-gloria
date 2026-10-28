// Versioned deterministic PRNG. Not used for generating secrets; the root seed
// comes from crypto.randomUUID() on the server and is never returned to clients.
export function random(seed: string): () => number {
  let h = 2166136261;
  for (const ch of seed) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0;
  return () => {
    h = (h + 0x6d2b79f5) >>> 0;
    let t = Math.imul(h ^ (h >>> 15), 1 | h);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function shuffle<T>(items: T[], rng: () => number): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
export function poisson(mean: number, rng: () => number): number {
  if (!Number.isFinite(mean) || mean < 0 || mean > 40) throw new Error("INVALID_POISSON_MEAN");
  const limit = Math.exp(-mean);
  let product = 1, count = 0;
  do { count++; product *= rng(); } while (product > limit);
  return count - 1;
}
