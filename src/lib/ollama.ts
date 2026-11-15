import { ContextOut } from "./api";

const OLLAMA_URL = (
  process.env.NEXT_PUBLIC_OLLAMA_URL || "http://localhost:11434"
).replace(/\/$/, "");

// Mismo contexto en warmup y chat: si cambia, Ollama recarga el modelo.
const NUM_CTX = 2048;

// Límites duros de longitud: los impone el código, no el modelo.
const CHAT_MAX_SENTENCES = 3;
const SIM_MAX_SENTENCES = 3;
const CHAT_NUM_PREDICT = 200;
const SIM_NUM_PREDICT = 150;

const REFUSAL_PATTERN =
  /^(lo siento|disculpa|no puedo proporcionar|no puedo ayudar|como modelo|como asistente|i'?m sorry|i cannot|i can'?t)/i;

// Frases que mandan a buscar en otra parte: se eliminan de la respuesta.
const DEFLECTION_PATTERN =
  /consult(a|ar|es|e)\b|informaci[oó]n oficial|recursos (educativos|disponibles|en l[ií]nea)|sitio web|p[aá]gina (web|oficial)|en l[ií]nea|online|busca(r)? (en|m[aá]s)|te recomiendo (visitar|buscar|leer)|puedes (visitar|buscar|investigar)/i;

export interface SimulationInput {
  materialName: string;
  materialCategory: string;
  loiPercent: number;
  o2Percent: number;
  pressurePsi: number;
  gravityG: number;
  environmentName: string;
  verdict: "APROBADO" | "RESTRINGIDO" | "PROHIBIDO";
  riskScore: number;
  spreadMmPerSec: number;
  userNote?: string;
}

export type ChatTurn = { role: "user" | "assistant"; content: string };

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

const PSI_PER_ATM = 14.696;
const EARTH_O2_PCT = 21;

const round = (n: number, d = 2): number => Number(n.toFixed(d));

/** Número con coma decimal, como se escribe y se lee en español. */
const es = (n: number, d = 2): string => String(round(n, d)).replace(".", ",");

function gravityLabel(g: number): string {
  if (g === 0) return "microgravedad, casi sin peso";
  if (g === 1) return "gravedad igual a la de la Tierra";
  return `gravedad parcial, ${es(g)} veces la de la Tierra`;
}

function trafficLight(verdict: SimulationInput["verdict"]): string {
  if (verdict === "PROHIBIDO") return "rojo";
  if (verdict === "RESTRINGIDO") return "ámbar";
  return "verde";
}

/** Compara el oxígeno del entorno con el de la Tierra, ya resuelto en palabras. */
function o2VersusEarth(o2Pct: number): string {
  const diff = o2Pct - EARTH_O2_PCT;
  if (diff >= 2) return `${diff} puntos más que en la Tierra`;
  if (diff <= -2) return `${Math.abs(diff)} puntos menos que en la Tierra`;
  return "igual que en la Tierra";
}

/** Cada factor del RPI explicado como una causa completa y fácil de entender. */
const FACTOR_REASONS: Record<string, string> = {
  o2_margin: "con este oxígeno al material le falta muy poco para arder",
  o2_extrapolation:
    "aquí hay más oxígeno del que se probó, y con más oxígeno la llama avanza más rápido",
  pressure_extrapolation:
    "el ensayo se hizo con otra presión, así que no sabemos bien cómo se comportará la llama aquí",
  gravity_extrapolation:
    "el ensayo se hizo con otra gravedad, así que no sabemos bien cómo se moverá la llama aquí",
  soot_load: "la llama suelta mucho hollín y humo, que es peligroso respirar",
  cool_flame: "pueden aparecer llamas frías, casi invisibles y difíciles de detectar",
  evidence_weakness: "hay pocos datos y no son muy confiables",
  material_fit: "este material se parece mucho a los que se usan en este entorno",
  egress_window: "la tripulación tendría muy poco tiempo para salir",
  measured_sustain: "en el ensayo la llama se mantuvo encendida sin apagarse sola",
  evidence_density: "el experimento se repitió pocas veces",
};

