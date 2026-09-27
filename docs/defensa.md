# Guion de defensa del checkpoint 1

Duración propuesta: 6 minutos. Cada integrante debe poder explicar el recorrido completo, además de su área.

1. **0:00–0:45 · Problema.** Una experiencia web accesible para dirigir una carrera desde el ascenso, con progresión clara. El MVP valida un conjunto pequeño de ligas.
2. **0:45–2:15 · Arquitectura.** Navegador y Next.js en Vercel; Auth, funciones y Postgres en Supabase. Seguir una petición con JWT hasta una fila protegida por RLS. Explicar por qué no se usa service_role en el flujo de usuario.
3. **2:15–3:30 · Evidencia.** Abrir la URL desplegada; comprobar salud; iniciar sesión de prueba ya confirmada; crear o recuperar una carrera. Aclarar que el dataset actual es sintético y que no hay simulación todavía.
4. **3:30–4:30 · Ingeniería.** Mostrar ejecución CI, prueba de aislamiento, commits y PR. Mostrar AI-DECISIONS y distinguir corrección automática de revisión humana.
5. **4:30–5:30 · Evolución.** Motor propio, importación versionada y narrativa JSON con fallback. Justificar que un fallo de IA no cambia un resultado ni bloquea la carrera.
6. **5:30–6:00 · Límites.** Plan gratuito, cobertura de datos pendiente y backlog hasta 09/11. Informar cualquier servicio aún no verificado en vez de afirmarlo desplegado.

Preguntas para ensayar: ¿qué pasa si un usuario cambia user_id?, ¿qué impide duplicar la carrera?, ¿qué datos recibe Gemini?, ¿qué parte escala y cuál limita?, ¿cómo se reproduce el setup?, ¿cómo se identifica un error?, ¿qué cambia al comercializar el SaaS?
