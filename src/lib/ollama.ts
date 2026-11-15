import { ContextOut, atmToPsi } from "./api";

const OLLAMA_URL = (
  process.env.NEXT_PUBLIC_OLLAMA_URL || "http://localhost:11434"
).replace(/\/$/, "");

const REFUSAL_PATTERN =
  /^(lo siento|disculpa|no puedo proporcionar|no puedo ayudar|como modelo|i'?m sorry|i cannot)/i;

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
        options: { num_ctx: 1024 },
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
  const { finding, environment } = context;

  const topFactors = (finding.factors || [])
    .slice(0, 2)
    .map((f) => `${f.name} (+${f.contribution.toFixed(1)})`)
    .join(", ");

  const systemPrompt = `Eres FLAMEY, asistente educativo de la NASA para prevención de incendios en naves y hábitats espaciales (base científica PSI).
Resume los datos experimentales provistos en español de forma clara, objetiva y breve (máximo 65 palabras, sin títulos #):
- **Ensayo PSI:** resume los parámetros medidos y la condición del módulo actual.
- **Evaluación técnica:** explica si el material o fluido es apto o requiere restricción en esta atmósfera y gravedad.
- **Prevención:** indica qué material ignífugo (Nomex, PBI) o control ambiental (dilución con N2/CO2/He) protege a la tripulación.`;

  const dataPrompt = `Módulo espacial: ${environment.label} (${
    environment.gravity_g === 0 ? "microgravedad 0g" : `${environment.gravity_g}g`
  }, ${Math.round(environment.o2_fraction * 100)}% O2, ${atmToPsi(
    environment.pressure_atm
  )} psi, diluyente ${environment.diluent}).
Experimento NASA: ${finding.experiment} (${finding.facility}) | Muestra: ${
    finding.material || "muestra experimental"
  } | Flujo: ${finding.flame_mode} | Índice RPI: ${finding.rpi} (${finding.band}).
Variables clave: ${topFactors || "N/A"}.
Registro técnico: ${finding.narrative}
${
  userQuestion
    ? `Consulta de ingeniería: ${userQuestion}`
    : "Sintetiza el hallazgo científico y la medida de seguridad recomendada."
}`;

  const res = await fetch(`${OLLAMA_URL}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal,
    body: JSON.stringify({
      model,
      stream: true,
      keep_alive: "15m",
      options: {
        temperature: 0.2,
        num_ctx: 1024,
        num_predict: 180,
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
  let verifiedSafeStart = false;

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
          const trimmed = accumulated.trimStart();

          // Esperar los primeros 22 caracteres para verificar que no sea un falso rechazo
          if (!verifiedSafeStart) {
            if (REFUSAL_PATTERN.test(trimmed)) {
              await reader.cancel();
              throw new Error("REFUSAL_FALLBACK");
            }
            if (trimmed.length >= 22 || json.done) {
              verifiedSafeStart = true;
              onToken(accumulated);
            }
          } else {
            onToken(accumulated);
          }
        }
      } catch (err) {
        if (err instanceof Error && err.message === "REFUSAL_FALLBACK") {
          throw err;
        }
        // Ignorar fragmentos parciales de línea JSON
      }
    }
  }

  // Si la respuesta completa fue muy corta (<22 chars) y válida, emitirla al final
  if (!verifiedSafeStart && accumulated.trim()) {
    onToken(accumulated);
  }
}