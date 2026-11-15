import { ContextOut } from "./api";

let speakTimer: ReturnType<typeof setTimeout> | null = null;

export function isVoiceSupported(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

/** Limpia Markdown y símbolos químicos para pronunciación natural */
export function sanitizeTextForSpeech(raw: string): string {
  return raw
    .replace(/```[\s\S]*?```/g, "")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^\s*[-*•]\s+/gm, "")
    .replace(/\bO₂\b|\bO2\b/g, "oxígeno")
    .replace(/\bCO₂\b|\bCO2\b/g, "dióxido de carbono")
    .replace(/\bN₂\b|\bN2\b/g, "nitrógeno")
    .replace(/µg/g, "microgravedad")
    .replace(/mm\/s/g, "milímetros por segundo")
    .replace(/\s+/g, " ")
    .trim();
}

function pickBestSpanishVoice(): SpeechSynthesisVoice | null {
  if (!isVoiceSupported()) return null;
  const voices = window.speechSynthesis.getVoices();
  if (!voices.length) return null;

  return (
    voices.find(
      (v) =>
        v.lang.startsWith("es") &&
        /natural|google|helena|sabina|alvaro/i.test(v.name)
    ) ||
    voices.find(
      (v) => v.lang === "es-ES" || v.lang === "es-MX" || v.lang === "es-419"
    ) ||
    voices.find((v) => v.lang.startsWith("es")) ||
    null
  );
}

/** Detiene cualquier locución en curso y limpia temporizadores pendientes */
export function stopVoice(): void {
  if (speakTimer) {
    clearTimeout(speakTimer);
    speakTimer = null;
  }
  if (!isVoiceSupported()) return;
  try {
    window.speechSynthesis.cancel();
  } catch {
    // Ignorar errores de cancelación
  }
}

/** Habla una sola vez sin solapamientos ni eco */
function speakSingleUtterance(text: string, rate = 1.22): void {
  if (!isVoiceSupported()) return;
  stopVoice();

  const clean = sanitizeTextForSpeech(text);
  if (!clean) return;

  // Retardo breve de 60ms evita que Chromium solape o corte tras cancel()
  speakTimer = setTimeout(() => {
    const utterance = new SpeechSynthesisUtterance(clean);
    const voice = pickBestSpanishVoice();
    if (voice) utterance.voice = voice;
    utterance.lang = voice?.lang || "es-ES";
    utterance.rate = rate;
    utterance.pitch = 1.0;
    window.speechSynthesis.speak(utterance);
  }, 60);
}

/**
 * Resume en 2 frases cortas el veredicto de seguridad para el módulo activo.
 * Evita lecturas largas y comunica directo qué material es peligroso y dónde.
 */
export function speakFindingAlert(ctx: ContextOut): void {
  const { finding, environment } = ctx;
  const o2Pct = Math.round(environment.o2_fraction * 100);
  const material = finding.material || "el combustible ensayado";
  const highRisk = o2Pct >= 30 || finding.rpi >= 55;

  const summary = highRisk
    ? `Alerta en ${environment.label} al ${o2Pct} por ciento de oxígeno. Es peligroso usar ${material} según el ensayo ${finding.experiment}; se recomienda sustituir por material ignífugo o aplicar dilución.`
    : `En ${environment.label} al ${o2Pct} por ciento de oxígeno, el ensayo ${finding.experiment} con ${material} requiere control de ventilación y monitoreo continuo.`;

  speakSingleUtterance(summary, 1.22);
}

/** Lee solo las primeras 2 frases (máx. 190 caracteres) de una respuesta puntual */
export function speakShortReply(rawResponse: string): void {
  const clean = sanitizeTextForSpeech(rawResponse);
  if (!clean) return;

  const sentences = clean.split(/(?<=[.!?])\s+/).slice(0, 2).join(" ");
  const clipped =
    sentences.length > 190 ? `${sentences.slice(0, 187)}...` : sentences;

  speakSingleUtterance(clipped, 1.22);
}