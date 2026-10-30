# Verificación CP2-04 · 30/10/2026

## Resultado

Implementación local y pruebas automáticas aprobadas. Cloud permite el flujo autenticado del motor mediante HTTP, pero el frontend candidato queda bloqueado para entrega por diferencias de despliegue. PR en borrador hasta verificar el backend actualizado y revisión cruzada real.

| Entorno / prueba | Resultado | Evidencia |
|---|---|---|
| Lint, TypeScript, 198 tests y build | PASS | `npm run check` |
| Navegador sobre build de producción | PASS | `career-browser.json` |
| Resiliencia navegador con fallos interceptados | PASS | `career-resilience.json` |
| PostgreSQL local, 30 verificaciones | PASS | `npm run db:test` |
| Motor local: 14 jornadas, 56 encuentros, concurrencia y aislamiento | PASS | `npm run test:game-integration` |
| Narrativa HTTP local, fallback e aislamiento | PASS, cero llamadas de proveedor | `narrative-http.json` |
| Ráfaga local: 40 GET, concurrencia 2 | PASS, p95 72,25 ms; errores 0% | `career-load-2026-10-30.json` |
| Ráfaga cloud: 20 GET, concurrencia 2 | PASS, p95 1140 ms; errores 0% | `career-cloud-load.json` |
| Cloud: carreras, aislamiento, dataset real, motor y recarga | PASS | `career-cloud.json` |
| Cloud: preflight con x-request-id | FAIL | CORS no permite ese encabezado |
| Cloud: propagación de x-request-id | FAIL | health genera otro UUID |
| Cloud: narrative desplegada | FAIL | POST sin sesión responde 404, se esperaba 401 |

Los JSON están en `docs/evidencias/`. Son mediciones pequeñas, no garantías de capacidad o disponibilidad. Se midieron lecturas; no se extrapola su latencia a escrituras ni generación de IA.

## Alcance de las pruebas

Cloud usa dos cuentas nuevas, confirmadas como fixtures sintéticos mediante la sesión de gestión ya autorizada. Los accesos se guardan en `tmp/cloud-fixtures.json` y las variables públicas en `.env.cloud`, ignorados por Git. No se modifican cuentas ajenas, no se borran datos y no se invoca Gemini. La cuenta B conserva una carrera propia, por lo que se comprueba aislamiento por ID y no por ausencia de filas.

`npm run test:career-cloud` no pasa hasta actualizar el despliegue. En una repetición conserva las carreras y saltea inicialización si ya existe la partida; la primera ejecución verificó initialize y replay. Avanza como máximo una jornada de la cuenta A por ejecución. `test:career-cloud-load` solo hace lecturas autenticadas. `test:cloud` es el smoke histórico de CP1: también detectó el bloqueo CORS, pero sus supuestos de cuenta B vacía no corresponden a estas fixtures CP2; usar la suite CP2 para estas cuentas.

Los fallos de base/red y estados 401/409/429/503 se inyectan en el navegador: no se apagó producción ni se afirmó que exista rate limiting cloud. Se verificó un retry idéntico tras perder la respuesta de start, sin duplicar el avance. La prueba se ajustó para ser independiente de Strict Mode y esperar la respuesta de narrativa del encuentro nuevo.

## Repetición

Instalar con `npm ci`. Para navegador, `npx playwright install chromium`; iniciar un build con `NEXT_PUBLIC_SUPABASE_URL=https://demo.supabase.co` y `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=demo-public-browser-test`, servir en puerto 3100 y ejecutar `npm run test:career-browser` y `npm run test:career-resilience`. En Windows se puede indicar `EDGE_EXECUTABLE` con la ruta de Edge instalado. CI contiene un job que hace esta secuencia con Chromium.

Local: iniciar Supabase y Edge Functions; `npm run test:career-load` crea dos cuentas sintéticas por ejecución y conserva sus datos. Cloud: usar las fixtures ya creadas; no volver a ejecutar el aprovisionador para una repetición. El aprovisionador exige un flag explícito y rechaza sobrescribir archivos de fixtures.

## Antes de entregar

1. Actualizar el backend cloud desde el flujo de despliegue revisado: funciones health/careers/game con el CORS y trazabilidad del código vigente, y función narrative con migración/configuración correspondiente. Esta tarea no hizo deploy.
2. Repetir `test:career-cloud` y el flujo desde navegador con el frontend candidato. Mantener narrativa en fallback si no hay cuota autorizada.
3. Completar revisión humana cruzada y controles operativos de #12/#14. Las pruebas de error controlado no sustituyen un ensayo de caída real ni prueban alertas o rollback.
