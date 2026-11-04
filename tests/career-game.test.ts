import { describe, expect, it, vi } from 'vitest';
import { initialize, publicView, transition } from '../supabase/functions/_shared/game/engine';
import { bestLineup, clubs } from '../supabase/functions/_shared/game/data';
import { careerOverview, GameRequestError, sendDecision, type Decision } from '../src/lib/career-game';

describe('career dashboard integration contracts', () => {
  it('derives the upcoming fixture and highlights a table window containing the active club', () => {
    const game = publicView(initialize(clubs.find(c => c.tier === 'low')!.id, 'dashboard'));
    const view = careerOverview(game);
    expect(view.next?.round).toBe(1);
    expect([view.next?.home, view.next?.away]).toContain(game.clubId);
    expect(view.nearby.some(row => row.clubId === game.clubId)).toBe(true);
    expect(view.fixtures).toHaveLength(14);
  });
  it('shows no next match after a full season and keeps completed fixtures', () => {
    const club = clubs.find(c => c.tier === 'low')!;
    let state = initialize(club.id, 'dashboard');
    while (state.phase !== 'finished') {
      state = transition(state, { type: 'start', season: state.season, round: state.round, formation: '4-4-2', tactic: 'balanced', lineup: bestLineup(club, '4-4-2') });
      if (state.phase === 'playing') state = transition(state, { type: 'auto', season: state.season, round: state.round });
    }
    expect(careerOverview(publicView(state)).next).toBeUndefined();
    expect(careerOverview(publicView(state)).fixtures).toHaveLength(14);
  });
  it('preserves the exact idempotent decision when retrying an uncertain response', async () => {
    const decision: Decision = { requestId: crypto.randomUUID(), expectedVersion: 4, command: { type: 'auto', season: 1, round: 2 } };
    const invoke = vi.fn().mockResolvedValueOnce({ data: null, error: { context: { status: 409 } } }).mockResolvedValueOnce({ data: { version: 5, game: null }, error: null });
    const client = { functions: { invoke } };
    await expect(sendDecision(client, decision)).rejects.toBeInstanceOf(GameRequestError);
    await expect(sendDecision(client, decision)).resolves.toMatchObject({ version: 5 });
    expect(invoke.mock.calls[0][1].body).toBe(decision);
    expect(invoke.mock.calls[1][1].body).toBe(decision);
  });
});
