"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { api, ContextOut, FindingOut, RulesOut } from "@/lib/api";
import {
  askMaterialSimulationStream,
  askOllamaStream,
  getOllamaModels,
  SimulationInput,
  unloadOllamaModel,
  warmupOllamaModel,
} from "@/lib/ollama";
import {
  isVoiceSupported,
  speakSimulationVerdict,
  speakText,
  stopVoice,
} from "@/lib/voice";
import {
  Flame,
  ChevronDown,
  ChevronUp,
  Send,
  Loader2,
  RefreshCw,
  Volume2,
  VolumeX,
  Sliders,
  ShieldCheck,
  ShieldAlert,
  AlertTriangle,
  Settings,
  Lightbulb,
  MessageCircle,
  Database,
  Sparkles,
  Trash2,
  Sun,
  Moon,
  ArrowLeftRight,
} from "lucide-react";

interface Props {
  activeFinding: FindingOut | null;
  environmentKey: string;
}

interface ChatMsg {
  role: "user" | "flamey";
  text: string;
}

type Side = "left" | "right";

const RAG_MODE = "psi-rag";
const PSI_PER_ATM = 14.696;
const EARTH_O2_PCT = 21;
// Un cambio de experimento cuenta como "pedido por la persona" si llega
// justo después de un clic o Enter. Si no, Flamey espera.
const EXPLICIT_WINDOW_MS = 700;
// Turnos previos que se envían al modelo.
const HISTORY_TURNS = 6;
const THEME_STORAGE_KEY = "flamey-theme";
const SIDE_STORAGE_KEY = "flamey-side";
// Clave del entorno "traje espacial" en la API (valor por defecto del OpenAPI).
const SUIT_ENV_KEY = "eva";
// Píxeles que hay que mover antes de considerar que es un arrastre y no un clic.
const DRAG_THRESHOLD_PX = 4;
// Margen mínimo entre Flamey y los bordes (menú lateral y ventana).
const EDGE_GAP_PX = 8;

const AFFIRMATIVE = /^\s*(s[ií]|claro|dale|ok|okay|vale|bueno|por favor|de una)\b/i;

/* ------------------------------------------------------------------ */
/*  Tema claro / oscuro (solo para este widget)                        */
/* ------------------------------------------------------------------ */

const THEMES = {
  dark: {
    panel: "border-slate-800 bg-slate-950/95",
    pill: "border-teal-400/60 bg-slate-950/95 text-teal-200 hover:border-teal-300",
    divider: "border-slate-800/80",
    title: "text-white",
    text: "text-slate-100",
    sub: "text-slate-200",
    soft: "text-slate-300",
    muted: "text-slate-400",
    accent: "text-teal-300",
    link: "text-teal-300 hover:text-teal-200",
    surface: "border-slate-800 bg-slate-900",
    field:
      "border-slate-700 bg-slate-900 text-white placeholder:text-slate-400",
    select: "border-slate-700 bg-slate-950 text-slate-200",
    modelSelect: "border-slate-700 bg-slate-950 text-emerald-300",
    chip: "border-slate-700 bg-slate-900 text-teal-200 hover:bg-slate-800",
    iconBtn: "border-slate-800 bg-slate-900 text-slate-300 hover:text-white",
    iconBtnActive: "border-teal-400/70 bg-teal-500/20 text-teal-200",
    userBubble: "bg-teal-500/15 text-teal-100",
    botBubble: "border-slate-800 bg-slate-900 text-slate-100",
    tabOn: "border-teal-400 text-teal-200",
    tabOff: "border-transparent text-slate-400 hover:text-white",
    envOn: "border-teal-400 bg-teal-500/20 font-bold text-teal-100",
    envOff: "border-slate-800 bg-slate-900 text-slate-300 hover:border-slate-600",
    track: "bg-slate-800",
    file: "text-cyan-300",
    myth: "text-rose-300",
    fact: "text-emerald-200",
    danger: "text-rose-400",
    warn: "text-amber-300",
    ok: "text-emerald-300",
    info: "text-cyan-300",
    whyDivider: "border-white/10",
  },
  light: {
    panel: "border-slate-200 bg-white/95",
    pill: "border-teal-600/50 bg-white text-teal-700 hover:border-teal-600",
    divider: "border-slate-200",
    title: "text-slate-900",
    text: "text-slate-800",
    sub: "text-slate-700",
    soft: "text-slate-600",
    muted: "text-slate-500",
    accent: "text-teal-700",
    link: "text-teal-700 hover:text-teal-900",
    surface: "border-slate-200 bg-slate-50",
    field:
      "border-slate-300 bg-white text-slate-900 placeholder:text-slate-500",
    select: "border-slate-300 bg-white text-slate-800",
    modelSelect: "border-slate-300 bg-white text-emerald-700",
    chip: "border-slate-300 bg-white text-teal-700 hover:bg-slate-100",
    iconBtn: "border-slate-200 bg-white text-slate-600 hover:text-slate-900",
    iconBtnActive: "border-teal-500 bg-teal-50 text-teal-700",
    userBubble: "bg-teal-600 text-white",
    botBubble: "border-slate-200 bg-slate-100 text-slate-800",
    tabOn: "border-teal-600 text-teal-700",
    tabOff: "border-transparent text-slate-500 hover:text-slate-900",
    envOn: "border-teal-600 bg-teal-50 font-bold text-teal-800",
    envOff: "border-slate-200 bg-white text-slate-600 hover:border-slate-400",
    track: "bg-slate-200",
    file: "text-cyan-700",
    myth: "text-rose-700",
    fact: "text-emerald-700",
    danger: "text-rose-600",
    warn: "text-amber-600",
    ok: "text-emerald-600",
    info: "text-cyan-700",
    whyDivider: "border-black/10",
  },
};

type ThemeName = keyof typeof THEMES;
type Theme = (typeof THEMES)["dark"];

const ThemeCtx = createContext<Theme>(THEMES.dark);

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

const toAtm = (psi: number): number => psi / PSI_PER_ATM;
const fmt = (n: number, d = 2): string =>
  n.toLocaleString("es", { maximumFractionDigits: d });

const cap = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

/** Acepta O2 como fracción (0.32) o como porcentaje (32). */
const toPct = (v: number): number => Math.round(v <= 1 ? v * 100 : v);

const modelLabel = (m: string): string =>
  m === RAG_MODE ? "Datos NASA (sin modelo)" : `IA local · ${m.split(":")[0]}`;

/** Borde derecho del menú lateral: Flamey nunca pasa de ahí. */
function navRightEdge(): number {
  if (typeof document === "undefined") return 0;
  const nav = document.querySelector('nav[aria-label="Secciones"]');
  return nav ? nav.getBoundingClientRect().right : 0;
}

/* ------------------------------------------------------------------ */
/*  Datos de materiales y entornos                                     */
/* ------------------------------------------------------------------ */

interface MaterialPreset {
  id: string;
  shortName: string;
  name: string;
  category: string;
  loi: number;
  evaRated: boolean;
  baseSpread: number;
  note: string;
}

