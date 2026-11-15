"use client";

import { useEffect, useRef, useState } from "react";
import { api, atmToPsi, ContextOut, FindingOut, RulesOut } from "@/lib/api";
import {
  askOllamaStream,
  getOllamaModels,
  unloadOllamaModel,
  warmupOllamaModel,
} from "@/lib/ollama";
import {
  Flame,
  FileCheck2,
  X,
  BookOpen,
  MessageSquare,
  Send,
  Loader2,
  Database,
} from "lucide-react";

interface Props {
  activeFinding: FindingOut | null;
  environmentKey: string;
}

/** Síntesis instantánea tipo RAG usando 100% datos reales de PSI cuando el visitante no tiene Ollama */
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
    if (q.includes("eva") || q.includes("traje") || q.includes("luna") || q.includes("peligro") || q.includes("usar")) {
      return `**Veredicto PSI (${environment.label}):** ${
        isCritical
          ? `ALTO RIESGO / RESTRINGIDO. A ${o2Pct}% O₂ (${psi} psi) la inflamabilidad de ${
              finding.material || "este material"
            } supera el margen seguro probado (${finding.narrative}).`
          : `RIESGO CONTROLADO bajo atmósfera estándar (${o2Pct}% O₂, ${psi} psi), sujeto a control de flujo.`
      }\n**Factor dominante:** ${topFactor} con ${finding.observations} corridas experimentales.`;
    }
    if (q.includes("apag") || q.includes("supres") || q.includes("preven") || q.includes("mitig")) {
      return `**Control recomendado:** Limitar exposición de ${
        finding.material || "combustibles"
      } en atmósferas >30% O₂, aplicar dilución supresora con CO₂ o He (protocolo FLEX) y mantener evacuación por debajo de ${
        environment.egress_s
      } s.`;
    }
  }

  return [
    `**1. Dato PSI (${finding.facility}):** ${finding.narrative}`,
    `**2. Riesgo en ${environment.label} (${o2Pct}% O₂ · ${psi} psi):** ${
      isCritical
        ? `Atmósfera enriquecida crítica; ${
            finding.material || "el material"
          } presenta ignición acelerada en ${
            environment.gravity_g === 0 ? "microgravedad" : `${environment.gravity_g} g`
          } (factor clave: ${topFactor}).`
        : `Condición nominal de cabina (${topFactor}); vigilar acumulación local de oxígeno y flujo de ventilación.`
    }`,
    `**3. Acción:** Sustituir por textiles ignífugos certificados (Nomex/PBI), aplicar supresión por dilución (CO₂/He) y auditar las ${evidence.length} filas CSV respaldadas.`,
  ].join("\n\n");
}

