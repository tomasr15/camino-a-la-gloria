import { bestLineup, lineupPlayers } from '../../supabase/functions/_shared/game/data';
import type { Club, Formation, Selection } from '../../supabase/functions/_shared/game/model';

export const positionLabels = { GK: 'Arquero', DEF: 'Defensores', MID: 'Mediocampistas', FWD: 'Delanteros' };
export const tacticLabels = { defensive: 'Defensiva', balanced: 'Equilibrada', offensive: 'Ofensiva' };
export const formationCounts = (formation: Formation) => ({ GK: 1, DEF: 4, MID: formation === '4-4-2' ? 4 : 3, FWD: formation === '4-4-2' ? 2 : 3 });
export function validSelection(club: Club, selection: Selection): boolean {
  try { lineupPlayers(club, selection.formation, selection.lineup); return ['defensive', 'balanced', 'offensive'].includes(selection.tactic); } catch { return false; }
}
export function draftKey(careerId: string, dataset: string, season: number, clubId: string) {
  return `cg:lineup:v1:${careerId}:${dataset}:${season}:${clubId}`;
}
export function readDraft(key: string, club: Club, previous?: Selection): Selection {
  const fallback = previous && validSelection(club, previous) ? previous : { formation: '4-4-2' as const, tactic: 'balanced' as const, lineup: bestLineup(club, '4-4-2') };
  try {
    const value: unknown = JSON.parse(localStorage.getItem(key) ?? 'null');
    if (!value || typeof value !== 'object') return fallback;
    const v = value as Selection;
    // An incomplete but well-formed draft is useful to resume editing; start validates all positions.
    if (!['4-4-2', '4-3-3'].includes(v.formation) || !['defensive', 'balanced', 'offensive'].includes(v.tactic) || !Array.isArray(v.lineup) || v.lineup.length > club.players.length || new Set(v.lineup).size !== v.lineup.length || v.lineup.some(id => !club.players.some(p => p.id === id))) return fallback;
    return { formation: v.formation, tactic: v.tactic, lineup: v.lineup };
  } catch { return fallback; }
}
export function saveDraft(key: string, selection: Selection): boolean {
  try { localStorage.setItem(key, JSON.stringify(selection)); return true; } catch { return false; }
}
export function fitFormation(club: Club, selection: Selection, formation: Formation): Selection {
  const counts = formationCounts(formation);
  const recommended = bestLineup(club, formation);
  const lineup = (Object.keys(counts) as Array<keyof typeof counts>).flatMap(position => {
    const existing = selection.lineup.filter(id => club.players.some(p => p.id === id && p.position === position));
    const available = recommended.filter(id => !existing.includes(id) && club.players.some(p => p.id === id && p.position === position));
    return [...existing, ...available].slice(0, counts[position]);
  });
  return { ...selection, formation, lineup };
}
