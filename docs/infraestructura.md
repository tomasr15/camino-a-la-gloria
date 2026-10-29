# Setup y operación

## Entorno local reproducible

1. `npm ci` con Node 22.
2. Iniciar Docker Desktop y ejecutar `npm run db:start`. Las migraciones iniciales se aplican al crear la base local.
3. Crear `.env.local` con las dos variables públicas de `.env.example`; obtenerlas con `npx supabase status`. No copiar secretos de servicio al frontend.
4. Crear `supabase/.env.local` con `ALLOWED_ORIGINS=http://localhost:3000,http://127.0.0.1:3000`.
5. Ejecutar `npm run functions:serve` y `npm run dev` en terminales separadas.
6. Confirmar correo en Mailpit local, puerto 54324. Verificar `/estado` y crear/recuperar una carrera.

No ejecutar `db reset` ni borrar volúmenes. Para cambios posteriores usar migraciones aditivas (`supabase migration up` en local) con revisión previa.

## Supabase cloud

Organización y proyecto dedicados al producto en plan Free. Desactivar la exposición automática de tablas nuevas; habilitar RLS. La migración otorga privilegios explícitos. Elegir región cercana al público de prueba y registrar la región efectiva en evidencias.

Ruta CLI, una vez autenticada y con credenciales disponibles localmente:

```sh
npx supabase login
npx supabase link --project-ref <referencia-del-proyecto>
npx supabase db push
npx supabase secrets set ALLOWED_ORIGINS=https://<dominio-del-frontend>
npx supabase functions deploy health
npx supabase functions deploy careers
npx supabase functions deploy game
```

Si el setup inicial se aplica desde SQL Editor, ejecutar exactamente la migración versionada y registrar esa vía. Antes de futuros `db push`, reconciliar el historial de migraciones con `migration repair` solo después de verificar que el SQL ya fue aplicado; no reejecutar ciegamente el esquema.

`verify_jwt=false` es deliberado para validar JWT en `careers` con `getUser`, compatible con claves actuales. No hay acceso privado antes de esta validación. `health` es público. Configurar Auth Site URL con el dominio definitivo, mantener confirmación de correo y revisar restricciones del correo gestionado antes de invitar usuarios externos.

## Vercel

Importar `tomasr15/camino-a-la-gloria`, framework Next.js, raíz del repositorio, Node 22 y `npm run build`. Configurar `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`. Son valores públicos; nunca agregar `service_role`, contraseña de DB ni claves de IA con prefijo público.

La integración Git despliega el frontend. El equipo debe usar PR y esperar CI antes de integrar. No se declara un bloqueo técnico de merges si no se configuró protección de rama. Para previews, agregar solamente orígenes explícitamente autorizados en `ALLOWED_ORIGINS`; no usar un comodín global.

## GitHub Actions

- `ci.yml`: app y SQL en jobs separados sobre push y PR. El job SQL usa infraestructura efímera del runner sin tocar cloud.
- `deploy-backend.yml`: ejecución manual sobre `main`, primero valida app, luego enlaza proyecto, aplica migraciones y despliega funciones.
- `health-monitor.yml`: cada 10 minutos consulta `health` en cloud (ver Alertas). No despliega ni usa secretos.
- Para `game`, configurar antes la misma clave `GAME_SIGNING_KEY` en los secretos de Edge Functions y en `game_private.signing_key`; no guardar la clave en Git. El workflow conserva el secreto cloud ya aprovisionado.
- Configuración necesaria en entorno `production`: secrets `SUPABASE_ACCESS_TOKEN`, `SUPABASE_DB_PASSWORD`; variables `SUPABASE_PROJECT_REF`, `ALLOWED_ORIGINS`.
- No iniciar el workflow de backend sin esas variables ni afirmar que está operativo hasta una ejecución exitosa.

## Captura de errores (Sentry)

Proyecto `javascript-nextjs` en la organización `caminoalagloria`, plan gratuito. **Obligatorio:** activar Settings → Projects → javascript-nextjs → Security & Privacy → «Prevent Storing of IP Addresses». Sin esa opción, Sentry deduce y guarda la IP de quien envía cada evento (la de cada jugador, en los eventos del navegador), aunque el cliente no la mande. El DSN está en Settings → Projects → javascript-nextjs → Client Keys. Es público por diseño (solo permite enviar eventos), pero igual se configura por variables y no queda en Git. Sin DSN no se envía nada, así que CI y local sin configurar siguen igual.