export function FlameyWidget({ activeFinding, environmentKey }: Props) {
  const [open, setOpen] = useState(true);
  const [context, setContext] = useState<ContextOut | null>(null);
  const [rules, setRules] = useState<RulesOut | null>(null);
  const [mode, setMode] = useState<"finding" | "rules" | "ask">("finding");

  // Modelos locales del visitante (si tiene Ollama abierto)
  const [models, setModels] = useState<string[]>([]);
  const [selectedModel, setSelectedModel] = useState<string>("");
  const [modelReady, setModelReady] = useState(false);
  const [loadingModel, setLoadingModel] = useState(false);

  const [aiExplanation, setAiExplanation] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [question, setQuestion] = useState("");

  const prevModelRef = useRef<string>("");
  const warmupAbortRef = useRef<AbortController | null>(null);
  const streamAbortRef = useRef<AbortController | null>(null);

  const hasLocalOllama = models.length > 0;

  // 1. Detectar si el usuario que abre la web tiene Ollama corriendo en su PC
  useEffect(() => {
    getOllamaModels().then((list) => {
      setModels(list);
      if (list.length > 0) {
        const preferred =
          list.find((m) => m.includes("1b")) ||
          list.find((m) => m.includes("1.5b") || m.includes("2b")) ||
          list.find((m) => m.includes("3b")) ||
          list[0];
        setSelectedModel(preferred);
      }
    });
    api.rules().then(setRules).catch(() => {});
  }, []);

  // 2. Si el usuario sí tiene Ollama y cambia de modelo, cortar proceso previo y pre-cargar en su GPU
  useEffect(() => {
    if (!selectedModel) return;

    streamAbortRef.current?.abort();
    warmupAbortRef.current?.abort();

    const controller = new AbortController();
    warmupAbortRef.current = controller;

    setModelReady(false);
    setLoadingModel(true);
    setStreaming(false);
    setAiExplanation("");

    const switchModel = async () => {
      if (prevModelRef.current && prevModelRef.current !== selectedModel) {
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

  // 3. Cargar contexto PSI y generar explicación (con Ollama local si existe, o RAG PSI inmediato si no)
  useEffect(() => {
    if (!activeFinding) return;
    let cancelled = false;

    setOpen(true);
    setMode("finding");
    setAiExplanation("");

    api
      .findingContext(activeFinding.key, environmentKey)
      .then((ctx) => {
        if (cancelled) return;
        setContext(ctx);

        // Si el visitante no tiene Ollama o aún no está listo, mostrar RAG PSI al instante
        if (!hasLocalOllama || !modelReady || !selectedModel) {
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
  }, [activeFinding, environmentKey, hasLocalOllama, modelReady, selectedModel]);

  const handleAsk = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!question.trim() || !context) return;

    const q = question;
    setQuestion("");
    setMode("finding");

    // Fallback instantáneo si el visitante no tiene Ollama local
    if (!hasLocalOllama || !modelReady || !selectedModel) {
      setAiExplanation(buildPsiRagReport(context, q));
      return;
    }

    streamAbortRef.current?.abort();
    const controller = new AbortController();
    streamAbortRef.current = controller;

    setAiExplanation("");
    setStreaming(true);

    try {
      await askOllamaStream({
        model: selectedModel,
        context,
        userQuestion: q,
        signal: controller.signal,
        onToken: (text) => setAiExplanation(text),
      });
    } catch {
      setAiExplanation(buildPsiRagReport(context, q));
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

  const canAsk = !hasLocalOllama || modelReady;

  return (
    <div className="fixed left-16 bottom-5 z-30 w-[360px] sm:w-[420px] rounded-2xl bg-slate-950/95 backdrop-blur-xl border border-slate-800 shadow-2xl p-3.5">
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

              {hasLocalOllama ? (
                <select
                  value={selectedModel}
                  onChange={(e) => setSelectedModel(e.target.value)}
                  className="bg-slate-900 border border-emerald-500/40 rounded px-1.5 py-0.5 font-hud text-[10px] text-emerald-300 max-w-[145px] truncate cursor-pointer"
                  title="Modelo local detectado en tu PC"
                >
                  {models.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              ) : (
                <span
                  className="inline-flex items-center gap-1 bg-teal-950/80 border border-teal-500/40 rounded px-1.5 py-0.5 font-hud text-[10px] text-teal-300"
                  title="Motor de síntesis basado directamente en evidencia PSI"
                >
                  <Database className="w-2.5 h-2.5" /> PSI-RAG
                </span>
              )}

              {hasLocalOllama && loadingModel && (
                <span className="inline-flex items-center gap-1 font-hud text-[9px] text-amber-300">
                  <Loader2 className="w-3 h-3 animate-spin" /> Cargando GPU...
                </span>
              )}
              {hasLocalOllama && modelReady && !loadingModel && (
                <span className="font-hud text-[9px] text-emerald-400">● Local</span>
              )}
            </div>

            <p className="text-xs text-slate-200 leading-snug truncate mt-0.5">
              {context
                ? `${context.finding.experiment} · ${context.environment.label}`
                : "Selecciona un módulo o hallazgo para analizar."}
            </p>
          </div>
        </div>
        <button
          onClick={() => setOpen(false)}
          className="text-slate-500 hover:text-slate-300 cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Cuerpo */}
      {mode === "finding" && context && (
        <div className="mt-3 space-y-2.5 max-h-64 overflow-y-auto pr-1">
          {hasLocalOllama && loadingModel ? (
            <div className="p-3 rounded-lg bg-slate-900/90 border border-amber-500/30 font-hud text-xs text-amber-300 flex items-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin shrink-0" />
              Cargando {selectedModel} en tu GPU...
            </div>
          ) : (
            <div className="text-xs text-slate-200 leading-relaxed bg-slate-900/90 p-3 rounded-lg border border-slate-800 whitespace-pre-line">
              {aiExplanation || buildPsiRagReport(context)}
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
              <span className="truncate max-w-[230px] text-cyan-300">{ev.file}</span>
              <span>
                Fila #{ev.row} · Q {Math.round(ev.quality * 100)}%
              </span>
            </div>
          ))}
        </div>
      )}

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

      {/* Barra inferior */}
      <div className="mt-3 pt-2 border-t border-slate-800/80 flex items-center justify-between gap-2">
        <button
          disabled={!canAsk}
          onClick={() => setMode(mode === "ask" ? "finding" : "ask")}
          className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-900 hover:bg-slate-800 border border-teal-500/50 font-hud text-[11px] text-teal-300 disabled:opacity-40 cursor-pointer"
        >
          <MessageSquare className="w-3 h-3" />
          {canAsk ? "PREGÚNTAME" : "CARGANDO MODELO..."}
        </button>

        <button
          onClick={() => setMode(mode === "rules" ? "finding" : "rules")}
          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-slate-900 hover:bg-slate-800 border border-slate-700 font-hud text-[10px] text-slate-300 cursor-pointer"
        >
          <BookOpen className="w-3 h-3 text-amber-400" />
          {mode === "rules" ? "VER ANÁLISIS" : "REGLAS NASA"}
        </button>
      </div>
    </div>
  );
}