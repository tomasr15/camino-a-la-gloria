import { afterEach, describe, expect, it, vi } from 'vitest';
import { clubs, bestLineup } from '../supabase/functions/_shared/game/data';
import { draftKey, fitFormation, readDraft, validSelection } from '../src/lib/lineup-draft';

const club = clubs[0];
const selection = { formation: '4-4-2' as const, tactic: 'balanced' as const, lineup: bestLineup(club, '4-4-2') };
afterEach(() => vi.unstubAllGlobals());
describe('lineup draft safety', () => {
  it('rejects duplicate players, wrong positions and foreign players before start', () => {
    expect(validSelection(club, selection)).toBe(true);
    expect(validSelection(club, { ...selection, lineup: Array(11).fill(selection.lineup[0]) })).toBe(false);
    expect(validSelection(club, { ...selection, lineup: [...selection.lineup.slice(1), clubs[1].players[0].id] })).toBe(false);
    expect(validSelection(club, { ...selection, formation: '4-3-3' })).toBe(false);
  });
  it('retains existing starters and fills the required positions on formation change', () => {
    const changed = fitFormation(club, selection, '4-3-3');
    expect(validSelection(club, changed)).toBe(true);
    expect(changed.lineup.filter(id => selection.lineup.includes(id))).toHaveLength(10);
  });
  it('restores an incomplete draft but never accepts players from another club', () => {
    vi.stubGlobal('localStorage', { getItem: () => JSON.stringify({ ...selection, lineup: selection.lineup.slice(0, 10) }) });
    expect(readDraft('test', club).lineup).toHaveLength(10);
    vi.stubGlobal('localStorage', { getItem: () => JSON.stringify({ ...selection, lineup: [clubs[1].players[0].id] }) });
    expect(readDraft('test', club)).toEqual(selection);
  });
  it('scopes browser drafts to career, dataset, season and club', () => {
    const a = draftKey('career-a', 'data', 1, club.id);
    expect(draftKey('career-b', 'data', 1, club.id)).not.toBe(a);
    expect(draftKey('career-a', 'data', 2, club.id)).not.toBe(a);
    expect(draftKey('career-a', 'other-data', 1, club.id)).not.toBe(a);
  });
});