- Local: `NEXT_PUBLIC_SENTRY_DSN` en `.env.local` y `SENTRY_DSN` en `supabase/.env.local`; `SENTRY_ENVIRONMENT=development` y `NEXT_PUBLIC_SENTRY_ENVIRONMENT=development` para separar los eventos de prueba.
- Cloud, funciones: `npx supabase secrets set SENTRY_DSN=<dsn> SENTRY_ENVIRONMENT=production --project-ref <ref>`. Los secretos se conservan entre despliegues; no hace falta tocar `deploy-backend.yml`.
- Cloud, frontend: agregar `NEXT_PUBLIC_SENTRY_DSN` en las variables de Vercel y volver a desplegar. La CSP habilita el host de ingesta del DSN en `connect-src`.

Evento de prueba de las Edge Functions: con `SENTRY_TEST_EVENTS=true`, `GET /functions/v1/health?sentry-test=1` envía «Evento de prueba desde la Edge Function health». Volver a `false` después. Evento de prueba del navegador: en la consola de la app, `setTimeout(() => { throw new Error("Prueba de Sentry desde el navegador") })`. Cada instancia envía como máximo 20 eventos por minuto para no agotar la cuota mensual gratuita.

## Alertas

**Caída de health.** `health-monitor.yml` corre `npm run monitor:health` cada 10 minutos (GitHub puede demorarlo unos minutos). Hace hasta tres intentos separados por 20 s; si todos fallan (status distinto de 200, cuerpo distinto de `ok` o timeout de 10 s), envía un evento a Sentry con la etiqueta `check=health-monitor` y el job termina en error. GitHub avisa por correo de esa falla a quien modificó por última vez el `cron`. Variables del repositorio (Settings → Secrets and variables → Actions → Variables): `HEALTH_URL=https://<ref>.supabase.co/functions/v1/health` y `SENTRY_DSN`. Sin `HEALTH_URL` el job no hace nada. Los workflows programados solo corren desde `main` y GitHub los desactiva si el repositorio pasa 60 días sin actividad. Como efecto secundario, la consulta periódica evita que el proyecto Free de Supabase se pause por inactividad.

**5xx sostenidos.** Regla de Sentry en el proyecto `javascript-nextjs` (Alerts → Create Alert → Issues):
- When: «An event or issue activity is captured».
- If: «Number of events in an issue is more than 5 in 5 minutes» y «The event's tags match `runtime` equals `edge`».
- Then: «Notify on preferred channel» → Member → el responsable de turno (correo).
- Nombre: «5xx sostenidos en Edge Functions».

**Health caído en Sentry.** Segunda regla con When «An event or issue activity is captured», If «The event's tags match `check` equals `health-monitor`» y la misma acción. Nombre: «Health caído».

Para probarlas: la de 5xx, con `SENTRY_TEST_EVENTS=true`, abriendo seis veces `…/functions/v1/health?sentry-test=1` en menos de 5 minutos (los eventos de prueba también llevan `runtime=edge`). La de health, cambiando `HEALTH_URL` por una URL inexistente y ejecutando el workflow a mano con «Run workflow»; después se restaura. Las reglas se configuran en la web de Sentry y no quedan versionadas en Git.

## Runbook breve

| Síntoma | Diagnóstico y acción |
|---|---|
| Portada abre pero no hay registro | Revisar variables públicas y volver a desplegar el frontend |
| Health 503 | Verificar disponibilidad de DB y existencia del dataset inicial |
| Carrera 401 | Revisar confirmación de correo, sesión y token; iniciar sesión de nuevo |
| Carrera 403 | Revisar origen permitido; no ampliar a todos los dominios |
| Carrera 409 | Ya existe una carrera: recuperarla con GET, no reintentar inserciones |
| Carrera 503 | Buscar requestId en logs; revisar Auth, políticas y migración |
| Mensaje con «Referencia: <uuid>» | Buscar ese UUID en los logs de Edge Functions: es el `requestId` de la solicitud; `requestIdSource: "client"` confirma que vino del navegador |
| Alerta «Health caído» o job del monitor en rojo | Abrir el log del job: muestra cada intento con status y requestId. Verificar si el proyecto Supabase está pausado o caído y seguir la fila «Health 503» |
| Alerta «5xx sostenidos» | Abrir el issue en Sentry, tomar un `requestId` y buscarlo en los logs de la función indicada |
| Error en Sentry | Copiar la etiqueta `requestId` del evento y buscarla en los logs de Edge Functions; si vino del navegador, el evento de la función tiene el mismo id |
| Narrativa siempre en fallback | `npm run -s report:narrative-usage \| npm run -s report:narrative-quota`: si hoy figura `corte`, el cupo diario se agotó; `deshabilitada` indica el corte manual |
| Error en despliegue | Revisar CI/build; corregir mediante commit sin reescribir historial |

No borrar datos como método de reparación. Si una corrección exige una operación destructiva, dejarla pendiente para decisión del usuario.