/** Una sola acción concreta, elegida según la causa principal. */
const FACTOR_ACTIONS: Record<string, string> = {
  o2_margin: "usar solo materiales que no arden con tanto oxígeno, como Nomex o PBI",
  o2_extrapolation: "usar solo materiales que no arden con tanto oxígeno, como Nomex o PBI",
  pressure_extrapolation: "probar el material con la presión real antes de usarlo",
  gravity_extrapolation: "probar el material con la gravedad real antes de usarlo",
  soot_load: "instalar detectores de humo más sensibles",
  cool_flame: "instalar sensores que detecten llamas que no se ven",
  evidence_weakness: "repetir el ensayo antes de confiar en este material",
  material_fit: "cambiarlo por una tela que no arde, como Nomex o PBI",
  egress_window: "tener un extintor a mano y la salida siempre despejada",
  measured_sustain: "cortar el flujo de aire para que la llama se apague",
  evidence_density: "repetir el ensayo antes de confiar en este material",
};

const DEFAULT_ACTION = "cambiarlo por una tela que no arde, como Nomex o PBI";

/** Temas que Flamey sabe continuar. Cada uno trae su pregunta de cierre. */
const TOPICS = [
  {
    id: "suit",
    match: /\beva\b|traje/i,
    ask: "¿Quieres compararlo con lo que pasaría dentro de un traje espacial?",
  },
  {
    id: "extinguish",
    match: /apag|extin|supres|sofoc/i,
    ask: "¿Quieres saber cómo se apagaría esta llama sin gravedad?",
  },
  {
    id: "replace",
    match: /reempl|sustit|alternativ|otro material|qu[eé] material/i,
    ask: "¿Quieres saber qué material podría reemplazarlo?",
  },
] as const;

type TopicId = (typeof TOPICS)[number]["id"];

const AFFIRMATIVE = /^\s*(s[ií]|claro|dale|ok|okay|vale|bueno|por favor|de una)\b/i;

/** Detecta de qué tema habla la persona. Un "sí" responde a la última pregunta de Flamey. */
function resolveTopic(text: string, previousAssistant?: string): TopicId | null {
  const direct = TOPICS.find((t) => t.match.test(text));
  if (direct) return direct.id;
  if (AFFIRMATIVE.test(text) && previousAssistant) {
    const offered = TOPICS.find((t) => previousAssistant.includes(t.ask));
    if (offered) return offered.id;
  }
  return null;
}

/** Saca la velocidad de propagación del registro técnico, si viene. */
function spreadFromNarrative(narrative: string): string | null {
  const m = narrative.match(/propagaci[oó]n de\s*([\d.,]+)\s*mm\/s/i);
  return m ? m[1].replace(".", ",") : null;
}

/** Acepta O2 como fracción (0.32) o como porcentaje (32). */
const toPct = (v: number): number => Math.round(v <= 1 ? v * 100 : v);

// Etiquetas que un modelo pequeño tiende a colar al inicio de las frases.
const LABEL_PATTERN =
  /(^|\n|[.!?]\s+)\s*(?:(?:primera|segunda|tercera|cuarta|[uú]ltima)\s+frase|qu[eé]\s+vimos|riesgo|qu[eé]\s+hacer|veredicto|por\s+qu[eé]|alternativa|respuesta|raz[oó]n|motivo(?:\s+principal)?|consejo|dato\s+clave|pregunta(?:\s+final)?|cierre)\s*:\s*/gi;

/** Deja texto plano en un solo párrafo: sin markdown, sin listas y sin etiquetas. */
function tidy(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, "")
    .replace(/\*\*/g, "")
    .replace(/\*/g, "")
    .replace(/["“”]/g, "")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^\s*[-•]\s+/gm, "")
    .replace(/^\s*\d+[.)]\s+/gm, "")
    .replace(LABEL_PATTERN, "$1")
    .replace(/\s*\n+\s*/g, " ")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

/**
 * Parte el texto en frases completas y deja aparte lo que aún no termina.
 * Un punto solo cierra frase si le sigue un espacio o el final (respeta "7.16").
 */
function splitSentences(text: string): { done: string[]; tail: string } {
  const done: string[] = [];
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    if (!/[.!?…]/.test(text[i])) continue;
    const next = text[i + 1];
    if (next === undefined || /\s/.test(next)) {
      const sentence = text.slice(start, i + 1).trim();
      if (sentence) done.push(sentence);
      start = i + 1;
    }
  }
  return { done, tail: text.slice(start).trim() };
}

