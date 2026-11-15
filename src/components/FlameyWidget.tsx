"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, atmToPsi, ContextOut, FindingOut, RulesOut } from "@/lib/api";
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
  speakFindingAlert,
  speakShortReply,
  speakSimulationVerdict,
  stopVoice,
} from "@/lib/voice";
import {
  Flame,
  FileCheck2,
  ChevronDown,
  ChevronUp,
  BookOpen,
  Send,
  Loader2,
  RefreshCw,
  Volume2,
  VolumeX,
  Sliders,
  ShieldCheck,
  ShieldAlert,
  AlertTriangle,
  Cpu,
  Sparkles,
} from "lucide-react";

interface Props {
  activeFinding: FindingOut | null;
  environmentKey: string;
}

const RAG_MODE = "psi-rag";

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
    note: "Inflamación rápida en >24% O₂; estrictamente prohibido en Traje EVA.",
  },
  {
    id: "foam",
    shortName: "Espuma PU",
    name: "Espuma de Poliuretano",
    category: "Aislante polimérico",
    loi: 17,
    evaRated: false,
    baseSpread: 2.1,
    note: "Alta propagación y liberación de gases tóxicos (HCN/CO) en cabina.",
  },
  {
    id: "pmma",
    shortName: "Acrílico",
    name: "Acrílico / PMMA (Visores)",
    category: "Termoplástico óptico",
    loi: 18,
    evaRated: false,
    baseSpread: 0.9,
    note: "Llama esférica persistente en 0g; requiere policarbonato tratado.",
  },
  {
    id: "nylon",
    shortName: "Nylon",
    name: "Nylon 6,6 / Correas estándar",
    category: "Poliamida sintética",
    loi: 24,
    evaRated: false,
    baseSpread: 0.85,
    note: "Margen justo en ISS; goteo fundido peligroso en hábitat Lunar (32% O₂).",
  },
  {
    id: "silicone",
    shortName: "Silicona",
    name: "Silicona / Sellos y cables",
    category: "Elastómero",
    loi: 30,
    evaRated: false,
    baseSpread: 0.55,
    note: "Apto en ISS (21% O₂), pero restringido en atmósferas enriquecidas >32% O₂.",
  },
  {
    id: "ptfe",
    shortName: "Teflón PTFE",
    name: "Teflón / PTFE (Cableado NASA)",
    category: "Fluoropolímero",
    loi: 95,
    evaRated: true,
    baseSpread: 0.12,
    note: "Estándar aeroespacial para aislamiento eléctrico en cabina y vacío.",
  },
  {
    id: "nomex",
    shortName: "Nomex EVA",
    name: "Nomex / PBI (Tejido Traje EVA)",
    category: "Aramida ignífuga",
    loi: 36,
    evaRated: true,
    baseSpread: 0.08,
    note: "Autoextinguible en traje EVA (4.3 psi · 100% O₂) bajo norma NASA-STD-6001B.",
  },
];

const ENV_PRESETS = [
  { id: "iss", label: "ISS", o2: 21, psi: 14.7, g: 0 },
  { id: "lunar", label: "Luna", o2: 32, psi: 8.2, g: 0.165 },
  { id: "rover", label: "Rover", o2: 34, psi: 8.0, g: 0.165 },
  { id: "mars", label: "Marte", o2: 21, psi: 14.7, g: 0.38 },
  { id: "eva", label: "Traje EVA", o2: 100, psi: 4.3, g: 0 },
];

const QUICK_QUESTIONS = [
  "¿Es peligroso en Traje EVA?",
  "¿Cómo se apaga en 0g?",
];

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
      52 -
      loiMargin * 1.45 +
      (ppO2 - 3.09) * 9.5 +
      diluentPenalty * 0.35;
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

  let verdict: "APROBADO" | "RESTRINGIDO" | "PROHIBIDO" = "APROBADO";
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
  const ppO2 = ((sim.o2Percent / 100) * sim.pressurePsi).toFixed(2);
  const gravLabel =
    sim.gravityG === 0 ? "microgravedad (0g)" : `${sim.gravityG}g`;

  return [
    `- **Dictamen (${sim.verdict}):** En ${sim.environmentName} (${sim.o2Percent}% O₂, ${sim.pressurePsi} psi, ppO₂ ${ppO2} psi), **${sim.materialName}** propaga a **${sim.spreadMmPerSec} mm/s**.`,
    `- **Por qué ocurre en ${gravLabel}:** ${
      sim.o2Percent >= 30
        ? "Sin nitrógeno suficiente para absorber calor, la llama acelera y se vuelve difícil de extinguir."
        : "Atmósfera controlada; sin corrientes de aire forzado, la llama se limita por difusión."
    }`,
    `- **Recomendación NASA:** ${
      presetNote ||
      (sim.verdict === "PROHIBIDO"
        ? "Reemplazar por textiles ignífugos certificados (Nomex/PBI) o cableado Teflón PTFE."
        : "Permitido bajo control de configuración y sensores ópticos activos.")
    }`,
  ].join("\n");
}

