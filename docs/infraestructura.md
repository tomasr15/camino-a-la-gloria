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
```

Si el setup inicial se aplica desde SQL Editor, ejecutar exactamente la migración versionada y registrar esa vía. Antes de futuros `db push`, reconciliar el historial de migraciones con `migration repair` solo después de verificar que el SQL ya fue aplicado; no reejecutar ciegamente el esquema.

`verify_jwt=false` es deliberado para validar JWT en `careers` con `getUser`, compatible con claves actuales. No hay acceso privado antes de esta validación. `health` es público. Configurar Auth Site URL con el dominio definitivo, mantener confirmación de correo y revisar restricciones del correo gestionado antes de invitar usuarios externos.

## Vercel

Importar `tomasr15/camino-a-la-gloria`, framework Next.js, raíz del repositorio, Node 22 y `npm run build`. Configurar `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`. Son valores públicos; nunca agregar `service_role`, contraseña de DB ni claves de IA con prefijo público.

La integración Git despliega el frontend. El equipo debe usar PR y esperar CI antes de integrar. No se declara un bloqueo técnico de merges si no se configuró protección de rama. Para previews, agregar solamente orígenes explícitamente autorizados en `ALLOWED_ORIGINS`; no usar un comodín global.

## GitHub Actions

- `ci.yml`: app y SQL en jobs separados sobre push y PR. El job SQL usa infraestructura efímera del runner sin tocar cloud.
- `deploy-backend.yml`: ejecución manual sobre `main`, primero valida app, luego enlaza proyecto, aplica migraciones y despliega funciones.
- Configuración necesaria en entorno `production`: secrets `SUPABASE_ACCESS_TOKEN`, `SUPABASE_DB_PASSWORD`; variables `SUPABASE_PROJECT_REF`, `ALLOWED_ORIGINS`.
- No iniciar el workflow de backend sin esas variables ni afirmar que está operativo hasta una ejecución exitosa.

## Runbook breve

| Síntoma | Diagnóstico y acción |
|---|---|
| Portada abre pero no hay registro | Revisar variables públicas y volver a desplegar el frontend |
| Health 503 | Verificar disponibilidad de DB y existencia del dataset inicial |
| Carrera 401 | Revisar confirmación de correo, sesión y token; iniciar sesión de nuevo |
| Carrera 403 | Revisar origen permitido; no ampliar a todos los dominios |
| Carrera 409 | Ya existe una carrera: recuperarla con GET, no reintentar inserciones |
| Carrera 503 | Buscar requestId en logs; revisar Auth, políticas y migración |
| Error en despliegue | Revisar CI/build; corregir mediante commit sin reescribir historial |

No borrar datos como método de reparación. Si una corrección exige una operación destructiva, dejarla pendiente para decisión del usuario.
