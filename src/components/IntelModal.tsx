"use client";

import { useEffect, useState } from "react";
import {
  api,
  FacilitiesOut,
  GapsOut,
  HardwareNodeOut,
  IncidentOut,
  IncidentSourceOut,
  InvestigationOut,
  MeasurementsOut,
  RulesOut,
  SimilarityPair,
  SpinoffOut,
  VariationOut,
} from "@/lib/api";
import { X } from "lucide-react";

export type IntelTab =
  | "hardware"
  | "sensors"
  | "compare"
  | "gaps"
  | "incidents"
  | "spinoffs"
  | "info";

interface Props {
  tab: IntelTab | null;
  onClose: () => void;
  onChangeTab: (t: IntelTab) => void;
}

export function IntelModal({ tab, onClose, onChangeTab }: Props) {
  const [hardware, setHardware] = useState<HardwareNodeOut[]>([]);
  const [facilities, setFacilities] = useState<FacilitiesOut | null>(null);
  const [measurements, setMeasurements] = useState<MeasurementsOut | null>(null);
  const [investigations, setInvestigations] = useState<InvestigationOut[]>([]);
  const [selectedExp, setSelectedExp] = useState<string>("");
  const [variation, setVariation] = useState<VariationOut | null>(null);
  const [similarity, setSimilarity] = useState<SimilarityPair[]>([]);
  const [incidents, setIncidents] = useState<IncidentOut[]>([]);
  const [incidentExcerpt, setIncidentExcerpt] = useState<IncidentSourceOut | null>(null);
  const [spinoffs, setSpinoffs] = useState<SpinoffOut[]>([]);
  const [gaps, setGaps] = useState<GapsOut | null>(null);
  const [rules, setRules] = useState<RulesOut | null>(null);

  useEffect(() => {
    if (!tab) return;
    if (tab === "hardware") {
      api.hardware().then(setHardware).catch(() => {});
      api.facilities().then(setFacilities).catch(() => {});
    }
    if (tab === "sensors") {
      api.measurements().then(setMeasurements).catch(() => {});
    }
    if (tab === "compare") {
      api
        .investigations()
        .then((list) => {
          setInvestigations(list);
          if (list[0] && !selectedExp) setSelectedExp(list[0].key);
        })
        .catch(() => {});
      api.similarity(20).then(setSimilarity).catch(() => {});
    }
    if (tab === "incidents") {
      api.incidents().then(setIncidents).catch(() => {});
    }
    if (tab === "spinoffs") {
      api.spinoffs().then(setSpinoffs).catch(() => {});
    }
    if (tab === "gaps") {
      api.gaps().then(setGaps).catch(() => {});
    }
    if (tab === "info") {
      api.rules().then(setRules).catch(() => {});
    }
  }, [tab, selectedExp]);

  useEffect(() => {
    if (tab === "compare" && selectedExp) {
      api.variation(selectedExp).then(setVariation).catch(() => {});
    }
  }, [tab, selectedExp]);

  if (!tab) return null;

  const tabs: { id: IntelTab; label: string }[] = [
    { id: "hardware", label: "Hardware & Instalaciones" },
    { id: "sensors", label: "Sensores & Mediciones" },
    { id: "compare", label: "Comparador & Variación" },
    { id: "gaps", label: "Brechas PSI" },
    { id: "incidents", label: "Incidentes Históricos" },
    { id: "spinoffs", label: "Beneficio en Tierra" },
    { id: "info", label: "Guía & Mitos NASA" },
  ];

  return (
    <div className="fixed inset-0 z-40 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4">
      <div className="w-full max-w-5xl max-h-[88vh] flex flex-col rounded-2xl bg-slate-900 border border-slate-800 shadow-2xl">
        <div className="p-4 border-b border-slate-800 flex items-center justify-between gap-2 flex-wrap">
          <div className="flex flex-wrap gap-1.5">
            {tabs.map((t) => (
              <button
                key={t.id}
                onClick={() => onChangeTab(t.id)}
                className={`px-3 py-1.5 rounded-lg font-hud text-xs transition cursor-pointer ${
                  tab === t.id
                    ? "bg-teal-500/20 text-teal-300 border border-teal-500/40"
                    : "bg-slate-950 text-slate-400 hover:text-white"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 cursor-pointer">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 overflow-y-auto space-y-4 text-xs">
          {tab === "hardware" && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {hardware.map((h, i) => (
                  <div key={i} className="p-4 rounded-xl bg-slate-950/80 border border-slate-800">
                    <div className="font-hud text-[10px] text-teal-400">
                      {h.facility} · {h.hardware}
                    </div>
                    <h3 className="text-sm font-bold text-white mt-0.5">
                      {h.label} ({h.project})
                    </h3>
                    <div className="mt-2.5 flex flex-wrap gap-1.5">
                      {h.experiments.map((e) => (
                        <span
                          key={e.key}
                          className="font-hud text-[11px] px-2 py-0.5 rounded bg-slate-900 border border-slate-700 text-slate-200"
                        >
                          {e.key} ({e.observations} obs)
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>

              {facilities && facilities.facilities.length > 0 && (
                <div className="p-4 rounded-xl bg-slate-950/80 border border-slate-800">
                  <p className="font-hud text-teal-400 mb-2">ESPECIFICACIONES DE BASTIDORES EN ISS</p>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    {facilities.facilities.map((f, idx) => (
                      <div key={idx} className="p-2.5 rounded bg-slate-900 border border-slate-800">
                        <div className="font-bold text-white">{f.nombre || f.id}</div>
                        <div className="font-hud text-[11px] text-slate-400 mt-0.5">
                          Bastidor: {f.bastidor || "N/A"} · {f.masa_kg ?? "?"} kg · {f.volumen_m3 ?? "?"} m³
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {tab === "sensors" && measurements && (
            <div className="space-y-3">
              <p className="text-slate-300">{measurements.note}</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {measurements.experiments.map((exp) => (
                  <div key={exp.experiment} className="p-4 rounded-xl bg-slate-950/80 border border-slate-800">
                    <h3 className="text-sm font-bold text-white">{exp.experiment}</h3>
                    <div className="mt-2 space-y-1">
                      {exp.measurements.map((m, i) => (
                        <div key={i} className="flex justify-between p-1.5 rounded bg-slate-900 font-hud text-[11px]">
                          <span className="text-cyan-300">{m.instrument}</span>
                          <span className="text-slate-300">
                            {m.variable} ({m.kind})
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {tab === "compare" && (
            <div className="space-y-4">
              <div className="p-4 rounded-xl bg-slate-950/80 border border-slate-800">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <span className="font-hud text-teal-400">VARIABLES CAMBIANTES VS CONSTANTES</span>
                  <select
                    value={selectedExp}
                    onChange={(e) => setSelectedExp(e.target.value)}
                    className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-white"
                  >
                    {investigations.map((inv) => (
                      <option key={inv.key} value={inv.key}>
                        {inv.label} ({inv.observations} corridas)
                      </option>
                    ))}
                  </select>
                </div>

                {variation && (
                  <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <p className="font-hud text-[11px] text-amber-300 mb-1.5">LO QUE VARÍA ENTRE CORRIDAS</p>
                      <div className="space-y-1">
                        {variation.varying.map((v) => (
                          <div key={v.column} className="flex justify-between p-2 rounded bg-slate-900">
                            <span className="font-mono text-slate-200">{v.column}</span>
                            <span className="font-hud text-slate-400">
                              {v.minimum != null && v.maximum != null
                                ? `${v.minimum} → ${v.maximum}`
                                : `${v.distinct} valores`}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div>
                      <p className="font-hud text-[11px] text-cyan-300 mb-1.5">LO QUE PERMANECE CONSTANTE</p>
                      <div className="flex flex-wrap gap-1.5">
                        {variation.constant.map((c) => (
                          <span
                            key={c}
                            className="font-mono text-[11px] px-2 py-1 rounded bg-slate-900 border border-slate-800 text-slate-300"
                          >
                            {c}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <div className="p-4 rounded-xl bg-slate-950/80 border border-slate-800">
                <p className="font-hud text-teal-400 mb-2">SIMILITUD Y DIFERENCIAS ENTRE EXPERIMENTOS</p>
                <div className="space-y-2">
                  {similarity.slice(0, 8).map((s, idx) => (
                    <div
                      key={idx}
                      className="p-2.5 rounded-lg bg-slate-900 flex flex-col sm:flex-row sm:items-center justify-between gap-2"
                    >
                      <div>
                        <span className="font-bold text-white">{s.a}</span> ↔{" "}
                        <span className="font-bold text-white">{s.b}</span>
                        <p className="text-[11px] text-slate-400 mt-0.5">Común: {s.shared.join(", ")}</p>
                        <p className="text-[11px] text-amber-300/80">Difiere: {s.differing.join(", ")}</p>
                      </div>
                      <span className="font-hud px-2.5 py-1 rounded bg-teal-500/15 text-teal-300 border border-teal-500/30 self-start">
                        {s.similarity}% similitud
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {tab === "gaps" && gaps && (
            <div className="space-y-3">
              <p className="text-slate-300">{gaps.note}</p>
              {gaps.declared.map((d, i) => (
                <div key={i} className="p-3.5 rounded-xl bg-amber-950/20 border border-amber-500/30">
                  <div className="font-hud text-amber-300 font-semibold">{d.area}</div>
                  <p className="text-slate-200 mt-1">{d.detail}</p>
                  <p className="font-hud text-[11px] text-slate-400 mt-1">Cota disponible: {d.bound}</p>
                </div>
              ))}
            </div>
          )}

          {tab === "incidents" && (
            <div className="space-y-4">
              {incidentExcerpt && (
                <div className="p-4 rounded-xl bg-slate-950 border border-rose-500/40">
                  <div className="flex justify-between items-center mb-2">
                    <span className="font-hud text-rose-300">INFORME ORIGINAL: {incidentExcerpt.slug}</span>
                    <button
                      onClick={() => setIncidentExcerpt(null)}
                      className="text-slate-400 hover:text-white cursor-pointer"
                    >
                      Cerrar
                    </button>
                  </div>
                  <div className="space-y-1 text-slate-300 max-h-40 overflow-y-auto">
                    {incidentExcerpt.excerpt.map((line, idx) => (
                      <p key={idx}>{line}</p>
                    ))}
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {incidents.map((inc) => (
                  <div key={inc.slug} className="p-4 rounded-xl bg-slate-950/80 border border-slate-800">
                    <div className="flex justify-between font-hud text-[11px] text-rose-400">
                      <span>
                        {inc.year} · {inc.environment}
                      </span>
                      {inc.mean_rpi != null && <span>RPI medio: {inc.mean_rpi}</span>}
                    </div>
                    <h3 className="text-sm font-bold text-white mt-1">{inc.name}</h3>
                    <p className="text-slate-300 mt-1.5 leading-relaxed">{inc.summary}</p>
                    <div className="mt-2.5 flex items-center justify-between gap-2">
                      <span className="font-hud text-[11px] text-teal-300">Veredicto: {inc.verdict}</span>
                      <button
                        onClick={() => api.incidentSource(inc.slug).then(setIncidentExcerpt).catch(() => {})}
                        className="font-hud text-[10px] px-2 py-1 rounded bg-slate-900 hover:bg-slate-800 text-rose-300 border border-rose-500/30 cursor-pointer"
                      >
                        Ver extracto
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {tab === "spinoffs" && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {spinoffs.map((sp, i) => (
                <div key={i} className="p-4 rounded-xl bg-slate-950/80 border border-slate-800">
                  <span className="font-hud text-[10px] text-emerald-400">{sp.source}</span>
                  <h3 className="text-sm font-bold text-white mt-0.5">{sp.name}</h3>
                  <p className="text-slate-300 mt-1.5 leading-relaxed">{sp.benefit}</p>
                </div>
              ))}
            </div>
          )}

          {tab === "info" && (
            <div className="space-y-4">
              <div className="p-4 rounded-xl bg-slate-950/80 border border-slate-800 space-y-2">
                <h3 className="text-sm font-bold text-white">Cómo usar el Centro de Mando (Space Apps 2026)</h3>
                <p className="text-slate-300">
                  1. Selecciona un entorno habitable (<code>SPX-001</code> a <code>SPX-006</code>) para rankear los experimentos PSI por Índice de Prioridad de Riesgo (RPI).
                </p>
                <p className="text-slate-300">
                  2. Usa <strong>LABORATORIO</strong> para simular atmósferas enriquecidas en O₂, dilución supresora (CO₂ / He) y cotas de gravedad parcial entre 0 g y 1 g.
                </p>
                <p className="text-slate-300">
                  3. Pulsa <strong>Interpretar SI</strong> en cualquier hallazgo para que <strong>Flamey</strong> audite las filas CSV originales sin inventar datos.
                </p>
              </div>

              {rules && (
                <div className="space-y-2">
                  <p className="font-hud text-teal-400">MITOS VS HECHOS OFICIALES DE LA GUÍA NASA ({rules.count})</p>
                  {rules.rules.map((r, i) => (
                    <div key={i} className="p-3 rounded-xl bg-slate-950/80 border border-slate-800">
                      <p className="text-rose-300 line-through">{r.mito}</p>
                      <p className="text-emerald-300 mt-1">{r.hecho}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}