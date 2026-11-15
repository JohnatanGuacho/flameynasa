// src/lib/voice.ts

export function isVoiceSupported(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

/** Limpia Markdown y símbolos técnicos para que la voz los lea de forma natural */
export function sanitizeTextForSpeech(raw: string): string {
  return raw
    .replace(/```[\s\S]*?```/g, "") // Quita bloques de código
    .replace(/`([^`]+)`/g, "$1") // Quita comillas invertidas
    .replace(/\*\*([^*]+)\*\*/g, "$1") // Quita negritas **texto**
    .replace(/\*([^*]+)\*/g, "$1") // Quita cursivas *texto*
    .replace(/__([^_]+)__/g, "$1")
    .replace(/^#{1,6}\s+/gm, "") // Quita encabezados #
    .replace(/^\s*[-*•]\s+/gm, "") // Quita viñetas
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
    voices.find((v) => v.lang.startsWith("es") && /natural|google|helena|sabina|alvaro/i.test(v.name)) ||
    voices.find((v) => v.lang === "es-ES" || v.lang === "es-MX" || v.lang === "es-419") ||
    voices.find((v) => v.lang.startsWith("es")) ||
    null
  );
}

/** Detiene inmediatamente cualquier locución en curso */
export function stopVoice(): void {
  if (!isVoiceSupported()) return;
  try {
    window.speechSynthesis.cancel();
  } catch {
    // Ignorar errores de cancelación en navegadores restrictivos
  }
}

/** Lee un texto completo (ideal para respuestas instantáneas PSI-RAG) */
export function speakText(
  rawText: string,
  options?: { rate?: number; onEnd?: () => void }
): void {
  if (!isVoiceSupported()) return;
  stopVoice();

  const clean = sanitizeTextForSpeech(rawText);
  if (!clean) return;

  const utterance = new SpeechSynthesisUtterance(clean);
  const voice = pickBestSpanishVoice();
  if (voice) utterance.voice = voice;
  utterance.lang = voice?.lang || "es-ES";
  utterance.rate = options?.rate ?? 1.06;
  utterance.pitch = 1.0;

  if (options?.onEnd) {
    utterance.onend = options.onEnd;
    utterance.onerror = options.onEnd;
  }

  window.speechSynthesis.speak(utterance);
}

/**
 * Cola de locución en tiempo real para respuestas en streaming:
 * va hablando cada oración apenas termina de escribirse sin esperar al final.
 */
export function createStreamSpeaker(rate = 1.06) {
  let spokenLength = 0;
  let cancelled = false;

  const enqueueSentence = (sentence: string) => {
    if (cancelled || !isVoiceSupported()) return;
    const clean = sanitizeTextForSpeech(sentence);
    if (!clean) return;

    const utterance = new SpeechSynthesisUtterance(clean);
    const voice = pickBestSpanishVoice();
    if (voice) utterance.voice = voice;
    utterance.lang = voice?.lang || "es-ES";
    utterance.rate = rate;
    window.speechSynthesis.speak(utterance);
  };

  return {
    /** Alimentar con el texto acumulado del stream */
    pushAccumulated(fullText: string) {
      if (cancelled) return;
      const pending = fullText.slice(spokenLength);
      // Buscar el último cierre de oración o salto de línea doble
      const match = pending.match(/^([\s\S]*?(?:[.!?](?:\s|$)|\n\n))/);
      if (match && match[1].trim().length >= 12) {
        enqueueSentence(match[1]);
        spokenLength += match[1].length;
      }
    },

    /** Vaciar el fragmento final cuando termina el stream */
    flush(fullText: string) {
      if (cancelled) return;
      const remaining = fullText.slice(spokenLength);
      if (remaining.trim()) {
        enqueueSentence(remaining);
        spokenLength = fullText.length;
      }
    },

    cancel() {
      cancelled = true;
      stopVoice();
    },
  };
}