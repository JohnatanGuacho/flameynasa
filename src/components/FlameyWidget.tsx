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
} from "lucide-react";

interface Props {
  activeFinding: FindingOut | null;
  environmentKey: string;
}

interface ChatMsg {
  role: "user" | "flamey";
  text: string;
}

const RAG_MODE = "psi-rag";
const PSI_PER_ATM = 14.696;
// Un cambio de experimento cuenta como "pedido por la persona" si llega
// justo después de un clic o Enter. Si no, Flamey espera.
const EXPLICIT_WINDOW_MS = 700;
// Turnos previos que se envían al modelo.
const HISTORY_TURNS = 6;
const THEME_STORAGE_KEY = "flamey-theme";
// Clave del entorno "traje espacial" en la API (valor por defecto del OpenAPI).
const SUIT_ENV_KEY = "eva";

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

const modelLabel = (m: string): string =>
  m === RAG_MODE ? "Rápido (sin GPU)" : `IA local · ${m.split(":")[0]}`;

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

const QUICK_QUESTIONS = [
  "¿Es peligroso en traje EVA?",
  "¿Cómo se apaga en 0g?",
  "¿Qué material lo reemplaza?",
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

/* ------------------------------------------------------------------ */
/*  Respuestas del modo Rápido (sin IA): prosa natural, sin etiquetas  */
/* ------------------------------------------------------------------ */

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

function buildPsiRagReport(
  ctx: ContextOut,
  question?: string,
  suitContext?: ContextOut
): string {
  const { finding, environment } = ctx;
  const o2Pct = Math.round(environment.o2_fraction * 100);
  const atm = fmt(environment.pressure_atm);
  const isCritical = o2Pct >= 30;
  const material = finding.material || "la muestra";
  const where = `En ${environment.label}, con ${o2Pct}% de O₂ a ${atm} atm`;

  if (question) {
    const q = question.toLowerCase();

    if (q.includes("reempl") || q.includes("sustit") || q.includes("alternativ")) {
      return `Lo más seguro es cambiar ${material} por una tela que no arde, como Nomex o PBI, o por teflón en los cables. ${where}, esos materiales aguantan mucho mejor. ¿Quieres saber cómo se apagaría esta llama sin gravedad?`;
    }

    if (
      q.includes("apag") ||
      q.includes("supres") ||
      q.includes("preven") ||
      q.includes("mitig")
    ) {
      return `Sin gravedad la llama no sube, así que lo primero es cortar el flujo de aire que la alimenta. Después se puede diluir el aire con dióxido de carbono o helio. La tripulación tendría unos ${environment.egress_s} segundos para salir. ¿Quieres saber qué material podría reemplazarlo?`;
    }

    if (q.includes("eva") || q.includes("traje") || suitContext) {
      if (suitContext) {
        const suit = suitContext.finding;
        const suitO2 = Math.round(suitContext.environment.o2_fraction * 100);
        return `Dentro del traje espacial el aire tiene ${suitO2}% de O₂ a ${fmt(
          suitContext.environment.pressure_atm
        )} atm. Para este mismo experimento el riesgo allí es ${suit.rpi} de 100, y en ${
          environment.label
        } es ${finding.rpi} de 100. ${
          suit.rpi > finding.rpi
            ? "En el traje sería más peligroso."
            : "El riesgo calculado en el traje no es mayor."
        } ¿Quieres saber qué material podría reemplazarlo?`;
      }
      return `Dentro de un traje espacial el aire es oxígeno puro, así que ${material} ardería con mucha más facilidad que en ${environment.label}. Por eso los trajes solo usan telas que no arden. ¿Quieres saber qué material podría reemplazarlo?`;
    }

    if (q.includes("luna") || q.includes("peligro") || q.includes("usar")) {
      return `${where}, ${
        isCritical
          ? `${material} es peligroso, porque con tanto oxígeno arde con facilidad.`
          : `${material} tiene un riesgo moderado si el aire circula con normalidad.`
      } ¿Quieres saber qué material podría reemplazarlo?`;
    }

    return `De ${finding.experiment} tengo ${finding.observations} corridas con ${material}. ${where}, el nivel de riesgo es ${finding.band}, ${finding.rpi} de 100. ¿Quieres saber qué material podría reemplazarlo?`;
  }

  return `En el experimento ${finding.experiment} se probó ${material} en ${
    finding.observations
  } corridas. ${where}, ${
    isCritical
      ? "ardería con más facilidad y la llama avanzaría más rápido."
      : "el riesgo es moderado, pero hay que vigilar que el oxígeno no se acumule."
  } Lo más seguro es usar telas que no arden, como Nomex o PBI. ¿Quieres saber cómo se apagaría esta llama sin gravedad?`;
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

  // Motor: PSI-RAG (instantáneo) o modelo local de Ollama
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

  const prevModelRef = useRef<string>(RAG_MODE);
  const warmupAbortRef = useRef<AbortController | null>(null);
  const streamAbortRef = useRef<AbortController | null>(null);
  const voiceEnabledRef = useRef(voiceEnabled);
  const selectedModelRef = useRef(selectedModel);
  const modelReadyRef = useRef(modelReady);
  const lastInputRef = useRef(0);
  const lastEnvChangeRef = useRef(0);
  const listRef = useRef<HTMLDivElement | null>(null);

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

  /* ---------------- Tema ---------------- */

  // Se lee en un efecto (no en el estado inicial) para no romper el prerender.
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(THEME_STORAGE_KEY);
      if (saved === "light" || saved === "dark") setThemeName(saved);
    } catch {
      // Sin acceso a localStorage: se queda en oscuro
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
      const preferred =
        list.find((m) => m.includes("qwen2.5")) ||
        list.find((m) => m.includes("1.5b") || m.includes("2b")) ||
        list.find((m) => m.includes("1b")) ||
        list[0];
      setSelectedModel((curr) =>
        curr !== RAG_MODE && list.includes(curr) ? curr : preferred
      );
    } else {
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

      // Un "sí" responde a la última pregunta que hizo Flamey.
      const lastFlamey =
        [...history].reverse().find((m) => m.role === "flamey")?.text || "";
      const saidYes = !!q && AFFIRMATIVE.test(q);

      const asksSuit =
        !!q &&
        (/\beva\b|traje/i.test(q) ||
          (saidYes && /traje espacial\?/i.test(lastFlamey)));

      // Mismo experimento, evaluado en el traje: dato real de la API.
      let suitContext: ContextOut | undefined;
      if (asksSuit && ctx.environment.key !== SUIT_ENV_KEY) {
        try {
          suitContext = await api.findingContext(ctx.finding.key, SUIT_ENV_KEY);
        } catch {
          suitContext = undefined;
        }
        if (controller.signal.aborted) return;
      }

      // Para el modo Rápido, un "sí" se traduce al tema que Flamey ofreció.
      let ragQuestion = q;
      if (saidYes) {
        if (asksSuit) ragQuestion = "traje";
        else if (/apagar[ií]a/i.test(lastFlamey)) ragQuestion = "apagar";
        else if (/reemplazar/i.test(lastFlamey)) ragQuestion = "reemplazo";
      }
      const fallback = () => buildPsiRagReport(ctx, ragQuestion, suitContext);

      const model = selectedModelRef.current;
      const useLocal = model !== RAG_MODE && modelReadyRef.current;

      if (!useLocal) {
        deliver(fallback());
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
      deliver(finalReply.trim() || fallback());
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
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Abrir asistente Flamey"
        className={`fixed bottom-5 left-16 z-30 flex cursor-pointer items-center gap-2 rounded-full border px-3.5 py-2 shadow-2xl transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-400 ${t.pill}`}
      >
        <Flame className="h-4 w-4 text-orange-500" />
        <span className="font-hud text-xs font-bold tracking-wide">FLAMEY</span>
        <ChevronUp className={`h-3.5 w-3.5 ${t.muted}`} />
      </button>
    );
  }

  const isLocalModel = selectedModel !== RAG_MODE;
  const canAsk = !isLocalModel || modelReady;
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
    ? `Cargando ${shortModelName}...`
    : modelLabel(selectedModel);

  /* ---------------- Vista abierta ---------------- */

  return (
    <ThemeCtx.Provider value={t}>
      <aside
        aria-label="Asistente de seguridad contra incendios Flamey"
        className={`fixed bottom-5 left-16 z-30 flex max-h-[70vh] w-[320px] flex-col overflow-hidden rounded-2xl border shadow-2xl backdrop-blur-xl ${t.panel}`}
      >
        {/* CABECERA */}
        <div
          className={`flex shrink-0 items-center justify-between gap-2 border-b px-3 py-2 ${t.divider}`}
        >
          <div className="flex min-w-0 items-center gap-2">
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
              label="Elegir motor de IA"
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

        {/* MOTOR DE IA (oculto por defecto) */}
        {showSettings && (
          <div
            className={`flex shrink-0 items-center gap-1.5 border-b px-3 py-2 ${t.divider}`}
          >
            <label htmlFor="flamey-model-select" className="sr-only">
              Motor de IA
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
                      disabled={!canAsk}
                      className="flex h-9 w-full cursor-pointer items-center justify-center gap-1.5 rounded-xl bg-teal-500 text-xs font-semibold text-slate-950 hover:bg-teal-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-300 disabled:opacity-40"
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

                  {/* Preguntas rápidas */}
                  <div className="-mx-3 flex gap-1.5 overflow-x-auto px-3 pb-0.5">
                    {QUICK_QUESTIONS.map((qText) => (
                      <button
                        key={qText}
                        type="button"
                        disabled={!canAsk || streaming}
                        onClick={() => submitQuestion(qText)}
                        className={`shrink-0 cursor-pointer whitespace-nowrap rounded-full border px-2.5 py-1 text-[11px] disabled:opacity-40 ${t.chip}`}
                      >
                        {qText}
                      </button>
                    ))}
                  </div>

                  <form onSubmit={handleAskSubmit} className="flex gap-1.5">
                    <label htmlFor="flamey-ask-input" className="sr-only">
                      Escribe tu pregunta
                    </label>
                    <input
                      id="flamey-ask-input"
                      type="text"
                      value={question}
                      disabled={!canAsk}
                      onChange={(e) => setQuestion(e.target.value)}
                      placeholder="Pregunta algo..."
                      className={`h-8 min-w-0 flex-1 rounded-lg border px-2.5 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-400 disabled:opacity-50 ${t.field}`}
                    />
                    <button
                      type="submit"
                      disabled={!canAsk || streaming || !question.trim()}
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