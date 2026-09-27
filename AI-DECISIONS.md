# AI Decision Log

Estado: propuesta e implementación asistidas; **validación humana pendiente**. Las comprobaciones automáticas no equivalen a revisión humana. Fecha: 27/09/2026.

## AI-001 · Alcance y arquitectura del checkpoint 1

- **Problema:** convertir el one-pager y la consigna en una entrega de arquitectura alcanzable.
- **Prompt/herramienta:** Codex. «Necesito que a partir del archivo Camino a la Gloria [...] realices un plan» y luego «Quiero que lo realices todo lo que tiene que ver con esta entrega actuando como un ingeniero en sistemas».
- **Propuesta generada:** Next.js en Vercel; identidad, funciones y PostgreSQL en Supabase; motor separado de IA; integración técnica mínima para CP1.
- **Auditoría de la propuesta:** se distinguió la exigencia oficial de arquitectura/setup/repositorio del backend funcional de CP2. Se retiró cualquier afirmación de servicios ya desplegados antes de verificarlos. Se conservó la suscripción histórica fuera del MVP académico.
- **Validación/corrección humana:** pendiente de Julian, Lucas y Tomas. Registrar desacuerdos y decisiones al revisar.

## AI-002 · Persistencia y aislamiento

- **Problema:** guardar una carrera por cuenta evitando lectura ajena y manipulación de reputación.
- **Herramienta:** Codex; derivado de la implementación del checkpoint solicitada.
- **Código generado:** migración PostgreSQL con RLS, índice único de propietario y privilegios de inserción por columna; función que valida JWT con `getUser` y opera con el rol del usuario.
- **Correcciones durante desarrollo:** se evitó usar `service_role`; se rechazaron atributos adicionales, incluido `user_id` y `reputation`; se agregó límite real de 2 KB al cuerpo y timeout a llamadas. `verify_jwt=false` solo desactiva el filtro del gateway: la función `careers` exige y verifica identidad antes de acceder a datos.
- **Validación automática:** contratos y pruebas SQL especificados en el repositorio; resultados efectivos en el documento de evidencias.
- **Validación/corrección humana:** pendiente. Revisar especialmente RLS, privilegios por columna y configuración de Auth.

## AI-003 · Interfaz y estados reales

- **Problema:** mostrar una base de producto defendible sin aparentar un juego terminado.
- **Código generado:** portada responsive, formularios de acceso/carrera y comprobación de salud.
- **Decisión:** informar explícitamente si falta configuración; no guardar una carrera ficticia en el navegador ni mostrar éxitos sin respuesta del backend.
- **Limitaciones:** sin recuperación de contraseña ni edición/borrado de cuenta en CP1; la narrativa y la simulación siguen pendientes.
- **Validación/corrección humana:** pendiente de revisión funcional y accesibilidad por el equipo.

## AI-004 · Entrega y trazabilidad

- **Problema:** iniciar repositorio, automatizaciones, informe y pruebas con plazo inmediato.
- **Resultado:** commits de cambios reales, workflows de CI y despliegue, documentación y backlog.
- **Control:** no inventar historial previo, aprobaciones cruzadas, métricas de producción ni aportes individuales. La instrucción del usuario prohíbe borrar cualquier recurso.
- **Validación/corrección humana:** completar en el PR de revisión antes de afirmar aprobación del equipo.
