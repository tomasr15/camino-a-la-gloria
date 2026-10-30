# Verificación CP2-04 · 30/10/2026

## Resultado

Implementación local y pruebas automáticas aprobadas. El 30/10/2026 se desplegaron `health`, `careers`, `game` y `narrative` en el proyecto cloud `gmpjtvxpolmxtqvdxdit` desde el código del PR #25. La migración `20261027000100_narrative.sql` ya estaba aplicada; no se volvió a ejecutar. El PR permanece en borrador hasta la revisión humana cruzada.

| Entorno / prueba | Resultado | Evidencia |
|---|---|---|
| Lint, TypeScript, 198 tests y build | PASS | `npm run check` |
| Navegador sobre build de producción | PASS | `career-browser.json` |
| Resiliencia navegador con fallos interceptados | PASS | `career-resilience.json` |
| CI remoto del PR: application, database y browser | PASS, 3/3 jobs | [Run 41049950746](https://github.com/tomasr15/camino-a-la-gloria/actions/runs/41049950746) |
| PostgreSQL local, 30 verificaciones | PASS | `npm run db:test` |
| Motor local: 14 jornadas, 56 encuentros, concurrencia y aislamiento | PASS | `npm run test:game-integration` |
| Narrativa HTTP local, fallback e aislamiento | PASS, cero llamadas de proveedor | `narrative-http.json` |
| Ráfaga local: 40 GET, concurrencia 2 | PASS, p95 72,25 ms; errores 0% | `career-load-2026-10-30.json` |
| Ráfaga cloud: 20 GET, concurrencia 2 | PASS, p95 1140 ms; errores 0% | `career-cloud-load.json` |
| Cloud: carreras, aislamiento, dataset real, motor y recarga | PASS | `career-cloud.json` |
| Cloud: preflight con x-request-id | PASS | `career-cloud.json` |
| Cloud: propagación de x-request-id | PASS | `career-cloud.json` |
| Cloud: narrative desplegada | PASS; POST sin sesión 401 | `career-cloud.json` |
| Navegador con backend cloud real | PASS: login, dashboard, fallback, recarga y móvil | `career-cloud-browser.json` |

Los JSON están en `docs/evidencias/`. Son mediciones pequeñas, no garantías de capacidad o disponibilidad. Se midieron lecturas; no se extrapola su latencia a escrituras ni generación de IA.

## Alcance de las pruebas

Cloud usa dos cuentas nuevas, confirmadas como fixtures sintéticos mediante la sesión de gestión ya autorizada. Los accesos se guardan en `tmp/cloud-fixtures.json` y las variables públicas en `.env.cloud`, ignorados por Git. No se modifican cuentas ajenas, no se borran datos y no se invoca Gemini. La cuenta B conserva una carrera propia, por lo que se comprueba aislamiento por ID y no por ausencia de filas.

`npm run test:career-cloud` ahora pasa. En una repetición conserva las carreras y saltea inicialización si ya existe la partida; la primera ejecución verificó initialize y replay. Avanza como máximo una jornada de la cuenta A por ejecución. `test:career-cloud-load` solo hace lecturas autenticadas. `test:cloud` es el smoke histórico de CP1: sus supuestos de cuenta B vacía no corresponden a estas fixtures CP2; usar la suite CP2 para estas cuentas.

El recorrido con backend cloud usa un build de producción local del frontend del PR. Playwright reenvía las peticiones al servicio real con el `Origin` publicado y adapta `Access-Control-Allow-Origin` a `localhost` para la página local. Esta adaptación no prueba por sí sola el CORS nativo del navegador en Vercel; `test:career-cloud` comprueba por separado el preflight y la respuesta para el origen publicado. La crónica devuelta fue `fallback` (200), sin invocar Gemini. No se desplegó el frontend candidato a Vercel.

Los fallos de base/red y estados 401/409/429/503 se inyectan en el navegador: no se apagó producción ni se afirmó que exista rate limiting cloud. Se verificó un retry idéntico tras perder la respuesta de start, sin duplicar el avance. La prueba se ajustó para ser independiente de Strict Mode y esperar la respuesta de narrativa del encuentro nuevo.

## Repetición

Instalar con `npm ci`. Para navegador, `npx playwright install chromium`; iniciar un build con `NEXT_PUBLIC_SUPABASE_URL=https://demo.supabase.co` y `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=demo-public-browser-test`, servir en puerto 3100 y ejecutar `npm run test:career-browser` y `npm run test:career-resilience`. En Windows se puede indicar `EDGE_EXECUTABLE` con la ruta de Edge instalado. CI contiene un job que hace esta secuencia con Chromium.

Local: iniciar Supabase y Edge Functions; `npm run test:career-load` crea dos cuentas sintéticas por ejecución y conserva sus datos. Cloud: usar las fixtures ya creadas; no volver a ejecutar el aprovisionador para una repetición. El aprovisionador exige un flag explícito y rechaza sobrescribir archivos de fixtures.

Para repetir navegador + cloud: construir con las variables públicas de `.env.cloud` cargadas en el proceso del build, iniciar `next start --port 3101`, y ejecutar `npm run test:career-cloud-browser` con `EDGE_EXECUTABLE` apuntando a Edge instalado si Chromium de Playwright no está presente. El script usa `tmp/cloud-fixtures.json` (ignorado por Git), solo lee el juego y no muestra contraseñas ni tokens. Su informe queda en `docs/evidencias/career-cloud-browser.json`.

## Antes de entregar

1. Completar revisión humana cruzada del PR #25 antes de integrarlo. La ejecución de la suite no equivale a una aprobación del diff.
2. Cuando se publique el frontend candidato en su origen final, repetir el recorrido nativo en ese dominio. El puente de Playwright sirve para verificar el frontend del PR contra cloud sin abrir un origen adicional en producción.
3. Completar controles operativos de #12/#14. Las pruebas de error controlado no sustituyen un ensayo de caída real ni prueban alertas o rollback.
