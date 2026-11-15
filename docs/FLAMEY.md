# Flamey: cómo funciona el asistente

Documento maestro del asistente de seguridad contra incendios de **Flame in Freefall**. Describe el código tal como está en el repositorio: de dónde salen los datos, cómo se interpretan, cómo se arma cada respuesta y qué parámetros se pueden mover.

## Índice

1. [Qué es Flamey](#1-qué-es-flamey)
2. [Mapa de archivos](#2-mapa-de-archivos)
3. [De dónde salen los datos](#3-de-dónde-salen-los-datos)
4. [Cuándo habla y cuándo espera](#4-cuándo-habla-y-cuándo-espera)
5. [Los dos motores de respuesta](#5-los-dos-motores-de-respuesta)
6. [Cómo entiende una pregunta](#6-cómo-entiende-una-pregunta)
7. [Motor de datos: cómo arma cada respuesta](#7-motor-de-datos-cómo-arma-cada-respuesta)
8. [Motor con modelo local (Ollama)](#8-motor-con-modelo-local-ollama)
9. [Simulador de materiales](#9-simulador-de-materiales)
10. [Voz](#10-voz)
11. [Parámetros que puedes mover](#11-parámetros-que-puedes-mover)
12. [Recetas rápidas](#12-recetas-rápidas)
13. [Limitaciones conocidas](#13-limitaciones-conocidas)

---

## 1. Qué es Flamey

Flamey es el panel flotante de la esquina inferior izquierda. Tiene dos pestañas:

- **Chat:** explica un experimento de la base PSI de la NASA evaluado en un entorno (ISS, base lunar, rover, Marte, traje EVA) y responde preguntas de seguimiento.
- **Simular:** dice si un material es seguro en una atmósfera que el usuario elige, con un semáforo, un puntaje de riesgo y una velocidad de llama.

Funciona de dos maneras:

- **Sin modelo ("Datos NASA"):** responde al instante con frases armadas por código a partir de los datos de la API. No inventa nada.
- **Con modelo local (Ollama):** un modelo redacta la respuesta con los mismos datos. Si el modelo falla, cae al modo sin modelo.

---

## 2. Mapa de archivos

| Archivo | Qué hace |
|---|---|
| `src/app/page.tsx` | Página principal. Carga entornos y hallazgos, y le pasa a Flamey el hallazgo seleccionado y el entorno activo. |
| `src/components/FlameyWidget.tsx` | Todo el asistente: interfaz, chat, detección de temas, motor de datos, simulador y tema claro/oscuro. |
| `src/components/FindingsDrawer.tsx` | Ranking de hallazgos. Su botón "Explicar con Flamey" es lo que dispara una explicación. |
| `src/lib/api.ts` | Cliente de la API emberwatch y sus tipos. |
| `src/lib/ollama.ts` | Conexión con Ollama: prompts, streaming y limpieza del texto del modelo. |
| `src/lib/voice.ts` | Lectura en voz alta: limpieza del texto para voz y reproducción. |
| `src/app/api/tts/route.ts` | Ruta del servidor que convierte texto en audio con Fish Audio. |

---

## 3. De dónde salen los datos

Toda la información viene de la API emberwatch (`NEXT_PUBLIC_API_URL`, por defecto `https://emberwatch-api.devcoreinc.com`).

### Flujo de carga

```
page.tsx
 ├─ api.meta()                → lista de entornos (clave, O₂, presión, gravedad...)
 ├─ api.findings(entorno)     → ranking de hallazgos para ese entorno
 └─ <FlameyWidget activeFinding={hallazgo} environmentKey={entorno} />

FlameyWidget.tsx
 ├─ api.findingContext(clave, entorno)   → contexto completo del hallazgo
 ├─ api.findingContext(clave, "eva")     → el mismo hallazgo en el traje (solo si se pregunta)
 └─ api.rules()                          → mitos y hechos ("¿Sabías que?")
```

### El contexto (`ContextOut`)

Es la pieza central. Lo devuelve `/api/findings/{clave}/context?environment=...` y Flamey usa estos campos:

| Campo | Para qué lo usa Flamey |
|---|---|
| `finding.experiment` | Nombre del experimento. |
| `finding.material` | Qué se quemó. Si viene vacío dice "una muestra de prueba". |
| `finding.observations` | Número de corridas del ensayo. |
| `finding.quality` | Calidad del dato (0 a 1), se muestra como porcentaje. |
| `finding.rpi` y `finding.band` | Puntaje de riesgo (de 100) y su nivel. |
| `finding.factors[]` | Cada factor trae `name`, `value`, `weight` y `contribution`. Se ordenan por `contribution` para saber la causa principal. |
| `finding.o2_min`, `o2_max`, `pressure_atm` | Condiciones en que se hizo el ensayo. |
| `finding.narrative` | Solo se extrae de aquí la velocidad de propagación (ver abajo). |
| `environment.label`, `o2_fraction`, `pressure_atm`, `gravity_g` | Atmósfera del entorno evaluado. |
| `environment.egress_s` | Segundos disponibles para evacuar. |
| `environment.key` | Para saber si ya se está en el traje (`"eva"`). |
| `evidence[]` | Registros PSI de respaldo (archivo, fila, calidad). |

Los campos `messages`, `response_schema` y `provider` que también devuelve la API **no se usan**: Flamey construye sus propios prompts.

### La velocidad de la llama

No hay un campo numérico para la velocidad. Se saca del texto del `narrative` con esta expresión:

```
/propagaci[oó]n de\s*([\d.,]+)\s*mm\/s/i
```

Es decir, busca la frase "propagación de 0.69 mm/s". Si la API cambia esa redacción, el tema de velocidad deja de aparecer.

---

## 4. Cuándo habla y cuándo espera

Flamey no arranca solo. La página (`page.tsx`) selecciona automáticamente el primer hallazgo cada vez que cambia el entorno, así que el widget tiene que distinguir "lo eligió la página" de "lo pidió la persona".

Lo decide así (`FlameyWidget.tsx`, efecto del experimento seleccionado):

- Guarda el momento del último clic o Enter en toda la ventana.
- Guarda el momento del último cambio de entorno.
- Un cambio de hallazgo cuenta como **pedido** solo si llega dentro de los `EXPLICIT_WINDOW_MS` (700 ms) posteriores a un clic, y ese clic ocurrió después del último cambio de entorno.

| Situación | Qué hace Flamey |
|---|---|
| Carga de la página | Carga el contexto en silencio y queda minimizado. |
| Cambio de entorno | Limpia el chat, carga el nuevo contexto y espera. |
| Clic en "Explicar con Flamey" o "Al azar" | Se abre, pasa a la pestaña Chat y explica de inmediato. |
| Abrir Flamey a mano | Muestra el experimento cargado y el botón "Explicar este experimento". |

Al cambiar de experimento o de entorno el chat siempre se limpia, para no mezclar datos de dos ensayos.

---

## 5. Los dos motores de respuesta

Toda respuesta del chat pasa por la función `generate` del widget. Este es su recorrido:

```
generate(contexto, pregunta, historial)
 │
 ├─ 1. Detecta el tema de la pregunta (detectIntent)
 ├─ 2. Calcula qué temas ya se tocaron (coveredIntents)
 ├─ 3. Si el tema es el traje → pide a la API el contexto en "eva"
 │
 ├─ 4. ¿Hay modelo local listo?
 │      ├─ NO  → responde el motor de datos
 │      └─ SÍ  → ¿el tema es de dato exacto?
 │               ├─ SÍ → responde el motor de datos
 │               └─ NO → responde el modelo
 │                        └─ si falla o devuelve vacío → motor de datos
 │
 └─ 5. Añade la respuesta al chat y, si la voz está activa, la lee
```

Los temas de **dato exacto** (constante `DATA_ONLY`) son `why`, `evidence`, `speed` y `conditions`. Se responden siempre desde los datos, aunque haya modelo, para que los números no se inventen.

El modelo solo redacta: la explicación inicial, la comparación con el traje, cómo se apaga, qué lo reemplaza y las preguntas libres.

---

## 6. Cómo entiende una pregunta

No hay comprensión de lenguaje en el modo sin modelo: se usan expresiones regulares (lista `INTENTS` en el widget). Se revisan en este orden y gana la primera que coincide.

| Tema | Palabras que lo activan | Botón sugerido |
|---|---|---|
| `suit` | eva, traje | ¿Y en un traje espacial? |
| `extinguish` | apag, extin, supres, sofoc | ¿Cómo se apaga? |
| `replace` | reempl, sustit, alternativ, otro material, qué material | ¿Qué lo reemplaza? |
| `evidence` | confiab, evidenc, fuente, corrida, calidad, cuántos datos, de dónde | ¿Es confiable? |
| `speed` | velocidad, rápid, avanza, propag | ¿Qué tan rápido avanza? |
| `conditions` | condicion, se probó, cómo se hizo, ensay, presión, gravedad, oxígeno | ¿Cómo se probó? |
| `why` | por qué, causa, razón, motivo, riesgo, peligro | ¿Por qué ese riesgo? |

### El "sí, por favor"

Cada respuesta termina ofreciendo un tema con una frase fija (campo `ask`). Si la persona contesta con una afirmación (`sí`, `claro`, `dale`, `ok`, `vale`, `bueno`, `por favor`, `de una`), Flamey busca cuál de esas frases aparece en su último mensaje y continúa ese tema.

Por eso las frases `ask` deben ser idénticas en `FlameyWidget.tsx` (`INTENTS`) y en `ollama.ts` (`TOPICS`) para los tres temas que comparten: traje, apagar y reemplazar.

### Los botones sugeridos

Los botones de pregunta se calculan en cada momento: muestran solo los temas disponibles que aún no se han tocado. Un tema no está disponible si:

- es `suit` y el entorno actual ya es el traje (`eva`);
- es `speed` y el `narrative` no trae velocidad.

La pregunta de cierre sigue el orden `ASK_ORDER`: `why`, `suit`, `replace`, `extinguish`, `evidence`, `speed`, `conditions`. Cuando no queda ninguno, la respuesta no termina en pregunta.

---

## 7. Motor de datos: cómo arma cada respuesta

Función `answerFromData` del widget. Recibe el contexto, el tema, los temas ya cubiertos y, si aplica, el contexto del traje.

### Cómo interpreta el riesgo

1. Ordena `finding.factors` de mayor a menor `contribution`.
2. Toma el nombre del primero como **causa principal**.
3. Traduce ese nombre con dos diccionarios:
   - `FACTOR_REASONS`: la causa en lenguaje sencillo.
   - `FACTOR_ACTIONS`: la acción recomendada.

| Factor | Causa que dice Flamey | Acción que recomienda |
|---|---|---|
| `o2_margin` | al material le falta muy poco para arder | materiales que no arden con tanto oxígeno (Nomex, PBI) |
| `o2_extrapolation` | hay más oxígeno del que se probó | materiales que no arden con tanto oxígeno (Nomex, PBI) |
| `pressure_extrapolation` | el ensayo se hizo con otra presión | probar con la presión real |
| `gravity_extrapolation` | el ensayo se hizo con otra gravedad | probar con la gravedad real |
| `soot_load` | la llama suelta mucho hollín y humo | detectores de humo más sensibles |
| `cool_flame` | pueden aparecer llamas frías, casi invisibles | sensores para llamas que no se ven |
| `evidence_weakness` | hay pocos datos y no son muy confiables | repetir el ensayo |
| `material_fit` | el material se parece a los que se usan en este entorno | cambiarlo por una tela que no arde |
| `egress_window` | la tripulación tendría poco tiempo para salir | extintor a mano y salida despejada |
| `measured_sustain` | la llama se mantuvo encendida sin apagarse sola | cortar el flujo de aire |
| `evidence_density` | el experimento se repitió pocas veces | repetir el ensayo |

Si el factor no está en el diccionario, usa una causa y una acción por defecto (`DEFAULT_REASON`, `DEFAULT_ACTION`).

### Qué dice en cada tema

| Tema | De qué datos sale |
|---|---|
| Explicación inicial | experimento, material, corridas, O₂ del entorno comparado con la Tierra (21%), RPI, banda, causa principal y acción. |
| `why` | los tres factores con mayor `contribution`, traducidos. |
| `suit` | contexto del traje pedido a la API: O₂ y presión del traje, RPI allí frente al RPI aquí. Si la diferencia supera 2 puntos dice dónde es más peligroso. Si la API falla, da una explicación general. |
| `extinguish` | texto fijo sobre ventilación y dilución con CO₂ o helio, más `egress_s` del entorno. |
| `replace` | texto fijo (Nomex, PBI, teflón) más la acción recomendada. |
| `evidence` | corridas, calidad y número de registros. Avisa de cautela si hay menos de 5 corridas o la calidad es menor al 60%. |
| `speed` | velocidad extraída del `narrative`, en mm/s y convertida a cm por minuto (se multiplica por 6). |
| `conditions` | `o2_min`, `o2_max` y `pressure_atm` del ensayo frente a los del entorno. Si el entorno supera el máximo ensayado, avisa que es una estimación. |
| No reconocido | dice que no tiene ese dato, recuerda el RPI y ofrece un tema. |

Dos detalles de interpretación:

- El oxígeno del ensayo se acepta como fracción (0.32) o porcentaje (32): `toPct` convierte lo que sea menor o igual a 1.
- Un `o2_max` de 0 o nulo se trata como "la base no registra el oxígeno del ensayo".

---

## 8. Motor con modelo local (Ollama)

Todo está en `src/lib/ollama.ts`. Las llamadas salen **desde el navegador** hacia `NEXT_PUBLIC_OLLAMA_URL` (por defecto `http://localhost:11434`).

### Ciclo de vida del modelo

| Paso | Función | Qué hace |
|---|---|---|
| Buscar modelos | `getOllamaModels` | `GET /api/tags`. Si falla o no hay ninguno, Flamey se queda en modo datos. |
| Elegir uno | `scanLocalModels` (widget) | Prefiere: uno con "qwen2.5", luego "1.5b" o "2b", luego "1b", luego el primero. |
| Precargar | `warmupOllamaModel` | Una llamada vacía con `keep_alive: "15m"` para dejarlo en memoria. |
| Descargar | `unloadOllamaModel` | `keep_alive: 0` al cambiar de modelo o volver al modo datos. |

Mientras el modelo carga, el punto de estado parpadea en ámbar y Flamey responde con el motor de datos.

### Cómo se arma el prompt del chat (`askOllamaStream`)

El código prepara casi todo y al modelo solo le queda redactar:

1. **Causa y acción:** se eligen por código con el factor de mayor `contribution`.
2. **Tema y dato clave:** si la pregunta es de traje, apagar o reemplazar, el código escribe un "DATO CLAVE" ya redactado con los números reales.
3. **Pregunta de cierre:** el código elige un tema no tocado y le pide al modelo que termine con esa frase exacta.
4. **Bloque de datos:** experimento, material, oxígeno del ensayo, velocidad, entorno, oxígeno comparado con la Tierra, gravedad, riesgo, causa y acción.
5. **Reglas de estilo (`STYLE_RULES`):** un párrafo, texto plano, frases cortas, unidades en palabras, solo los datos recibidos.

Todo eso va en el **mensaje de sistema**, para que los datos sigan presentes en cada turno. Como conversación solo se envían los **dos últimos mensajes** del historial más la pregunta actual; con más historial los modelos pequeños se repiten.

### Limpieza de lo que responde el modelo

| Mecanismo | Qué hace |
|---|---|
| `REFUSAL_PATTERN` | Si la respuesta empieza con "lo siento", "no puedo ayudar", "como modelo"..., se cancela y responde el motor de datos. |
| `tidy` | Quita markdown, listas, numeración y etiquetas como "Riesgo:" o "Primera frase:". |
| `closeSentence` | Si el texto quedó cortado por el límite de tokens, lo recorta a la última frase completa. |
| Respuesta vacía | El widget usa el motor de datos. |

> **Nota de versión.** El `ollama.ts` que está en el repositorio usa `NUM_PREDICT = 260` y confía en el prompt para la longitud. Existe una versión posterior, entregada por chat y aún no aplicada, que impone el límite por código (corte a 3 frases, eliminación de frases tipo "consulta a la NASA" y pregunta de cierre añadida por código). Si las respuestas del modelo salen largas o inventan fuentes, esa es la versión a aplicar.

---

## 9. Simulador de materiales

La pestaña **Simular** no consulta la API: calcula todo en el navegador con la función `computeSimulationPhysics` del widget.

### Entradas

- **Entorno:** uno de `ENV_PRESETS` (ISS, Luna, Rover, Marte, EVA) o una mezcla personalizada con los controles de oxígeno (21 a 100%), presión (4,3 a 14,7 psi) y gravedad (0, 0,165, 0,38 o 1 g).
- **Material:** uno de `MATERIAL_PRESETS` o un nombre libre. Cada preset tiene un `loi` (índice límite de oxígeno, el porcentaje de O₂ a partir del cual mantiene la llama) y un `baseSpread` (velocidad base en mm/s).

| Material | LOI | Velocidad base | Apto para traje |
|---|---|---|---|
| Algodón | 19 | 1,4 | no |
| Espuma PU | 17 | 2,1 | no |
| Acrílico | 18 | 0,9 | no |
| Nylon | 24 | 0,85 | no |
| Silicona | 30 | 0,55 | no |
| Teflón PTFE | 95 | 0,12 | sí |
| Nomex EVA | 36 | 0,08 | sí |

### Fórmulas

**Puntaje de riesgo (8 a 99):**

```
ppO2     = (O2% / 100) × presión_psi
margen   = LOI − O2%
riesgo   = 52 − margen × 1,45 + (ppO2 − 3,09) × 9,5 + max(0, O2% − 21) × 0,85 × 0,35
```

El 3,09 es la presión parcial de oxígeno a nivel del mar en psi (21% de 14,7).

Excepción: si el material es apto para traje, el oxígeno es 100% y la presión es de 4,5 psi o menos, el riesgo se fija en 18 (teflón) o 26 (Nomex).

**Velocidad de la llama (mínimo 0,05 mm/s):**

```
velocidad = base × (O2% / 21)^1,35 × √(presión_psi / 14,7) × factor_gravedad

factor_gravedad = 1,15            si gravedad = 0 y O2% > 30
                = 0,82            si gravedad = 0 y O2% ≤ 30
                = 0,95 + g × 0,25 en cualquier otro caso
```

**Veredicto:**

| Riesgo | Veredicto | Semáforo |
|---|---|---|
| 65 o más | PROHIBIDO | rojo, "No usar aquí" |
| 36 a 64 | RESTRINGIDO | ámbar, "Usar con cuidado" |
| menos de 36 | APROBADO | verde, "Seguro" |

Un material escrito a mano usa el LOI y la velocidad base del preset que esté seleccionado en el desplegable; solo cambia el nombre.

### La explicación

- **Sin modelo:** `buildFallbackSimulationReport` arma tres frases con el semáforo, la atmósfera, la velocidad y la nota del material.
- **Con modelo:** `askMaterialSimulationStream` le pasa el resultado ya decidido y le pide explicarlo sin cambiarlo. Hay una espera de 850 ms tras el último cambio de controles antes de llamar al modelo.

---

## 10. Voz

Archivo `src/lib/voice.ts`. La voz se activa con el icono del altavoz en la cabecera; también hay un botón para escuchar la última respuesta.

### Recorrido de un texto

```
speakText(texto)
 ├─ sanitizeTextForSpeech   → convierte símbolos en palabras
 ├─ POST /api/tts           → Fish Audio devuelve un MP3
 │    └─ si falla → voz del navegador (speechSynthesis) en español
 └─ reproduce el audio
```

### Qué convierte la limpieza para voz

| En pantalla | Lo que se lee |
|---|---|
| `O₂`, `CO₂`, `N₂` | oxígeno, dióxido de carbono, nitrógeno |
| `0,56 atm` | 0 coma 56 atmósferas |
| `8.2 psi` | 8 coma 2 libras por pulgada cuadrada |
| `32%` | 32 por ciento |
| `0.69 mm/s` | 0 coma 69 milímetros por segundo |
| `µg` | microgravedad |

Por eso el motor de datos puede escribir con símbolos en pantalla: la voz los traduce sola.

`PRONUNCIATION_FIXES` corrige palabras que la voz pronuncia mal; hoy solo "atmósfera", que se separa en "at mósfera".

### El servicio de voz

`src/app/api/tts/route.ts` llama a Fish Audio con la clave `FISH_AUDIO_API_KEY` de `.env.local`, el modelo `s2.1-pro-free` y una voz de referencia fija (`JARVIS_REFERENCE_ID`). Si falta la clave, la ruta responde con error y el navegador usa su propia voz.

En el simulador sin modelo no se lee el texto de pantalla sino un resumen propio, `speakSimulationVerdict`.

---

## 11. Parámetros que puedes mover

### Variables de entorno (`.env.local`)

| Variable | Valor por defecto | Para qué |
|---|---|---|
| `NEXT_PUBLIC_API_URL` | `https://emberwatch-api.devcoreinc.com` | Dirección de la API de datos. |
| `NEXT_PUBLIC_OLLAMA_URL` | `http://localhost:11434` | Dirección de Ollama. |
| `FISH_AUDIO_API_KEY` | (sin valor) | Clave de Fish Audio para la voz. |

### En `src/lib/ollama.ts`

| Parámetro | Valor actual | Qué pasa si lo cambias |
|---|---|---|
| `NUM_CTX` | 2048 | Tamaño del contexto. Si lo cambias, Ollama recarga el modelo; debe ser igual en precarga y chat. |
| `NUM_PREDICT` | 260 | Tope de tokens por respuesta. Más bajo = respuestas más cortas, con riesgo de corte. |
| `temperature` | 0.2 | Más alto = más variado y más propenso a inventar. |
| `repeat_penalty` | 1.2 | Más alto = se repite menos, pero puede sonar forzado. |
| `repeat_last_n` | 256 | Cuántos tokens hacia atrás mira para no repetirse. |
| `keep_alive` | `"15m"` | Tiempo que el modelo queda en memoria sin uso. |
| `STYLE_RULES` | texto | Reglas de tono y formato para el modelo. |
| `FACTOR_REASONS`, `FACTOR_ACTIONS` | diccionarios | Causa y acción que se le pasan al modelo. |
| `TOPICS` | 3 temas | Temas con dato clave y pregunta de cierre. |
| `REFUSAL_PATTERN` | regex | Inicios de respuesta que se consideran negativa. |
| `LABEL_PATTERN` | regex | Etiquetas que se borran del texto del modelo. |
| `past.slice(-2)` | 2 mensajes | Cuánto historial ve el modelo. |

### En `src/components/FlameyWidget.tsx`

| Parámetro | Valor actual | Qué pasa si lo cambias |
|---|---|---|
| `EXPLICIT_WINDOW_MS` | 700 | Ventana tras un clic para considerar "pedido" un cambio de experimento. |
| `HISTORY_TURNS` | 6 | Mensajes que el widget envía a `ollama.ts` (que luego usa solo 2). |
| `SUIT_ENV_KEY` | `"eva"` | Clave del entorno del traje en la API. |
| `EARTH_O2_PCT` | 21 | Referencia para "X puntos más que en la Tierra". |
| `INTENTS` | 7 temas | Palabras que activan cada tema, pregunta de cierre y texto del botón. |
| `ASK_ORDER` | lista | Orden en que se ofrecen los temas y aparecen los botones. |
| `DATA_ONLY` | 4 temas | Temas que nunca van al modelo. |
| `FACTOR_REASONS`, `FACTOR_ACTIONS` | diccionarios | Causa y acción en el modo sin modelo. |
| `MATERIAL_PRESETS` | 7 materiales | Materiales del simulador, con su LOI y velocidad base. |
| `ENV_PRESETS` | 5 entornos | Atmósferas del simulador. |
| Umbrales 65 y 36 | en `computeSimulationPhysics` | Límites de PROHIBIDO y RESTRINGIDO. |
| Espera de 850 ms | efecto del simulador | Pausa antes de pedir explicación al modelo. |
| `THEMES` | claro y oscuro | Colores del widget en cada tema. |
| `useState(false)` en `open` | minimizado | Cámbialo a `true` para que arranque abierto. |
| `max-h-[70vh] w-[320px]` | en el `<aside>` | Tamaño del panel. |

### En `src/lib/voice.ts` y `src/app/api/tts/route.ts`

| Parámetro | Valor actual | Para qué |
|---|---|---|
| `DEFAULT_RATE` | 1.0 | Velocidad de lectura. |
| `PRONUNCIATION_FIXES` | 1 regla | Palabras que la voz pronuncia mal. |
| `JARVIS_REFERENCE_ID` | id fijo | Voz de Fish Audio que se usa. |
| Cabecera `model` | `s2.1-pro-free` | Modelo de voz de Fish Audio. |

---

## 12. Recetas rápidas

### Añadir un tema nuevo al chat sin modelo

1. Añade su identificador al tipo `IntentId`.
2. Añade una entrada en `INTENTS` con `match`, `ask` y `chip`. Recuerda que el orden decide quién gana.
3. Añádelo a `ASK_ORDER` donde quieras que se ofrezca.
4. Añade un `case` en `answerFromData` que arme la frase con los datos.
5. Si es un dato exacto, añádelo a `DATA_ONLY`.

### Cambiar lo que dice sobre un factor

Edita la frase en `FACTOR_REASONS` y `FACTOR_ACTIONS`, **en los dos archivos** (`FlameyWidget.tsx` y `ollama.ts`). Están duplicados.

### Añadir un factor nuevo de la API

Añade su nombre a los dos diccionarios en los dos archivos. Mientras no esté, Flamey usa la causa y la acción por defecto.

### Añadir un material al simulador

Añade un objeto a `MATERIAL_PRESETS` con `id`, `shortName`, `name`, `category`, `loi`, `evaRated`, `baseSpread` y `note`.

### Hacer más estricto o más permisivo el semáforo

Cambia los umbrales `65` y `36` en `computeSimulationPhysics`.

### Evitar que elija un modelo de programación

En `scanLocalModels`, cambia la primera preferencia por:

```tsx
list.find((m) => m.includes("qwen2.5") && !m.includes("coder")) ||
```

### Forzar el modo sin modelo para una demo

En el icono de ajustes del widget elige "Datos NASA (sin modelo)". Es la opción más segura: solo dice lo que está en la API.

---

## 13. Limitaciones conocidas

- **Diccionarios duplicados.** `FACTOR_REASONS`, `FACTOR_ACTIONS` y las frases de cierre de traje, apagar y reemplazar existen en `FlameyWidget.tsx` y en `ollama.ts`. Si se cambian en un solo sitio, el "sí, por favor" puede dejar de reconocerse.
- **Las frases de los factores son una interpretación.** Se redactaron a partir del nombre de cada factor, no de la documentación de la API. Conviene revisarlas contra el significado real en el backend.
- **La velocidad depende de una frase.** Se extrae del `narrative` por expresión regular.
- **La clave del traje es fija.** `"eva"` está escrita en el widget y en `ollama.ts`.
- **La detección de "pedido" es una heurística.** Si se pulsa "Explicar con Flamey" sobre el mismo hallazgo que la página ya había seleccionado por defecto, la propiedad no cambia y el widget no se entera. La solución de fondo es que `page.tsx` no seleccione `list[0]` automáticamente.
- **El simulador usa un modelo propio.** No llama a `/api/lab/simulate`, aunque el cliente `api.simulate` existe. Sus números no provienen de los datos PSI.
- **Los entornos del simulador no coinciden con los de la API.** Según lo que mostró la interfaz, la API evalúa Marte con 34% de O₂ a 0,56 atm y el rover con 0,38 g, mientras que `ENV_PRESETS` tiene Marte con 21% a 14,7 psi y el rover con 0,165 g.
- **El modo sin modelo no entiende lenguaje libre.** Solo reconoce las palabras de la tabla de temas.
- **Los modelos pequeños inventan.** Aun con los datos en el prompt, un modelo de 1B a 3B puede añadir cifras falsas. El recorte por código (versión pendiente de `ollama.ts`) lo reduce pero no lo elimina.
- **Ollama se llama desde el navegador.** Funciona en local; en un sitio desplegado el navegador del visitante tendría que alcanzar su propio Ollama y este tendría que aceptar ese origen.
- **Interfaz solo en español.** El conmutador ES/EN de la página no afecta a los textos de Flamey.
