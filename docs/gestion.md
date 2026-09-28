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

| ID | Hito | Tarea y aceptación | Responsable propuesto |
|---|---|---|---|
| CP1-01 | 28/09 | Revisar arquitectura y justificar cada servicio; observaciones en PR | Tomás y revisor |
| CP1-02 | 28/09 | Verificar cloud y acceso desde otro dispositivo; registrar URL y requestId | Lucas y revisor |
| CP1-03 | 28/09 | Revisar UX, CI y trazabilidad; no dejar secretos en commits | Julian y revisor |
| CP1-04 | 28/09 | Completar revisión humana del log de IA y ensayo | Los tres — revisión de Julian y Lucas registrada 28/09; lectura de Tomas y ensayo pendientes |
| CP2-01 | 09/11 | Comprobar cobertura de liga/temporada y condiciones; dataset trazable | Lucas |
| CP2-02 | 09/11 | Modelar clubes, planteles, fixtures y ofertas con migraciones | Lucas |
| CP2-03 | 09/11 | Motor reproducible con resultados, avance atómico e idempotencia | Tomás |
| CP2-04 | 09/11 | Pantallas de equipo, once titular y jornada; flujo integrado | Julian |
| CP2-05 | 09/11 | Narrativa Gemini con validación de hechos, cuota y fallback | Tomás |
| CP2-06 | 09/11 | Pruebas de integración, aislamiento, fallos y carga acotada | Los tres |
| FINAL-01 | 30/11 | Endurecer operación, demostrar progresión y ensayar defensa individual | Los tres |

## Riesgos principales

1. **Plazo inmediato y poco historial:** los commits de hoy no sustituyen continuidad previa. Declarar autoría asistida y lograr revisiones reales del equipo.
2. **Datos deportivos:** seleccionar liga/temporada después de comprobar cobertura; no presentar fixture sintético como integración real.
3. **Planes gratuitos:** validar cuotas, políticas y limitaciones de correo/colaboración; no habilitar gastos automáticos.
4. **IA no determinista:** acotar entrada/salida, validar hechos y persistir resultado del motor antes de generar texto.
5. **Dependencia de proveedores:** conservar SQL, contratos y configuración en Git; documentar recuperación y límites de portabilidad.
6. **Exceso de alcance:** suscripciones históricas fuera del MVP; Realtime y nuevas ligas sujetos a necesidad y tiempo.

## Definición de terminado para CP1

Arquitectura defendible, setup comprobado, repositorio accesible, CI verificado, evidencia honesta y revisión humana documentada. La revisión individual del equipo y el envío formal a la cátedra no pueden reemplazarse por una ejecución automática.
