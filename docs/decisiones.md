# Registro de decisiones

Estado: revisadas el 28/09/2026 por Julian Coloma, Lucas Modernell y Tomas Rosato. Fuentes oficiales consultadas el 27/09/2026.

| Decisión | Alternativa considerada | Motivo y costo asumido |
|---|---|---|
| D01. Next.js/React/TypeScript en Vercel | SPA en hosting estático | Coincide con el one-pager; despliegue gestionado y posibilidad de crecer. Se usa el mínimo necesario; no se duplica backend de negocio en Next.js. |
| D02. Supabase Postgres/Auth/Functions | AWS con RDS, Cognito y Lambda separados | Menor configuración inicial para tres integrantes. Se acepta dependencia operativa del proveedor; SQL y reglas TypeScript conservan portabilidad parcial. |
| D03. RLS + cliente con JWT del usuario | service_role en toda la API | Defensa también ante acceso directo; evitar que un error de filtro permita leer carreras ajenas. |
| D04. Una carrera por cuenta | Carreras múltiples | Alineado al acceso inicial del producto; unicidad en DB evita carreras duplicadas por concurrencia. |
| D05. Datos sintéticos identificados en CP1 | Importar planteles sin validar cobertura | Permite comprobar infraestructura sin afirmar integración o licencias inexistentes. Los datos reales se validan en CP2. |
| D06. Motor separado de Gemini | Delegar resultados al LLM | Reglas auditables y consistencia; IA limitada a narrativa. |
| D07. Git integration para frontend; workflow manual para backend | Desplegar todo automáticamente en cada push | Migraciones requieren preparación de secretos y revisión. Automatizar el paso manual después de establecer el entorno y aprobación del equipo. |
| D08. Sin Realtime/Storage inicial | Aprovisionar todo el stack desde CP1 | No hay actualización multijugador ni archivos de usuario implementados. Menos recursos y superficie operativa. |

## Costos y restricciones

Presupuesto académico objetivo: USD 0 de suscripciones y consumo pago. No se habilitan upgrades ni cargos automáticos. Esto no constituye una garantía de disponibilidad o de que cualquier uso futuro quede cubierto.

- **Vercel Hobby:** restringido a uso personal no comercial. La futura suscripción SaaS obliga a reevaluar el plan. También tiene restricciones para repositorios de organizaciones y autores colaboradores; verificar el flujo del equipo antes de apoyarse en previews de todos los integrantes. [Plan Hobby](https://vercel.com/docs/plans/hobby), [integración Git](https://vercel.com/docs/git), [límites](https://vercel.com/docs/limits).
- **Supabase Free:** la página consultada incluye 500 MB de base y 500.000 invocaciones de funciones. Son límites de referencia que pueden cambiar; controlar uso real en el dashboard y evitar cargar datos históricos completos. [Precios](https://supabase.com/pricing), [funciones](https://supabase.com/docs/guides/functions/pricing).
- **Gemini y API-Football:** no habilitados ni consumidos en CP1. Antes de CP2 registrar modelo, cuota, condiciones, cobertura de liga/temporada y presupuesto diario. No se afirma cobertura gratuita de temporadas históricas.

## Documentación técnica usada

- [Instalación Next.js](https://nextjs.org/docs/app/getting-started/installation): lint separado del build; Node compatible y TypeScript.
- [Verificación de usuario](https://supabase.com/docs/reference/javascript/auth-getuser): verificación del JWT en servidor.
- [Auth en funciones](https://supabase.com/docs/guides/functions/auth): elegir autenticación explícita y acceso con RLS.
- [Pruebas de base](https://supabase.com/docs/guides/database/testing): pgTAP mediante CLI.
- [Entornos y despliegue](https://supabase.com/docs/guides/deployment/managing-environments): migraciones y automatización.
