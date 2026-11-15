"use client";

import { useState } from "react";
import { api, EnvironmentOut, FindingOut, ProvenanceOut, atmToPsi } from "@/lib/api";
import { Sparkles, X, Layers, FileSpreadsheet, SearchCheck } from "lucide-react";

interface Props {
  open: boolean;
  onClose: () => void;
  environment?: EnvironmentOut;
  findings: FindingOut[];
  loading: boolean;
  onAskFlamey: (finding: FindingOut) => void;
}

export function FindingsDrawer({
  open,
  onClose,
  environment,
  findings,
  loading,
  onAskFlamey,
}: Props) {
  const [prov, setProv] = useState<ProvenanceOut | null>(null);
  const [loadingProv, setLoadingProv] = useState(false);

  if (!open) return null;

  const inspectSource = async (sourceFile: string) => {
    setLoadingProv(true);
    try {
      const data = await api.provenance(sourceFile);
      setProv(data);
    } catch {
      setProv(null);
    } finally {
      setLoadingProv(false);
    }
  };

  return (
    <aside className="fixed right-0 top-14 bottom-0 z-30 w-full sm:w-[460px] bg-slate-950/95 backdrop-blur-xl border-l border-slate-800 flex flex-col shadow-2xl">
      <div className="p-4 border-b border-slate-800 flex items-start justify-between gap-3">
        <div>
          <span className="font-hud text-[10px] tracking-widest text-teal-400 uppercase">
            RANKING PSI · {environment?.label || "ENTORNO"}
          </span>
          <h2 className="text-base font-bold text-white mt-0.5">
            {findings.length} hallazgos clasificados por RPI
          </h2>
          {environment && (
            <p className="font-hud text-[11px] text-slate-400 mt-1">
              g = {environment.gravity_g === 0 ? "µg" : `${environment.gravity_g} g`} · O₂ ={" "}
              {Math.round(environment.o2_fraction * 100)}% · {environment.pressure_atm} atm (
              {atmToPsi(environment.pressure_atm)} psi)
            </p>
          )}
        </div>
        <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 cursor-pointer">
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Inspector rápido de procedencia CSV */}
      {(loadingProv || prov) && (
        <div className="p-3 bg-slate-900 border-b border-teal-500/30 text-xs">
          <div className="flex items-center justify-between">
            <span className="font-hud text-[11px] text-teal-300">
              {loadingProv ? "CARGANDO CSV..." : `PROCEDENCIA: ${prov?.source_file} (${prov?.observations} filas)`}
            </span>
            <button onClick={() => setProv(null)} className="text-slate-400 hover:text-white text-xs cursor-pointer">
              Cerrar
            </button>
          </div>
          {prov && prov.rows[0] && (
            <pre className="mt-2 p-2 rounded bg-slate-950 text-[10px] font-hud text-slate-300 overflow-x-auto max-h-28">
              {JSON.stringify(prov.rows[0].raw, null, 2)}
            </pre>
          )}
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {loading ? (
          <div className="text-xs font-hud text-teal-400 animate-pulse py-10 text-center">
            EVALUANDO EXPERIMENTOS PSI...
          </div>
        ) : findings.length === 0 ? (
          <div className="text-xs text-slate-400 py-10 text-center">
            No se encontraron hallazgos para este entorno.
          </div>
        ) : (
          findings.map((f, idx) => (
            <div
              key={f.key}
              className="rounded-xl bg-slate-900/85 border border-slate-800 hover:border-teal-500/40 p-3.5 transition"
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-hud text-[11px] px-1.5 py-0.5 rounded bg-teal-500/15 text-teal-300 border border-teal-500/30">
                      #{idx + 1} · RPI {f.rpi}
                    </span>
                    <span className="font-hud text-[11px] text-slate-400">{f.facility}</span>
                  </div>
                  <h3 className="text-sm font-semibold text-white mt-1.5">{f.experiment}</h3>
                  <p className="text-xs text-slate-400">
                    Material: <span className="text-slate-200">{f.material || "N/A"}</span> · Modo:{" "}
                    <span className="text-slate-200">{f.flame_mode}</span>
                    {f.geometry ? ` · Geometría: ${f.geometry}` : ""}
                  </p>
                </div>
                <span className="font-hud text-[10px] uppercase px-2 py-0.5 rounded-full bg-slate-800 text-amber-300 border border-slate-700 shrink-0">
                  {f.band}
                </span>
              </div>

              <p className="mt-2 text-xs text-slate-300 leading-relaxed">{f.narrative}</p>

              {/* Factores de peso */}
              {f.factors?.length > 0 && (
                <div className="mt-2.5 pt-2 border-t border-slate-800/80 space-y-1">
                  {f.factors.slice(0, 3).map((fac) => (
                    <div key={fac.name} className="flex items-center justify-between text-[11px] font-hud">
                      <span className="text-slate-400 truncate max-w-[195px]">{fac.name}</span>
                      <div className="flex items-center gap-2">
                        <div className="w-20 h-1.5 bg-slate-800 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-teal-400"
                            style={{ width: `${Math.min(100, Math.round(fac.value * 100))}%` }}
                          />
                        </div>
                        <span className="text-teal-300">+{fac.contribution.toFixed(1)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div className="mt-3 flex items-center justify-between gap-2 pt-2 border-t border-slate-800/80 flex-wrap">
                <div className="flex items-center gap-3 text-[11px] font-hud text-slate-400">
                  <span className="inline-flex items-center gap-1">
                    <Layers className="w-3 h-3 text-teal-400" /> {f.observations} obs
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <FileSpreadsheet className="w-3 h-3 text-sky-400" /> Q {Math.round(f.quality * 100)}%
                  </span>
                  {f.sources?.[0] && (
                    <button
                      onClick={() => inspectSource(f.sources[0])}
                      className="inline-flex items-center gap-1 text-cyan-400 hover:underline cursor-pointer"
                    >
                      <SearchCheck className="w-3 h-3" /> CSV
                    </button>
                  )}
                </div>

                <button
                  onClick={() => onAskFlamey(f)}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-teal-500/20 hover:bg-teal-500/30 text-teal-300 border border-teal-500/40 text-xs font-medium transition cursor-pointer"
                >
                  <Sparkles className="w-3.5 h-3.5" /> Interpretar SI
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </aside>
  );
}