function renderInlineMarkdown(line: string): React.ReactNode[] {
  const normalized = line.replace(/\*{1,2}$/, "");
  const tokens = normalized.split(/(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g);

  return tokens.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**") && part.length > 4) {
      return (
        <strong key={i} className="font-semibold text-teal-200">
          {part.slice(2, -2)}
        </strong>
      );
    }
    if (part.startsWith("*") && part.endsWith("*") && part.length > 2) {
      return (
        <em key={i} className="italic text-slate-100">
          {part.slice(1, -1)}
        </em>
      );
    }
    if (part.startsWith("`") && part.endsWith("`") && part.length > 2) {
      return (
        <code
          key={i}
          className="px-1.5 py-0.5 rounded bg-slate-800 text-cyan-300 font-hud text-xs"
        >
          {part.slice(1, -1)}
        </code>
      );
    }
    return <React.Fragment key={i}>{part}</React.Fragment>;
  });
}

function MarkdownMessage({ content }: { content: string }) {
  const lines = content.split("\n");

  return (
    <div className="space-y-2 text-[13px] leading-relaxed text-slate-100">
      {lines.map((rawLine, idx) => {
        const line = rawLine.trim();
        if (!line) return null;

        const headingMatch = line.match(/^#{1,4}\s+(.*)$/);
        if (headingMatch) {
          return (
            <p key={idx} className="font-semibold text-amber-300 text-xs">
              {renderInlineMarkdown(headingMatch[1])}
            </p>
          );
        }

        const bulletMatch = line.match(/^[-*•]\s+(.*)$/);
        if (bulletMatch) {
          return (
            <div key={idx} className="flex items-start gap-2">
              <span className="text-teal-400 font-bold mt-0.5">•</span>
              <span className="flex-1">{renderInlineMarkdown(bulletMatch[1])}</span>
            </div>
          );
        }

        return <p key={idx}>{renderInlineMarkdown(line)}</p>;
      })}
    </div>
  );
}

function buildPsiRagReport(ctx: ContextOut, question?: string): string {
  const { finding, environment, evidence } = ctx;
  const o2Pct = Math.round(environment.o2_fraction * 100);
  const psi = atmToPsi(environment.pressure_atm);
  const isCritical = o2Pct >= 30;

  const topFactor = finding.factors?.[0]
    ? `${finding.factors[0].name} (+${finding.factors[0].contribution.toFixed(1)} pts)`
    : `RPI ${finding.rpi}`;

  if (question) {
    const q = question.toLowerCase();
    if (
      q.includes("eva") ||
      q.includes("traje") ||
      q.includes("luna") ||
      q.includes("peligro") ||
      q.includes("usar")
    ) {
      return `- **Veredicto (${environment.label}):** ${
        isCritical
          ? `PELIGROSO / RESTRINGIDO a ${o2Pct}% O₂ (${psi} psi) para ${
              finding.material || "este material"
            }.`
          : `RIESGO CONTROLADO a ${o2Pct}% O₂ (${psi} psi), sujeto a flujo nominal.`
      }\n- **Factor clave:** ${topFactor} (${finding.observations} corridas PSI).`;
    }
    if (
      q.includes("apag") ||
      q.includes("supres") ||
      q.includes("preven") ||
      q.includes("mitig")
    ) {
      return `- **Cómo mitigarlo:** Evitar ${
        finding.material || "combustibles"
      } en >30% O₂, diluir con CO₂ o He y asegurar evacuación < ${
        environment.egress_s
      } s.`;
    }
  }

  return [
    `- **Dato PSI:** ${finding.narrative}`,
    `- **Riesgo en ${environment.label} (${o2Pct}% O₂):** ${
      isCritical
        ? `Atmósfera enriquecida crítica; ${
            finding.material || "el material"
          } acelera su ignición (${topFactor}).`
        : `Condición nominal (${topFactor}); vigilar acumulación local de O₂.`
    }`,
    `- **Prevención:** Usar textiles ignífugos (Nomex/PBI) o dilución CO₂/He (${evidence.length} filas CSV).`,
  ].join("\n");
}

export function FlameyWidget({ activeFinding, environmentKey }: Props) {
  const [open, setOpen] = useState(true);
  const [tab, setTab] = useState<"finding" | "sim" | "rules">("finding");
  const [showEngineBar, setShowEngineBar] = useState(false);
  const [showCsvEvidence, setShowCsvEvidence] = useState(false);

  const [context, setContext] = useState<ContextOut | null>(null);
  const [rules, setRules] = useState<RulesOut | null>(null);

  // Voz
  const [voiceEnabled, setVoiceEnabled] = useState(false);
  const [voiceAvailable, setVoiceAvailable] = useState(false);

  // Modelos locales vs PSI-RAG
  const [models, setModels] = useState<string[]>([]);
  const [selectedModel, setSelectedModel] = useState<string>(RAG_MODE);
  const [scanning, setScanning] = useState(false);
  const [modelReady, setModelReady] = useState(true);
  const [loadingModel, setLoadingModel] = useState(false);

  const [aiExplanation, setAiExplanation] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [question, setQuestion] = useState("");

  // Simulador interactivo
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

  const currentPreset = useMemo(
    () =>
      MATERIAL_PRESETS.find((p) => p.id === selectedPresetId) ||
      MATERIAL_PRESETS[0],
    [selectedPresetId]
  );

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

  useEffect(() => {
    voiceEnabledRef.current = voiceEnabled;
    if (!voiceEnabled) stopVoice();
  }, [voiceEnabled]);

  useEffect(() => {
    setVoiceAvailable(isVoiceSupported());
    return () => stopVoice();
  }, []);

  const toggleVoice = () => {
    setVoiceEnabled((prev) => {
      const next = !prev;
      if (next) {
        if (tab === "sim") speakSimulationVerdict(simResult);
        else if (context) speakFindingAlert(context);
      } else {
        stopVoice();
      }
      return next;
    });
  };

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
    api.rules().then(setRules).catch(() => {});
  }, [scanLocalModels]);

  // Cambiar entre PSI-RAG y modelos locales de GPU
  useEffect(() => {
    streamAbortRef.current?.abort();
    warmupAbortRef.current?.abort();
    stopVoice();

    if (selectedModel === RAG_MODE) {
      if (prevModelRef.current && prevModelRef.current !== RAG_MODE) {
        unloadOllamaModel(prevModelRef.current);
      }
      prevModelRef.current = RAG_MODE;
      setLoadingModel(false);
      setModelReady(true);
      setStreaming(false);
      return;
    }

    const controller = new AbortController();
    warmupAbortRef.current = controller;

    setModelReady(false);
    setLoadingModel(true);
    setStreaming(false);
    setAiExplanation("");

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

  // Cargar análisis puntual de hallazgo PSI
  useEffect(() => {
    if (!activeFinding) return;
    let cancelled = false;

    stopVoice();
    setOpen(true);
    setTab("finding");
    setAiExplanation("");

    api
      .findingContext(activeFinding.key, environmentKey)
      .then((ctx) => {
        if (cancelled) return;
        setContext(ctx);

        if (voiceEnabledRef.current) {
          speakFindingAlert(ctx);
        }

        if (selectedModel === RAG_MODE || !modelReady) {
          setAiExplanation(buildPsiRagReport(ctx));
          return;
        }

        streamAbortRef.current?.abort();
        const controller = new AbortController();
        streamAbortRef.current = controller;

        setStreaming(true);
        askOllamaStream({
          model: selectedModel,
          context: ctx,
          signal: controller.signal,
          onToken: (text) => setAiExplanation(text),
        })
          .catch((err) => {
            if (err?.name !== "AbortError") {
              setAiExplanation(buildPsiRagReport(ctx));
            }
          })
          .finally(() => {
            if (!controller.signal.aborted) setStreaming(false);
          });
      })
      .catch(() => {});

    return () => {
      cancelled = true;
      streamAbortRef.current?.abort();
    };
  }, [activeFinding, environmentKey, modelReady, selectedModel]);

  // Evaluación automática en vivo cuando el usuario cambia material u O2 en el Simulador
  useEffect(() => {
    if (tab !== "sim") return;

    const fallbackReport = buildFallbackSimulationReport(
      simResult,
      customMaterial.trim() ? undefined : currentPreset.note
    );
    setSimAnalysis(fallbackReport);

    const timer = setTimeout(() => {
      if (voiceEnabledRef.current) {
        speakSimulationVerdict(simResult);
      }

      if (selectedModel === RAG_MODE || !modelReady) {
        return;
      }

      streamAbortRef.current?.abort();
      const controller = new AbortController();
      streamAbortRef.current = controller;

      setStreaming(true);
      askMaterialSimulationStream({
        model: selectedModel,
        sim: simResult,
        signal: controller.signal,
        onToken: (text) => setSimAnalysis(text),
      })
        .catch((err) => {
          if ((err as Error)?.name !== "AbortError") {
            setSimAnalysis(fallbackReport);
          }
        })
        .finally(() => {
          if (!controller.signal.aborted) setStreaming(false);
        });
    }, 450);

    return () => {
      clearTimeout(timer);
      streamAbortRef.current?.abort();
    };
  }, [tab, simResult, customMaterial, currentPreset.note, selectedModel, modelReady]);

  const submitQuestion = async (rawQuestion: string) => {
    const q = rawQuestion.trim();
    if (!q || !context) return;

    stopVoice();
    setQuestion("");

    if (selectedModel === RAG_MODE || !modelReady) {
      const answer = buildPsiRagReport(context, q);
      setAiExplanation(answer);
      if (voiceEnabledRef.current) speakShortReply(answer);
      return;
    }

    streamAbortRef.current?.abort();
    const controller = new AbortController();
    streamAbortRef.current = controller;

    let finalReply = "";
    setAiExplanation("");
    setStreaming(true);

    try {
      await askOllamaStream({
        model: selectedModel,
        context,
        userQuestion: q,
        signal: controller.signal,
        onToken: (text) => {
          finalReply = text;
          setAiExplanation(text);
        },
      });
      if (!controller.signal.aborted && voiceEnabledRef.current && finalReply) {
        speakShortReply(finalReply);
      }
    } catch {
      const fallback = buildPsiRagReport(context, q);
      setAiExplanation(fallback);
      if (voiceEnabledRef.current) speakShortReply(fallback);
    } finally {
      if (!controller.signal.aborted) setStreaming(false);
    }
  };

  const handleAskSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    submitQuestion(question);
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Abrir asistente Flamey"
        className="fixed left-16 bottom-5 z-30 flex items-center gap-2.5 px-4 py-2.5 rounded-full bg-slate-950/95 border border-teal-400/60 text-teal-200 shadow-2xl hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-400 transition cursor-pointer"
      >
        <Flame className="w-4 h-4 text-orange-400" />
        <span className="font-hud text-xs font-bold tracking-wide">FLAMEY</span>
      </button>
    );
  }

  const isLocalModel = selectedModel !== RAG_MODE;
  const canAsk = !isLocalModel || modelReady;
  const shortModelName =
    selectedModel === RAG_MODE ? "PSI-RAG" : selectedModel.split(":")[0];

  return (
    <aside
      aria-label="Asistente de seguridad contra incendios Flamey"
      className="fixed left-16 bottom-5 z-30 w-[370px] sm:w-[440px] rounded-2xl bg-slate-950/95 backdrop-blur-xl border border-slate-800 shadow-2xl p-4"
    >
      {/* 1. CABECERA LIMPIA */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-cyan-400 via-teal-500 to-orange-500 flex items-center justify-center shadow-md shrink-0">
            <Flame className="w-5 h-5 text-slate-950 fill-slate-950" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="font-hud text-xs font-bold tracking-wider text-white">
                FLAMEY SI
              </h2>
              <span
                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-hud text-[11px] ${
                  isLocalModel
                    ? "bg-emerald-500/15 text-emerald-300 border border-emerald-500/40"
                    : "bg-teal-500/15 text-teal-300 border border-teal-500/40"
                }`}
              >
                {loadingModel ? "Cargando..." : shortModelName}
              </span>
            </div>
            <p className="text-xs text-slate-300 truncate mt-0.5">
              {tab === "sim"
                ? `${simEnvName} · ${simO2}% O₂ (${simPsi} psi)`
                : context
                ? `${context.finding.experiment} · ${context.environment.label}`
                : "Selecciona un hallazgo o abre el simulador"}
            </p>
          </div>
        </div>

        {/* Controles esenciales: Voz, Motor IA y Minimizar */}
        <div className="flex items-center gap-1.5 shrink-0">
          {voiceAvailable && (
            <button
              type="button"
              onClick={toggleVoice}
              aria-pressed={voiceEnabled}
              aria-label={voiceEnabled ? "Desactivar voz" : "Activar voz"}
              className={`inline-flex items-center gap-1.5 min-h-[34px] px-2.5 rounded-lg border font-hud text-xs transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-400 cursor-pointer ${
                voiceEnabled
                  ? "bg-teal-500/25 border-teal-400 text-teal-100"
                  : "bg-slate-900 border-slate-700 text-slate-300 hover:text-white"
              }`}
            >
              {voiceEnabled ? (
                <Volume2 className="w-3.5 h-3.5 text-teal-300" />
              ) : (
                <VolumeX className="w-3.5 h-3.5" />
              )}
              <span>Voz</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => setShowEngineBar((v) => !v)}
            aria-expanded={showEngineBar}
            aria-label="Configurar motor de IA"
            title="Cambiar modelo local o modo PSI-RAG"
            className={`min-h-[34px] px-2 rounded-lg border transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-400 cursor-pointer ${
              showEngineBar
                ? "bg-slate-800 border-emerald-400/60 text-emerald-300"
                : "bg-slate-900 border-slate-700 text-slate-300 hover:text-white"
            }`}
          >
            <Cpu className="w-3.5 h-3.5" />
          </button>

          <button
            type="button"
            onClick={() => {
              stopVoice();
              setOpen(false);
            }}
            aria-label="Minimizar Flamey"
            className="min-h-[34px] px-2 rounded-lg bg-slate-900 border border-slate-800 text-slate-400 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-400 cursor-pointer"
          >
            <ChevronDown className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Barra plegable de selección de motor IA (solo visible si el usuario la abre) */}
      {showEngineBar && (
        <div className="mt-2.5 p-2 rounded-xl bg-slate-900 border border-slate-800 flex items-center gap-2">
          <label htmlFor="flamey-model-select" className="font-hud text-xs text-slate-300 shrink-0">
            Motor IA:
          </label>
          <select
            id="flamey-model-select"
            value={selectedModel}
            onChange={(e) => setSelectedModel(e.target.value)}
            className="flex-1 bg-slate-950 border border-slate-700 rounded-lg px-2 py-1 text-xs text-emerald-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-400 cursor-pointer"
          >
            {models.map((m) => (
              <option key={m} value={m}>
                {m} (GPU Local)
              </option>
            ))}
            <option value={RAG_MODE}>PSI-RAG (Instantáneo sin GPU)</option>
          </select>
          <button
            type="button"
            onClick={scanLocalModels}
            disabled={scanning}
            aria-label="Buscar modelos locales en Ollama"
            className="p-1.5 rounded-lg bg-slate-950 border border-slate-700 text-slate-200 hover:border-teal-400 cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${scanning ? "animate-spin" : ""}`} />
          </button>
        </div>
      )}

      {/* 2. PESTAÑAS PRINCIPALES DE NAVEGACIÓN */}
      <div
        role="tablist"
        aria-label="Secciones de Flamey"
        className="grid grid-cols-3 gap-1.5 mt-3 p-1 rounded-xl bg-slate-900 border border-slate-800"
      >
        <button
          type="button"
          role="tab"
          aria-selected={tab === "finding"}
          onClick={() => setTab("finding")}
          className={`flex items-center justify-center gap-1.5 py-2 rounded-lg font-hud text-xs font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-400 cursor-pointer ${
            tab === "finding"
              ? "bg-teal-500 text-slate-950 shadow"
              : "text-slate-300 hover:text-white"
          }`}
        >
          <Sparkles className="w-3.5 h-3.5" />
          <span>Análisis PSI</span>
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={tab === "sim"}
          onClick={() => setTab("sim")}
          className={`flex items-center justify-center gap-1.5 py-2 rounded-lg font-hud text-xs font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 cursor-pointer ${
            tab === "sim"
              ? "bg-cyan-400 text-slate-950 shadow"
              : "text-slate-300 hover:text-white"
          }`}
        >
          <Sliders className="w-3.5 h-3.5" />
          <span>Simulador O₂</span>
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={tab === "rules"}
          onClick={() => setTab("rules")}
          className={`flex items-center justify-center gap-1.5 py-2 rounded-lg font-hud text-xs font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 cursor-pointer ${
            tab === "rules"
              ? "bg-amber-400 text-slate-950 shadow"
              : "text-slate-300 hover:text-white"
          }`}
        >
          <BookOpen className="w-3.5 h-3.5" />
          <span>Reglas NASA</span>
        </button>
      </div>

      {/* 3. CONTENIDO DE PESTAÑA 1: ANÁLISIS PSI + PREGUNTA RÁPIDA */}
      {tab === "finding" && (
        <div role="tabpanel" className="mt-3 space-y-2.5">
          {context ? (
            <>
              <div
                aria-live="polite"
                className="max-h-52 overflow-y-auto bg-slate-900/95 p-3 rounded-xl border border-slate-800"
              >
                {isLocalModel && loadingModel ? (
                  <div className="flex items-center gap-2 text-xs text-amber-300 font-hud py-2">
                    <Loader2 className="w-4 h-4 animate-spin shrink-0" />
                    <span>Preparando {shortModelName} en tu GPU...</span>
                  </div>
                ) : (
                  <>
                    <MarkdownMessage
                      content={aiExplanation || buildPsiRagReport(context)}
                    />
                    {streaming && (
                      <span className="inline-block w-1.5 h-3.5 ml-1 bg-teal-400 animate-pulse align-middle" />
                    )}
                  </>
                )}
              </div>

              {/* Preguntas de 1 clic + campo libre */}
              <div className="flex flex-wrap gap-1.5">
                {QUICK_QUESTIONS.map((qText) => (
                  <button
                    key={qText}
                    type="button"
                    disabled={!canAsk || streaming}
                    onClick={() => submitQuestion(qText)}
                    className="px-2.5 py-1 rounded-full bg-slate-900 hover:bg-slate-800 border border-slate-700 text-xs text-teal-200 disabled:opacity-40 cursor-pointer"
                  >
                    {qText}
                  </button>
                ))}
              </div>

              <form onSubmit={handleAskSubmit} className="flex gap-1.5">
                <label htmlFor="flamey-ask-input" className="sr-only">
                  Pregunta sobre este experimento
                </label>
                <input
                  id="flamey-ask-input"
                  type="text"
                  value={question}
                  disabled={!canAsk}
                  onChange={(e) => setQuestion(e.target.value)}
                  placeholder="Haz una pregunta puntual..."
                  className="flex-1 min-h-[36px] bg-slate-900 border border-slate-700 rounded-xl px-3 text-xs text-white placeholder:text-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-400 disabled:opacity-50"
                />
                <button
                  type="submit"
                  disabled={!canAsk || streaming || !question.trim()}
                  aria-label="Enviar pregunta"
                  className="min-h-[36px] px-3 rounded-xl bg-teal-500 text-slate-950 font-semibold hover:bg-teal-400 disabled:opacity-40 cursor-pointer"
                >
                  <Send className="w-4 h-4" />
                </button>
              </form>

              {/* Acordeón discreto para evidencia CSV */}
              <div>
                <button
                  type="button"
                  onClick={() => setShowCsvEvidence((v) => !v)}
                  className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg bg-slate-900/70 hover:bg-slate-900 border border-slate-800 font-hud text-xs text-slate-300 cursor-pointer"
                >
                  <span className="inline-flex items-center gap-1.5 text-teal-300">
                    <FileCheck2 className="w-3.5 h-3.5" />
                    Respaldo CSV ({context.evidence.length} registros)
                  </span>
                  {showCsvEvidence ? (
                    <ChevronUp className="w-3.5 h-3.5" />
                  ) : (
                    <ChevronDown className="w-3.5 h-3.5" />
                  )}
                </button>

                {showCsvEvidence && (
                  <div className="mt-1.5 space-y-1">
                    {context.evidence.slice(0, 2).map((ev, idx) => (
                      <div
                        key={idx}
                        className="px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-800 font-hud text-xs text-slate-300 flex justify-between"
                      >
                        <span className="truncate max-w-[235px] text-cyan-300">
                          {ev.file}
                        </span>
                        <span>
                          Fila #{ev.row} · {Math.round(ev.quality * 100)}%
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          ) : (
            <p className="text-xs text-slate-300 bg-slate-900 p-3 rounded-xl border border-slate-800">
              Haz clic en un módulo o experimento para ver el análisis científico, o
              cambia a la pestaña <strong>Simulador O₂</strong> para probar materiales.
            </p>
          )}
        </div>
      )}

      {/* 4. CONTENIDO DE PESTAÑA 2: SIMULADOR GUIADO EN 3 PASOS */}
      {tab === "sim" && (
        <div role="tabpanel" className="mt-3 space-y-2.5 max-h-[410px] overflow-y-auto pr-1">
          {/* Paso 1: Entorno rápido */}
          <div className="space-y-1">
            <span className="block font-hud text-xs text-slate-300">
              1. Elige entorno espacial:
            </span>
            <div className="flex flex-wrap gap-1.5">
              {ENV_PRESETS.map((env) => {
                const active = simEnvName === env.label && simO2 === env.o2;
                return (
                  <button
                    key={env.id}
                    type="button"
                    aria-pressed={active}
                    onClick={() => {
                      setSimEnvName(env.label);
                      setSimO2(env.o2);
                      setSimPsi(env.psi);
                      setSimGravity(env.g);
                    }}
                    className={`px-2.5 py-1.5 rounded-lg font-hud text-xs border transition cursor-pointer ${
                      active
                        ? "bg-cyan-500/25 border-cyan-400 text-cyan-100 font-bold"
                        : "bg-slate-900 border-slate-800 text-slate-300 hover:border-slate-600"
                    }`}
                  >
                    {env.label} · {env.o2}%
                  </button>
                );
              })}
            </div>
          </div>

          {/* Paso 2: Material como chips directos + campo opcional */}
          <div className="space-y-1.5">
            <span className="block font-hud text-xs text-slate-300">
              2. Toca un material (o escribe otro):
            </span>
            <div className="flex flex-wrap gap-1.5">
              {MATERIAL_PRESETS.map((mat) => {
                const selected = !customMaterial.trim() && selectedPresetId === mat.id;
                return (
                  <button
                    key={mat.id}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => {
                      setSelectedPresetId(mat.id);
                      setCustomMaterial("");
                    }}
                    className={`px-2.5 py-1 rounded-full text-xs border transition cursor-pointer ${
                      selected
                        ? "bg-teal-500/25 border-teal-400 text-teal-100 font-semibold"
                        : "bg-slate-900 border-slate-800 text-slate-300 hover:border-slate-600"
                    }`}
                  >
                    {mat.shortName}
                  </button>
                );
              })}
            </div>

            <label htmlFor="sim-custom-material" className="sr-only">
              Otro material personalizado
            </label>
            <input
              id="sim-custom-material"
              type="text"
              value={customMaterial}
              onChange={(e) => setCustomMaterial(e.target.value)}
              placeholder="Otro material: ej. Velcro, Kapton, Batería Litio..."
              className="w-full min-h-[34px] bg-slate-900 border border-slate-800 rounded-xl px-3 text-xs text-white placeholder:text-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-400"
            />
          </div>

          {/* Paso 3: Deslizador principal de Oxígeno y Presión */}
          <div className="p-3 rounded-xl bg-slate-900 border border-slate-800 space-y-2.5">
            <div>
              <div className="flex justify-between items-center text-xs">
                <label htmlFor="sim-o2-slider" className="font-hud text-slate-200">
                  3. Nivel de Oxígeno (O₂)
                </label>
                <span
                  className={`font-hud font-bold ${
                    simO2 >= 50
                      ? "text-rose-400"
                      : simO2 >= 30
                      ? "text-amber-300"
                      : "text-emerald-300"
                  }`}
                >
                  {simO2}% O₂
                </span>
              </div>
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
                className="w-full accent-teal-400 h-2 bg-slate-800 rounded-lg cursor-pointer mt-1.5"
              />
              <div className="flex justify-between text-[11px] text-slate-400 font-hud mt-0.5">
                <span>21% ISS</span>
                <span>32% Luna</span>
                <span>100% Traje EVA</span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 pt-1 border-t border-slate-800/80">
              <div>
                <label
                  htmlFor="sim-psi-slider"
                  className="flex justify-between text-xs text-slate-300 font-hud"
                >
                  <span>Presión</span>
                  <span className="text-cyan-300">{simPsi.toFixed(1)} psi</span>
                </label>
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
                  className="w-full accent-cyan-400 h-1.5 bg-slate-800 rounded-lg cursor-pointer mt-1.5"
                />
              </div>

              <div>
                <label
                  htmlFor="sim-gravity-select"
                  className="block text-xs text-slate-300 font-hud mb-1"
                >
                  Gravedad
                </label>
                <select
                  id="sim-gravity-select"
                  value={simGravity}
                  onChange={(e) => setSimGravity(Number(e.target.value))}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2 py-1 text-xs text-slate-200 cursor-pointer"
                >
                  <option value={0}>0 g (ISS / EVA)</option>
                  <option value={0.165}>0.165 g (Luna)</option>
                  <option value={0.38}>0.38 g (Marte)</option>
                  <option value={1}>1.0 g (Tierra)</option>
                </select>
              </div>
            </div>
          </div>

          {/* Tarjeta visual de Dictamen en tiempo real */}
          <div
            role="status"
            aria-live="polite"
            className={`p-3 rounded-xl border flex items-center gap-3 ${
              simResult.verdict === "PROHIBIDO"
                ? "bg-rose-950/50 border-rose-500/60 text-rose-100"
                : simResult.verdict === "RESTRINGIDO"
                ? "bg-amber-950/50 border-amber-500/60 text-amber-100"
                : "bg-emerald-950/50 border-emerald-500/60 text-emerald-100"
            }`}
          >
            {simResult.verdict === "PROHIBIDO" ? (
              <ShieldAlert className="w-6 h-6 text-rose-400 shrink-0" />
            ) : simResult.verdict === "RESTRINGIDO" ? (
              <AlertTriangle className="w-6 h-6 text-amber-400 shrink-0" />
            ) : (
              <ShieldCheck className="w-6 h-6 text-emerald-400 shrink-0" />
            )}
            <div className="min-w-0">
              <div className="font-hud text-xs font-bold">
                {simResult.verdict} · RIESGO {simResult.riskScore}/100
              </div>
              <div className="text-xs opacity-90">
                Propagación estimada: <strong>{simResult.spreadMmPerSec} mm/s</strong>
              </div>
            </div>
          </div>

          {/* Explicación automática */}
          <div className="bg-slate-900/95 p-3 rounded-xl border border-slate-800">
            <MarkdownMessage
              content={
                simAnalysis ||
                buildFallbackSimulationReport(
                  simResult,
                  customMaterial.trim() ? undefined : currentPreset.note
                )
              }
            />
            {streaming && (
              <span className="inline-block w-1.5 h-3.5 ml-1 bg-teal-400 animate-pulse align-middle" />
            )}
          </div>
        </div>
      )}

      {/* 5. CONTENIDO DE PESTAÑA 3: REGLAS NASA */}
      {tab === "rules" && (
        <div role="tabpanel" className="mt-3 space-y-2 max-h-72 overflow-y-auto pr-1">
          {rules ? (
            rules.rules.slice(0, 4).map((r, i) => (
              <div
                key={i}
                className="p-3 rounded-xl bg-slate-900 border border-slate-800 text-xs space-y-1"
              >
                <p className="text-rose-300 line-through">Mito: {r.mito}</p>
                <p className="text-emerald-200 font-medium">Realidad: {r.hecho}</p>
              </div>
            ))
          ) : (
            <p className="text-xs text-slate-300">Cargando reglas NASA...</p>
          )}
        </div>
      )}
    </aside>
  );
}