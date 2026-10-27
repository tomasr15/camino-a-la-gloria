# CP2-03: contexto y fallback humorístico

Dirección de tono confirmada: picante, con puteadas explícitas, sarcasmo y bronca de popular argentina. Las seis escenas usan este registro por defecto, incluyendo «manga de muertos», «la concha de su madre» y descansos al plantel, dirigentes y representantes. La gracia debe estar en el remate futbolero y la frustración del hincha; el rótulo de ficción se conserva.

Primera entrega: funciones puras en `supabase/functions/_shared/narrative.ts`, sin llamadas a Gemini ni integración con persistencia o pantallas.

`parseNarrativeContext(unknown)` valida una lista cerrada de campos y devuelve una copia inmutable. Contexto v1:

```json
{
  "version": 1,
  "confirmed": true,
  "matchId": "career-1/season-1/match-1",
  "home": { "id": "club-1", "name": "Atlético del Barrio", "goals": 2 },
  "away": { "id": "club-2", "name": "Deportivo Siesta", "goals": 1 },
  "humor": { "mode": "fictional", "theme": "barra" }
}
```

El futuro handler debe construir este contexto desde un resultado persistido y autorizado. `confirmed: true` no demuestra que un partido exista o pertenezca al usuario. Nunca aceptar este contexto directamente del navegador como fuente del resultado. El adaptador de CP2-02 debe resolver los nombres desde el dataset y componer una identidad que distinga carrera, temporada y partido; el ID del fixture por sí solo podría repetirse. No enviar email, JWT, semilla, planteles ni estado completo a Gemini.

`buildFallbackNarrative(context)` devuelve el contrato existente `{title, body, matchId}`. Calcula victoria local, visitante o empate a partir del marcador. La misma entrada v1 produce exactamente la misma salida, sin reloj, aleatoriedad o servicios externos. El tema se elige antes de invocarla y debe conservarse al persistir el contexto.

Temas: `barra`, `apagon`, `arbitro_comprado`, `intoxicacion`, `apuestas`, `hinchada`. El tono es de cancha argentina: bronca de hincha, puteadas, exageración, diálogos de popular y platea, aprietes al plantel y sospechas de apuestas o árbitros comprados. Ejemplo: «¡Den dos pases seguidos, les estamos pidiendo fútbol, no que arreglen la economía!». La intoxicación y el apagón también forman parte de las escenas futboleras. Esta orientación reemplaza los primeros chistes de mascota y metegol, corregidos por el usuario.

El marcador y el desenlace aparecen primero como hechos confirmados. Luego, el rótulo «Folclore de tribuna (ficción)» distingue las escenas inventadas y opiniones de hinchas. Sus acusaciones y exageraciones no son datos verificados del partido ni eventos del motor: no generan lesiones, sanciones, cambios de reputación o estadísticas. La bronca de una tribuna puede coexistir con cualquier marcador; el texto no infiere posesión, pases, goleadores o rendimiento estadístico a partir del resultado. Esta pauta deberá trasladarse al prompt de Gemini y a su validación de hechos.

La salida es texto plano; la interfaz debe renderizarla como texto, nunca como HTML. El contrato rechaza campos desconocidos, nombres vacíos o excesivos, controles y delimitadores HTML, equipos con el mismo ID y goles negativos, fraccionarios o no seguros. Esto no valida semánticamente una futura respuesta libre de Gemini: ese control, el proveedor, cuotas, almacenamiento y conexión al motor siguen pendientes.

Pruebas: `npm test -- tests/narrative.test.ts`. Verificación general: `npm run check`. Los casos cubren resultados, seis temas, repetibilidad, ausencia de mutaciones, límites, entradas inválidas e inyección de campos privados o hechos deportivos.
