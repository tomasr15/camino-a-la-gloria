# Camino a la Gloria

Simulador web de carrera de director técnico. TPI de Desarrollo de Software Cloud, UTN FRLP, 2026.

**Checkpoint 1 · 28/09/2026:** arquitectura y base técnica. Esta versión implementa pantalla inicial, registro/inicio de sesión, creación y lectura de una carrera privada y comprobación de conectividad. No incluye aún partidos, clubes reales, fichajes ni generación con IA.

[Aplicación publicada](https://camino-a-la-gloria-dusky.vercel.app) · [Informe PDF](docs/entrega/Checkpoint-1-Camino-a-la-Gloria.pdf) · [Tablero del equipo](https://github.com/users/tomasr15/projects/1)

## Documentación de entrega

- [Informe de arquitectura](docs/arquitectura.md)
- [Decisiones y alternativas](docs/decisiones.md)
- [Setup y operación](docs/infraestructura.md)
- [Alcance, riesgos y backlog](docs/gestion.md)
- [Evidencias y estado de entrega](docs/evidencia-checkpoint-1.md)
- [Auditoría de IA](AI-DECISIONS.md), revisada el 28/09/2026 por Julian Coloma ,Lucas Modernell y Tomas Rosato
- [Guion de defensa](docs/defensa.md)

## Inicio rápido

Requisitos: Node.js 22.12 o superior dentro de la rama 22, npm y Docker Desktop para la base local. Las dependencias están fijadas en `package-lock.json`.

```sh
npm ci
npm run db:start
```

Copiar `.env.example` a `.env.local` y completar la URL local y la clave pública que entrega `npx supabase status`. Copiar `supabase/functions/.env.example` a `supabase/.env.local`. No versionar estos archivos.

```sh
npm run functions:serve
# En otra terminal:
npm run dev
```

Abrir `http://localhost:3000`. Los correos de confirmación locales se reciben en `http://localhost:54324`. Sin configuración, la portada funciona y la página de carrera informa que el registro no está habilitado; no simula persistencia.

## Verificación

```sh
npm run check
npm run db:test
```

`check` ejecuta ESLint, TypeScript, pruebas de contratos y build. `db:test` verifica acceso por propietario, rechazo de suplantación, una carrera por usuario y bloqueo de cambios de reputación. Las pruebas de base usan una transacción revertida, sin modificar datos preexistentes.

La prueba de integración local se ejecuta con `npm run test:integration`. La verificación cloud está registrada en `docs/evidencias/cloud-smoke.json`; su script exige las variables públicas en `.env.cloud` y dos cuentas sintéticas dedicadas en `tmp/cloud-fixtures.json` (ambos ignorados). No aprovisiona usuarios ni borra datos. No compartir las credenciales de fixtures en GitHub.

## Stack

Next.js / React / TypeScript; Supabase Auth, PostgreSQL y Edge Functions; Vercel para frontend; GitHub Actions para CI. API-Football y Gemini están diseñados para CP2 y no reciben llamadas en CP1. El dataset `cp1-infrastructure-fixture-v1` es sintético y solo valida infraestructura: no contiene planteles reales.

## Equipo y autoría

Julian Coloma, Lucas Modernell y Tomas Rosato. La implementación inicial fue realizada con asistencia de Codex, identificada en los commits y en `AI-DECISIONS.md`. Julian Coloma, Lucas Modernell y Tomas Rosato revisaron ese log y las decisiones documentadas el 28/09/2026.

## Conservación

Por instrucción del usuario, no borrar archivos, datos ni recursos. Las migraciones iniciales son aditivas. No ejecutar `db reset`, limpieza de volúmenes, force-push ni eliminación de recursos en este proyecto.
