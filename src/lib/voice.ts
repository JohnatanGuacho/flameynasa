import { ContextOut } from "./api";
import { SimulationInput } from "./ollama";

let speakTimer: ReturnType<typeof setTimeout> | null = null;
let currentAudio: HTMLAudioElement | null = null;
let currentAudioUrl: string | null = null;
let activeController: AbortController | null = null;

export function isVoiceSupported(): boolean {
  return typeof window !== "undefined";
}

/* ------------------------------------------------------------------ */
/*  Física: conversiones y formato hablado                             */
/* ------------------------------------------------------------------ */

const DEFAULT_RATE = 1.0;
const PSI_PER_ATM = 14.696;
const KPA_PER_ATM = 101.325;

export const psiToAtm = (psi: number): number => psi / PSI_PER_ATM;
export const kpaToAtm = (kpa: number): number => kpa / KPA_PER_ATM;

/** Número para voz: máx. 2 decimales, sin ceros sobrantes, "coma" decimal. */
function spokenNumber(n: number, maxDecimals = 2): string {
  const rounded = Number(n.toFixed(maxDecimals));
  return String(rounded).replace(".", " coma ");
}

/** 1 -> "1 atmósfera", 0.21 -> "0 coma 21 atmósferas" */
export function atmToSpeech(atm: number): string {
  const label = Math.abs(atm - 1) < 0.005 ? "atmósfera" : "atmósferas";
  return `${spokenNumber(atm)} ${label}`;
}

/**
 * Presión parcial de oxígeno (ppO₂) = fracción de O₂ × presión total.
 * Es la variable clave de inflamabilidad: a más ppO₂, más fácil arde.
 */
export function partialO2Atm(o2Fraction: number, totalAtm: number): number {
  return o2Fraction * totalAtm;
}

/* ------------------------------------------------------------------ */
/*  Limpieza del texto para que la voz lo lea bien                     */
/* ------------------------------------------------------------------ */

// Número (con . o , decimal) seguido de unidad
const num = String.raw`(-?\d+(?:[.,]\d+)?)`;

function toSpokenNumber(raw: string): string {
  return raw.replace(/[.,](\d+)/, " coma $1");
}

function plural(raw: string, singular: string, pluralForm: string): string {
  const n = parseFloat(raw.replace(",", "."));
  return `${toSpokenNumber(raw)} ${n === 1 ? singular : pluralForm}`;
}

