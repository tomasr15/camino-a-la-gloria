import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

// One-off import from API-Football (free plan: 100 requests/day, seasons
// 2022-2024, at most 3 pages per query). Every response is cached in an
// ignored folder, so re-running the build costs no quota. The key is read
// from .env and never printed or written.
const LEAGUE = 128, SEASON = 2024, CODE = 'cp2-real-v1';
const CACHE = '.cache/api-football';
const OUTPUT = process.argv[2] ?? 'supabase/functions/_shared/game/datasets/cp2-real-v1.json';
// Tiers chosen by the team for the demo; strength is the reference each club
// is normalized to inside its band, ordered by 2024 statistics. Listed from
// low to high, the same order the engine and its tests expect.
const CLUBS = [
  { apiId: 474, tier: 'low', strength: 48 }, { apiId: 476, tier: 'low', strength: 50 }, { apiId: 2432, tier: 'low', strength: 52 },
  { apiId: 453, tier: 'medium', strength: 58 }, { apiId: 436, tier: 'medium', strength: 60 }, { apiId: 438, tier: 'medium', strength: 62 },
  { apiId: 451, tier: 'high', strength: 69 }, { apiId: 435, tier: 'high', strength: 72 }
];
const ids = CLUBS.map(c => c.apiId);

mkdirSync(CACHE, { recursive: true });
let calls = 0;
async function api(path) {
  const file = join(CACHE, path.replace(/[^a-z0-9]+/gi, '_') + '.json');
  if (existsSync(file)) return JSON.parse(readFileSync(file, 'utf8'));
  const key = readFileSync('.env', 'utf8').split(/\r?\n/).find(l => l.startsWith('API_FOOTBALL_KEY='))?.slice(17).trim();
  assert.ok(key, 'API_FOOTBALL_KEY is missing from .env');
  if (calls++) await new Promise(r => setTimeout(r, 7000)); // free plan: 10 requests/minute
  const response = await fetch('https://v3.football.api-sports.io' + path, { headers: { 'x-apisports-key': key } });
  const body = await response.json();
  const errors = Array.isArray(body.errors) ? body.errors : Object.values(body.errors ?? {});
  // Only the page cap is an expected refusal; anything else stops the import.
  if (errors.length && !String(errors[0]).includes('Page parameter')) throw new Error(path + ': ' + JSON.stringify(body.errors));
  writeFileSync(file, JSON.stringify(body));
  return body;
}

// 1. Season statistics per club, up to the free page limit.
const profiles = new Map();
const add = p => { if (!profiles.has(p.player.id)) profiles.set(p.player.id, p); };
for (const team of ids) for (let page = 1; page <= 3; page++) {
  const body = await api(`/players?league=${LEAGUE}&season=${SEASON}&team=${team}&page=${page}`);
  body.response.forEach(add);
  if (page >= (body.paging?.total ?? 1)) break;
}
// 2. Pages beyond the cap can hold starters, so find who played in matches
// between these clubs (each club three times, spread over the season) and
// fetch whoever is still missing by id.
const fixtures = (await api(`/fixtures?league=${LEAGUE}&season=${SEASON}`)).response
  .filter(f => ids.includes(f.teams.home.id) && ids.includes(f.teams.away.id))
  .sort((a, b) => a.fixture.timestamp - b.fixture.timestamp);
const covered = Object.fromEntries(ids.map(i => [i, 0])), picked = [];
for (const pass of [0, 1, 2]) for (const f of fixtures) {
  const [h, a] = [f.teams.home.id, f.teams.away.id];
  if (!picked.includes(f) && covered[h] <= pass && covered[a] <= pass) { picked.push(f); covered[h]++; covered[a]++; }
}
for (const f of picked) for (const side of (await api(`/fixtures/players?fixture=${f.fixture.id}`)).response)
  for (const p of side.players) if ((p.statistics[0].games.minutes ?? 0) > 0 && !profiles.has(p.player.id))
    (await api(`/players?id=${p.player.id}&season=${SEASON}`)).response.forEach(add);

