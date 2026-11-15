"use client";

import { useEffect, useState } from "react";
import { api, atmToPsi, Fm2Out, GravityBandOut, LabOut, OxygenLadderOut } from "@/lib/api";
import { useMission } from "@/components/MissionContext";
import { PageShell, Panel, PanelTitle } from "@/components/ui";
import { AlertTriangle, Flame, ShieldCheck } from "lucide-react";

const FALLBACK_MATERIALS = ["SIBAL", "PMMA", "NOMEX", "COTTON"];

const PRESETS = [
  { label: "ISS", g: 0, o2: 0.21, p: 1.0 },
  { label: "Base lunar", g: 0.165, o2: 0.34, p: 0.69 },
  { label: "Rover", g: 0.165, o2: 0.3, p: 0.69 },
  { label: "Traje EVA", g: 0.165, o2: 1.0, p: 0.29 },
  { label: "Marte", g: 0.38, o2: 0.34, p: 0.65 },
];

export default function LaboratorioPage() {
  const { materialKeys } = useMission();
  const materials = materialKeys.length ? materialKeys : FALLBACK_MATERIALS;

  const [material, setMaterial] = useState("SIBAL");
  const [o2, setO2] = useState(0.3);
  const [pressure, setPressure] = useState(0.69);
  const [gravity, setGravity] = useState(0.165);
  const [flow, setFlow] = useState(10);
  const [co2, setCo2] = useState(0);
  const [he, setHe] = useState(0);

  const [sim, setSim] = useState<LabOut | null>(null);
  const [band, setBand] = useState<GravityBandOut | null>(null);
  const [ladder, setLadder] = useState<OxygenLadderOut | null>(null);
  const [fm2, setFm2] = useState<Fm2Out | null>(null);
  const [failed, setFailed] = useState(false);

  // Si el material elegido no existe en la API, usa el primero disponible.
  useEffect(() => {
    if (materialKeys.length && !materialKeys.includes(material)) {
      setMaterial(materialKeys[0]);
    }
  }, [materialKeys, material]);

  useEffect(() => {
    api.oxygenLadder().then(setLadder).catch(() => {});
    api.fm2().then(setFm2).catch(() => {});
  }, []);

  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(() => {
      api
        .simulate({
          material,
          o2_fraction: o2,
          pressure_atm: pressure,
          gravity_g: gravity,
          flow_cm_s: flow,
          ignition_w: 25,
          co2_pct: co2,
          he_pct: he,
          diluent: "N2",
          mode: "opposed",
        })
        .then((result) => {
          if (cancelled) return;
          setSim(result);
          setFailed(false);
        })
        .catch(() => {
          if (!cancelled) setFailed(true);
        });

      api
        .gravityBand({
          material,
          o2_fraction: o2,
          pressure_atm: pressure,
          diluent: "N2",
          mode: "opposed",
          gravity_g: Math.min(1, gravity),
        })
        .then((result) => {
          if (!cancelled) setBand(result);
        })
        .catch(() => {});
    }, 150);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [material, o2, pressure, gravity, flow, co2, he]);

  return (
    <PageShell
      title="Laboratorio"
      subtitle="Cambia la atmósfera y mira si el material arde, a qué velocidad y entre qué límites de gravedad."
    >
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        {/* Controles */}
        <Panel className="space-y-4 lg:col-span-5">
          <div>
            <label
              htmlFor="lab-material"
              className="mb-1 block font-hud text-xs text-slate-300"
            >
              Material
            </label>
            <select
              id="lab-material"
              value={material}
              onChange={(e) => setMaterial(e.target.value)}
              className="h-9 w-full cursor-pointer rounded-lg border border-slate-700 bg-slate-900 px-3 text-sm text-white"
            >
              {materials.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </div>

          <div>
            <span className="mb-1 block font-hud text-xs text-slate-300">Entorno</span>
            <div className="flex flex-wrap gap-1.5">
              {PRESETS.map((preset) => {
                const active =
                  gravity === preset.g && o2 === preset.o2 && pressure === preset.p;
                return (
                  <button
                    key={preset.label}
                    type="button"
                    aria-pressed={active}
                    title={`${Math.round(preset.o2 * 100)}% O₂ · ${preset.p} atm · ${preset.g} g`}
                    onClick={() => {
                      setGravity(preset.g);
                      setO2(preset.o2);
                      setPressure(preset.p);
                    }}
                    className={`cursor-pointer rounded-lg border px-2.5 py-1 font-hud text-xs ${
                      active
                        ? "border-teal-400 bg-teal-500/20 text-teal-100"
                        : "border-slate-700 bg-slate-900 text-slate-300 hover:border-slate-500"
                    }`}
                  >
                    {preset.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <label htmlFor="lab-o2" className="flex justify-between font-hud text-xs">
              <span className="text-slate-300">Oxígeno</span>
              <span className="font-semibold text-amber-300">{Math.round(o2 * 100)}%</span>
            </label>
            <input
              id="lab-o2"
              type="range"
              min={0.15}
              max={1.0}
              step={0.01}
              value={o2}
              onChange={(e) => setO2(parseFloat(e.target.value))}
              className="w-full cursor-pointer accent-teal-400"
            />
          </div>

          <div>
            <label htmlFor="lab-pressure" className="flex justify-between font-hud text-xs">
              <span className="text-slate-300">Presión</span>
              <span className="text-cyan-300">
                {pressure.toFixed(2)} atm ({atmToPsi(pressure)} psi)
              </span>
            </label>
            <input
              id="lab-pressure"
              type="range"
              min={0.2}
              max={1.5}
              step={0.01}
              value={pressure}
              onChange={(e) => setPressure(parseFloat(e.target.value))}
              className="w-full cursor-pointer accent-teal-400"
            />
          </div>

          <div>
            <label htmlFor="lab-gravity" className="flex justify-between font-hud text-xs">
              <span className="text-slate-300">Gravedad</span>
              <span className="text-violet-300">
                {gravity === 0 ? "0 g (microgravedad)" : `${gravity.toFixed(3)} g`}
              </span>
            </label>
            <input
              id="lab-gravity"
              type="range"
              min={0}
              max={1}
              step={0.005}
              value={gravity}
              onChange={(e) => setGravity(parseFloat(e.target.value))}
              className="w-full cursor-pointer accent-teal-400"
            />
          </div>

          <div className="grid grid-cols-3 gap-2">
            {[
              { id: "lab-flow", label: "Flujo (cm/s)", value: flow, set: setFlow, max: 200 },
              { id: "lab-co2", label: "CO₂ (%)", value: co2, set: setCo2, max: 60 },
              { id: "lab-he", label: "Helio (%)", value: he, set: setHe, max: 60 },
            ].map((field) => (
              <div key={field.id}>
                <label
                  htmlFor={field.id}
                  className="block font-hud text-[11px] text-slate-300"
                >
                  {field.label}
                </label>
                <input
                  id={field.id}
                  type="number"
                  min={0}
                  max={field.max}
                  value={field.value}
                  onChange={(e) =>
                    field.set(Math.max(0, Math.min(field.max, Number(e.target.value))))
                  }
                  className="mt-1 h-8 w-full rounded-lg border border-slate-700 bg-slate-900 px-2 font-hud text-xs text-white"
                />
              </div>
            ))}
          </div>
        </Panel>

        {/* Resultados */}
        <div className="space-y-4 lg:col-span-7">
          {failed && !sim && (
            <Panel>
              <p className="text-sm text-slate-300">
                No se pudo calcular la simulación. Revisa la conexión con la API.
              </p>
            </Panel>
          )}

          {sim && (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <Panel>
                <span className="font-hud text-[11px] text-slate-400">Estado</span>
                <div className="mt-1 flex items-center gap-2 text-sm font-bold">
                  {sim.quenched ? (
                    <>
                      <ShieldCheck className="h-4 w-4 text-emerald-400" />
                      <span className="text-emerald-400">Se apaga</span>
                    </>
                  ) : (
                    <>
                      <Flame className="h-4 w-4 text-rose-400" />
                      <span className="text-rose-400">Sigue ardiendo</span>
                    </>
                  )}
                </div>
              </Panel>
              <Panel>
                <span className="font-hud text-[11px] text-slate-400">
                  Velocidad de la llama
                </span>
                <p className="mt-1 font-hud text-lg font-bold text-white">
                  {sim.rate_mm_s.toFixed(2)} mm/s
                </p>
              </Panel>
              <Panel>
                <span className="font-hud text-[11px] text-slate-400">
                  Margen sobre el límite
                </span>
                <p
                  className={`mt-1 font-hud text-lg font-bold ${
                    sim.excess > 0 ? "text-amber-400" : "text-teal-400"
                  }`}
                >
                  {sim.excess > 0 ? "+" : ""}
                  {(sim.excess * 100).toFixed(1)}%
                </p>
              </Panel>
            </div>
          )}

          {band && (
            <Panel>
              <div className="flex flex-wrap items-center justify-between gap-1">
                <PanelTitle>Entre microgravedad y la Tierra</PanelTitle>
                <span className="font-hud text-xs text-slate-400">
                  Objetivo: <strong className="text-white">{band.interpolated_at} g</strong>
                </span>
              </div>
              <div className="grid grid-cols-3 gap-2 text-center font-hud text-xs">
                <div className="rounded-lg border border-slate-800 bg-slate-950 p-2.5">
                  <div className="text-[11px] text-slate-400">0 g</div>
                  <div className="mt-0.5 font-semibold text-cyan-300">
                    {band.low.toFixed(2)} mm/s
                  </div>
                </div>
                <div className="rounded-lg border border-teal-500/40 bg-teal-950/40 p-2.5">
                  <div className="text-[11px] text-teal-300">{band.interpolated_at} g</div>
                  <div className="mt-0.5 font-bold text-white">
                    {band.interpolated.toFixed(2)} mm/s
                  </div>
                </div>
                <div className="rounded-lg border border-slate-800 bg-slate-950 p-2.5">
                  <div className="text-[11px] text-slate-400">1 g</div>
                  <div className="mt-0.5 font-semibold text-amber-300">
                    {band.high.toFixed(2)} mm/s
                  </div>
                </div>
              </div>
              {band.declared && (
                <p className="mt-2.5 flex items-start gap-1.5 text-xs text-amber-300">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  La base PSI aún no tiene ensayos en gravedad parcial. Este valor es una
                  estimación entre los dos extremos, hasta que lleguen datos de LUCI y FM2.
                </p>
              )}
            </Panel>
          )}

          {ladder && ladder.anchors.length > 0 && (
            <Panel>
              <PanelTitle>Niveles de oxígeno de referencia</PanelTitle>
              <div className="flex flex-wrap gap-1.5">
                {ladder.anchors.map((a) => (
                  <button
                    key={a.label}
                    type="button"
                    onClick={() => setO2(a.o2)}
                    title="Usar este nivel de oxígeno"
                    className="cursor-pointer rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-1 font-hud text-xs text-teal-300 hover:border-teal-500/60"
                  >
                    {Math.round(a.o2 * 100)}% · {a.label}
                  </button>
                ))}
              </div>
            </Panel>
          )}

          {fm2 && (
            <Panel>
              <PanelTitle>Experimento lunar planificado (FM2)</PanelTitle>
              <p className="text-sm text-slate-300">{fm2.note}</p>
            </Panel>
          )}
        </div>
      </div>
    </PageShell>
  );
}