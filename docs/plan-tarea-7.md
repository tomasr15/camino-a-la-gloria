# Plan de la tarea #7: motor y progresión

Fecha: 26/10/2026. Entrega objetivo: 09/11/2026.
Issue: https://github.com/tomasr15/camino-a-la-gloria/issues/7
Estado: motor y persistencia implementados en la rama de trabajo; revisión previa al commit.

## Alcance acordado con Tomás

- Liga de 8 equipos, ida y vuelta: 14 jornadas, 4 partidos por jornada y 56 partidos por temporada.
- El usuario dirige un equipo de nivel bajo, elige once y táctica y avanza una jornada por vez.
- Se simulan también los encuentros de los demás equipos y se actualiza la tabla.
- Al terminar la temporada se evalúa al DT y se generan posibles ofertas.
- Tomás y el asistente preparan también los datos y el modelo necesarios, aunque originalmente correspondieran a Lucas; la incorporación posterior se coordinará mediante un formato común.
- La deuda técnica del issue #11 queda fuera de este trabajo, por decisión de Tomás.

## Reglas acordadas durante la conversación

### Datos y selección

- Comenzar con equipos y jugadores ficticios identificados como datos de prueba; incorporar luego datos reales verificados. Esto no satisface por sí solo el compromiso de datos reales de CP2.
- 18 jugadores por club: 2 arqueros, 6 defensores, 6 mediocampistas y 4 delanteros.
- Elegir once con arquero; formaciones 4-4-2 y 4-3-3.
- Atributos de ataque, defensa y atajadas de 1 a 100.
- Ataque del once: 60% del promedio de ataque de delanteros + 30% del de mediocampistas + 10% del de defensores.
- Defensa del once: 50% del promedio de defensa de defensores + 20% del de mediocampistas + 30% de atajadas del arquero.
- Formación 4-4-2: sin ajustes. Formación 4-3-3: ataque x1,05 y defensa x0,95.
- Táctica defensiva: ataque x0,85, defensa x1,15. Equilibrada: sin ajustes. Ofensiva: ataque x1,15, defensa x0,85.

### Goles y confianza

- Goles esperados: 1,3 x ataque propio / defensa rival, después de aplicar formación, táctica y confianza.
- Localía: multiplicar por 1,10 los goles esperados del local.
- Limitar los goles esperados finales al intervalo 0,2..3,5 por equipo; no es un límite del marcador.
- El marcador cuenta las ocasiones convertidas una sola vez. La cantidad de ocasiones se sortea con Poisson, usando la conversión automática media para conservar los goles esperados; su calibración de juego sigue pendiente.
- Confianza: últimos cinco partidos anteriores al encuentro; victoria +2 puntos porcentuales, empate 0 y derrota -2. Acotar suma entre -6% y +6% y aplicar a ataque y defensa.
- Confianza del equipo reiniciada al comenzar una temporada.
- Parámetros iniciales aceptados para probar: requieren evaluación del equilibrio mediante simulaciones antes de considerarlos calibrados.

### Reputación

- Reputación del DT: empieza en 20, limitada a 0..100.
- Rival más fuerte: ganar +3, empatar +1, perder -1.
- Rival parecido: ganar +2, empatar 0, perder -1.
- Rival más débil: ganar +1, empatar -1, perder -2.
- Diferencia de al menos 10 puntos entre las fuerzas de los onces de referencia determina rival más fuerte o débil.
- No añadir otro premio de reputación por rachas.
- Objetivo de club bajo: primeros 6; medio: primeros 4; alto: primeros 2.
- Cierre de temporada: cumplir objetivo +3; superarlo por dos puestos o más +5 total; incumplir -2. Aplicar una sola vez.

### Ofertas

- Generar al terminar las 14 jornadas, tras evaluar la temporada.
- Requisitos de reputación: clubes bajos 15, medios 30, altos 50.
- Hasta dos ofertas de clubes con vacante y nivel compatible; selección guardada para que recargar no cambie las ofertas.
- Vacantes vinculadas a clubes que terminan por debajo de su objetivo; selección reproducible de hasta dos candidatos elegibles.
- Elegir una oferta o quedarse. Conservar reputación, iniciar siguiente temporada con el plantel del club elegido y confianza cero.
- Ofertas de los otros siete clubes en esta demo. La progresión a otras ligas requiere incorporar esas competiciones.