const MATERIAL_PRESETS: MaterialPreset[] = [
  {
    id: "cotton",
    shortName: "Algodón",
    name: "Algodón / Textiles comunes",
    category: "Celulosa orgánica",
    loi: 19,
    evaRated: false,
    baseSpread: 1.4,
    note: "Arde rápido con más de 24% de O₂. Está prohibido en el traje EVA.",
  },
  {
    id: "foam",
    shortName: "Espuma PU",
    name: "Espuma de Poliuretano",
    category: "Aislante polimérico",
    loi: 17,
    evaRated: false,
    baseSpread: 2.1,
    note: "La llama avanza rápido y libera gases tóxicos en la cabina.",
  },
  {
    id: "pmma",
    shortName: "Acrílico",
    name: "Acrílico / PMMA (Visores)",
    category: "Termoplástico óptico",
    loi: 18,
    evaRated: false,
    baseSpread: 0.9,
    note: "En 0g forma una llama esférica persistente. Conviene usar policarbonato tratado.",
  },
  {
    id: "nylon",
    shortName: "Nylon",
    name: "Nylon 6,6 / Correas estándar",
    category: "Poliamida sintética",
    loi: 24,
    evaRated: false,
    baseSpread: 0.85,
    note: "Tiene poco margen en la ISS y gotea fundido en el hábitat lunar.",
  },
  {
    id: "silicone",
    shortName: "Silicona",
    name: "Silicona / Sellos y cables",
    category: "Elastómero",
    loi: 30,
    evaRated: false,
    baseSpread: 0.55,
    note: "Sirve en la ISS (21% de O₂), pero se restringe con más de 32% de O₂.",
  },
  {
    id: "ptfe",
    shortName: "Teflón PTFE",
    name: "Teflón / PTFE (Cableado NASA)",
    category: "Fluoropolímero",
    loi: 95,
    evaRated: true,
    baseSpread: 0.12,
    note: "Es el estándar aeroespacial para aislar cables en cabina y en vacío.",
  },
  {
    id: "nomex",
    shortName: "Nomex EVA",
    name: "Nomex / PBI (Tejido Traje EVA)",
    category: "Aramida ignífuga",
    loi: 36,
    evaRated: true,
    baseSpread: 0.08,
    note: "Se autoextingue en el traje EVA (0,29 atm y 100% de O₂), según NASA-STD-6001B.",
  },
];

const ENV_PRESETS = [
  { id: "iss", short: "ISS", label: "ISS", o2: 21, psi: 14.7, g: 0 },
  { id: "lunar", short: "Luna", label: "Luna", o2: 32, psi: 8.2, g: 0.165 },
  { id: "rover", short: "Rover", label: "Rover", o2: 34, psi: 8.0, g: 0.165 },
  { id: "mars", short: "Marte", label: "Marte", o2: 21, psi: 14.7, g: 0.38 },
  { id: "eva", short: "EVA", label: "Traje EVA", o2: 100, psi: 4.3, g: 0 },
];

/* ------------------------------------------------------------------ */
/*  Semáforo del veredicto                                             */
/* ------------------------------------------------------------------ */

const VERDICT_META: Record<
  SimulationInput["verdict"],
  {
    label: string;
    box: Record<ThemeName, string>;
    iconColor: Record<ThemeName, string>;
    bar: string;
    Icon: React.ElementType;
  }
> = {
  PROHIBIDO: {
    label: "No usar aquí",
    box: {
      dark: "bg-rose-950/50 border-rose-500/60 text-rose-100",
      light: "bg-rose-50 border-rose-300 text-rose-900",
    },
    iconColor: { dark: "text-rose-400", light: "text-rose-600" },
    bar: "bg-rose-500",
    Icon: ShieldAlert,
  },
  RESTRINGIDO: {
    label: "Usar con cuidado",
    box: {
      dark: "bg-amber-950/50 border-amber-500/60 text-amber-100",
      light: "bg-amber-50 border-amber-300 text-amber-900",
    },
    iconColor: { dark: "text-amber-400", light: "text-amber-600" },
    bar: "bg-amber-400",
    Icon: AlertTriangle,
  },
  APROBADO: {
    label: "Seguro",
    box: {
      dark: "bg-emerald-950/50 border-emerald-500/60 text-emerald-100",
      light: "bg-emerald-50 border-emerald-300 text-emerald-900",
    },
    iconColor: { dark: "text-emerald-400", light: "text-emerald-600" },
    bar: "bg-emerald-400",
    Icon: ShieldCheck,
  },
};

/* ------------------------------------------------------------------ */
/*  Física del simulador (sin cambios)                                 */
/* ------------------------------------------------------------------ */

function computeSimulationPhysics(params: {
  preset: MaterialPreset;
  customMaterial: string;
  o2Percent: number;
  pressurePsi: number;
  gravityG: number;
  environmentName: string;
}): SimulationInput {
  const {
    preset,
    customMaterial,
    o2Percent,
    pressurePsi,
    gravityG,
    environmentName,
  } = params;

  const isCustom = customMaterial.trim().length > 0;
  const materialName = isCustom ? customMaterial.trim() : preset.name;
  const materialCategory = isCustom ? "Material consultado" : preset.category;

  const ppO2 = (o2Percent / 100) * pressurePsi;
  const diluentPenalty = Math.max(0, o2Percent - 21) * 0.85;
  const pressureFactor = pressurePsi / 14.7;

  let riskScore = 0;

  if (!isCustom && preset.evaRated && o2Percent === 100 && pressurePsi <= 4.5) {
    riskScore = preset.id === "ptfe" ? 18 : 26;
  } else {
    const loiMargin = preset.loi - o2Percent;
    const rawRisk =
      52 - loiMargin * 1.45 + (ppO2 - 3.09) * 9.5 + diluentPenalty * 0.35;
    riskScore = Math.max(8, Math.min(99, Math.round(rawRisk)));
  }

  const gravityMultiplier =
    gravityG === 0 ? (o2Percent > 30 ? 1.15 : 0.82) : 0.95 + gravityG * 0.25;

  const spreadMmPerSec = Number(
    Math.max(
      0.05,
      preset.baseSpread *
        Math.pow(o2Percent / 21, 1.35) *
        Math.sqrt(pressureFactor) *
        gravityMultiplier
    ).toFixed(2)
  );

  let verdict: SimulationInput["verdict"] = "APROBADO";
  if (riskScore >= 65) verdict = "PROHIBIDO";
  else if (riskScore >= 36) verdict = "RESTRINGIDO";

  return {
    materialName,
    materialCategory,
    loiPercent: preset.loi,
    o2Percent,
    pressurePsi,
    gravityG,
    environmentName,
    verdict,
    riskScore,
    spreadMmPerSec,
  };
}

function buildFallbackSimulationReport(
  sim: SimulationInput,
  presetNote?: string
): string {
  const atm = toAtm(sim.pressurePsi);
  const grav =
    sim.gravityG === 0 ? "microgravedad" : `gravedad de ${sim.gravityG} g`;

  const verdictText =
    sim.verdict === "PROHIBIDO"
      ? "Semáforo rojo, no uses este material aquí."
      : sim.verdict === "RESTRINGIDO"
      ? "Semáforo ámbar, úsalo solo con mucho cuidado."
      : "Semáforo verde, es seguro en estas condiciones.";

  const why =
    sim.o2Percent >= 30
      ? "Con tanto oxígeno la llama se acelera y cuesta apagarla."
      : "Con este oxígeno la llama avanza despacio y se puede controlar.";

  const alt =
    presetNote ||
    (sim.verdict === "PROHIBIDO"
      ? "Es mejor cambiarlo por Nomex, PBI o teflón."
      : "Puedes usarlo si hay detectores de humo activos.");

  return `${verdictText} En ${grav}, con ${sim.o2Percent}% de O₂ a ${fmt(
    atm
  )} atm, la llama avanzaría a ${sim.spreadMmPerSec} mm/s. ${why} ${alt}`;
}

/* ------------------------------------------------------------------ */
/*  Motor de respuestas con datos de la NASA (funciona sin modelo)     */
/* ------------------------------------------------------------------ */

/** Cada factor del RPI explicado como una causa fácil de entender. */
const FACTOR_REASONS: Record<string, string> = {
  o2_margin: "con este oxígeno al material le falta muy poco para arder",
  o2_extrapolation: "aquí hay más oxígeno del que se probó en el ensayo",
  pressure_extrapolation: "el ensayo se hizo con otra presión",
  gravity_extrapolation: "el ensayo se hizo con otra gravedad",
  soot_load: "la llama suelta mucho hollín y humo",
  cool_flame: "pueden aparecer llamas frías, casi invisibles",
  evidence_weakness: "hay pocos datos y no son muy confiables",
  material_fit: "el material se parece a los que se usan en este entorno",
  egress_window: "la tripulación tendría poco tiempo para salir",
  measured_sustain: "en el ensayo la llama se mantuvo encendida sin apagarse sola",
  evidence_density: "el experimento se repitió pocas veces",
};

/** Una acción concreta según la causa principal. */
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

const DEFAULT_REASON = "con más oxígeno los materiales arden con más facilidad";
const DEFAULT_ACTION = "cambiarlo por una tela que no arde, como Nomex o PBI";

