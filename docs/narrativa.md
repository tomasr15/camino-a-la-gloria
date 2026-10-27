# CP2-03: contexto y fallback humorístico

Dirección de tono confirmada: picante, con puteadas explícitas, sarcasmo y bronca de popular argentina. Las seis escenas usan este registro por defecto, incluyendo «manga de muertos», «la concha de su madre» y descansos al plantel, dirigentes y representantes. La gracia debe estar en el remate futbolero y la frustración del hincha; el rótulo de ficción se conserva.

Implementación: contexto y fallback en `supabase/functions/_shared/narrative.ts`, adaptador Gemini y orquestación en `_shared/narrative/`, función HTTP `narrative` y persistencia privada con cupo compartido. Depende de la migración del motor CP2-02, incorporado a esta rama. La interfaz de CP2-04 puede consumir este endpoint al terminar un partido.

`parseNarrativeContext(unknown)` valida una lista cerrada de campos y devuelve una copia inmutable. Contexto v1:

```json
{
  "version": 1,
  "confirmed": true,
  "matchId": "career-1/season-1/match-1",
  "home": { "id": "club-1", "name": "Atlético del Barrio", "goals": 2 },
  "away": { "id": "club-2", "name": "Deportivo Siesta", "goals": 1 },
  "humor": { "mode": "fictional", "theme": "barra" }
}
```

El handler construye este contexto desde `game_private.match_results` mediante RPC firmado con `GAME_SIGNING_KEY` y JWT verificado con Auth. La consulta toma la carrera de `auth.uid()`; el navegador solo envía temporada y fixture. `confirmed: true` no demuestra por sí mismo persistencia o pertenencia. Los nombres se resuelven desde el dataset sintético del motor actual y el ID de narrativa combina carrera, temporada y fixture. Gemini recibe únicamente ese identificador, goles, desenlace y tema; no recibe nombres de clubes, email, JWT, semilla, planteles o estado completo.

`buildFallbackNarrative(context)` devuelve el contrato existente `{title, body, matchId}`. Calcula victoria local, visitante o empate a partir del marcador. La misma entrada v1 produce exactamente la misma salida, sin reloj, aleatoriedad o servicios externos. El tema se elige antes de invocarla y debe conservarse al persistir el contexto.

Temas: `barra`, `apagon`, `arbitro_comprado`, `intoxicacion`, `apuestas`, `hinchada`. El tono es de cancha argentina: bronca de hincha, puteadas, exageración, diálogos de popular y platea, aprietes al plantel y sospechas de apuestas o árbitros comprados. Ejemplo: «¡Den dos pases seguidos, les estamos pidiendo fútbol, no que arreglen la economía!». La intoxicación y el apagón también forman parte de las escenas futboleras. Esta orientación reemplaza los primeros chistes de mascota y metegol, corregidos por el usuario.

El marcador y el desenlace aparecen primero como hechos confirmados escritos por el servidor. Luego, el rótulo «Folclore de tribuna (ficción)» distingue las escenas inventadas y opiniones de hinchas. Sus acusaciones y exageraciones no son datos verificados del partido ni eventos del motor: no generan lesiones, sanciones, cambios de reputación o estadísticas. La bronca de una tribuna puede coexistir con cualquier marcador. El prompt mantiene las puteadas explícitas y prohíbe introducir estadísticas o personas identificadas en la escena.

La salida es texto plano; la interfaz debe renderizarla como texto, nunca como HTML. El contrato rechaza campos desconocidos, nombres vacíos o excesivos, controles y delimitadores HTML, equipos con el mismo ID y goles negativos, fraccionarios o no seguros.

## JSON y controles de hechos

Gemini devuelve exclusivamente `{matchId, homeGoals, awayGoals, outcome, scene}` con esquema JSON. El servidor compara todos los hechos por igualdad exacta y rechaza campos adicionales. Solo inserta `scene` en el relato; el título y el resumen deportivo se componen con datos confirmados. El texto se acota a 1000 caracteres y se rechazan HTML, controles, cifras, marcadores escritos con palabras, nombres de los clubes y vocabulario de goles, lesiones, penales, expulsiones y desenlaces. Si se rechaza, se guarda el fallback con la causa y el consumo conocido.

Los filtros léxicos sobre ficción libre son conservadores, pueden rechazar chistes válidos y no prueban semánticamente cualquier oración posible. Una paráfrasis no contemplada puede pasar. La garantía fuerte es que los datos deportivos y el estado del motor se componen y conservan fuera del texto generado. El tono real del proveedor y su tasa de fallback requieren evaluación con una clave configurada; un bloqueo de contenido del proveedor también produce fallback.

