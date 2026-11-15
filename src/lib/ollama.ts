import { ContextOut, atmToPsi } from "./api";

const OLLAMA_URL = (
  process.env.NEXT_PUBLIC_OLLAMA_URL || "http://localhost:11434"
).replace(/\/$/, "");

const REFUSAL_PATTERN =
  /^(lo siento|disculpa|no puedo proporcionar|no puedo ayudar|como modelo|i'?m sorry|i cannot)/i;

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
        options: { num_ctx: 1024 },
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

async function streamChatCompletion(params: {
  model: string;
  systemPrompt: string;
  userPrompt: string;
  onToken: (partialText: string) => void;
  signal?: AbortSignal;
}): Promise<void> {
  const { model, systemPrompt, userPrompt, onToken, signal } = params;

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
        num_predict: 190,
      },
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
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
      }
    }
  }

  if (!verifiedSafeStart && accumulated.trim()) {
    onToken(accumulated);
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

  return streamChatCompletion({
    model,
    systemPrompt,
    userPrompt: dataPrompt,
    onToken,
    signal,
  });
}

export async function askMaterialSimulationStream(params: {
  model: string;
  sim: SimulationInput;
  onToken: (partialText: string) => void;
  signal?: AbortSignal;
}): Promise<void> {
  const { model, sim, onToken, signal } = params;
  const ppO2 = ((sim.o2Percent / 100) * sim.pressurePsi).toFixed(2);

  const systemPrompt = `Eres FLAMEY, ingeniero de certificación de materiales espaciales de la NASA (estándar NASA-STD-6001B).
Evalúa si el material consultado es seguro en la atmósfera simulada, en español, directo y máximo 70 palabras (sin títulos #):
- **Dictamen (${sim.verdict}):** explica si es seguro o peligroso usar este material a ${sim.o2Percent}% O2 y ${sim.pressurePsi} psi (ppO2 ${ppO2} psi).
- **Física en ${sim.gravityG === 0 ? "0g" : `${sim.gravityG}g`}:** cómo afecta la falta de nitrógeno diluyente o la baja gravedad a la ignición y propagación (${sim.spreadMmPerSec} mm/s).
- **Alternativa NASA:** material certificado recomendado o límite operativo.`;

  const userPrompt = `Simulación de certificación NASA:
Material: ${sim.materialName} (${sim.materialCategory}, Índice Límite de Oxígeno LOI ~${sim.loiPercent}%).
Entorno: ${sim.environmentName} | O2: ${sim.o2Percent}% | Presión: ${sim.pressurePsi} psi (ppO2: ${ppO2} psi) | Gravedad: ${sim.gravityG}g.
Resultado del modelo físico: ${sim.verdict} (Riesgo ${sim.riskScore}/100, propagación ~${sim.spreadMmPerSec} mm/s).
${sim.userNote ? `Consulta adicional: ${sim.userNote}` : "Evalúa su uso en cabina o traje EVA."}`;

  return streamChatCompletion({
    model,
    systemPrompt,
    userPrompt,
    onToken,
    signal,
  });
}