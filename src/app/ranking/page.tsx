"use client";

import { useMemo, useRef, useState } from "react";
import { api, FindingOut, ProvenanceOut, atmToPsi } from "@/lib/api";
import { useMission } from "@/components/MissionContext";
import { PageShell, StateMessage } from "@/components/ui";
import {
  ChevronDown,
  ChevronUp,
  FileSpreadsheet,
  Layers,
  Loader2,
  Search,
  SearchCheck,
  Shuffle,
  Sparkles,
} from "lucide-react";

const FACTOR_COLORS = [
  "bg-teal-400",
  "bg-cyan-400",
  "bg-amber-400",
  "bg-violet-400",
  "bg-rose-400",
  "bg-sky-400",
];

/* Acepta O2 como fracción (0.32) o como porcentaje (32) */
const o2Pct = (v: number): number => Math.round(v <= 1 ? v * 100 : v);

function o2Range(f: FindingOut): string | null {
  if (f.o2_min == null && f.o2_max == null) return null;
  const lo = f.o2_min != null ? o2Pct(f.o2_min) : null;
  const hi = f.o2_max != null ? o2Pct(f.o2_max) : null;
  if (lo != null && hi != null && lo !== hi) return `O₂ ${lo}–${hi}%`;
  return `O₂ ${lo ?? hi}%`;
}

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full border border-slate-700 bg-slate-950 px-2 py-0.5 font-hud text-[11px] text-slate-200">
      {children}
    </span>
  );
}

