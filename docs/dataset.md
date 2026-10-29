# Dataset real de CP2 (`cp2-real-v1`)

Refs #6. Reemplaza los clubes ficticios `cp2-synthetic-v1` del motor por ocho clubes reales de la Liga Profesional Argentina 2024.

## Fuente y cobertura

- Proveedor: API-Football, plan gratis. Cuenta verificada el 28/10/2026: 100 pedidos por día, temporadas 2022 a 2024 y hasta 3 páginas por consulta. La temporada actual no está disponible en el plan gratis.
- Liga 128, temporada 2024. Es la temporada más reciente accesible y la única de las ligas argentinas consultadas con estadísticas de jugadores completas; la Primera Nacional trae planteles pero no estadísticas por partido.
- La importación es única y se guarda; el juego nunca consulta al proveedor. `source.sourceHash` identifica el conjunto de jugadores importados.

## Clubes y niveles

| Nivel | Club | Fuerza objetivo |
|---|---|---|
| Bajo | Sarmiento | 48 |
| Bajo | Deportivo Riestra | 50 |
| Bajo | Barracas Central | 52 |
| Medio | Independiente | 58 |
| Medio | Racing | 60 |
| Medio | Vélez | 62 |
| Alto | Boca | 69 |
| Alto | River | 72 |

Los niveles los eligió el equipo para la demo. Las estadísticas 2024 ordenan River, Vélez, Racing, Boca, Independiente, Barracas, Riestra, Sarmiento: Boca queda como alto y Vélez como medio por decisión de diseño, no por los datos. Dentro de cada nivel, la fuerza objetivo sigue el orden de las estadísticas.

## Atributos

Cada jugador se compara, en percentiles, con los de su misma posición en los ocho clubes:

- Ataque: 70% producción ofensiva por 90 minutos (2 x goles + asistencias + 0,3 x tiros + 0,5 x pases clave) y 30% calificación del proveedor.
- Defensa: 70% acciones defensivas por 90 minutos (quites + intercepciones + 0,3 x duelos ganados) y 30% calificación.
- Arqueros: atajadas con 60% porcentaje de atajadas y 40% calificación; defensa con 50% y 50%; ataque fijo en 10. Los jugadores de campo tienen atajadas 10.
- Con menos de 900 minutos el valor se acerca proporcionalmente a 50, para que una muestra chica no genere extremos. Sin minutos, el jugador queda en 50.

Plantel: 18 jugadores por club (2 arqueros, 6 defensores, 6 mediocampistas, 4 delanteros), elegidos por minutos jugados. Independiente y Riestra tuvieron un solo arquero con minutos; el suplente es un arquero del plantel sin minutos, con valores 50.

Al cargar el dataset, el motor desplaza todos los atributos del club para que su once de referencia alcance la fuerza objetivo, igual que hacía con los clubes ficticios. Se conserva el orden interno del plantel; los valores absolutos son parámetros del juego, no una evaluación de los futbolistas.

## Cobertura de jugadores

El plan gratis devuelve como máximo 60 jugadores por club y se quedaban afuera titulares. El importador revisa quién jugó en 12 partidos entre estos clubes (tres por club, repartidos en la temporada) y pide por id las estadísticas de los que faltan. En la importación del 28/10/2026 se recuperaron así 41 jugadores, entre ellos Romero, Cavani, Arias y Quintero.

## Regenerar

Con `API_FOOTBALL_KEY` en `.env` (ignorado por Git):

```bash
node scripts/import-dataset.mjs
```

Las respuestas se guardan en `.cache/api-football/`, también ignorado; repetir la importación no consume cupo. La importación completa usa unos 80 pedidos.

## Límites

- Pendiente revisar las condiciones de uso de API-Football sobre la publicación de nombres en un repositorio público.
- Las partidas guardadas con `cp2-synthetic-v1` dejan de ser válidas (`UNSUPPORTED_GAME_VERSION`); la migración `20261028000100_dataset_real.sql` solo acepta el dataset real.
- No se usan escudos ni fotos.
