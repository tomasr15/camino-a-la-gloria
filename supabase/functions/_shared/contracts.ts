export function parseCareerInput(input: unknown): { managerName: string } {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("INVALID_INPUT");
  const data = input as Record<string, unknown>;
  if (Object.keys(data).some(key => key !== "managerName") || typeof data.managerName !== "string") throw new Error("INVALID_INPUT");
  const managerName = data.managerName.trim();
  if ([...managerName].length < 2 || [...managerName].length > 60 || /[\u0000-\u001f\u007f]/.test(managerName)) throw new Error("INVALID_INPUT");
  return { managerName };
}

// Contract for CP2. Not connected to an AI provider in CP1.
export type Narrative = { title: string; body: string; matchId: string };
export function validateNarrative(input: unknown, expectedMatchId: string): Narrative {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("INVALID_NARRATIVE");
  const x = input as Record<string, unknown>;
  if (Object.keys(x).sort().join(",") !== "body,matchId,title" || x.matchId !== expectedMatchId || typeof x.title !== "string" || typeof x.body !== "string" || x.title.trim().length < 1 || x.title.length > 120 || x.body.trim().length < 1 || x.body.length > 2000) throw new Error("INVALID_NARRATIVE");
  return { title: x.title, body: x.body, matchId: expectedMatchId };
}