export default function RankingPage() {
  const { currentEnv, findings, loadingFindings, askFlamey } = useMission();

  const [prov, setProv] = useState<ProvenanceOut | null>(null);
  const [provFile, setProvFile] = useState<string | null>(null);
  const [loadingProv, setLoadingProv] = useState(false);
  const [query, setQuery] = useState("");
  const [band, setBand] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);

  const cardRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const bands = useMemo(() => {
    const counts = new Map<string, number>();
    findings.forEach((f) => counts.set(f.band, (counts.get(f.band) || 0) + 1));
    return Array.from(counts.entries());
  }, [findings]);

  // Se conserva el puesto original del ranking aunque se filtre
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return findings
      .map((f, idx) => ({ f, rank: idx + 1 }))
      .filter(({ f }) => !band || f.band === band)
      .filter(({ f }) => {
        if (!q) return true;
        return [f.experiment, f.material, f.facility, f.flame_mode, f.geometry]
          .filter(Boolean)
          .some((v) => String(v).toLowerCase().includes(q));
      });
  }, [findings, query, band]);

  const inspectSource = async (sourceFile: string) => {
    if (provFile === sourceFile) {
      setProvFile(null);
      setProv(null);
      return;
    }
    setProvFile(sourceFile);
    setProv(null);
    setLoadingProv(true);
    try {
      setProv(await api.provenance(sourceFile));
    } catch {
      setProv(null);
      setProvFile(null);
    } finally {
      setLoadingProv(false);
    }
  };

  const pickRandom = () => {
    if (filtered.length === 0) return;
    const { f } = filtered[Math.floor(Math.random() * filtered.length)];
    setExpanded(f.key);
    askFlamey(f);
    requestAnimationFrame(() => {
      cardRefs.current[f.key]?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    });
  };

  const subtitle = currentEnv
    ? `${currentEnv.label} · ${
        currentEnv.gravity_g === 0 ? "µg" : `${currentEnv.gravity_g} g`
      } · ${Math.round(currentEnv.o2_fraction * 100)}% O₂ · ${currentEnv.pressure_atm} atm (${atmToPsi(
        currentEnv.pressure_atm
      )} psi)`
    : "Experimentos ordenados por relevancia para el entorno elegido";

  return (
    <PageShell
      title={`Ranking de hallazgos${
        findings.length ? ` · ${filtered.length} de ${findings.length}` : ""
      }`}
      subtitle={subtitle}
      actions={
        <button
          type="button"
          onClick={pickRandom}
          disabled={filtered.length === 0}
          title="Analizar un hallazgo al azar con Flamey"
          className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-900 px-3 font-hud text-xs text-teal-200 hover:bg-slate-800 disabled:opacity-40"
        >
          <Shuffle className="h-3.5 w-3.5" />
          Al azar
        </button>
      }
    >
      {/* Filtros */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[14rem] flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <label htmlFor="findings-search" className="sr-only">
            Buscar experimento o material
          </label>
          <input
            id="findings-search"
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar experimento o material"
            className="h-9 w-full rounded-lg border border-slate-700 bg-slate-900 pl-8 pr-3 text-sm text-white placeholder:text-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-400"
          />
        </div>

        {bands.length > 1 && (
          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              aria-pressed={band === ""}
              onClick={() => setBand("")}
              className={`cursor-pointer rounded-full border px-3 py-1 font-hud text-[11px] ${
                band === ""
                  ? "border-teal-400 bg-teal-500/20 text-teal-100"
                  : "border-slate-700 bg-slate-900 text-slate-300 hover:border-slate-500"
              }`}
            >
              Todos
            </button>
            {bands.map(([name, count]) => (
              <button
                key={name}
                type="button"
                aria-pressed={band === name}
                onClick={() => setBand(band === name ? "" : name)}
                className={`cursor-pointer rounded-full border px-3 py-1 font-hud text-[11px] uppercase ${
                  band === name
                    ? "border-teal-400 bg-teal-500/20 text-teal-100"
                    : "border-slate-700 bg-slate-900 text-slate-300 hover:border-slate-500"
                }`}
              >
                {name} {count}
              </button>
            ))}
          </div>
        )}
      </div>

      <StateMessage
        loading={loadingFindings}
        empty={!loadingFindings && filtered.length === 0}
        emptyText={
          findings.length === 0
            ? "Este entorno no tiene hallazgos."
            : "Ningún hallazgo coincide con el filtro."
        }
      />

      {/* Lista */}
      {!loadingFindings && (
        <div className="grid grid-cols-1 items-start gap-2 xl:grid-cols-2">
          {filtered.map(({ f, rank }) => {
            const isOpen = expanded === f.key;
            const o2 = o2Range(f);
            const totalContribution =
              f.factors?.reduce((sum, fac) => sum + Math.max(0, fac.contribution), 0) || 0;
            const source = f.sources?.[0];
            const showProv = isOpen && source && provFile === source;

            return (
              <div
                key={f.key}
                ref={(el) => {
                  cardRefs.current[f.key] = el;
                }}
                className={`rounded-xl border transition ${
                  isOpen
                    ? "border-teal-500/50 bg-slate-900"
                    : "border-slate-800 bg-slate-900/70 hover:border-slate-600"
                }`}
              >
                <button
                  type="button"
                  onClick={() => setExpanded(isOpen ? null : f.key)}
                  aria-expanded={isOpen}
                  className="flex w-full cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-400"
                >
                  <span className="w-6 shrink-0 text-center font-hud text-xs text-slate-400">
                    {rank}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold text-white">
                      {f.experiment}
                    </div>
                    <div className="truncate text-xs text-slate-400">
                      {f.material || "Sin material"} · {f.flame_mode}
                    </div>
                    <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-slate-800">
                      <div
                        className="h-full bg-teal-400"
                        style={{ width: `${Math.max(0, Math.min(100, f.rpi))}%` }}
                      />
                    </div>
                  </div>
                  <div className="shrink-0 text-right font-hud">
                    <div className="text-lg font-bold leading-none text-teal-300">{f.rpi}</div>
                    <div className="mt-0.5 text-[10px] uppercase text-slate-400">{f.band}</div>
                  </div>
                  {isOpen ? (
                    <ChevronUp className="h-4 w-4 shrink-0 text-slate-400" />
                  ) : (
                    <ChevronDown className="h-4 w-4 shrink-0 text-slate-400" />
                  )}
                </button>

                {isOpen && (
                  <div className="space-y-3 border-t border-slate-800 px-3 pb-3 pt-2.5">
                    <p className="text-sm leading-relaxed text-slate-200">{f.narrative}</p>

                    <div className="flex flex-wrap gap-1">
                      <Chip>{f.facility}</Chip>
                      {o2 && <Chip>{o2}</Chip>}
                      {f.pressure_atm != null && <Chip>{f.pressure_atm} atm</Chip>}
                      {f.geometry && <Chip>{f.geometry}</Chip>}
                    </div>

                    {f.factors?.length > 0 && (
                      <div className="space-y-1.5 rounded-lg border border-slate-800 bg-slate-950 p-2.5">
                        <div className="flex items-center justify-between font-hud text-xs">
                          <span className="text-slate-300">RPI = Σ valor × peso</span>
                          <span className="font-bold text-teal-300">{f.rpi}</span>
                        </div>

                        {totalContribution > 0 && (
                          <div className="flex h-2 overflow-hidden rounded-full bg-slate-800">
                            {f.factors.map((fac, i) => (
                              <div
                                key={fac.name}
                                title={`${fac.name}: +${fac.contribution.toFixed(1)}`}
                                className={FACTOR_COLORS[i % FACTOR_COLORS.length]}
                                style={{
                                  width: `${
                                    (Math.max(0, fac.contribution) / totalContribution) * 100
                                  }%`,
                                }}
                              />
                            ))}
                          </div>
                        )}

                        <div className="space-y-0.5">
                          {f.factors.map((fac, i) => (
                            <div
                              key={fac.name}
                              className="flex items-center gap-1.5 font-hud text-[11px]"
                            >
                              <span
                                className={`h-2 w-2 shrink-0 rounded-sm ${
                                  FACTOR_COLORS[i % FACTOR_COLORS.length]
                                }`}
                              />
                              <span className="min-w-0 flex-1 truncate text-slate-300">
                                {fac.name}
                              </span>
                              <span className="shrink-0 text-slate-400">
                                {fac.value.toFixed(2)} × {fac.weight.toFixed(2)}
                              </span>
                              <span className="w-10 shrink-0 text-right text-teal-300">
                                +{fac.contribution.toFixed(1)}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-3 font-hud text-xs text-slate-400">
                        <span title="Corridas del experimento" className="inline-flex items-center gap-1">
                          <Layers className="h-3.5 w-3.5 text-teal-400" />
                          {f.observations}
                        </span>
                        <span title="Calidad del dato" className="inline-flex items-center gap-1">
                          <FileSpreadsheet className="h-3.5 w-3.5 text-sky-400" />
                          {Math.round(f.quality * 100)}%
                        </span>
                        {source && (
                          <button
                            type="button"
                            onClick={() => inspectSource(source)}
                            aria-expanded={!!showProv}
                            title="Ver la fila original del CSV"
                            className="inline-flex cursor-pointer items-center gap-1 text-cyan-300 hover:text-cyan-200"
                          >
                            <SearchCheck className="h-3.5 w-3.5" />
                            CSV
                          </button>
                        )}
                      </div>

                      <button
                        type="button"
                        onClick={() => askFlamey(f)}
                        className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg bg-teal-500 px-3 py-1.5 text-xs font-semibold text-slate-950 hover:bg-teal-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-300"
                      >
                        <Sparkles className="h-3.5 w-3.5" />
                        Explicar con Flamey
                      </button>
                    </div>

                    {showProv && (
                      <div className="rounded-lg border border-slate-800 bg-slate-950 p-2.5">
                        {loadingProv ? (
                          <div className="flex items-center gap-2 font-hud text-xs text-teal-300">
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            Cargando CSV...
                          </div>
                        ) : prov ? (
                          <>
                            <div className="truncate font-hud text-xs text-teal-300">
                              {prov.source_file} · {prov.observations} filas
                            </div>
                            {prov.rows[0] && (
                              <div className="mt-1.5 max-h-40 space-y-0.5 overflow-y-auto">
                                {Object.entries(prov.rows[0].raw).map(([k, v]) => (
                                  <div
                                    key={k}
                                    className="flex justify-between gap-2 font-hud text-[11px]"
                                  >
                                    <span className="truncate text-slate-400">{k}</span>
                                    <span className="max-w-[55%] shrink-0 truncate text-slate-200">
                                      {String(v)}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </>
                        ) : null}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </PageShell>
  );
}