import { ContextOut, atmToPsi } from "./api";

const OLLAMA_URL = (
  process.env.NEXT_PUBLIC_OLLAMA_URL || "http://localhost:11434"
).replace(/\/$/, "");

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

/** Libera inmediatamente de la VRAM el modelo anterior al cambiar de opción */
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

/** Pre-carga el modelo seleccionado en VRAM antes de habilitar preguntas */
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
        options: { num_ctx: 1536 },
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function askOllamaStream(params: {
  model: string;
  context: ContextOut;
  userQuestion?: string;
  onToken: (partialText: string) => void;
  signal?: AbortSignal;
}): Promise<void> {
  const { model, context, userQuestion, onToken, signal } = params;
  const { finding, environment, evidence } = context;

  const evidenceSummary = evidence
    .slice(0, 2)
    .map(
      (e) =>
        `- ${e.file} (fila #${e.row}, calidad ${Math.round(e.quality * 100)}%): ${JSON.stringify(e.raw)}`
    )
    .join("\n");

  const systemPrompt = `Eres FLAMEY, especialista de la NASA en seguridad contra incendios espaciales (base PSI).
Tu objetivo es advertir de forma clara y sencilla cómo funciona el fenómeno de combustión y cuál es el peligro real de usar ese material o combustible en el entorno seleccionado (Luna, Marte, Rover, Traje EVA o ISS), aportando conocimiento de física en baja gravedad (sin convección natural, llamas esféricas por difusión, mayor inflamabilidad con O2 enriquecido).
Reglas:
- Nunca inventes datos ni cifras fuera del contexto.
- No uses títulos grandes (# o ###). Usa etiquetas en negrita y frases completas.
- Estructura siempre en 3 puntos claros y completos (máximo 150 palabras en total):
  **1. Qué ocurre:** explicación física sencilla del experimento.
  **2. Peligro en este entorno:** riesgo real del material/atmósfera para la tripulación.
  **3. Control y prevención:** medida concreta de seguridad (materiales, límite de O2, detección o supresión).`;

  const dataPrompt = `Entorno: ${environment.label} (${environment.gravity_g === 0 ? "microgravedad 0g" : environment.gravity_g + " g"}, ${Math.round(environment.o2_fraction * 100)}% O2, ${atmToPsi(environment.pressure_atm)} psi).
Experimento: ${finding.experiment} (${finding.facility}) | Material: ${finding.material || "N/A"} | Modo: ${finding.flame_mode} | RPI: ${finding.rpi} (${finding.band}).
Resumen técnico: ${finding.narrative}
Evidencia CSV:
${evidenceSummary}
${userQuestion ? `Pregunta del usuario: ${userQuestion}` : "Explica este hallazgo y advierte los riesgos de este material en este entorno."}`;

  const res = await fetch(`${OLLAMA_URL}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal,
    body: JSON.stringify({
      model,
      stream: true,
      keep_alive: "15m",
      options: {
        temperature: 0.25,
        num_ctx: 1536,
        num_predict: 550, // Suficiente para que nunca se corte a mitad de oración
      },
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: dataPrompt },
      ],
    }),
  });

  if (!res.ok || !res.body) {
    throw new Error(`Ollama HTTP ${res.status}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let accumulated = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    const chunk = decoder.decode(value, { stream: true });
    for (const line of chunk.split("\n")) {
      if (!line.trim()) continue;
      try {
        const json = JSON.parse(line);
        if (json.message?.content) {
          accumulated += json.message.content;
          onToken(accumulated);
        }
      } catch {
        // Ignorar fragmentos parciales de línea JSON
      }
    }
  }
}