### Mano a mano aprobado: resolución del motor

- La pantalla del minijuego es una tarea aparte, vinculada al #9. El #7 incluye generación, resolución, persistencia y pruebas de la ocasión; no incluye barra visual, botones ni animación.
- Dirección: izquierda, centro o derecha desde el punto de vista del pateador. El servidor fija y oculta la elección del arquero antes de recibir el disparo.
- Precisión de 0 a 100: centro del indicador 100, extremos 0, transición lineal. Recorrido inicial propuesto y aprobado de dos segundos, ajustable al probar la interfaz por separado.
- Probabilidad base de gol: 30% con precisión 0, 50% con 50 y 70% con 100, con interpolación lineal.
- Atributos: sumar 3 puntos porcentuales por cada 10 puntos de diferencia entre ataque del pateador y atajadas del arquero; diferencia negativa resta.
- Si el arquero elige la misma dirección que el disparo, restar 20 puntos porcentuales.
- Probabilidad final acotada a 10%..90%. Fórmula equivalente: clamp(0,30 + 0,004 * precision + 0,003 * (ataque - atajadas) - (mismaDireccion ? 0,20 : 0), 0,10, 0,90).
- Resolver con azar del servidor reproducible. Guardar entradas, versiones y desenlace; cada ocasión se resuelve una sola vez.
- El resultado final, puntos y reputación se confirman cuando terminan las jugadas pendientes.
- Estos parámetros son un punto de partida aceptado, pendiente de calibración con simulaciones. Los penales no forman parte de esta ampliación aprobada.
- Máximo de dos manos a mano controlables por partido, con posibilidad de cero o uno según las ocasiones generadas.
- El usuario puede elegir resolución automática. Dirección uniforme entre izquierda, centro y derecha; precisión igual al promedio de dos sorteos uniformes de 0 a 100. Queda pendiente la calibración.

### Niveles, tabla y rivales aprobados

- 3 clubes bajos (fuerza inicial objetivo 45..54), 3 medios (55..64) y 2 altos (65..74). Son rangos de fuerza del once de referencia, no límites de cada atributo individual.
- El usuario elige entre los tres clubes bajos; ofrecer perfiles ofensivo, defensivo y equilibrado.
- Valoración fija de club: promedio de ataque y defensa de su mejor once 4-4-2, sin táctica, confianza ni localía, guardado al inicio de temporada. Esa referencia determina dificultad del rival y reputación; la fuerza efectiva del partido usa el once real y sus ajustes.
- Tabla: puntos (victoria 3, empate 1, derrota 0), diferencia de gol, goles a favor, victorias y finalmente orden de sorteo persistido al iniciar la temporada. Mostrar explícitamente el criterio si se usa el sorteo.
- Once de la CPU: arquero por atajadas, defensores por defensa, mediocampistas por promedio de ataque y defensa, delanteros por ataque. Siempre posiciones y once válidos.
- CPU compara sus mejores onces válidos 4-4-2 y 4-3-3 mediante promedio de ataque y defensa con ajuste de formación. Elige el mayor; empate favorece 4-4-2.
- Táctica CPU si es al menos 10 puntos más débil: defensiva 50%, equilibrada 35%, ofensiva 15%.
- Si la diferencia de fuerza fija es menor que 10: defensiva 25%, equilibrada 50%, ofensiva 25%.
- Si es al menos 10 puntos más fuerte: defensiva 15%, equilibrada 35%, ofensiva 50%.
- Decisión de CPU persistida antes de resolver el encuentro, sin usar la táctica elegida por el usuario para contrarrestarla.
- Valores aprobados como punto de partida sujeto a pruebas de equilibrio.

## Decisiones resueltas para esta versión

- Planteles ficticios versionados; desempates estables por identificador del jugador.
- Sin lesiones, cansancio, sanciones ni sustituciones en la demo de este motor.
- Calendario circular de ida y vuelta; los clubes intercambian localía en la segunda vuelta.
- Se eligen hasta dos ocasiones del club del usuario para control manual. El resto se resuelve automáticamente y de forma reproducible.
- El estado del partido pendiente y las decisiones se guardan por versión. La API devuelve el siguiente evento, marcador parcial visible, tabla, calendario y ofertas.