/**
 * Da forma a la respuesta: máximo de frases, sin frases que manden a
 * buscar en otra parte y sin preguntas escritas por el modelo.
 */
function shapeReply(
  raw: string,
  maxSentences: number
): { text: string; complete: boolean } {
  const { done, tail } = splitSentences(tidy(raw));

  const kept = done
    .filter((s) => !DEFLECTION_PATTERN.test(s))
    .filter((s) => !/\?$/.test(s))
    .slice(0, maxSentences);

  const reachedLimit = kept.length >= maxSentences;
  const showTail =
    !reachedLimit && tail && !DEFLECTION_PATTERN.test(tail) ? ` ${tail}` : "";

  return {
    text: `${kept.join(" ")}${showTail}`.trim(),
    // Ya hay suficientes frases y el modelo empezó otra: se puede cortar.
    complete: reachedLimit && (tail.length > 0 || done.length > maxSentences),
  };
}

/** Si la respuesta quedó a medias, la deja terminar en frase completa. */
function closeSentence(text: string): string {
  const t = text.trimEnd();
  if (!t || /[.!?…]$/.test(t)) return t;
  const { done } = splitSentences(t);
  return done.length > 0 ? done.join(" ") : `${t}.`;
}

const STYLE_RULES = `REGLAS (obligatorias):
- Máximo 3 frases, en un solo párrafo. Nada de títulos, etiquetas, listas, comillas ni frases que empiecen con una palabra y dos puntos.
- Solo texto plano: sin asteriscos, sin almohadillas, sin emojis.
- Sencillo pero técnico: usa los números de los datos (oxígeno, presión, velocidad de la llama, nivel de riesgo) y explica qué significan.
- Escribe las unidades con palabras: por ciento, atmósferas, milímetros por segundo.
- Usa SOLO los datos que recibes. No inventes números, temperaturas, materiales ni nombres.
- Nunca mandes a consultar a la NASA ni a ninguna otra fuente. No hagas preguntas.
- Ve directo al dato: no expliques qué es un semáforo ni repitas la pregunta.`;

/* ------------------------------------------------------------------ */
/*  Gestión del modelo                                                 */
/* ------------------------------------------------------------------ */

export async function getOllamaModels(): Promise<string[]> {
  try {
    const res = await fetch(`${OLLAMA_URL}/api/tags`, { cache: "no-store" });
    if (!res.ok) return [];
    const data = await res.json();
    return (data.models || []).map((m: { name: string }) => m.name);
  } catch {
    return [];
  }
}

