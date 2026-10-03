# Alcance, trabajo y riesgos

## Matriz de trazabilidad

| Fuente | Requisito | Implementación/evidencia |
|---|---|---|
| TPI p. 3, CP1 | Arquitectura detallada | arquitectura.md, decisiones.md y diagramas |
| TPI p. 3, CP1 | Setup de infraestructura | migración, funciones, configuración y evidencia cloud |
| TPI p. 3, CP1 | Repositorio con actividad | commits reales; PR para revisión humana |
| TPI p. 2 | AI-DECISIONS.md | Log en raíz, sin validaciones humanas ficticias |
| TPI pp. 3–4 | CI, PR, Kanban, observabilidad | workflows, plantilla PR, tablero y logs JSON |
| One-pager p. 1 | Una carrera guardada | Auth, careers y unicidad por usuario |
| One-pager p. 1 | Datos reales y versionados | Modelo de versión; integración real diferida a CP2 |
| One-pager p. 1 | IA narrativa; motor propio | Diseño separado y contrato JSON; implementación completa en CP2 |

## Roles propuestos y flujo

Tomás: arquitectura/documentación e integración. Lucas: datos/backend/seguridad. Julian: frontend/CI. Son responsabilidades propuestas, no afirmaciones de trabajo ya realizado. Confirmar usuarios de GitHub antes de asignar o invitar personas.

Tablero: Pendiente → En curso → En revisión → Hecho. WIP: una tarea en curso por integrante y hasta dos PR en revisión. Si se alcanza el límite, priorizar revisión. Cada tarjeta incluye criterio de aceptación y evidencia. Un resultado técnico puede estar listo aunque su revisión humana siga pendiente; no marcar aprobación cruzada automáticamente.

## Backlog priorizado

| ID · issue | Hito | Tarea y aceptación | Responsable propuesto |
|---|---|---|---|
| CP1-01 · #2 | 28/09 | Revisar arquitectura y justificar cada servicio; observaciones en PR | Tomás y revisor |
| CP1-02 · #3 | 28/09 | Verificar cloud y acceso desde otro dispositivo; registrar URL y requestId | Lucas y revisor |
| CP1-03 · #4 | 28/09 | Revisar UX, CI y trazabilidad; no dejar secretos en commits | Julian y revisor |
| CP1-04 · #5 | 28/09 | Completar revisión humana del log de IA y ensayo | Los tres — revisión de Julian, Lucas y Tomás registrada 28/09 |
| CP1-05 · #11 | 03/10 | Cerrar la deuda técnica de CP1 antes de arrancar CP2 | Los tres — implementación en el PR #16, pendiente de revisión cruzada |
| CP2-01 · #6 | 09/11 | Comprobar cobertura de liga/temporada, reglas y licencias; modelar clubes, planteles, fixtures y ofertas con migraciones; dataset trazable | Lucas |
| CP2-02 · #7 | 09/11 | Motor reproducible con resultados, avance atómico e idempotencia | Tomás |
| CP2-03 · #8 | 09/11 | Narrativa Gemini con validación de hechos, cuota y fallback | Tomás |
| CP2-04 · #9 | 09/11 | Pantallas de equipo, once titular y jornada; flujo integrado y pruebas de la demo | Julian |
| CP2-05 · #12 | 09/11 | Despliegue por Actions con health check, rate limiting, ensayo de fallos y carga acotada | Tomás |
| CP2-06 · #13 | 09/11 | requestId de punta a punta, captura de errores, alertas de 5xx y cuota diaria de IA | Lucas |
| CP2-07 · #14 | 09/11 | Tests de handlers, cobertura con umbral, seguridad en CI, archivos de comunidad, PR cruzado, evidencia por script e informe ensayado | Julian |
| CP2-08 · #15 | Opcional | Consultas en lenguaje natural sobre el reglamento con pgvector; fuera del backlog comprometido | Sin asignar |
| FINAL-01 | 30/11 | Endurecer operación y observabilidad (#12, #13), demostrar progresión sobre el motor de #7 y ensayar la defensa individual (#14) | Los tres |

La fuente de verdad del estado es el tablero de GitHub: los identificadores CP1-xx y CP2-xx son los del tablero y cada fila apunta a su issue, así que esta tabla replica su contenido en lugar de mantener una numeración propia. #15 es opcional y no cuenta para el hito. Hasta el 03/10/2026 esta tabla usaba una numeración local que chocaba con la del tablero.

## Riesgos principales

1. **Plazo inmediato y poco historial:** los commits de hoy no sustituyen continuidad previa. Declarar autoría asistida y lograr revisiones reales del equipo.
2. **Datos deportivos:** seleccionar liga/temporada después de comprobar cobertura; no presentar fixture sintético como integración real.
3. **Planes gratuitos:** validar cuotas, políticas y limitaciones de correo/colaboración; no habilitar gastos automáticos.
4. **IA no determinista:** acotar entrada/salida, validar hechos y persistir resultado del motor antes de generar texto.
5. **Dependencia de proveedores:** conservar SQL, contratos y configuración en Git; documentar recuperación y límites de portabilidad.
6. **Exceso de alcance:** suscripciones históricas fuera del MVP; Realtime y nuevas ligas sujetos a necesidad y tiempo.

## Definición de terminado para CP1

Arquitectura defendible, setup comprobado, repositorio accesible, CI verificado, evidencia honesta y revisión humana documentada. La revisión individual del equipo y el envío formal a la cátedra no pueden reemplazarse por una ejecución automática.