type IntentId =
  | "suit"
  | "extinguish"
  | "replace"
  | "evidence"
  | "speed"
  | "conditions"
  | "why";

/**
 * Temas que Flamey sabe responder. El orden importa: se revisan de arriba abajo.
 * `ask` es la pregunta de cierre; las tres primeras coinciden con las de ollama.ts.
 */
const INTENTS: { id: IntentId; match: RegExp; ask: string; chip: string }[] = [
  {
    id: "suit",
    match: /\beva\b|traje/i,
    ask: "¿Quieres compararlo con lo que pasaría dentro de un traje espacial?",
    chip: "¿Y en un traje espacial?",
  },
  {
    id: "extinguish",
    match: /apag|extin|supres|sofoc/i,
    ask: "¿Quieres saber cómo se apagaría esta llama sin gravedad?",
    chip: "¿Cómo se apaga?",
  },
  {
    id: "replace",
    match: /reempl|sustit|alternativ|otro material|qu[eé] material/i,
    ask: "¿Quieres saber qué material podría reemplazarlo?",
    chip: "¿Qué lo reemplaza?",
  },
  {
    id: "evidence",
    match: /confiab|evidenc|fuente|corrida|calidad|cu[aá]ntos datos|de d[oó]nde/i,
    ask: "¿Quieres saber qué tan confiables son estos datos?",
    chip: "¿Es confiable?",
  },
  {
    id: "speed",
    match: /velocidad|r[aá]pid|avanza|propag/i,
    ask: "¿Quieres saber qué tan rápido avanzaría la llama?",
    chip: "¿Qué tan rápido avanza?",
  },
  {
    id: "conditions",
    match: /condicion|se prob[oó]|c[oó]mo se hizo|ensay|presi[oó]n|gravedad|ox[ií]geno/i,
    ask: "¿Quieres saber en qué condiciones se hizo el ensayo?",
    chip: "¿Cómo se probó?",
  },
  {
    id: "why",
    match: /por qu[eé]|causa|raz[oó]n|motivo|riesgo|peligro/i,
    ask: "¿Quieres saber por qué tiene ese nivel de riesgo?",
    chip: "¿Por qué ese riesgo?",
  },
];

// Orden en que Flamey va ofreciendo temas y mostrando los botones.
const ASK_ORDER: IntentId[] = [
  "why",
  "suit",
  "replace",
  "extinguish",
  "evidence",
  "speed",
  "conditions",
];

// Estos temas son datos exactos: se responden siempre desde la base, con o sin modelo.
const DATA_ONLY = new Set<IntentId>(["why", "evidence", "speed", "conditions"]);

/** De qué habla la persona. Un "sí" responde a la última pregunta de Flamey. */
function detectIntent(text: string, lastFlamey: string): IntentId | null {
  const direct = INTENTS.find((i) => i.match.test(text));
  if (direct) return direct.id;
  if (AFFIRMATIVE.test(text) && lastFlamey) {
    const offered = INTENTS.find((i) => lastFlamey.includes(i.ask));
    if (offered) return offered.id;
  }
  return null;
}

/** Temas ya tocados en la conversación (más el actual, si lo hay). */
function coveredIntents(history: ChatMsg[], current?: IntentId | null): Set<IntentId> {
  const covered = new Set<IntentId>();
  history.forEach((m, i) => {
    if (m.role !== "user") return;
    const prev = history[i - 1]?.role === "flamey" ? history[i - 1].text : "";
    const found = detectIntent(m.text, prev);
    if (found) covered.add(found);
  });
  if (current) covered.add(current);
  return covered;
}

/** Velocidad de propagación que la API deja escrita en el registro técnico. */
function spreadOf(finding: FindingOut): number | null {
  const m = (finding.narrative || "").match(
    /propagaci[oó]n de\s*([\d.,]+)\s*mm\/s/i
  );
  if (!m) return null;
  const n = parseFloat(m[1].replace(",", "."));
  return Number.isFinite(n) && n > 0 ? n : null;
}

function vsEarth(o2Pct: number): string {
  const diff = o2Pct - EARTH_O2_PCT;
  if (diff >= 2) return `${diff} puntos más que en la Tierra`;
  if (diff <= -2) return `${Math.abs(diff)} puntos menos que en la Tierra`;
  return "igual que en la Tierra";
}

/** Temas que tienen sentido para este experimento y entorno. */
function availableIntents(ctx: ContextOut): IntentId[] {
  return ASK_ORDER.filter((id) => {
    if (id === "suit") return ctx.environment.key !== SUIT_ENV_KEY;
    if (id === "speed") return spreadOf(ctx.finding) !== null;
    return true;
  });
}

/**
 * Respuesta armada solo con datos de la API, en lenguaje sencillo.
 * `intent` = "explain" para la explicación inicial, o null si no se entendió.
 */
function answerFromData(
  ctx: ContextOut,
  intent: IntentId | "explain" | null,
  covered: Set<IntentId>,
  suitContext?: ContextOut
): string {
  const { finding, environment } = ctx;
  const o2Pct = Math.round(environment.o2_fraction * 100);
  const atm = fmt(environment.pressure_atm);
  const material = finding.material || "una muestra de prueba";
  const band = String(finding.band || "").toLowerCase();
  const gravity =
    environment.gravity_g === 0 ? "microgravedad" : `${environment.gravity_g} g`;

  const ranked = [...(finding.factors || [])].sort(
    (a, b) => b.contribution - a.contribution
  );
  const mainReason = FACTOR_REASONS[ranked[0]?.name] || DEFAULT_REASON;
  const mainAction = FACTOR_ACTIONS[ranked[0]?.name] || DEFAULT_ACTION;

  const nextId = availableIntents(ctx).find((id) => !covered.has(id));
  const ask = nextId ? ` ${INTENTS.find((i) => i.id === nextId)!.ask}` : "";

  switch (intent) {
    case "explain": {
      const runs =
        finding.observations > 0 ? ` en ${finding.observations} corridas` : "";
      return `En el experimento ${finding.experiment} se quemó ${material}${runs}. En ${environment.label} el aire tiene ${o2Pct}% de O₂, ${vsEarth(
        o2Pct
      )}. El riesgo es ${band}, ${finding.rpi} de 100, sobre todo porque ${mainReason}. Lo que conviene es ${mainAction}.${ask}`;
    }

    case "why": {
      const reasons = ranked
        .slice(0, 3)
        .map((f) => FACTOR_REASONS[f.name])
        .filter(Boolean);
      if (reasons.length === 0) {
        return `El riesgo en ${environment.label} es ${finding.rpi} de 100 porque ${DEFAULT_REASON}.${ask}`;
      }
      const [first, second, third] = reasons;
      return `El riesgo en ${environment.label} es ${band}, ${finding.rpi} de 100. ${cap(
        first
      )}.${second ? ` Además, ${second}.` : ""}${
        third ? ` Y por último, ${third}.` : ""
      }${ask}`;
    }

    case "suit": {
      if (suitContext) {
        const suit = suitContext.finding;
        const suitO2 = Math.round(suitContext.environment.o2_fraction * 100);
        const delta = suit.rpi - finding.rpi;
        const verdict =
          delta > 2
            ? "En el traje sería más peligroso."
            : delta < -2
            ? "El riesgo calculado en el traje es menor."
            : "El riesgo es parecido en los dos sitios.";
        const suitSpread = spreadOf(suit);
        return `Dentro del traje espacial el aire tiene ${suitO2}% de O₂ a ${fmt(
          suitContext.environment.pressure_atm
        )} atm. Para este mismo experimento el riesgo allí es ${suit.rpi} de 100, y en ${
          environment.label
        } es ${finding.rpi} de 100. ${verdict}${
          suitSpread ? ` Allí la llama avanzaría a unos ${fmt(suitSpread)} mm/s.` : ""
        }${ask}`;
      }
      return `Dentro de un traje espacial el aire es oxígeno puro, así que ${material} ardería con mucha más facilidad que en ${environment.label}. Por eso los trajes solo usan telas que no arden.${ask}`;
    }

    case "extinguish":
      return `Sin gravedad el aire caliente no sube, así que la llama depende del aire que le llega. Lo primero es cortar la ventilación; después se diluye el aire con dióxido de carbono o helio, como probó el experimento FLEX. La tripulación tendría unos ${environment.egress_s} segundos para salir.${ask}`;

    case "replace":
      return `Los materiales que no arden y ya se usan en misiones son Nomex y PBI para las telas, y teflón para aislar cables. Para este caso lo que conviene es ${mainAction}.${ask}`;

    case "evidence": {
      const quality = Math.round(finding.quality * 100);
      const records = ctx.evidence?.length || 0;
      const caution =
        finding.observations < 5 || quality < 60
          ? " Son pocos datos o de calidad baja, así que tómalo como una orientación."
          : " Es una base sólida para este tipo de ensayo.";
      return `Esto sale de ${finding.observations} corridas del experimento ${finding.experiment}, con una calidad de dato del ${quality}%.${
        records > 0
          ? ` Hay ${records} registros de la base PSI detrás; puedes verlos con el botón de registros de abajo.`
          : ""
      }${caution}${ask}`;
    }

    case "speed": {
      const spread = spreadOf(finding);
      if (spread === null) {
        return `La base no trae una velocidad estimada para este experimento en ${environment.label}.${ask}`;
      }
      return `En ${environment.label} la llama avanzaría a unos ${fmt(
        spread
      )} mm/s, que son cerca de ${fmt(spread * 6, 1)} centímetros por minuto. Es una proyección a partir del ensayo, no una medición directa en ese entorno.${ask}`;
    }

    case "conditions": {
      const hasO2 = finding.o2_max != null && finding.o2_max > 0;
      const lo = hasO2 ? toPct(finding.o2_min ?? finding.o2_max!) : null;
      const hi = hasO2 ? toPct(finding.o2_max!) : null;
      const tested = hasO2
        ? `El ensayo se hizo con ${lo === hi ? `${hi}%` : `entre ${lo}% y ${hi}%`} de O₂${
            finding.pressure_atm != null ? ` a ${fmt(finding.pressure_atm)} atm` : ""
          }.`
        : "La base no registra con cuánto oxígeno se hizo este ensayo.";
      const gap =
        hasO2 && hi !== null && o2Pct > hi
          ? " Aquí hay más oxígeno del que se probó, así que el resultado es una estimación."
          : "";
      return `${tested} ${environment.label} tiene ${o2Pct}% de O₂ a ${atm} atm y ${gravity}.${gap}${ask}`;
    }

    default:
      return `No tengo ese dato para ${finding.experiment}. Lo que sí sé es que en ${environment.label} el riesgo es ${band}, ${finding.rpi} de 100.${ask}`;
  }
}