export async function unloadOllamaModel(model: string): Promise<void> {
  if (!model) return;
  try {
    await fetch(`${OLLAMA_URL}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model, keep_alive: 0 }),
    });
  } catch {
    // Ignorar si ya estaba descargado
  }
}

export async function warmupOllamaModel(
  model: string,
  signal?: AbortSignal
): Promise<boolean> {
  try {
    const res = await fetch(`${OLLAMA_URL}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal,
      body: JSON.stringify({
        model,
        prompt: "",
        stream: false,
        keep_alive: "15m",
        options: { num_ctx: NUM_CTX },
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/* ------------------------------------------------------------------ */
/*  Streaming                                                          */
/* ------------------------------------------------------------------ */

async function streamChatCompletion(params: {
  model: string;
  systemPrompt: string;
  turns: ChatTurn[];
  /** Tope de frases: al alcanzarlo se deja de leer al modelo. */
  maxSentences: number;
  numPredict: number;
  /** Texto que el código añade al final (la pregunta de cierre). */
  suffix?: string;
  onToken: (partialText: string) => void;
  signal?: AbortSignal;
}): Promise<void> {
  const {
    model,
    systemPrompt,
    turns,
    maxSentences,
    numPredict,
    suffix,
    onToken,
    signal,
  } = params;

  const res = await fetch(`${OLLAMA_URL}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal,
    body: JSON.stringify({
      model,
      stream: true,
      keep_alive: "15m",
      options: {
        temperature: 0.1,
        repeat_penalty: 1.2,
        repeat_last_n: 256,
        num_ctx: NUM_CTX,
        num_predict: numPredict,
      },
      messages: [{ role: "system", content: systemPrompt }, ...turns],
    }),
  });

  if (!res.ok || !res.body) {
    throw new Error(`Ollama HTTP ${res.status}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let accumulated = "";
  let buffer = "";
  let verifiedSafeStart = false;
  let enough = false;

  const handleLine = (line: string) => {
    if (!line.trim() || enough) return;

    let json: { message?: { content?: string }; done?: boolean };
    try {
      json = JSON.parse(line);
    } catch {
      return; // línea incompleta o ruido
    }

    if (!json.message?.content) return;
    accumulated += json.message.content;
    const trimmed = accumulated.trimStart();

    if (!verifiedSafeStart) {
      if (REFUSAL_PATTERN.test(trimmed)) {
        throw new Error("REFUSAL_FALLBACK");
      }
      if (trimmed.length < 22 && !json.done) return;
      verifiedSafeStart = true;
    }

    const shaped = shapeReply(accumulated, maxSentences);
    if (shaped.text) onToken(shaped.text);
    if (shaped.complete) enough = true;
  };

  try {
    while (!enough) {
      const { done, value } = await reader.read();
      if (done) break;

      // Una línea JSON puede llegar partida entre dos chunks: se acumula en buffer.
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) handleLine(line);
    }
    if (!enough && buffer.trim()) handleLine(buffer);
  } finally {
    // Corta la generación en Ollama si ya hay suficiente o hubo un error.
    reader.cancel().catch(() => {});
  }

  // Entrega final: frases completas, con la pregunta de cierre que pone el código.
  const body = closeSentence(shapeReply(accumulated, maxSentences).text);
  if (body) {
    onToken(suffix ? `${body} ${suffix}` : body);
  }
}

/* ------------------------------------------------------------------ */
/*  Interpretar un hallazgo de la base de datos                        */
/* ------------------------------------------------------------------ */

export async function askOllamaStream(params: {
  model: string;
  context: ContextOut;
  userQuestion?: string;
  /** Mensajes anteriores del chat, para mantener el hilo. */
  history?: ChatTurn[];
  /** El mismo experimento evaluado en el traje espacial, si se pidió comparar. */
  suitContext?: ContextOut;
  onToken: (partialText: string) => void;
  signal?: AbortSignal;
}): Promise<void> {
  const { model, context, userQuestion, history, suitContext, onToken, signal } =
    params;
  const { finding, environment } = context;

  const o2Pct = Math.round(environment.o2_fraction * 100);
  const past = (history || []).filter((t) => t.content.trim());

  // La causa que más puntos aporta decide la razón y la acción.
  const topFactor = [...(finding.factors || [])].sort(
    (a, b) => b.contribution - a.contribution
  )[0]?.name;

  const reason =
    (topFactor && FACTOR_REASONS[topFactor]) ||
    "con más oxígeno los materiales arden con más facilidad";
  const action = (topFactor && FACTOR_ACTIONS[topFactor]) || DEFAULT_ACTION;

  /* ---- De qué se habla ahora y qué temas ya se tocaron ---- */

  const lastAssistant = [...past].reverse().find((t) => t.role === "assistant");
  const topic = userQuestion
    ? resolveTopic(userQuestion, lastAssistant?.content)
    : null;

  const covered = new Set<TopicId>();
  past.forEach((turn, i) => {
    if (turn.role !== "user") return;
    const prev = past[i - 1]?.role === "assistant" ? past[i - 1].content : undefined;
    const found = resolveTopic(turn.content, prev);
    if (found) covered.add(found);
  });
  if (topic) covered.add(topic);
  if (environment.key === "eva") covered.add("suit");

  // Pregunta de cierre: un tema que todavía no se haya tocado. La añade el código.
  const followUp = TOPICS.find((t) => !covered.has(t.id))?.ask || "";

  /* ---- Dato clave para responder, ya resuelto en código ---- */

  let keyFact = "";
  if (topic === "suit") {
    if (suitContext) {
      const suit = suitContext.finding;
      const suitO2 = Math.round(suitContext.environment.o2_fraction * 100);
      const suitSpread = spreadFromNarrative(suit.narrative || "");
      const delta = suit.rpi - finding.rpi;
      keyFact = `Dentro del traje espacial el aire tiene ${suitO2} por ciento de oxígeno a ${es(
        suitContext.environment.pressure_atm
      )} atmósferas. Para este mismo experimento el riesgo allí es ${suit.rpi} de 100, nivel ${
        suit.band
      }; en ${environment.label} es ${finding.rpi} de 100. ${
        delta > 2
          ? "Es decir, en el traje es más peligroso."
          : delta < -2
          ? "Es decir, en el traje el riesgo calculado es menor."
          : "Es decir, el riesgo es parecido en los dos sitios."
      }${
        suitSpread
          ? ` En el traje la llama avanzaría a unos ${suitSpread} milímetros por segundo.`
          : ""
      }`;
    } else {
      keyFact =
        "Dentro de un traje espacial el aire es oxígeno puro, 100 por ciento, a baja presión. Con oxígeno puro casi cualquier material arde más rápido, por eso los trajes solo usan telas que no arden.";
    }
  } else if (topic === "extinguish") {
    keyFact = `Sin gravedad el aire caliente no sube, así que la llama depende del aire que le llega. Primero se corta la ventilación y luego se diluye el aire con dióxido de carbono o helio, como probó el experimento FLEX. La tripulación tendría unos ${environment.egress_s} segundos para salir.`;
  } else if (topic === "replace") {
    keyFact =
      "Materiales que no arden y ya se usan en misiones: Nomex y PBI para telas, y teflón para aislar cables.";
  }

  /* ---- Datos del experimento ---- */

  const testedLines: string[] = [];
  if (finding.o2_max != null && finding.o2_max > 0) {
    const lo = toPct(finding.o2_min ?? finding.o2_max);
    const hi = toPct(finding.o2_max);
    testedLines.push(
      lo === hi
        ? `Oxígeno usado en el ensayo: ${hi} por ciento`
        : `Oxígeno usado en el ensayo: de ${lo} a ${hi} por ciento`
    );
  }
  const spread = spreadFromNarrative(finding.narrative || "");
  if (spread) {
    testedLines.push(
      `Velocidad estimada de la llama en este entorno: ${spread} milímetros por segundo`
    );
  }

  const dataBlock = `DATOS DEL EXPERIMENTO (es todo lo que sabes)
Experimento: ${finding.experiment}
Material que se quemó: ${finding.material || "una muestra de prueba"}
Corridas del ensayo: ${finding.observations}
${testedLines.join("\n")}
Entorno que se evalúa: ${environment.label}
Oxígeno en ese entorno: ${o2Pct} por ciento, ${o2VersusEarth(o2Pct)}
Presión en ese entorno: ${es(environment.pressure_atm)} atmósferas
Gravedad en ese entorno: ${gravityLabel(environment.gravity_g)}
Nivel de riesgo: ${finding.band}, ${finding.rpi} de 100
Causa principal del riesgo: ${reason}
Acción recomendada: ${action}`.replace(/\n{2,}/g, "\n");

  const instructions = userQuestion
    ? `Responde solo a lo último que dice la persona, en 2 o 3 frases nuevas.
${
  keyFact
    ? "Usa el DATO CLAVE de abajo para responder, contado con tus palabras."
    : `Si la respuesta está en los datos, dala con sus números.
Si la pregunta es sobre algo que NO está en los datos (otros materiales, historia, cómo funciona la estación), di en una frase que ese dato no está en este experimento, y luego cuenta lo que sí sabes de ${finding.experiment}.`
}
No repitas frases que ya dijiste antes.
Si la persona dice EVA, se refiere al traje espacial. No expliques la sigla.`
    : `Explica el experimento en exactamente 3 frases:
1) qué material se quemó y con cuánto oxígeno,
2) el nivel de riesgo en este entorno y su causa principal,
3) la acción recomendada.`;

  // Los datos van en el system prompt para que sigan presentes en todo el chat.
  const systemPrompt = `Eres FLAMEY, asistente de seguridad contra incendios para misiones espaciales. Explicas experimentos reales de combustión en microgravedad con datos, de forma clara y breve.

Principio físico: cuanto más oxígeno hay en el aire, más fácil arde un material y más rápido avanza la llama.

${STYLE_RULES}

${instructions}

${dataBlock}${keyFact ? `\n\nDATO CLAVE PARA ESTA RESPUESTA\n${keyFact}` : ""}`;

  // Solo el último intercambio: con más historial un modelo pequeño se repite.
  const recent = past.slice(-2);
  if (recent[0]?.role === "assistant") {
    recent.unshift({ role: "user", content: "Explícame este experimento." });
  }

  const turns: ChatTurn[] = userQuestion
    ? [...recent, { role: "user", content: userQuestion }]
    : [{ role: "user", content: "Explícame este experimento." }];

  return streamChatCompletion({
    model,
    systemPrompt,
    turns,
    maxSentences: CHAT_MAX_SENTENCES,
    numPredict: CHAT_NUM_PREDICT,
    suffix: followUp,
    onToken,
    signal,
  });
}

/* ------------------------------------------------------------------ */
/*  Simulación de certificación de materiales                          */
/* ------------------------------------------------------------------ */

export async function askMaterialSimulationStream(params: {
  model: string;
  sim: SimulationInput;
  onToken: (partialText: string) => void;
  signal?: AbortSignal;
}): Promise<void> {
  const { model, sim, onToken, signal } = params;

  const totalAtm = sim.pressurePsi / PSI_PER_ATM;
  const light = trafficLight(sim.verdict);
  const loiGap = sim.o2Percent - sim.loiPercent;

  const reason =
    loiGap > 0
      ? `el material arde a partir de ${sim.loiPercent} por ciento de oxígeno y aquí hay ${sim.o2Percent} por ciento, ${loiGap} puntos por encima de su límite`
      : `el material necesita ${sim.loiPercent} por ciento de oxígeno para arder y aquí hay ${sim.o2Percent} por ciento, ${Math.abs(
          loiGap
        )} puntos por debajo de su límite`;

  const advice =
    sim.verdict === "PROHIBIDO"
      ? "cambiarlo por un material que no arde, como Nomex, PBI o teflón"
      : sim.verdict === "RESTRINGIDO"
      ? "usarlo solo en poca cantidad, lejos de fuentes de calor y con detector de humo"
      : "se puede usar, vigilando que el oxígeno no suba";

  const systemPrompt = `Eres FLAMEY, asistente de seguridad contra incendios para misiones espaciales. Dices si un material es seguro en un entorno, con datos, de forma clara y breve.

${STYLE_RULES}

Explica el resultado en exactamente 3 frases:
1) empieza con "Semáforo ${light}" y di si se puede usar el material aquí,
2) el motivo, con el límite de oxígeno del material y la velocidad de la llama,
3) el consejo.
El resultado ya está decidido: no lo cambies, solo explícalo.`;

  const userPrompt = `DATOS (es todo lo que sabes)
Material: ${sim.materialName}
Entorno: ${sim.environmentName}
Límite de oxígeno del material: ${sim.loiPercent} por ciento (por encima de ese valor mantiene la llama)
Oxígeno en el entorno: ${sim.o2Percent} por ciento, ${o2VersusEarth(sim.o2Percent)}
Presión: ${es(totalAtm)} atmósferas
Gravedad: ${gravityLabel(sim.gravityG)}
Velocidad de la llama: ${es(sim.spreadMmPerSec)} milímetros por segundo
Resultado: semáforo ${light}, riesgo ${sim.riskScore} de 100
Motivo: ${reason}
Consejo: ${advice}
${sim.userNote ? `\nPregunta de la persona: ${sim.userNote}\n` : ""}
Explícame este resultado.`;

  return streamChatCompletion({
    model,
    systemPrompt,
    turns: [{ role: "user", content: userPrompt }],
    maxSentences: SIM_MAX_SENTENCES,
    numPredict: SIM_NUM_PREDICT,
    onToken,
    signal,
  });
}