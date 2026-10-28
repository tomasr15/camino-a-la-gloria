import { validateNarrative, type Narrative } from "./contracts.ts";

export const HUMOR_THEMES = ["barra", "apagon", "arbitro_comprado", "intoxicacion", "apuestas", "hinchada"] as const;
export type HumorTheme = typeof HUMOR_THEMES[number];

/** Built on the server from a persisted result after ownership verification.
 * `confirmed` is a precondition, not proof of persistence or authorization.
 * matchId must identify the result across careers and seasons.
 */
export interface NarrativeContext {
  readonly version: 1;
  readonly confirmed: true;
  readonly matchId: string;
  readonly home: Readonly<{ id: string; name: string; goals: number }>;
  readonly away: Readonly<{ id: string; name: string; goals: number }>;
  readonly humor: Readonly<{ mode: "fictional"; theme: HumorTheme }>;
}

function record(value: unknown, keys: string[]): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value) ||
      Object.keys(value).sort().join(",") !== [...keys].sort().join(",")) {
    throw new Error("INVALID_NARRATIVE_CONTEXT");
  }
  return value as Record<string, unknown>;
}

function text(value: unknown, max: number): string {
  if (typeof value !== "string" || !value.trim() || value.length > max ||
      /[\u0000-\u001f\u007f<>]/.test(value)) throw new Error("INVALID_NARRATIVE_CONTEXT");
  return value.trim();
}

function team(value: unknown): NarrativeContext["home"] {
  const x = record(value, ["id", "name", "goals"]);
  if (typeof x.goals !== "number" || !Number.isSafeInteger(x.goals) || x.goals < 0) {
    throw new Error("INVALID_NARRATIVE_CONTEXT");
  }
  return Object.freeze({ id: text(x.id, 120), name: text(x.name, 100), goals: x.goals });
}

/** Strict allowlist keeps private fields and invented sporting events out. */
export function parseNarrativeContext(input: unknown): NarrativeContext {
  const x = record(input, ["version", "confirmed", "matchId", "home", "away", "humor"]);
  const humor = record(x.humor, ["mode", "theme"]);
  if (x.version !== 1 || x.confirmed !== true || humor.mode !== "fictional" ||
      !HUMOR_THEMES.includes(humor.theme as HumorTheme)) throw new Error("INVALID_NARRATIVE_CONTEXT");
  const home = team(x.home), away = team(x.away);
  if (home.id === away.id) throw new Error("INVALID_NARRATIVE_CONTEXT");
  return Object.freeze({
    version: 1, confirmed: true, matchId: text(x.matchId, 160), home, away,
    humor: Object.freeze({ mode: "fictional", theme: humor.theme as HumorTheme }),
  });
}

const scenes: Record<HumorTheme, string> = {
  barra: "La barra cayó a apretar al plantel: «¡Dos pases seguidos, la concha de su madre! ¡Cobran como profesionales y se tropiezan con la raya de cal!». El capitán pidió bancar el proyecto. «¿Qué proyecto, hermano? ¡Están haciendo mierda el club en cómodas cuotas!».",
  apagon: "Se cortó la luz y la popular se vino abajo: «¡No la prendas, la puta que te parió, que por fin dejamos de ver esta mierda!». Cuando apareció el electricista, lo silbaron más que al plantel. «¡El único que nos da una alegría y lo quieren arreglar!».",
  arbitro_comprado: "«¡Árbitro comprado, ladrón de mierda!», gritó uno pegado al alambrado. El de al lado ni se levantó: «Dejá de llorar por el árbitro, boludo. A estos les pagan para jugar y tampoco cumplen el contrato».",
  intoxicacion: "Del vestuario salió la versión de una intoxicación en la concentración. «¡Dejen de echarle la culpa al pollo, manga de muertos!», contestó la platea. «¡Yo me intoxico todos los domingos viendo esta mierda y el lunes voy a laburar igual!».",
  apuestas: "«¡Estos hijos de puta juegan por las apuestas!», explotó uno de la popular. «¡Entonces que apuesten a dar dos pases seguidos, a ver si se llenan de guita de una vez!», le contestaron. Otro pidió que investigaran al representante: «Ese sí que hizo negocio vendiéndonos estos paquetes».",
  hinchada: "«¡Los van a rajar a todos, manga de perros! ¡No pueden ser tan hijos de puta con la pelota!», bajó de la tribuna. Un socio se tapó los ojos: «Pagué la cuota, me peleé con mi mujer y me comí dos bondis para ver esta mierda. ¡El boludo soy yo, que encima vuelvo la semana que viene!».",
};

/** Pure, versioned fallback: no clock, random source, network or state writes.
 * Fiction is explicitly labelled and never used as engine events.
 */
export function buildFallbackNarrative(input: NarrativeContext): Narrative {
  const context = parseNarrativeContext(input);
  const { home, away } = context;
  const outcome = home.goals === away.goals ? "Empate" : home.goals > away.goals ? "Victoria local" : "Victoria visitante";
  return validateNarrative({
    matchId: context.matchId,
    title: `${outcome}: la tribuna tiene su propio análisis`,
    body: `Resultado confirmado: ${home.name} (local) ${home.goals} - ${away.goals} ${away.name} (visitante). ${outcome}.\n\nFolclore de tribuna (ficción): ${scenes[context.humor.theme]}`,
  }, context.matchId);
}