/* ------------------------------------------------------------------ */
/*  Presentación                                                       */
/* ------------------------------------------------------------------ */

function Answer({ text }: { text: string }) {
  const parts = text
    .split(/\n+/)
    .map((p) => p.trim())
    .filter(Boolean);

  return (
    <div className="space-y-1.5 text-[13px] leading-snug">
      {parts.map((part, i) => (
        <p key={i}>{part}</p>
      ))}
    </div>
  );
}

/* Botón de icono pequeño, reutilizado en cabecera y pie */
function IconBtn(props: {
  label: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  const { label, active, disabled, onClick, children } = props;
  const t = useContext(ThemeCtx);
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
      className={`inline-flex h-7 min-w-7 cursor-pointer items-center justify-center gap-1 rounded-lg border px-1.5 font-hud text-[11px] transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-400 disabled:opacity-40 ${
        active ? t.iconBtnActive : t.iconBtn
      }`}
    >
      {children}
    </button>
  );
}

/* ------------------------------------------------------------------ */
/*  Componente principal                                               */
/* ------------------------------------------------------------------ */

export function FlameyWidget({ activeFinding, environmentKey }: Props) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"finding" | "sim">("finding");
  const [themeName, setThemeName] = useState<ThemeName>("dark");
  const [showSettings, setShowSettings] = useState(false);
  const [showSources, setShowSources] = useState(false);
  const [showRule, setShowRule] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showWhy, setShowWhy] = useState(false);

  const [context, setContext] = useState<ContextOut | null>(null);
  const [loadingCtx, setLoadingCtx] = useState(false);
  const [rules, setRules] = useState<RulesOut | null>(null);
  const [ruleIdx, setRuleIdx] = useState(0);

  // Voz
  const [voiceEnabled, setVoiceEnabled] = useState(false);
  const [voiceAvailable, setVoiceAvailable] = useState(false);

  // Motor: datos NASA (sin modelo) o modelo local de Ollama
  const [models, setModels] = useState<string[]>([]);
  const [selectedModel, setSelectedModel] = useState<string>(RAG_MODE);
  const [scanning, setScanning] = useState(false);
  const [modelReady, setModelReady] = useState(true);
  const [loadingModel, setLoadingModel] = useState(false);

  // Chat
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [draft, setDraft] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [question, setQuestion] = useState("");

  // Simulador
  const [selectedPresetId, setSelectedPresetId] = useState<string>("cotton");
  const [customMaterial, setCustomMaterial] = useState<string>("");
  const [simO2, setSimO2] = useState<number>(100);
  const [simPsi, setSimPsi] = useState<number>(4.3);
  const [simGravity, setSimGravity] = useState<number>(0);
  const [simEnvName, setSimEnvName] = useState<string>("Traje EVA");
  const [simAnalysis, setSimAnalysis] = useState<string>("");

  // Posición: lado de la pantalla y desplazamiento mientras se arrastra
  const [side, setSide] = useState<Side>("left");
  const [dragX, setDragX] = useState(0);

  const prevModelRef = useRef<string>(RAG_MODE);
  const warmupAbortRef = useRef<AbortController | null>(null);
  const streamAbortRef = useRef<AbortController | null>(null);
  const voiceEnabledRef = useRef(voiceEnabled);
  const selectedModelRef = useRef(selectedModel);
  const modelReadyRef = useRef(modelReady);
  const lastInputRef = useRef(0);
  const lastEnvChangeRef = useRef(0);
  const listRef = useRef<HTMLDivElement | null>(null);
  const rootRef = useRef<HTMLElement | null>(null);
  const dragRef = useRef<{
    startX: number;
    minDx: number;
    maxDx: number;
    moved: boolean;
  } | null>(null);
  const suppressClickRef = useRef(false);

  const t = THEMES[themeName];

  const currentPreset = useMemo(
    () =>
      MATERIAL_PRESETS.find((p) => p.id === selectedPresetId) ||
      MATERIAL_PRESETS[0],
    [selectedPresetId]
  );

  const isCustomMaterial = customMaterial.trim().length > 0;

  const simResult = useMemo(
    () =>
      computeSimulationPhysics({
        preset: currentPreset,
        customMaterial,
        o2Percent: simO2,
        pressurePsi: simPsi,
        gravityG: simGravity,
        environmentName: simEnvName,
      }),
    [currentPreset, customMaterial, simO2, simPsi, simGravity, simEnvName]
  );

  const simFallback = useMemo(
    () =>
      buildFallbackSimulationReport(
        simResult,
        isCustomMaterial ? undefined : currentPreset.note
      ),
    [simResult, isCustomMaterial, currentPreset.note]
  );

  const simText = simAnalysis || simFallback;
  const lastFlameyText =
    [...messages].reverse().find((m) => m.role === "flamey")?.text || "";

  // Botones de pregunta: solo los temas que aún no se han tocado.
  const quickChips = useMemo(() => {
    if (!context) return [];
    const covered = coveredIntents(messages);
    return availableIntents(context)
      .filter((id) => !covered.has(id))
      .map((id) => INTENTS.find((i) => i.id === id)!);
  }, [context, messages]);

  /* ---------------- Tema y posición guardados ---------------- */

  // Se leen en un efecto (no en el estado inicial) para no romper el prerender.
  useEffect(() => {
    try {
      const savedTheme = window.localStorage.getItem(THEME_STORAGE_KEY);
      if (savedTheme === "light" || savedTheme === "dark") setThemeName(savedTheme);

      const savedSide = window.localStorage.getItem(SIDE_STORAGE_KEY);
      if (savedSide === "left" || savedSide === "right") setSide(savedSide);
    } catch {
      // Sin acceso a localStorage: oscuro y a la izquierda
    }
  }, []);

  const toggleTheme = () => {
    const next: ThemeName = themeName === "dark" ? "light" : "dark";
    setThemeName(next);
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      // Ignorar
    }
  };

  const saveSide = (next: Side) => {
    setSide(next);
    try {
      window.localStorage.setItem(SIDE_STORAGE_KEY, next);
    } catch {
      // Ignorar
    }
  };

  /* ---------------- Arrastre a izquierda o derecha ---------------- */

  const onDragStart = (e: React.PointerEvent<HTMLElement>) => {
    if (e.button !== 0 || !rootRef.current) return;
    const rect = rootRef.current.getBoundingClientRect();
    dragRef.current = {
      startX: e.clientX,
      // Límites: no pasar sobre el menú lateral ni salirse de la ventana.
      minDx: navRightEdge() + EDGE_GAP_PX - rect.left,
      maxDx: window.innerWidth - EDGE_GAP_PX - rect.right,
      moved: false,
    };
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onDragMove = (e: React.PointerEvent<HTMLElement>) => {
    const d = dragRef.current;
    if (!d) return;
    const dx = e.clientX - d.startX;
    if (Math.abs(dx) > DRAG_THRESHOLD_PX) d.moved = true;
    if (d.moved) setDragX(Math.max(d.minDx, Math.min(d.maxDx, dx)));
  };

  const onDragEnd = () => {
    const d = dragRef.current;
    if (!d) return;
    dragRef.current = null;

    if (d.moved && rootRef.current) {
      // Se queda en el lado más cercano del área libre (sin contar el menú).
      const rect = rootRef.current.getBoundingClientRect();
      const center = rect.left + rect.width / 2;
      const middle = (navRightEdge() + window.innerWidth) / 2;
      saveSide(center < middle ? "left" : "right");

      // Evita que soltar el arrastre cuente como clic.
      suppressClickRef.current = true;
      window.setTimeout(() => {
        suppressClickRef.current = false;
      }, 80);
    }
    setDragX(0);
  };

  const dragProps = {
    onPointerDown: onDragStart,
    onPointerMove: onDragMove,
    onPointerUp: onDragEnd,
    onPointerCancel: onDragEnd,
  };

  // --sidebar-w lo publica AppShell: así Flamey nunca queda sobre el menú.
  const positionStyle: React.CSSProperties = {
    ...(side === "left"
      ? { left: "calc(var(--sidebar-w, 0px) + 1rem)" }
      : { right: "1.25rem" }),
    transform: dragX ? `translateX(${dragX}px)` : undefined,
  };

  /* ---------------- Refs al día ---------------- */

  useEffect(() => {
    selectedModelRef.current = selectedModel;
    modelReadyRef.current = modelReady;
  }, [selectedModel, modelReady]);

  // Registra el último clic o Enter para saber si un cambio lo pidió la persona.
  useEffect(() => {
    const mark = () => {
      lastInputRef.current = performance.now();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Enter" || e.key === " ") mark();
    };
    window.addEventListener("pointerdown", mark, true);
    window.addEventListener("keydown", onKey, true);
    return () => {
      window.removeEventListener("pointerdown", mark, true);
      window.removeEventListener("keydown", onKey, true);
    };
  }, []);

  /* ---------------- Voz ---------------- */

  useEffect(() => {
    voiceEnabledRef.current = voiceEnabled;
    if (!voiceEnabled) stopVoice();
  }, [voiceEnabled]);

  useEffect(() => {
    setVoiceAvailable(isVoiceSupported());
    return () => stopVoice();
  }, []);

  const toggleVoice = () => {
    const next = !voiceEnabled;
    setVoiceEnabled(next);

    if (!next) {
      stopVoice();
      return;
    }
    if (tab === "sim") speakText(simText);
    else if (lastFlameyText) speakText(lastFlameyText);
  };

  /* ---------------- Modelos locales ---------------- */

  const scanLocalModels = useCallback(async () => {
    setScanning(true);
    const list = await getOllamaModels();
    setModels(list);
    if (list.length > 0) {
      // Los modelos "coder" son para programar y explican peor: van al final.
      const chat = list.filter((m) => !m.includes("coder"));
      const pool = chat.length > 0 ? chat : list;
      const preferred =
        pool.find((m) => m.includes("qwen2.5")) ||
        pool.find((m) => m.includes("1.5b") || m.includes("2b")) ||
        pool.find((m) => m.includes("1b")) ||
        pool[0];
      setSelectedModel((curr) =>
        curr !== RAG_MODE && list.includes(curr) ? curr : preferred
      );
    } else {
      // Sin Ollama: Flamey sigue funcionando con los datos de la NASA.
      setSelectedModel(RAG_MODE);
    }
    setScanning(false);
  }, []);

  useEffect(() => {
    scanLocalModels();
    api
      .rules()
      .then((data) => {
        setRules(data);
        // Empieza en un dato distinto cada visita (aquí sí se permite Math.random).
        const total = data.rules?.length || 0;
        if (total > 0) setRuleIdx(Math.floor(Math.random() * total));
      })
      .catch(() => {});
  }, [scanLocalModels]);

  useEffect(() => {
    streamAbortRef.current?.abort();
    warmupAbortRef.current?.abort();
    stopVoice();
    setStreaming(false);
    setDraft("");

    if (selectedModel === RAG_MODE) {
      if (prevModelRef.current && prevModelRef.current !== RAG_MODE) {
        unloadOllamaModel(prevModelRef.current);
      }
      prevModelRef.current = RAG_MODE;
      setLoadingModel(false);
      setModelReady(true);
      return;
    }

    const controller = new AbortController();
    warmupAbortRef.current = controller;

    setModelReady(false);
    setLoadingModel(true);

    const switchModel = async () => {
      if (
        prevModelRef.current &&
        prevModelRef.current !== RAG_MODE &&
        prevModelRef.current !== selectedModel
      ) {
        await unloadOllamaModel(prevModelRef.current);
      }
      prevModelRef.current = selectedModel;

      const ok = await warmupOllamaModel(selectedModel, controller.signal);
      if (!controller.signal.aborted) {
        setLoadingModel(false);
        setModelReady(ok);
      }
    };

    switchModel();
    return () => controller.abort();
  }, [selectedModel]);

  /* ---------------- Chat: generar una respuesta ---------------- */

  const cancelStream = useCallback(() => {
    streamAbortRef.current?.abort();
    setStreaming(false);
    setDraft("");
  }, []);

  /**
   * Genera una respuesta de Flamey y la añade al chat.
   * Sin `q` explica el experimento; con `q` responde usando el historial.
   * Si hay modelo local lo usa; si no (o si falla), responde con los datos.
   */
  const generate = useCallback(
    async (ctx: ContextOut, q: string | undefined, history: ChatMsg[]) => {
      stopVoice();
      streamAbortRef.current?.abort();

      const controller = new AbortController();
      streamAbortRef.current = controller;
      setDraft("");
      setStreaming(true);

      const deliver = (text: string) => {
        setMessages((m) => [...m, { role: "flamey", text }]);
        setDraft("");
        setStreaming(false);
        if (voiceEnabledRef.current) speakText(text);
      };

      const lastFlamey =
        [...history].reverse().find((m) => m.role === "flamey")?.text || "";
      const intent = q ? detectIntent(q, lastFlamey) : null;
      const covered = coveredIntents(history, intent);

      // Mismo experimento, evaluado en el traje: dato real de la API.
      let suitContext: ContextOut | undefined;
      if (intent === "suit" && ctx.environment.key !== SUIT_ENV_KEY) {
        try {
          suitContext = await api.findingContext(ctx.finding.key, SUIT_ENV_KEY);
        } catch {
          suitContext = undefined;
        }
        if (controller.signal.aborted) return;
      }

      const fromData = () =>
        answerFromData(ctx, q ? intent : "explain", covered, suitContext);

      const model = selectedModelRef.current;
      const useLocal = model !== RAG_MODE && modelReadyRef.current;

      // Sin modelo, o pregunta de dato exacto: se responde desde la base.
      if (!useLocal || (intent && DATA_ONLY.has(intent))) {
        deliver(fromData());
        return;
      }

      let finalReply = "";
      try {
        await askOllamaStream({
          model,
          context: ctx,
          userQuestion: q,
          suitContext,
          history: history.slice(-HISTORY_TURNS).map((m) => ({
            role: m.role === "user" ? ("user" as const) : ("assistant" as const),
            content: m.text,
          })),
          signal: controller.signal,
          onToken: (text) => {
            finalReply = text;
            setDraft(text);
          },
        });
      } catch {
        if (controller.signal.aborted) return;
        finalReply = "";
      }

      if (controller.signal.aborted) return;
      deliver(finalReply.trim() || fromData());
    },
    []
  );

  const explainCurrent = () => {
    if (!context) return;
    setMessages([]);
    generate(context, undefined, []);
  };

  const submitQuestion = (rawQuestion: string) => {
    const q = rawQuestion.trim();
    if (!q || !context || streaming) return;

    const history = messages;
    setQuestion("");
    setMessages((m) => [...m, { role: "user", text: q }]);
    generate(context, q, history);
  };

  const handleAskSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    submitQuestion(question);
  };

  const clearChat = () => {
    stopVoice();
    cancelStream();
    setMessages([]);
  };

  /* ---------------- Experimento seleccionado ---------------- */

  // Va antes del efecto del experimento: si cambian a la vez, gana "automático".
  useEffect(() => {
    lastEnvChangeRef.current = performance.now();
  }, [environmentKey]);

  useEffect(() => {
    if (!activeFinding) return;
    let cancelled = false;

    // ¿Lo pidió la persona con un clic, o lo puso la página por su cuenta?
    const lastInput = lastInputRef.current;
    const explicit =
      performance.now() - lastInput < EXPLICIT_WINDOW_MS &&
      lastInput > lastEnvChangeRef.current;

    stopVoice();
    streamAbortRef.current?.abort();
    setStreaming(false);
    setDraft("");
    setMessages([]);
    setContext(null);
    setLoadingCtx(true);

    if (explicit) {
      setOpen(true);
      setTab("finding");
    }

    api
      .findingContext(activeFinding.key, environmentKey)
      .then((ctx) => {
        if (cancelled) return;
        setContext(ctx);
        // Solo explica de inmediato si se pidió. Si no, espera.
        if (explicit) generate(ctx, undefined, []);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoadingCtx(false);
      });

    return () => {
      cancelled = true;
    };
  }, [activeFinding, environmentKey, generate]);

  // Mantiene el chat pegado al último mensaje.
  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, draft, streaming]);

  /* ---------------- Simulador en vivo ---------------- */

  useEffect(() => {
    if (tab !== "sim") return;

    setSimAnalysis(simFallback);

    const timer = setTimeout(() => {
      if (selectedModel === RAG_MODE || !modelReady) {
        if (voiceEnabledRef.current) speakSimulationVerdict(simResult);
        return;
      }

      streamAbortRef.current?.abort();
      const controller = new AbortController();
      streamAbortRef.current = controller;

      let finalSimReply = "";
      setStreaming(true);
      askMaterialSimulationStream({
        model: selectedModel,
        sim: simResult,
        signal: controller.signal,
        onToken: (text) => {
          finalSimReply = text;
          setSimAnalysis(text);
        },
      })
        .then(() => {
          if (!controller.signal.aborted && voiceEnabledRef.current && finalSimReply) {
            speakText(finalSimReply);
          }
        })
        .catch((err) => {
          if ((err as Error)?.name !== "AbortError") {
            setSimAnalysis(simFallback);
            if (voiceEnabledRef.current) speakSimulationVerdict(simResult);
          }
        })
        .finally(() => {
          if (!controller.signal.aborted) setStreaming(false);
        });
    }, 850);

    return () => {
      clearTimeout(timer);
      streamAbortRef.current?.abort();
      setStreaming(false);
    };
  }, [tab, simResult, simFallback, selectedModel, modelReady]);

  /* ---------------- Vista minimizada ---------------- */

  if (!open) {
    return (
      <button
        ref={(el) => {
          rootRef.current = el;
        }}
        type="button"
        {...dragProps}
        onClick={() => {
          if (suppressClickRef.current) return;
          setOpen(true);
        }}
        style={positionStyle}
        title="Abrir Flamey. Arrastra para moverlo de lado."
        aria-label="Abrir asistente Flamey"
        className={`fixed bottom-5 z-30 flex cursor-pointer touch-none select-none items-center gap-2 rounded-full border px-3.5 py-2 shadow-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-400 ${t.pill}`}
      >
        <Flame className="h-4 w-4 text-orange-500" />
        <span className="font-hud text-xs font-bold tracking-wide">FLAMEY</span>
        <ChevronUp className={`h-3.5 w-3.5 ${t.muted}`} />
      </button>
    );
  }

  const isLocalModel = selectedModel !== RAG_MODE;
  const shortModelName = selectedModel.split(":")[0];
  const meta = VERDICT_META[simResult.verdict];
  const VerdictIcon = meta.Icon;
  const currentRule = rules?.rules?.length
    ? rules.rules[ruleIdx % rules.rules.length]
    : null;
  const chatStarted = messages.length > 0 || (tab === "finding" && streaming);

  const statusDot = loadingModel
    ? "bg-amber-400 animate-pulse"
    : isLocalModel
    ? "bg-emerald-500"
    : "bg-teal-500";
  const statusTitle = loadingModel
    ? `Cargando ${shortModelName}... mientras tanto respondo con los datos`
    : modelLabel(selectedModel);

  /* ---------------- Vista abierta ---------------- */

  return (
    <ThemeCtx.Provider value={t}>
      <aside
        ref={(el) => {
          rootRef.current = el;
        }}
        style={positionStyle}
        aria-label="Asistente de seguridad contra incendios Flamey"
        className={`fixed bottom-5 z-30 flex max-h-[70vh] w-[320px] flex-col overflow-hidden rounded-2xl border shadow-2xl backdrop-blur-xl ${t.panel}`}
      >
        {/* CABECERA */}
        <div
          className={`flex shrink-0 items-center justify-between gap-2 border-b px-3 py-2 ${t.divider}`}
        >
          {/* Zona de arrastre: mueve Flamey a izquierda o derecha */}
          <div
            {...dragProps}
            title="Arrastra para mover Flamey de lado"
            className="flex min-w-0 flex-1 cursor-grab touch-none select-none items-center gap-2 active:cursor-grabbing"
          >
            <Flame className="h-4 w-4 shrink-0 text-orange-500" />
            <h2 className={`font-hud text-xs font-bold tracking-wider ${t.title}`}>
              FLAMEY
            </h2>
            <span
              title={statusTitle}
              aria-label={statusTitle}
              className={`h-2 w-2 shrink-0 rounded-full ${statusDot}`}
            />
          </div>

          <div className="flex shrink-0 items-center gap-1">
            {voiceAvailable && (
              <IconBtn
                label={voiceEnabled ? "Desactivar voz" : "Activar voz"}
                active={voiceEnabled}
                onClick={toggleVoice}
              >
                {voiceEnabled ? (
                  <Volume2 className="h-3.5 w-3.5" />
                ) : (
                  <VolumeX className="h-3.5 w-3.5" />
                )}
              </IconBtn>
            )}
            <IconBtn
              label={themeName === "dark" ? "Cambiar a modo claro" : "Cambiar a modo oscuro"}
              onClick={toggleTheme}
            >
              {themeName === "dark" ? (
                <Sun className="h-3.5 w-3.5" />
              ) : (
                <Moon className="h-3.5 w-3.5" />
              )}
            </IconBtn>
            <IconBtn
              label={side === "left" ? "Mover a la derecha" : "Mover a la izquierda"}
              onClick={() => saveSide(side === "left" ? "right" : "left")}
            >
              <ArrowLeftRight className="h-3.5 w-3.5" />
            </IconBtn>
            <IconBtn
              label="Elegir motor de respuestas"
              active={showSettings}
              onClick={() => setShowSettings((v) => !v)}
            >
              <Settings className="h-3.5 w-3.5" />
            </IconBtn>
            <IconBtn
              label="Minimizar Flamey"
              onClick={() => {
                stopVoice();
                setOpen(false);
              }}
            >
              <ChevronDown className="h-4 w-4" />
            </IconBtn>
          </div>
        </div>

        {/* MOTOR DE RESPUESTAS (oculto por defecto) */}
        {showSettings && (
          <div className={`shrink-0 space-y-1.5 border-b px-3 py-2 ${t.divider}`}>
            <div className="flex items-center gap-1.5">
              <label htmlFor="flamey-model-select" className="sr-only">
                Motor de respuestas
              </label>
              <select
                id="flamey-model-select"
                value={selectedModel}
                onChange={(e) => setSelectedModel(e.target.value)}
                className={`h-7 min-w-0 flex-1 cursor-pointer rounded-lg border px-2 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-400 ${t.modelSelect}`}
              >
                <option value={RAG_MODE}>{modelLabel(RAG_MODE)}</option>
                {models.map((m) => (
                  <option key={m} value={m}>
                    {modelLabel(m)}
                  </option>
                ))}
              </select>
              <IconBtn
                label="Buscar modelos en Ollama"
                disabled={scanning}
                onClick={scanLocalModels}
              >
                <RefreshCw className={`h-3.5 w-3.5 ${scanning ? "animate-spin" : ""}`} />
              </IconBtn>
            </div>
            {models.length === 0 && !scanning && (
              <p className={`text-[11px] ${t.muted}`}>
                No encontré Ollama en este equipo. Respondo con los datos de la NASA.
              </p>
            )}
          </div>
        )}

        {/* PESTAÑAS */}
        <div
          role="tablist"
          aria-label="Secciones de Flamey"
          className={`grid shrink-0 grid-cols-2 border-b ${t.divider}`}
        >
          {(
            [
              { id: "finding", label: "Chat", Icon: MessageCircle },
              { id: "sim", label: "Simular", Icon: Sliders },
            ] as const
          ).map(({ id, label, Icon }) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={tab === id}
              onClick={() => {
                if (tab === id) return;
                stopVoice();
                cancelStream();
                setTab(id);
              }}
              className={`flex h-8 cursor-pointer items-center justify-center gap-1.5 border-b-2 font-hud text-xs font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-teal-400 ${
                tab === id ? t.tabOn : t.tabOff
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              {label}
            </button>
          ))}
        </div>

        {/* CUERPO */}
        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          {/* ============ CHAT ============ */}
          {tab === "finding" && (
            <div role="tabpanel" className="space-y-2">
              {!context ? (
                <div
                  className={`flex items-center justify-center gap-2 py-4 text-center text-xs ${t.soft}`}
                >
                  {loadingCtx ? (
                    <>
                      <Loader2 className={`h-3.5 w-3.5 animate-spin ${t.accent}`} />
                      Cargando experimento...
                    </>
                  ) : (
                    "Elige un experimento del ranking y te lo explico."
                  )}
                </div>
              ) : (
                <>
                  {/* Experimento en contexto */}
                  <div className="flex items-center gap-2">
                    <div className="min-w-0 flex-1 font-hud text-[11px]">
                      <div className={`truncate ${t.sub}`}>
                        {context.finding.experiment} · {context.environment.label}
                      </div>
                      <div className={t.muted}>
                        {Math.round(context.environment.o2_fraction * 100)}% O₂ ·{" "}
                        {fmt(context.environment.pressure_atm)} atm ·{" "}
                        {context.environment.gravity_g === 0
                          ? "µg"
                          : `${context.environment.gravity_g} g`}
                      </div>
                    </div>
                    {chatStarted && (
                      <IconBtn label="Limpiar conversación" onClick={clearChat}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </IconBtn>
                    )}
                  </div>

                  {/* Flamey espera hasta que se lo pidan */}
                  {!chatStarted ? (
                    <button
                      type="button"
                      onClick={explainCurrent}
                      className="flex h-9 w-full cursor-pointer items-center justify-center gap-1.5 rounded-xl bg-teal-500 text-xs font-semibold text-slate-950 hover:bg-teal-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-300"
                    >
                      <Sparkles className="h-3.5 w-3.5" />
                      Explicar este experimento
                    </button>
                  ) : (
                    <div
                      ref={listRef}
                      aria-live="polite"
                      className="max-h-56 space-y-1.5 overflow-y-auto"
                    >
                      {messages.map((m, i) =>
                        m.role === "user" ? (
                          <p
                            key={i}
                            className={`ml-8 rounded-xl rounded-br-sm px-2.5 py-1.5 text-xs ${t.userBubble}`}
                          >
                            {m.text}
                          </p>
                        ) : (
                          <div
                            key={i}
                            className={`mr-4 rounded-xl rounded-bl-sm border px-2.5 py-2 ${t.botBubble}`}
                          >
                            <Answer text={m.text} />
                          </div>
                        )
                      )}

                      {streaming && (
                        <div
                          className={`mr-4 rounded-xl rounded-bl-sm border px-2.5 py-2 ${t.botBubble}`}
                        >
                          {draft ? (
                            <>
                              <Answer text={draft} />
                              <span className="ml-1 inline-block h-3 w-1.5 animate-pulse bg-teal-500 align-middle" />
                            </>
                          ) : (
                            <div
                              className={`flex items-center gap-2 font-hud text-xs ${t.accent}`}
                            >
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              Pensando...
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Preguntas sugeridas: solo las que faltan por hacer */}
                  {quickChips.length > 0 && (
                    <div className="-mx-3 flex gap-1.5 overflow-x-auto px-3 pb-0.5">
                      {quickChips.map((chip) => (
                        <button
                          key={chip.id}
                          type="button"
                          disabled={streaming}
                          onClick={() => submitQuestion(chip.chip)}
                          className={`shrink-0 cursor-pointer whitespace-nowrap rounded-full border px-2.5 py-1 text-[11px] disabled:opacity-40 ${t.chip}`}
                        >
                          {chip.chip}
                        </button>
                      ))}
                    </div>
                  )}

                  <form onSubmit={handleAskSubmit} className="flex gap-1.5">
                    <label htmlFor="flamey-ask-input" className="sr-only">
                      Escribe tu pregunta
                    </label>
                    <input
                      id="flamey-ask-input"
                      type="text"
                      value={question}
                      onChange={(e) => setQuestion(e.target.value)}
                      placeholder="Pregunta algo..."
                      className={`h-8 min-w-0 flex-1 rounded-lg border px-2.5 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-400 ${t.field}`}
                    />
                    <button
                      type="submit"
                      disabled={streaming || !question.trim()}
                      aria-label="Enviar pregunta"
                      className="h-8 cursor-pointer rounded-lg bg-teal-500 px-2.5 text-slate-950 hover:bg-teal-400 disabled:opacity-40"
                    >
                      <Send className="h-3.5 w-3.5" />
                    </button>
                  </form>

                  {/* Pie: fuentes, dato curioso, escuchar */}
                  <div className="flex items-center gap-1">
                    <IconBtn
                      label="Ver registros PSI usados"
                      active={showSources}
                      onClick={() => setShowSources((v) => !v)}
                    >
                      <Database className="h-3.5 w-3.5" />
                      {context.evidence.length}
                    </IconBtn>
                    {currentRule && (
                      <IconBtn
                        label="Mito y realidad"
                        active={showRule}
                        onClick={() => setShowRule((v) => !v)}
                      >
                        <Lightbulb className="h-3.5 w-3.5" />
                      </IconBtn>
                    )}
                    {voiceAvailable && (
                      <IconBtn
                        label="Escuchar la última respuesta"
                        disabled={streaming || !lastFlameyText}
                        onClick={() => speakText(lastFlameyText)}
                      >
                        <Volume2 className="h-3.5 w-3.5" />
                      </IconBtn>
                    )}
                  </div>

                  {showSources && (
                    <div className="space-y-1">
                      {context.evidence.slice(0, 3).map((ev, idx) => (
                        <div
                          key={idx}
                          className={`flex justify-between gap-2 rounded-lg border px-2 py-1 font-hud text-[11px] ${t.surface} ${t.soft}`}
                        >
                          <span className={`truncate ${t.file}`}>{ev.file}</span>
                          <span className="shrink-0">
                            Fila {ev.row} · {Math.round(ev.quality * 100)}%
                          </span>
                        </div>
                      ))}
                    </div>
                  )}

                  {showRule && currentRule && (
                    <div className={`space-y-1 rounded-lg border p-2 text-xs ${t.surface}`}>
                      <p className={t.myth}>Mito: {currentRule.mito}</p>
                      <p className={t.fact}>Realidad: {currentRule.hecho}</p>
                      <button
                        type="button"
                        onClick={() => setRuleIdx((i) => i + 1)}
                        className={`cursor-pointer font-hud text-[11px] ${t.link}`}
                      >
                        Ver otro
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* ============ SIMULAR ============ */}
          {tab === "sim" && (
            <div role="tabpanel" className="space-y-2">
              {/* Entorno */}
              <div className="flex items-center gap-1">
                <div className="grid flex-1 grid-cols-5 gap-1">
                  {ENV_PRESETS.map((env) => {
                    const active = simEnvName === env.label && simO2 === env.o2;
                    return (
                      <button
                        key={env.id}
                        type="button"
                        title={`${env.label}: ${env.o2}% O₂, ${fmt(toAtm(env.psi))} atm, ${env.g} g`}
                        aria-pressed={active}
                        onClick={() => {
                          setSimEnvName(env.label);
                          setSimO2(env.o2);
                          setSimPsi(env.psi);
                          setSimGravity(env.g);
                        }}
                        className={`h-7 cursor-pointer rounded-lg border font-hud text-[11px] transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-400 ${
                          active ? t.envOn : t.envOff
                        }`}
                      >
                        {env.short}
                      </button>
                    );
                  })}
                </div>
                <IconBtn
                  label="Ajustar oxígeno, presión y gravedad"
                  active={showAdvanced}
                  onClick={() => setShowAdvanced((v) => !v)}
                >
                  <Sliders className="h-3.5 w-3.5" />
                </IconBtn>
              </div>

              {/* Ajuste fino */}
              {showAdvanced && (
                <div
                  className={`space-y-2 rounded-lg border p-2 font-hud text-[11px] ${t.surface} ${t.soft}`}
                >
                  <label htmlFor="sim-o2-slider" className="flex items-center gap-2">
                    <span className="w-14 shrink-0">Oxígeno</span>
                    <input
                      id="sim-o2-slider"
                      type="range"
                      min={21}
                      max={100}
                      value={simO2}
                      onChange={(e) => {
                        setSimO2(Number(e.target.value));
                        setSimEnvName("Mezcla personalizada");
                      }}
                      className="h-1.5 min-w-0 flex-1 cursor-pointer accent-teal-500"
                    />
                    <span
                      className={`w-12 shrink-0 text-right font-bold ${
                        simO2 >= 50 ? t.danger : simO2 >= 30 ? t.warn : t.ok
                      }`}
                    >
                      {simO2}%
                    </span>
                  </label>

                  <label htmlFor="sim-psi-slider" className="flex items-center gap-2">
                    <span className="w-14 shrink-0">Presión</span>
                    <input
                      id="sim-psi-slider"
                      type="range"
                      min={4.3}
                      max={14.7}
                      step={0.1}
                      value={simPsi}
                      onChange={(e) => {
                        setSimPsi(Number(e.target.value));
                        setSimEnvName("Mezcla personalizada");
                      }}
                      className="h-1.5 min-w-0 flex-1 cursor-pointer accent-cyan-500"
                    />
                    <span className={`w-12 shrink-0 text-right ${t.info}`}>
                      {fmt(toAtm(simPsi))} atm
                    </span>
                  </label>

                  <label htmlFor="sim-gravity-select" className="flex items-center gap-2">
                    <span className="w-14 shrink-0">Gravedad</span>
                    <select
                      id="sim-gravity-select"
                      value={simGravity}
                      onChange={(e) => {
                        setSimGravity(Number(e.target.value));
                        setSimEnvName("Mezcla personalizada");
                      }}
                      className={`h-7 min-w-0 flex-1 cursor-pointer rounded-lg border px-1.5 ${t.select}`}
                    >
                      <option value={0}>0 g (ISS / EVA)</option>
                      <option value={0.165}>0,165 g (Luna)</option>
                      <option value={0.38}>0,38 g (Marte)</option>
                      <option value={1}>1 g (Tierra)</option>
                    </select>
                  </label>
                </div>
              )}

              {/* Material */}
              <div className="flex gap-1.5">
                <label htmlFor="sim-material-select" className="sr-only">
                  Material
                </label>
                <select
                  id="sim-material-select"
                  value={selectedPresetId}
                  onChange={(e) => {
                    setSelectedPresetId(e.target.value);
                    setCustomMaterial("");
                  }}
                  className={`h-8 min-w-0 flex-1 cursor-pointer rounded-lg border px-2 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-400 ${t.field} ${
                    isCustomMaterial ? "opacity-50" : ""
                  }`}
                >
                  {MATERIAL_PRESETS.map((mat) => (
                    <option key={mat.id} value={mat.id}>
                      {mat.shortName}
                    </option>
                  ))}
                </select>
                <label htmlFor="sim-custom-material" className="sr-only">
                  Otro material
                </label>
                <input
                  id="sim-custom-material"
                  type="text"
                  value={customMaterial}
                  onChange={(e) => setCustomMaterial(e.target.value)}
                  placeholder="Otro: Velcro..."
                  className={`h-8 min-w-0 flex-1 rounded-lg border px-2.5 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-400 ${t.field}`}
                />
              </div>

              {/* Veredicto (toca para ver el porqué) */}
              <div
                role="status"
                aria-live="polite"
                className={`rounded-xl border ${meta.box[themeName]}`}
              >
                <button
                  type="button"
                  onClick={() => setShowWhy((v) => !v)}
                  aria-expanded={showWhy}
                  aria-label="Ver explicación del veredicto"
                  className="block w-full cursor-pointer rounded-xl p-2.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-400"
                >
                  <div className="flex items-center gap-2.5">
                    <VerdictIcon
                      className={`h-6 w-6 shrink-0 ${meta.iconColor[themeName]}`}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="font-hud text-sm font-bold leading-tight">
                        {meta.label}
                      </div>
                      <div className="truncate text-[11px] opacity-90">
                        {simResult.materialName} · {simEnvName}
                      </div>
                    </div>
                    <div className="shrink-0 text-right font-hud">
                      <div className="text-base font-bold leading-none">
                        {simResult.riskScore}
                        <span className="text-[11px] font-normal opacity-70">/100</span>
                      </div>
                      <div className="mt-0.5 text-[11px] opacity-80">
                        {simResult.spreadMmPerSec} mm/s
                      </div>
                    </div>
                    {streaming ? (
                      <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin opacity-70" />
                    ) : showWhy ? (
                      <ChevronUp className="h-3.5 w-3.5 shrink-0 opacity-70" />
                    ) : (
                      <ChevronDown className="h-3.5 w-3.5 shrink-0 opacity-70" />
                    )}
                  </div>
                  <div className={`mt-2 h-1.5 overflow-hidden rounded-full ${t.track}`}>
                    <div
                      className={`h-full transition-all ${meta.bar}`}
                      style={{ width: `${simResult.riskScore}%` }}
                    />
                  </div>
                </button>

                {showWhy && (
                  <div className={`border-t px-2.5 pb-2.5 pt-2 ${t.whyDivider}`}>
                    <div className="max-h-40 overflow-y-auto">
                      <Answer text={simText} />
                    </div>
                    {voiceAvailable && (
                      <div className="mt-2 flex justify-end">
                        <IconBtn
                          label="Escuchar explicación"
                          disabled={streaming}
                          onClick={() => speakText(simText)}
                        >
                          <Volume2 className="h-3.5 w-3.5" />
                        </IconBtn>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </aside>
    </ThemeCtx.Provider>
  );
}