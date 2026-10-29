# Contrato del motor CP2

La función Edge `game` requiere JWT del usuario y una carrera creada mediante `careers`. `GET /functions/v1/game` devuelve `{ version, game, clubs, isSynthetic }`; antes de iniciar, `game` es `null`. Los clubes y jugadores son reales (Liga Profesional Argentina 2024, dataset `cp2-real-v1`); sus atributos son parámetros del juego derivados de estadísticas, descritos en `docs/dataset.md`.

`POST /functions/v1/game` recibe `{ requestId, expectedVersion, command }`. `requestId` es un UUID nuevo para cada decisión. Si se reintenta la misma solicitud, devuelve la respuesta original con `replayed: true`. Una decisión distinta con versión antigua responde `STALE_VERSION` (HTTP 409); el cliente debe consultar de nuevo.

Si una partida guardada tiene un `engineVersion` o `datasetCode` incompatible, `GET /functions/v1/game` y las nuevas transiciones responden `UNSUPPORTED_GAME_VERSION` (HTTP 409). La comprobación ocurre antes de construir la vista pública, incluso cuando la partida no tiene resultados; las partidas de `cp2-synthetic-v1` no se proyectan con los clubes reales.

Comandos:

```json
{ "type": "initialize", "clubId": "club-0" }
{ "type": "start", "season": 1, "round": 1, "formation": "4-4-2", "tactic": "balanced", "lineup": ["11 identificadores de jugadores"] }
{ "type": "shoot", "season": 1, "round": 1, "eventId": "identificador devuelto en game.match.pendingEvent", "direction": "left", "precision": 50 }
{ "type": "auto", "season": 1, "round": 1 }
{ "type": "nextSeason", "season": 1, "offerClubId": null }
```

`initialize` admite un club de nivel bajo. `start` acepta un once propio válido y una táctica `defensive`, `balanced` u `offensive`. La respuesta incluye el próximo `pendingEvent` cuando hay una ocasión controlable. `shoot` resuelve esa ocasión; `auto` resuelve todas las restantes de la jornada. Se guardan los cuatro resultados y la reputación cuando termina la jornada. `nextSeason` admite una oferta recibida o `null` para quedarse.

La respuesta `game` incluye `calendar`, `results`, `table`, `reputation`, `confidence`, `match`, `lastMatch`, `offers` e `history`. `match` es el partido del usuario en curso y vale `null` cuando la jornada está cerrada. `lastMatch` es el último partido terminado del usuario, con marcador final y todos sus eventos; se completa al cerrar cada jornada, incluso si `start` la cierra de inmediato porque el club no tuvo ocasiones controlables, y vuelve a `null` al empezar otra temporada. El servidor oculta la semilla, la elección del arquero, el azar futuro y los eventos aún no vistos. La interfaz visual del mano a mano corresponde al issue #9. La precisión declarada por el cliente sirve para la demo, pero no verifica habilidad frente a un cliente manipulado.

## Desarrollo local

Con Docker activo: `npm run db:start`, `node scripts/game-local-setup.mjs` y `npm run functions:serve` en otra terminal. El script genera una clave aleatoria para la base local y `supabase/.env.local`, archivo ignorado por Git. Después ejecutar `npm run db:test` y `npm run test:game-integration`. La integración crea usuarios y carreras de prueba solo en Supabase local.

## Despliegue

Antes de servir `game` en otro entorno hay que generar una clave aleatoria de al menos 64 caracteres, guardarla como secreto `GAME_SIGNING_KEY` de la Edge Function y provisionar exactamente el mismo valor en `game_private.signing_key` de esa base. Configurar `ALLOWED_ORIGINS`. No guardar la clave en Git. Aplicar la migración antes de desplegar la función; sin clave la función responde `GAME_NOT_CONFIGURED`.
