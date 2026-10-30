# Menú Carrera · implementación local

Fecha: 29/10/2026. Issue #9. Rama `design/issue-9-demo`.

El menú real de `/carrera` carga `game` después de recuperar o crear la carrera autenticada. El componente aislado `career-dashboard.tsx` y su CSS Module sustituyen la tarjeta de carrera; registro, portada y estado conservan sus diseños. La maqueta HTML anterior permanece como referencia histórica y no representa esta implementación.

## Estructura

- Navegación superior Central, Equipo, Tabla y Calendario, sin rutas ficticias.
- Próximo encuentro del calendario de la carrera, localía y temporada; acciones Jugar y Simular.
- Tabla resumida de cinco equipos alrededor del propio, más clasificación completa.
- Tres encuentros próximos y calendario completo con marcadores confirmados.
- Plantel, reputación, confianza, objetivo y último resultado derivados del estado activo.
- Inicialización cuando aún no hay partida, continuación de ocasiones y cierre de temporada/ofertas usando comandos existentes.

## Integración

El cliente reutiliza `invokeFunction` y `bestLineup`. `start` utiliza el once recomendado 4-4-2 equilibrado, anunciado en la interfaz: no hay un editor persistido del once en la pantalla anterior. Simular encadena `start` con `auto` solamente si quedan ocasiones. Jugar permite resolver `shoot` desde el menú; no modifica el motor. Las decisiones retienen UUID y expectedVersion ante respuesta incierta. Los errores 4xx liberan la acción y permiten actualizar; los fallos inciertos permiten reintentar la misma decisión. El componente se desmonta al cambiar la sesión.

El contrato no contiene fechas reales ni escudos. La interfaz muestra jornadas y distintivos con iniciales identificados como tales. La liga de ocho equipos es la competición de la carrera; el origen de planteles sigue siendo el dataset existente. No se agregaron fechas, clubes, resultados ni clasificaciones estáticas en la aplicación.

## Fondo

Asset: `public/images/career-stadium.png`. Generado con herramienta integrada image_gen, sin CLI ni API propia. Prompt utilizado:

> Create a photorealistic panoramic football stadium interior at night, seen from high in the stands, full wide pitch visible in lower half, grandstands and roof structure, subtle floodlights, cinematic premium sports game atmosphere. Forest green and charcoal palette with soft warm ivory lights, restrained muted lime grass. Background asset for a dark football career game dashboard: low contrast, dark upper area, detailed but quiet, no UI, no text, no logos, no prominent people. Wide 16:9 landscape.

Se aplica oscurecimiento en CSS manteniendo los tokens verde/crema/lima. La imagen es decorativa, no representa el estadio de un club concreto.

## Verificación y límites

- Pruebas unitarias nuevas: fixture actual, ventana de tabla, temporada terminada y conservación del cuerpo de decisión en reintento.
- Navegador Edge headless: render desktop; tabla de ocho clubes; calendario de 14 jornadas; simulación con pérdida de respuesta después de commit y reintento sin duplicados; disparo manual; recarga; cuatro pestañas a 390 px sin desbordamiento ni excepciones.
- Evidencia: `docs/evidencias/career-dashboard-browser.json` y capturas desktop/móvil.
- La prueba de navegador intercepta HTTP, usa sesión de prueba y el motor real. No demuestra aislamiento RLS ni conectividad cloud. No se configuraron credenciales, ejecutaron migraciones ni desplegó.
- Pendientes del issue amplio: edición de once, narrativa integrada, ensayo cloud con dos cuentas, carga/resiliencia y revisión humana.

Next.js generó AGENTS.md/CLAUDE.md al ejecutar el servidor de desarrollo. No son cambios funcionales de esta pantalla.

## Ampliación 30/10/2026

Equipo ahora permite editar formación, táctica y titulares, con validación por posición antes de Jugar/Simular. El borrador se conserva por carrera/dataset/temporada/club en este navegador y se confirma al iniciar el encuentro. Un partido en curso bloquea su edición. La cancha del mano a mano representa un tiro únicamente tras recibir su evento confirmado; trayectoria visual ilustrativa, sin revelar decisiones privadas del arquero. Respeta reduced-motion. La crónica solicita narrative para el último partido confirmado, valida su identidad carrera/temporada/fixture y renderiza texto plano; fallo o demora deja resultado visible sin bloquear avance. Editor y crónica se separaron en componentes. GPT-6 Luna verifica navegador por pedido de Tomás. Verificación cloud y revisión humana siguen pendientes.

Verificación real local del 30/10: db:test aprobó 30 comprobaciones SQL. test:game-integration aprobó inicialización, idempotencia, aislamiento, 14 jornadas/56 encuentros, cambio de temporada y concurrencia. test:narrative-http aprobó fallback persistido, rechazo de suplantación y aislamiento, sin llamadas al proveedor. El script de narrativa se corrigió para contemplar que start puede cerrar una jornada sin ocasiones controlables. npm run check aprobó lint/tipos/194 pruebas/build; cuatro pruebas adicionales de borrador también aprobaron. La evidencia de narrativa está en docs/evidencias/narrative-http.json.
