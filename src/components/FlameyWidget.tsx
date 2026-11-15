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
  X,
  BookOpen,
  MessageSquare,
  Send,
  Loader2,
  Database,
  RefreshCw,
  Volume2,
  VolumeX,
  Sliders,
  ShieldCheck,
  ShieldAlert,
  AlertTriangle,
  Sparkles,
} from "lucide-react";

interface Props {
  activeFinding: FindingOut | null;
  environmentKey: string;
}

const RAG_MODE = "psi-rag";

interface MaterialPreset {
  id: string;
  name: string;
  category: string;
  loi: number; // Índice Límite de Oxígeno (%) en 1 atm
  evaRated: boolean; // Certificado para hipobárico 4.3 psi 100% O2
  baseSpread: number;
  note: string;
}

const MATERIAL_PRESETS: MaterialPreset[] = [
  {
    id: "cotton",
    name: "Algodón / Textiles comunes",
    category: "Celulosa orgánica",
    loi: 19,
    evaRated: false,
    baseSpread: 1.4,
    note: "Inflamación rápida en >24% O₂; estrictamente prohibido en Traje EVA.",
  },
  {
    id: "foam",
    name: "Espuma de Poliuretano",
    category: "Aislante polimérico",
    loi: 17,
    evaRated: false,
    baseSpread: 2.1,
    note: "Alta propagación y liberación de gases tóxicos (HCN/CO) en cabina.",
  },
  {
    id: "pmma",
    name: "Acrílico / PMMA (Visores)",
    category: "Termoplástico óptico",
    loi: 18,
    evaRated: false,
    baseSpread: 0.9,
    note: "Llama esférica persistente en 0g; requiere policarbonato tratado.",
  },
  {
    id: "nylon",
    name: "Nylon 6,6 / Correas estándar",
    category: "Poliamida sintética",
    loi: 24,
    evaRated: false,
    baseSpread: 0.85,
    note: "Margen justo en ISS; goteo fundido peligroso en hábitat Lunar (32% O₂).",
  },
  {
    id: "silicone",
    name: "Silicona / Sellos y cables",
    category: "Elastómero",
    loi: 30,
    evaRated: false,
    baseSpread: 0.55,
    note: "Apto en ISS (21% O₂), pero restringido en atmósferas enriquecidas >32% O₂.",
  },
  {
    id: "ptfe",
    name: "Teflón / PTFE (Cableado NASA)",
    category: "Fluoropolímero",
    loi: 95,
    evaRated: true,
    baseSpread: 0.12,
    note: "Estándar aeroespacial para aislamiento eléctrico en cabina y vacío.",
  },
  {
    id: "nomex",
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
  { id: "lunar", label: "Base Lunar", o2: 32, psi: 8.2, g: 0.165 },
  { id: "rover", label: "Rover", o2: 34, psi: 8.0, g: 0.165 },
  { id: "mars", label: "Marte", o2: 21, psi: 14.7, g: 0.38 },
  { id: "eva", label: "Traje EVA", o2: 100, psi: 4.3, g: 0 },
];

function computeSimulationPhysics(params: {
  preset: MaterialPreset;
  customMaterial: string;
  o2Percent: number;
  pressurePsi: number;
  gravityG: number;
  environmentName: string;
  userNote?: string;
}): SimulationInput {
  const {
    preset,
    customMaterial,
    o2Percent,
    pressurePsi,
    gravityG,
    environmentName,
    userNote,
  } = params;

  const isCustom = customMaterial.trim().length > 0;
  const materialName = isCustom ? customMaterial.trim() : preset.name;
  const materialCategory = isCustom ? "Material consultado" : preset.category;

  // Presión parcial de oxígeno (psi): clave en trajes hipobáricos (4.3 psi * 100% = 4.3 psi)
  const ppO2 = (o2Percent / 100) * pressurePsi;
  // La ausencia de N2 diluyente dispara la tasa de reacción en atmósferas >30% O2
  const diluentPenalty = Math.max(0, o2Percent - 21) * 0.85;
  const pressureFactor = pressurePsi / 14.7;

  let riskScore = 0;

  if (!isCustom && preset.evaRated && o2Percent === 100 && pressurePsi <= 4.5) {
    // Nomex/PBI y PTFE están calificados para 100% O2 a baja presión (4.3 psi)
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

  // En 0g no hay flotabilidad natural, pero en atmósferas enriquecidas la llama por difusión se intensifica
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
    userNote,
  };
}

function buildFallbackSimulationReport(sim: SimulationInput, presetNote?: string): string {
  const ppO2 = ((sim.o2Percent / 100) * sim.pressurePsi).toFixed(2);
  const gravLabel = sim.gravityG === 0 ? "microgravedad (0g)" : `${sim.gravityG}g`;

  return [
    `- **Dictamen (${sim.verdict} · Riesgo ${sim.riskScore}/100):** En ${sim.environmentName} (${sim.o2Percent}% O₂, ${sim.pressurePsi} psi, ppO₂ ${ppO2} psi), **${sim.materialName}** tiene propagación estimada de **${sim.spreadMmPerSec} mm/s**.`,
    `- **Física en ${gravLabel}:** ${
      sim.o2Percent >= 30
        ? `La baja fracción de nitrógeno diluyente acelera la ignición y sostiene llamas estables incluso en baja gravedad.`
        : `Atmósfera normóxica controlada; la ausencia de convección natural limita la llama si no hay flujo forzado.`
    }`,
    `- **Guía NASA-STD-6001B:** ${
      presetNote ||
      (sim.verdict === "PROHIBIDO"
        ? "Sustituir por textiles ignífugos certificados (Nomex/PBI) o cableado PTFE."
        : "Apto bajo control de configuración y monitoreo de sensores ópticos.")
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
          className="px-1 py-0.5 rounded bg-slate-800 text-cyan-300 font-hud text-[11px]"
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
    <div className="space-y-1.5">
      {lines.map((rawLine, idx) => {
        const line = rawLine.trim();
        if (!line) return <div key={idx} className="h-1" />;

        const headingMatch = line.match(/^#{1,4}\s+(.*)$/);
        if (headingMatch) {
          return (
            <p key={idx} className="font-semibold text-amber-300 text-xs pt-0.5">
              {renderInlineMarkdown(headingMatch[1])}
            </p>
          );
        }

        const bulletMatch = line.match(/^[-*•]\s+(.*)$/);
        if (bulletMatch) {
          return (
            <div key={idx} className="flex items-start gap-2 pl-1">
              <span className="text-teal-400 mt-0.5">•</span>
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
      return `- **Acción:** Evitar ${
        finding.material || "combustibles"
      } en >30% O₂, diluir con CO₂ o He y asegurar evacuación < ${
        environment.egress_s
      } s.`;
    }
  }

  return [
    `- **Dato PSI:** ${finding.narrative}`,
    `- **Peligro en ${environment.label} (${o2Pct}% O₂):** ${
      isCritical
        ? `Atmósfera enriquecida crítica; ${
            finding.material || "el material"
          } acelera su ignición (${topFactor}).`
        : `Condición nominal (${topFactor}); vigilar acumulación local de O₂.`
    }`,
    `- **Acción:** Usar textiles ignífugos (Nomex/PBI) o dilución CO₂/He (${evidence.length} filas CSV).`,
  ].join("\n");
}

export function FlameyWidget({ activeFinding, environmentKey }: Props) {
  const [open, setOpen] = useState(true);
  const [context, setContext] = useState<ContextOut | null>(null);
  const [rules, setRules] = useState<RulesOut | null>(null);
  const [mode, setMode] = useState<"finding" | "rules" | "ask" | "sim">("finding");

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

  // Estado del Simulador de Materiales y Atmósferas
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
        if (mode === "sim") speakSimulationVerdict(simResult);
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
    setMode("finding");
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

  const handleAsk = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!question.trim() || !context) return;

    stopVoice();
    const q = question;
    setQuestion("");
    setMode("finding");

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

  const runMaterialSimulation = async () => {
    stopVoice();
    if (voiceEnabledRef.current) {
      speakSimulationVerdict(simResult);
    }

    const fallbackReport = buildFallbackSimulationReport(
      simResult,
      customMaterial.trim() ? undefined : currentPreset.note
    );

    if (selectedModel === RAG_MODE || !modelReady) {
      setSimAnalysis(fallbackReport);
      return;
    }

    streamAbortRef.current?.abort();
    const controller = new AbortController();
    streamAbortRef.current = controller;

    setSimAnalysis("");
    setStreaming(true);

    try {
      await askMaterialSimulationStream({
        model: selectedModel,
        sim: simResult,
        signal: controller.signal,
        onToken: (text) => setSimAnalysis(text),
      });
    } catch (err) {
      if ((err as Error)?.name !== "AbortError") {
        setSimAnalysis(fallbackReport);
      }
    } finally {
      if (!controller.signal.aborted) setStreaming(false);
    }
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="fixed left-16 bottom-5 z-30 flex items-center gap-2 px-3.5 py-2 rounded-full bg-slate-900/95 border border-teal-500/50 text-teal-300 shadow-xl hover:scale-105 transition cursor-pointer"
      >
        <Flame className="w-4 h-4 text-orange-400" />
        <span className="font-hud text-xs font-semibold">FLAMEY</span>
      </button>
    );
  }

  const isLocalModel = selectedModel !== RAG_MODE;
  const canAsk = !isLocalModel || modelReady;
  const ppO2 = ((simO2 / 100) * simPsi).toFixed(2);

  return (
    <div className="fixed left-16 bottom-5 z-30 w-[365px] sm:w-[445px] rounded-2xl bg-slate-950/95 backdrop-blur-xl border border-slate-800 shadow-2xl p-3.5">
      {/* Cabecera */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-cyan-400 via-teal-500 to-orange-500 flex items-center justify-center shadow-lg shrink-0">
            <Flame className="w-5 h-5 text-slate-950 fill-slate-950" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="font-hud text-[10px] tracking-widest text-amber-400">
                FLAMEY SI
              </span>

              {models.length > 0 ? (
                <select
                  value={selectedModel}
                  onChange={(e) => setSelectedModel(e.target.value)}
                  className="bg-slate-900 border border-emerald-500/40 rounded px-1.5 py-0.5 font-hud text-[10px] text-emerald-300 max-w-[140px] truncate cursor-pointer"
                >
                  {models.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                  <option value={RAG_MODE}>PSI-RAG (Sin GPU)</option>
                </select>
              ) : (
                <span className="inline-flex items-center gap-1 bg-teal-950/80 border border-teal-500/40 rounded px-1.5 py-0.5 font-hud text-[10px] text-teal-300">
                  <Database className="w-2.5 h-2.5" /> PSI-RAG
                </span>
              )}

              <button
                onClick={scanLocalModels}
                disabled={scanning}
                title="Re-escanear modelos locales de Ollama"
                className="p-1 rounded bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-300 cursor-pointer"
              >
                <RefreshCw className={`w-2.5 h-2.5 ${scanning ? "animate-spin" : ""}`} />
              </button>

              {voiceAvailable && (
                <button
                  onClick={toggleVoice}
                  title={voiceEnabled ? "Silenciar resumen de voz" : "Activar resumen de voz"}
                  className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded border font-hud text-[10px] transition cursor-pointer ${
                    voiceEnabled
                      ? "bg-teal-500/20 border-teal-400 text-teal-200"
                      : "bg-slate-900 border-slate-700 text-slate-400 hover:text-slate-200"
                  }`}
                >
                  {voiceEnabled ? (
                    <>
                      <Volume2 className="w-3 h-3 text-teal-300" />
                      <span>Voz ON</span>
                    </>
                  ) : (
                    <>
                      <VolumeX className="w-3 h-3" />
                      <span>Voz OFF</span>
                    </>
                  )}
                </button>
              )}

              {isLocalModel && loadingModel && (
                <span className="inline-flex items-center gap-1 font-hud text-[9px] text-amber-300">
                  <Loader2 className="w-3 h-3 animate-spin" /> GPU...
                </span>
              )}
              {isLocalModel && modelReady && !loadingModel && (
                <span className="font-hud text-[9px] text-emerald-400">● Local</span>
              )}
            </div>

            <p className="text-xs text-slate-200 leading-snug truncate mt-0.5">
              {mode === "sim"
                ? `Lab NASA-STD-6001B · ${simEnvName} (${simO2}% O₂ · ${simPsi} psi)`
                : context
                ? `${context.finding.experiment} · ${context.environment.label}`
                : "Selecciona un módulo o hallazgo para analizar."}
            </p>
          </div>
        </div>
        <button
          onClick={() => {
            stopVoice();
            setOpen(false);
          }}
          className="text-slate-500 hover:text-slate-300 cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* MODO 1: ANÁLISIS DE HALLAZGO PSI */}
      {mode === "finding" && context && (
        <div className="mt-3 space-y-2.5 max-h-64 overflow-y-auto pr-1">
          {isLocalModel && loadingModel ? (
            <div className="p-3 rounded-lg bg-slate-900/90 border border-amber-500/30 font-hud text-xs text-amber-300 flex items-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin shrink-0" />
              Cargando {selectedModel} en tu GPU...
            </div>
          ) : (
            <div className="text-xs text-slate-200 leading-relaxed bg-slate-900/90 p-3 rounded-lg border border-slate-800">
              <MarkdownMessage content={aiExplanation || buildPsiRagReport(context)} />
              {streaming && (
                <span className="inline-block w-1.5 h-3.5 ml-1 bg-teal-400 animate-pulse align-middle" />
              )}
            </div>
          )}

          <div className="font-hud text-[10px] text-teal-400 flex items-center gap-1 pt-0.5">
            <FileCheck2 className="w-3.5 h-3.5" /> RESPALDO CSV REAL ({context.evidence.length} FILAS)
          </div>
          {context.evidence.slice(0, 2).map((ev, idx) => (
            <div
              key={idx}
              className="p-2 rounded bg-slate-900/75 border border-slate-800 font-hud text-[10px] text-slate-300 flex justify-between"
            >
              <span className="truncate max-w-[245px] text-cyan-300">{ev.file}</span>
              <span>
                Fila #{ev.row} · Q {Math.round(ev.quality * 100)}%
              </span>
            </div>
          ))}
        </div>
      )}

      {/* MODO 2: SIMULADOR INTERACTIVO DE MATERIALES Y ATMÓSFERAS */}
      {mode === "sim" && (
        <div className="mt-3 space-y-2.5 max-h-80 overflow-y-auto pr-1">
          {/* Atajos de Misión / Traje EVA */}
          <div className="flex flex-wrap gap-1">
            {ENV_PRESETS.map((env) => {
              const active = simEnvName === env.label && simO2 === env.o2;
              return (
                <button
                  key={env.id}
                  type="button"
                  onClick={() => {
                    setSimEnvName(env.label);
                    setSimO2(env.o2);
                    setSimPsi(env.psi);
                    setSimGravity(env.g);
                    setSimAnalysis("");
                  }}
                  className={`px-2 py-0.5 rounded font-hud text-[10px] border transition cursor-pointer ${
                    active
                      ? "bg-teal-500/25 border-teal-400 text-teal-200"
                      : "bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200"
                  }`}
                >
                  {env.label} ({env.o2}%)
                </button>
              );
            })}
          </div>

          {/* Selector de Material o consulta personalizada */}
          <div className="grid grid-cols-1 gap-1.5 bg-slate-900/90 p-2.5 rounded-lg border border-slate-800">
            <label className="font-hud text-[10px] text-slate-400">
              MATERIAL A EVALUAR EN NASA
            </label>
            <select
              value={selectedPresetId}
              onChange={(e) => {
                setSelectedPresetId(e.target.value);
                setCustomMaterial("");
                setSimAnalysis("");
              }}
              className="bg-slate-950 border border-slate-700 rounded px-2 py-1 text-xs text-slate-100 cursor-pointer"
            >
              {MATERIAL_PRESETS.map((mat) => (
                <option key={mat.id} value={mat.id}>
                  {mat.name} (LOI {mat.loi}%)
                </option>
              ))}
            </select>

            <input
              type="text"
              value={customMaterial}
              onChange={(e) => {
                setCustomMaterial(e.target.value);
                setSimAnalysis("");
              }}
              placeholder="O escribe otro: Velcro, Kapton, Batería Litio..."
              className="bg-slate-950 border border-slate-800 rounded px-2 py-1 text-[11px] text-white placeholder:text-slate-500 focus:outline-none focus:border-teal-400"
            />
          </div>

          {/* Controles de Variables: O2 %, Presión psi y Gravedad g */}
          <div className="bg-slate-900/90 p-2.5 rounded-lg border border-slate-800 space-y-2">
            <div>
              <div className="flex justify-between font-hud text-[10px]">
                <span className="text-slate-300">CONCENTRACIÓN O₂</span>
                <span
                  className={
                    simO2 >= 50
                      ? "text-rose-400 font-bold"
                      : simO2 >= 30
                      ? "text-amber-300 font-bold"
                      : "text-emerald-300"
                  }
                >
                  {simO2}% O₂ · ppO₂ {ppO2} psi
                </span>
              </div>
              <input
                type="range"
                min={21}
                max={100}
                value={simO2}
                onChange={(e) => {
                  setSimO2(Number(e.target.value));
                  setSimEnvName("Atmósfera Custom");
                  setSimAnalysis("");
                }}
                className="w-full accent-teal-400 h-1.5 bg-slate-800 rounded-lg cursor-pointer mt-1"
              />
            </div>

            <div className="grid grid-cols-2 gap-2 pt-0.5">
              <div>
                <div className="flex justify-between font-hud text-[10px] text-slate-400">
                  <span>PRESIÓN</span>
                  <span className="text-cyan-300">{simPsi.toFixed(1)} psi</span>
                </div>
                <input
                  type="range"
                  min={4.3}
                  max={14.7}
                  step={0.1}
                  value={simPsi}
                  onChange={(e) => {
                    setSimPsi(Number(e.target.value));
                    setSimEnvName("Atmósfera Custom");
                    setSimAnalysis("");
                  }}
                  className="w-full accent-cyan-400 h-1.5 bg-slate-800 rounded-lg cursor-pointer mt-1"
                />
              </div>

              <div>
                <div className="flex justify-between font-hud text-[10px] text-slate-400">
                  <span>GRAVEDAD</span>
                  <span className="text-amber-300">{simGravity} g</span>
                </div>
                <select
                  value={simGravity}
                  onChange={(e) => {
                    setSimGravity(Number(e.target.value));
                    setSimAnalysis("");
                  }}
                  className="w-full mt-0.5 bg-slate-950 border border-slate-700 rounded px-1.5 py-0.5 font-hud text-[10px] text-slate-200 cursor-pointer"
                >
                  <option value={0}>0 g (ISS / EVA)</option>
                  <option value={0.165}>0.165 g (Luna)</option>
                  <option value={0.38}>0.38 g (Marte)</option>
                  <option value={1}>1.0 g (Tierra)</option>
                </select>
              </div>
            </div>
          </div>

          {/* Tarjeta de Dictamen Físico Instantáneo */}
          <div
            className={`p-2.5 rounded-lg border flex items-center justify-between gap-2 ${
              simResult.verdict === "PROHIBIDO"
                ? "bg-rose-950/40 border-rose-500/50 text-rose-200"
                : simResult.verdict === "RESTRINGIDO"
                ? "bg-amber-950/40 border-amber-500/50 text-amber-200"
                : "bg-emerald-950/40 border-emerald-500/50 text-emerald-200"
            }`}
          >
            <div className="flex items-center gap-2">
              {simResult.verdict === "PROHIBIDO" ? (
                <ShieldAlert className="w-5 h-5 text-rose-400 shrink-0" />
              ) : simResult.verdict === "RESTRINGIDO" ? (
                <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0" />
              ) : (
                <ShieldCheck className="w-5 h-5 text-emerald-400 shrink-0" />
              )}
              <div>
                <div className="font-hud text-[11px] font-bold">
                  {simResult.verdict} · RIESGO {simResult.riskScore}/100
                </div>
                <div className="font-hud text-[10px] opacity-85">
                  Propagación est.: {simResult.spreadMmPerSec} mm/s
                </div>
              </div>
            </div>

            <button
              type="button"
              disabled={!canAsk || streaming}
              onClick={runMaterialSimulation}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-teal-500 hover:bg-teal-400 text-slate-950 font-hud text-[10px] font-bold disabled:opacity-40 cursor-pointer shrink-0"
            >
              <Sparkles className="w-3 h-3" />
              EVALUAR IA
            </button>
          </div>

          {/* Resultado de IA o análisis técnico */}
          <div className="text-xs text-slate-200 leading-relaxed bg-slate-900/90 p-2.5 rounded-lg border border-slate-800">
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

      {/* MODO 3: REGLAS NASA */}
      {mode === "rules" && rules && (
        <div className="mt-3 space-y-2 max-h-56 overflow-y-auto pr-1">
          {rules.rules.slice(0, 4).map((r, i) => (
            <div
              key={i}
              className="p-2 rounded bg-slate-900 border border-slate-800 text-[11px]"
            >
              <p className="text-rose-300 line-through">{r.mito}</p>
              <p className="text-emerald-300 mt-0.5">{r.hecho}</p>
            </div>
          ))}
        </div>
      )}

      {/* MODO 4: PREGUNTA LIBRE */}
      {mode === "ask" && (
        <form onSubmit={handleAsk} className="mt-3 flex gap-1.5">
          <input
            type="text"
            value={question}
            disabled={!canAsk}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="Ej. ¿Es peligroso en Traje EVA o Luna?"
            className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-teal-400 disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={!canAsk || streaming || !question.trim()}
            className="px-2.5 py-1.5 rounded-lg bg-teal-500 text-slate-950 font-semibold text-xs hover:bg-teal-400 disabled:opacity-40 cursor-pointer"
          >
            <Send className="w-3.5 h-3.5" />
          </button>
        </form>
      )}

      {/* Barra inferior de navegación */}
      <div className="mt-3 pt-2 border-t border-slate-800/80 flex items-center justify-between gap-1.5 flex-wrap">
        <button
          disabled={!canAsk}
          onClick={() => setMode(mode === "ask" ? "finding" : "ask")}
          className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full border font-hud text-[10px] disabled:opacity-40 cursor-pointer ${
            mode === "ask"
              ? "bg-teal-500/20 border-teal-400 text-teal-200"
              : "bg-slate-900 hover:bg-slate-800 border-teal-500/50 text-teal-300"
          }`}
        >
          <MessageSquare className="w-3 h-3" />
          {canAsk ? "PREGÚNTAME" : "CARGANDO..."}
        </button>

        <button
          onClick={() => setMode(mode === "sim" ? "finding" : "sim")}
          className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full border font-hud text-[10px] cursor-pointer ${
            mode === "sim"
              ? "bg-cyan-500/25 border-cyan-400 text-cyan-200 font-bold"
              : "bg-slate-900 hover:bg-slate-800 border-cyan-500/50 text-cyan-300"
          }`}
        >
          <Sliders className="w-3 h-3" />
          {mode === "sim" ? "VER PSI" : "SIMULAR O₂"}
        </button>

        <button
          onClick={() => setMode(mode === "rules" ? "finding" : "rules")}
          className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full border font-hud text-[10px] cursor-pointer ${
            mode === "rules"
              ? "bg-amber-500/20 border-amber-400 text-amber-200"
              : "bg-slate-900 hover:bg-slate-800 border-slate-700 text-slate-300"
          }`}
        >
          <BookOpen className="w-3 h-3 text-amber-400" />
          REGLAS NASA
        </button>
      </div>
    </div>
  );
}