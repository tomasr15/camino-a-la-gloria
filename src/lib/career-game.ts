import type { View } from '../../supabase/functions/_shared/game/handler';
import type { Club, Command } from '../../supabase/functions/_shared/game/model';
import { errorStatus, invokeFunction, type FunctionsClient } from './functions';

export type GameSnapshot = { version: number; game: View | null; clubs: Club[]; isSynthetic: boolean };
export type GameReceipt = Pick<GameSnapshot, 'version' | 'game'>;
export type Decision = { requestId: string; expectedVersion: number; command: Command };
export class GameRequestError extends Error {
  constructor(public status: number | undefined, public reference: string | null) {
    super(status === 409 ? 'La partida cambió o no es compatible. Actualizá para consultar su estado.' : status === 401 ? 'Tu sesión venció. Volvé a iniciar sesión.' : 'No pudimos confirmar la operación. Reintentá la misma acción para recuperar su resultado.');
  }
}
export async function readGame(client: FunctionsClient) {
  const response = await invokeFunction<GameSnapshot>(client, 'game', { method: 'GET' });
  if (response.error || !response.data) throw new GameRequestError(errorStatus(response.error), response.requestId);
  return response.data;
}
export async function sendDecision(client: FunctionsClient, decision: Decision) {
  const response = await invokeFunction<GameReceipt>(client, 'game', { body: decision });
  if (response.error || !response.data) throw new GameRequestError(errorStatus(response.error), response.requestId);
  return response.data;
}
export function careerOverview(game: View) {
  const fixtures = game.calendar.filter(f => f.home === game.clubId || f.away === game.clubId);
  const next = fixtures.find(f => f.round === game.round);
  const index = game.table.findIndex(row => row.clubId === game.clubId);
  const start = Math.max(0, Math.min(index - 2, game.table.length - 5));
  return { next, fixtures, nearby: game.table.slice(start, start + 5), standing: game.table[index] };
}
