# CP2-04 · Pantallas e integración de la demo

Issue: https://github.com/tomasr15/camino-a-la-gloria/issues/9
Estado: propuesta visual local, sin integración ni despliegue. Objetivo: 09/11/2026.

## Dirección acordada

Premium Dark Gaming Dashboard: deportivo, cinematográfico, modular, elegante y contenido. Conservar verde oscuro, crema y lima del proyecto. Bordes finos, iluminación ambiental, tipografía fuerte y acentos localizados. Referencias: capturas aportadas por Tomás de FIFA/FC, Behance FIFA Ultimate Team UI/UX e Interface In Game. Priorizar legibilidad, teclado y móvil.

Tomás eligió cancha visual y barra de precisión para el mano a mano. Respetar docs/plan-tarea-7.md: izquierda/centro/derecha desde el pateador, centro 100, extremos 0, interpolación lineal, recorrido inicial de dos segundos. El backend determina el desenlace; la interfaz solo lo representa.

## Propuesta revisable

Abrir docs/prototipos/issue-9.html. Tres vistas: Mi carrera, Once titular y Mano a mano. Navegación, cambio de formación/táctica y ensayo de precisión funcionales. Progreso, rival y minuto son ejemplos. Nombres del plantel se completan desde el dataset del repositorio al preparar la maqueta. No guarda ni llama al backend, no simula resultados deportivos.

## Inventario y secuencia

1. Consolidar tokens y componentes de la propuesta: navegación, paneles, botones, selección, estados de carga/error/vacío y disposición móvil.
2. Reutilizar Auth/careers e invokeFunction. Consultar GET game; distinguir partida inexistente, lista, en curso, finalizada e incompatible. Elegir club bajo mediante initialize. La interfaz nunca reinicia ni borra una carrera incompatible.
3. Equipo y once: usar clubs/players del servidor, validar 11 propios sin duplicados, posiciones para 4-4-2/4-3-3, tácticas existentes. Definir borrador del once entre jornadas: el contrato actual no tiene comando separado de guardar alineación; no afirmar persistencia antes de start.
4. Jornada: start con season/round/formation/tactic/lineup; mostrar pendingEvent, enviar shoot o auto. Cubrir partidos sin ocasiones y lastMatch al cerrar jornada. Animar solo eventos públicos confirmados.
5. Resultados: tabla, confianza, reputación, calendario, narrativa del resultado confirmado. Cierre de temporada: ofertas y nextSeason. Reutilizar fallback/cuotas de narrativa existentes.
6. Recuperación: una clave de idempotencia por decisión, reutilizada en reintentos; expectedVersion; recargar ante STALE_VERSION sin repetir automáticamente una decisión distinta. Separar requestId de trazabilidad y clave de decisión. Evitar dobles clics y limpiar datos al cambiar de usuario.
7. Verificar flujo completo y aislamiento con dos cuentas, recarga durante partido, timeout posterior al guardado, 401/409/429/5xx y fallo de narrativa. Reutilizar tests del motor y SQL; añadir pruebas de navegador del recorrido nuevo. Carga y resiliencia coordinadas con #12; evidencia y revisión humana con #14; trazabilidad con #13.

## Criterios de terminado

- Sesión → carrera → club → once → jornada → resultado/tabla → recarga y continuación funcionan contra backend.
- Temporada completa y ofertas visibles, sin duplicación de efectos.
- Una cuenta no puede leer ni modificar otra carrera.
- Proveedor narrativo fallido no bloquea el resultado ni el avance.
- Móvil y teclado utilizables; movimiento decorativo reducido según preferencia; resolución automática disponible como alternativa al timing.
- npm run check, db:test y suites de integración pertinentes aprobadas; evidencia real de navegador, fallos y carga acotada. No confundir código existente con despliegue verificado.
- Revisión cruzada real y registro de asistencia en AI-DECISIONS.md antes del cierre.

## Límites

No ampliar el motor, fichajes, lesiones, sustituciones o ligas. No usar fotos ni escudos ausentes del dataset. No borrar datos, ejecutar resets, publicar o declarar pruebas aprobadas sin evidencia. README y partes de arquitectura/planes aún describen CP1 o dataset sintético: contrastar con implementación vigente al actualizar documentación.