## Por validar con el equipo

- Calibración de goles, dificultad y frecuencia de intervenciones con pruebas de juego.
- La interfaz del minijuego corresponde a la tarea #9. El valor de precisión llega desde esa interfaz; como cualquier dato del cliente, no es una prueba antifraude de habilidad.
- El dataset real comprometido para CP2 debe integrarse y verificarse por separado.

## Instrucción de Git del usuario

Cualquier commit debe hacerse con la identidad de Git de Tomás, verificada antes de commitear, y en una rama aparte de main. Tomás pidió aviso previo y commits atómicos. Aún no se hizo ningún commit.

## Orden de construcción

### 1. Datos y calendario

Definir un contrato de datos y preparar un dataset versionado con equipos y planteles. Generar calendario sin equipos repetidos en una jornada: cada pareja juega dos veces, alternando localía. Asegurar 7 encuentros como local y 7 como visitante para cada club.

Entregable: dataset identificado, contrato documentado y calendario completo validado.

### 2. Selección del equipo

Validar once jugadores distintos, pertenecientes al club, con arquero y posiciones compatibles con la formación. Calcular fuerza del equipo usando datos guardados; el cliente no suministra valores de fuerza ni marcadores.

Entregable: selección válida y cálculo documentado de ataque/defensa.

### 3. Simulación

Implementar una función de estado, decisiones y semilla que devuelva el resultado. Conservar versión del motor, versión del dataset, entradas y semilla para reproducirlo. Una semilla diferente corresponde a cada partido; los reintentos conservan la original. Definir también cómo eligen once y táctica los clubes controlados por el sistema.

Entregable: marcadores variables con reglas explicables y pruebas de repetibilidad.

### 4. Guardado y avance

Crear migraciones aditivas para resultados y progresión. Guardar por separado el progreso interno de las ocasiones y confirmar el resultado final de la jornada con sus efectos de manera atómica: o se confirman todos esos efectos, o no se aplica ninguno. La política de pausa y resolución automática está pendiente de acordar. Impedir resultados duplicados por carrera/partido y avances dobles por concurrencia. Verificar propietario y jornada esperada. Definir respuesta de reintento y manejo de decisiones diferentes para un partido ya confirmado.

Entregable: una jornada persistida, tabla actualizada y reintentos sin efectos duplicados.

### 5. Reputación y ofertas

Aplicar las reglas acordadas una sola vez. Evaluar el cierre de temporada y registrar ofertas válidas para esa carrera. Reutilizar la ruta existente de reputación cuando corresponda y preservar el límite 0..100.

Entregable: progresión visible y ofertas explicables, con pruebas de límites y duplicados.

### 6. Integración con la interfaz

Documentar solicitudes y respuestas para consultar plantel, calendario, tabla, resultado, reputación y ofertas, y para jugar una jornada. Acordar con Julián los datos que necesitan sus pantallas. La narrativa de Gemini consume después el resultado confirmado y corresponde al issue #8.

Entregable: flujo de demo completo accesible mediante el backend y contrato para frontend.

### 7. Verificación y revisión

- Mismas entradas, versiones y semilla producen el mismo resultado.
- Resultados válidos y frecuencias razonables en simulaciones de prueba; equipos fuertes ganan más a largo plazo, pero no siempre.
- Reintentos y solicitudes simultáneas no duplican partidos, puntos, reputación ni ofertas.
- Un fallo de persistencia no deja una jornada parcialmente aplicada.
- Un usuario no puede leer o modificar otra carrera ni imponer marcadores.
- Temporada completa: 14 jornadas y 56 resultados; posiciones y cierre consistentes.
- Evidencia reproducible, reglas documentadas y registro de asistencia en AI-DECISIONS.md.
- PR enlazada al #7 con revisión de otro integrante antes de considerar terminada la tarea.

## Estado del repositorio al preparar este plan

La copia local está en la rama revision/checkpoint-1-validacion y contiene una versión antigua de docs/gestion.md. El identificador vigente para motor y progresión es CP2-02 / issue #7. Antes de implementar se debe partir del main actualizado y conservar los documentos y cambios locales existentes.