function cleanBase(raw: string): string {
  return (
    raw
      // --- Markdown ---
      .replace(/```[\s\S]*?```/g, "")
      .replace(/`([^`]+)`/g, "$1")
      .replace(/\*\*([^*]+)\*\*/g, "$1")
      .replace(/\*([^*]+)\*/g, "$1")
      .replace(/^#{1,6}\s+/gm, "")
      .replace(/^\s*[-*•]\s+/gm, "")

      // --- Gases (lookarounds porque \b no funciona con subíndices ₂) ---
      .replace(/(?<![\p{L}\d])CO₂|(?<![\p{L}\d])CO2(?![\p{L}\d])/gu, "dióxido de carbono")
      .replace(/(?<![\p{L}\d])O₂|(?<![\p{L}\d])O2(?![\p{L}\d])/gu, "oxígeno")
      .replace(/(?<![\p{L}\d])N₂|(?<![\p{L}\d])N2(?![\p{L}\d])/gu, "nitrógeno")
      .replace(/ppO₂|ppO2/gi, "presión parcial de oxígeno")

      // --- Presión ---
      .replace(new RegExp(`${num}\\s*atm\\b`, "gi"), (_, n) =>
        plural(n, "atmósfera", "atmósferas")
      )
      .replace(/\batm\b/gi, "atmósferas")
      .replace(new RegExp(`${num}\\s*kPa\\b`, "g"), (_, n) =>
        plural(n, "kilopascal", "kilopascales")
      )
      .replace(new RegExp(`${num}\\s*psi\\b`, "gi"), (_, n) =>
        plural(n, "libra por pulgada cuadrada", "libras por pulgada cuadrada")
      )
      .replace(/\bkPa\b/g, "kilopascales")
      .replace(/\bpsi\b/gi, "libras por pulgada cuadrada")

      // --- Temperatura ---
      .replace(new RegExp(`${num}\\s*°\\s*C\\b`, "g"), (_, n) =>
        plural(n, "grado Celsius", "grados Celsius")
      )
      .replace(new RegExp(`${num}\\s*K\\b`, "g"), (_, n) =>
        plural(n, "kelvin", "kelvin")
      )

      // --- Gravedad y velocidad ---
      .replace(/µg|μg/g, "microgravedad")
      .replace(/m\/s²|m\/s\^2/g, "metros por segundo al cuadrado")
      .replace(/mm\/s/g, "milímetros por segundo")
      .replace(/cm\/s/g, "centímetros por segundo")
      .replace(/m\/s\b/g, "metros por segundo")

      // --- Energía, flujo y otros ---
      .replace(/kW\/m²/g, "kilovatios por metro cuadrado")
      .replace(/W\/m²/g, "vatios por metro cuadrado")
      .replace(/kJ\/g/g, "kilojulios por gramo")
      .replace(/MJ\/kg/g, "megajulios por kilogramo")
      .replace(/kg\/m³/g, "kilogramos por metro cúbico")
      .replace(/\bppm\b/gi, "partes por millón")
      .replace(/(\d)\s*%/g, "$1 por ciento")
      .replace(/%/g, " por ciento")

      // --- Decimales sueltos: 0.21 / 0,21 -> "0 coma 21" ---
      .replace(/(\d)[.,](\d)/g, "$1 coma $2")

      .replace(/\s+/g, " ")
      .trim()
  );
}

/* ------------------------------------------------------------------ */
/*  Pronunciación: palabras que la voz lee mal                         */
/*  Si alguna suena rara, prueba otra grafía de la lista de abajo.     */
/* ------------------------------------------------------------------ */

const PRONUNCIATION_FIXES: [RegExp, string][] = [
  // "atmósfera" -> la voz se come el grupo "tm". Se separa en dos sílabas.
  // Alternativas para probar: "ad mósfera", "atmosfera", "at-mósfera"
  [/atm[óo]sfera/gi, "at mósfera"],
];

function fixPronunciation(text: string): string {
  return PRONUNCIATION_FIXES.reduce(
    (acc, [pattern, spoken]) => acc.replace(pattern, spoken),
    text
  );
}

export function sanitizeTextForSpeech(raw: string): string {
  return fixPronunciation(cleanBase(raw));
}

/* ------------------------------------------------------------------ */
/*  Voz                                                                */
/* ------------------------------------------------------------------ */

function pickBestSpanishVoice(): SpeechSynthesisVoice | null {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) {
    return null;
  }
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

function fallbackBrowserSpeech(clean: string, rate: number): void {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
  const utterance = new SpeechSynthesisUtterance(clean);
  const voice = pickBestSpanishVoice();
  if (voice) utterance.voice = voice;
  utterance.lang = voice?.lang || "es-ES";
  utterance.rate = rate;
  utterance.pitch = 1.0;
  window.speechSynthesis.speak(utterance);
}

export function stopVoice(): void {
  if (speakTimer) {
    clearTimeout(speakTimer);
    speakTimer = null;
  }

  if (activeController) {
    activeController.abort();
    activeController = null;
  }

  if (currentAudio) {
    currentAudio.pause();
    currentAudio.src = "";
    currentAudio = null;
  }

  if (currentAudioUrl) {
    URL.revokeObjectURL(currentAudioUrl);
    currentAudioUrl = null;
  }

  if (typeof window !== "undefined" && "speechSynthesis" in window) {
    try {
      window.speechSynthesis.cancel();
    } catch {
      // Ignorar errores de cancelación
    }
  }
}

function speakSingleUtterance(text: string, rate = DEFAULT_RATE): void {
  if (!isVoiceSupported()) return;
  stopVoice();

  const clean = sanitizeTextForSpeech(text);
  if (!clean) return;

  speakTimer = setTimeout(async () => {
    const controller = new AbortController();
    activeController = controller;

    try {
      const response = await fetch("/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: clean }),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`Error TTS: ${response.status}`);
      }

      const audioBlob = await response.blob();
      if (controller.signal.aborted) return;

      const url = URL.createObjectURL(audioBlob);
      currentAudioUrl = url;

      const audio = new Audio(url);
      audio.playbackRate = rate;
      currentAudio = audio;

      audio.onended = () => {
        if (currentAudioUrl === url) {
          URL.revokeObjectURL(url);
          currentAudioUrl = null;
        }
        if (currentAudio === audio) {
          currentAudio = null;
        }
      };

      await audio.play();
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      fallbackBrowserSpeech(clean, DEFAULT_RATE);
    }
  }, 60);
}

export function speakText(rawText: string, rate = DEFAULT_RATE): void {
  speakSingleUtterance(rawText, rate);
}

/** Frase de atmósfera: "al 30 por ciento de oxígeno, a 0 coma 56 atmósferas, con presión parcial de oxígeno de 0 coma 17" */
function describeAtmosphere(o2Percent: number, totalAtm?: number): string {
  const base = `al ${Math.round(o2Percent)} por ciento de oxígeno`;
  if (totalAtm === undefined || !isFinite(totalAtm)) return base;

  const pp = partialO2Atm(o2Percent / 100, totalAtm);
  // La unidad se dice una sola vez: así la palabra "atmósferas" no se repite.
  return `${base}, a ${atmToSpeech(totalAtm)}, con una presión parcial de oxígeno de ${spokenNumber(pp)}`;
}

export function speakFindingAlert(ctx: ContextOut): void {
  const { finding, environment } = ctx;
  const o2Pct = Math.round(environment.o2_fraction * 100);
  const material = finding.material || "el combustible ensayado";
  const highRisk = o2Pct >= 30 || finding.rpi >= 55;

  // Si tu ContextOut ya trae la presión, cámbialo aquí (en atm).
  const totalAtm = (environment as { pressure_atm?: number }).pressure_atm;
  const atmo = describeAtmosphere(o2Pct, totalAtm);

  const summary = highRisk
    ? `Alerta en ${environment.label}, ${atmo}. Es peligroso usar ${material} según el ensayo ${finding.experiment}; se recomienda sustituir por material ignífugo o aplicar dilución.`
    : `En ${environment.label}, ${atmo}, el ensayo ${finding.experiment} con ${material} requiere control de ventilación y monitoreo continuo.`;

  speakSingleUtterance(summary, DEFAULT_RATE);
}

export function speakSimulationVerdict(sim: SimulationInput): void {
  const totalAtm = psiToAtm(sim.pressurePsi);
  const atmo = describeAtmosphere(sim.o2Percent, totalAtm);

  let summary = "";
  if (sim.verdict === "PROHIBIDO") {
    summary = `Material prohibido en ${sim.environmentName}, ${atmo}. Usar ${sim.materialName} presenta riesgo crítico de ignición; sustituye por Nomex, PBI o Teflón certificado.`;
  } else if (sim.verdict === "RESTRINGIDO") {
    summary = `Uso restringido para ${sim.materialName} en ${sim.environmentName}, ${atmo}. Requiere blindaje térmico y control estricto de ignición.`;
  } else {
    summary = `Material aprobado. ${sim.materialName} mantiene margen seguro en ${sim.environmentName}, ${atmo}.`;
  }
  speakSingleUtterance(summary, DEFAULT_RATE);
}

export function speakShortReply(rawResponse: string): void {
  const clean = sanitizeTextForSpeech(rawResponse);
  if (!clean) return;

  const sentences = clean.split(/(?<=[.!?])\s+/).slice(0, 2).join(" ");
  const clipped =
    sentences.length > 190 ? `${sentences.slice(0, 187)}...` : sentences;

  speakSingleUtterance(clipped, DEFAULT_RATE);
}