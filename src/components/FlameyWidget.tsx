"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { api, atmToPsi, ContextOut, FindingOut, RulesOut } from "@/lib/api";
import {
  askOllamaStream,
  getOllamaModels,
  unloadOllamaModel,
  warmupOllamaModel,
} from "@/lib/ollama";
import {
  isVoiceSupported,
  speakFindingAlert,
  speakShortReply,
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
} from "lucide-react";

interface Props {
  activeFinding: FindingOut | null;
  environmentKey: string;
}

const RAG_MODE = "psi-rag";

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
  const [mode, setMode] = useState<"finding" | "rules" | "ask">("finding");

  const [voiceEnabled, setVoiceEnabled] = useState(false);
  const [voiceAvailable, setVoiceAvailable] = useState(false);

  const [models, setModels] = useState<string[]>([]);
  const [selectedModel, setSelectedModel] = useState<string>(RAG_MODE);
  const [scanning, setScanning] = useState(false);
  const [modelReady, setModelReady] = useState(true);
  const [loadingModel, setLoadingModel] = useState(false);

  const [aiExplanation, setAiExplanation] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [question, setQuestion] = useState("");

  const prevModelRef = useRef<string>(RAG_MODE);
  const warmupAbortRef = useRef<AbortController | null>(null);
  const streamAbortRef = useRef<AbortController | null>(null);
  const voiceEnabledRef = useRef(voiceEnabled);

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
      if (next && context) {
        speakFindingAlert(context);
      } else if (!next) {
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
        list.find((m) => m.includes("1b")) ||
        list.find((m) => m.includes("1.5b") || m.includes("2b")) ||
        list.find((m) => m.includes("3b")) ||
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

  // Cargar análisis puntual y emitir alerta de voz resumida (1 sola vez, sin eco)
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

  return (
    <div className="fixed left-16 bottom-5 z-30 w-[360px] sm:w-[430px] rounded-2xl bg-slate-950/95 backdrop-blur-xl border border-slate-800 shadow-2xl p-3.5">
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
                  className="bg-slate-900 border border-emerald-500/40 rounded px-1.5 py-0.5 font-hud text-[10px] text-emerald-300 max-w-[145px] truncate cursor-pointer"
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
              {context
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
              <span className="truncate max-w-[235px] text-cyan-300">{ev.file}</span>
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