// 3. Attributes 1-100: percentile against the same position in these eight
// clubs, blending per-90 production with the provider rating. Small samples
// are pulled toward the position mean (full weight from 900 minutes).
const POSITION = { Goalkeeper: 'GK', Defender: 'DEF', Midfielder: 'MID', Attacker: 'FWD', Forward: 'FWD' };
const rows = [];
for (const p of profiles.values()) for (const s of p.statistics) {
  if (s.league.id !== LEAGUE || !ids.includes(s.team.id) || !POSITION[s.games.position]) continue;
  const minutes = s.games.minutes ?? 0, per90 = x => minutes ? x * 90 / minutes : 0;
  rows.push({
    apiId: p.player.id, name: p.player.name, team: s.team.id, clubName: s.team.name, position: POSITION[s.games.position], minutes,
    attackRaw: per90(2 * (s.goals.total ?? 0) + (s.goals.assists ?? 0) + 0.3 * (s.shots.total ?? 0) + 0.5 * (s.passes.key ?? 0)),
    defenseRaw: per90((s.tackles.total ?? 0) + (s.tackles.interceptions ?? 0) + 0.3 * (s.duels.won ?? 0)),
    saveRaw: (s.goals.saves ?? 0) + (s.goals.conceded ?? 0) ? (s.goals.saves ?? 0) / ((s.goals.saves ?? 0) + (s.goals.conceded ?? 0)) : 0,
    rating: Number(s.games.rating) || 6.5
  });
}
function percentile(list, field) {
  const played = list.filter(x => x.minutes > 0).map(x => x[field]).sort((a, b) => a - b);
  return x => 100 * (played.filter(v => v < x[field]).length + 0.5 * played.filter(v => v === x[field]).length) / played.length;
}
const clamp = x => Math.max(1, Math.min(100, Math.round(x)));
for (const position of ['GK', 'DEF', 'MID', 'FWD']) {
  const list = rows.filter(r => r.position === position);
  const [A, D, S, R] = ['attackRaw', 'defenseRaw', 'saveRaw', 'rating'].map(f => percentile(list, f));
  for (const r of list) {
    const w = Math.min(1, r.minutes / 900), mix = v => 50 + w * (v - 50);
    r.attack = clamp(position === 'GK' ? 10 : mix(0.7 * A(r) + 0.3 * R(r)));
    r.defense = clamp(position === 'GK' ? mix(0.5 * S(r) + 0.5 * R(r)) : mix(0.7 * D(r) + 0.3 * R(r)));
    r.saves = clamp(position === 'GK' ? mix(0.6 * S(r) + 0.4 * R(r)) : 10);
  }
}

// 4. Eighteen players per club in the shape the engine expects, by minutes.
const NEED = { GK: 2, DEF: 6, MID: 6, FWD: 4 };
const clubs = CLUBS.map(({ apiId, tier, strength }) => {
  const mine = rows.filter(r => r.team === apiId);
  const players = Object.entries(NEED).flatMap(([position, n]) => {
    const chosen = mine.filter(r => r.position === position).sort((a, b) => b.minutes - a.minutes || a.apiId - b.apiId).slice(0, n);
    assert.equal(chosen.length, n, `${mine[0]?.clubName}: not enough ${position}`);
    return chosen;
  });
  return {
    id: 'apf-' + apiId, name: mine[0].clubName, tier, strength,
    players: players.map(p => ({ id: 'apf-' + apiId + '-' + p.apiId, name: p.name, position: p.position,
      attack: p.attack, defense: p.defense, saves: p.saves, minutes: p.minutes }))
  };
});

const sourceHash = createHash('sha256').update(JSON.stringify([...profiles.keys()].sort((a, b) => a - b))).digest('hex');
const dataset = {
  code: CODE, isSynthetic: false,
  source: { provider: 'API-Football', league: LEAGUE, leagueName: 'Liga Profesional Argentina', season: SEASON, sourceHash },
  clubs
};
mkdirSync(OUTPUT.replace(/[^/]+$/, ''), { recursive: true });
writeFileSync(OUTPUT, JSON.stringify(dataset, null, 1) + '\n');
console.log(JSON.stringify({ output: OUTPUT, providerCalls: calls, profiles: profiles.size,
  clubs: clubs.map(c => `${c.name} (${c.tier})`) }, null, 2));