El adaptador usa REST `generateContent`, una sola respuesta, esquema JSON, máximo 768 tokens de salida, timeout de ocho segundos y cuerpo de respuesta limitado a 32 KB. No reintenta llamadas fallidas. La clave viaja en un encabezado y no se registra. Referencias: [generación](https://ai.google.dev/api/generate-content), [salida estructurada](https://ai.google.dev/gemini-api/docs/structured-output).

## API

`POST /functions/v1/narrative` con el JWT del usuario y JSON:

```json
{ "season": 1, "fixtureId": "s1-r1-m0" }
```

Respuesta 200: `{narrative: {title, body, matchId}, source: "gemini" | "fallback", reason, requestId}`. Los campos privados, marcadores y prompts enviados por el navegador se rechazan. Un partido no confirmado o ajeno devuelve 404; JWT inválido, 401; entrada inválida, 400. Los errores de Gemini usan fallback con 200, sin revertir el partido. La entrada HTTP está limitada a 1 KB.

## Consumo, concurrencia y recuperación

La migración crea `narrative_private.config`, `usage` y `events`, inaccesibles a clientes. Los RPC públicos requieren JWT y firma del servidor. Antes de llamar a Gemini, `narrative_reserve` bloquea la configuración compartida, comprueba cupos diario y por minuto móvil, incrementa el intento y guarda el fallback. Solo devuelve un ticket una vez por carrera/temporada/fixture. Las recargas reutilizan el relato guardado, incluso con proveedores caídos. El cupo diario usa UTC y no afirma coincidir con el reinicio de cuota del proveedor.

El consumo se limita por solicitudes, entrada mínima y salida máxima. Los intentos fallidos consumen el cupo reservado, porque un timeout no demuestra que Google no haya procesado la llamada. Se registran modelo, versión de prompt, causa, tokens informados y cantidad de intentos con consumo desconocido. No se presenta consumo desconocido como cero. `narrative_finish` es idempotente y registra tokens aun si se rechaza el relato. Si el proceso muere tras reservar, queda el fallback con `pending` y no se vuelve a llamar automáticamente. Si la base falla al reservar, se responde con fallback sin llamar al proveedor.

El esquema se instala con IA desactivada y cupos cero. Los límites propios no garantizan USD 0 en una cuenta con facturación: se debe seleccionar un modelo y proyecto con condiciones gratuitas verificadas antes de habilitarlo. [Cuotas oficiales](https://ai.google.dev/gemini-api/docs/rate-limits).

## Configuración y activación

Aplicar las migraciones, configurar la firma del motor en la base y en el runtime, y agregar estas variables solo al entorno del servidor (`supabase/.env.local` ignorado en local o secrets del proyecto):

```dotenv
NARRATIVE_ENABLED=true
GEMINI_API_KEY=valor_secreto
GEMINI_MODEL=modelo_verificado_en_AI_Studio
```

No hay modelo predeterminado. Verificar disponibilidad, cuota y condiciones del proyecto antes de elegirlo. Luego un operador puede establecer un cupo explícito en PostgreSQL; ejemplo conservador para una demo, sujeto a la cuota real:

```sql
update narrative_private.config
set enabled = true, daily_limit = 10, minute_limit = 1
where singleton;
```

Para cortar inmediatamente las nuevas reservas: `update narrative_private.config set enabled = false where singleton;`. Las solicitudes ya reservadas pueden terminar. Los partidos que ya tienen fallback persistido lo conservan al habilitar Gemini; usar un resultado nuevo para probar. El workflow incluye el despliegue de `narrative`; esta entrega se verificó localmente y no ejecutó un despliegue cloud.

`npm run report:narrative-usage` informa límites, intentos, tokens conocidos, consumo desconocido y causas. Por defecto consulta la base local. Para operación cloud acepta `NARRATIVE_REPORT_DB_URL` en el entorno del operador; no imprimir ni guardar esa credencial en Git.

## Verificación

`npm run check` ejecuta lint, tipos, pruebas y build. Las pruebas del adaptador simulan JSON válido, contradicciones, estadísticas inventadas, bloqueos, 429/5xx, timeout, cuerpo excesivo y errores de almacenamiento. No requieren una clave real.

Pruebas locales de la base y el endpoint:

```text
npm run db:start
npx supabase migration up --local
node scripts/game-local-setup.mjs
npm run test:narrative-db
npm run db:test
```

En una terminal, con Gemini desactivado: `npm run functions:serve`. En otra: `npm run test:narrative-http`. El script crea usuarios y una carrera sintéticos, juega una jornada y comprueba persistencia, aislamiento y conservación del estado. Los fixtures de prueba se conservan. Las pruebas de base restauran la configuración de cupo que encontraron. El job de base de CI corre también la prueba de concurrencia de narrativa.

Evidencia local generada por los scripts: `docs/evidencias/narrative-db.json` y `narrative-http.json`. No se ejecutó una llamada real a Gemini porque falta configurar su clave y modelo.

La base determinista sigue cubierta por `npm test -- tests/narrative.test.ts`: resultados, seis temas, repetibilidad, ausencia de mutaciones, límites e inyección de campos privados o hechos deportivos.
