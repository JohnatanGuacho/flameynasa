"use client";

import { useEffect, useState } from "react";
import { api, atmToPsi, Fm2Out, GravityBandOut, LabOut, OxygenLadderOut } from "@/lib/api";
import { Flame, Gauge, ShieldCheck, AlertTriangle, X } from "lucide-react";

interface Props {
  open: boolean;
  onClose: () => void;
  materials: string[];
}

export function LabPanel({ open, onClose, materials }: Props) {
  const [material, setMaterial] = useState(materials[0] || "SIBAL");
  const [o2, setO2] = useState(0.3);
  const [pressure, setPressure] = useState(0.69); // ~10.2 psi lunar
  const [gravity, setGravity] = useState(0.165);
  const [flow, setFlow] = useState(10);
  const [co2, setCo2] = useState(0);
  const [he, setHe] = useState(0);

  const [sim, setSim] = useState<LabOut | null>(null);
  const [band, setBand] = useState<GravityBandOut | null>(null);
  const [ladder, setLadder] = useState<OxygenLadderOut | null>(null);
  const [fm2, setFm2] = useState<Fm2Out | null>(null);

  useEffect(() => {
    if (!open) return;
    api.oxygenLadder().then(setLadder).catch(() => {});
    api.fm2().then(setFm2).catch(() => {});
  }, [open]);

  useEffect(() => {
    if (!open) return;
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
        .then(setSim)
        .catch(() => {});

      api
        .gravityBand({
          material,
          o2_fraction: o2,
          pressure_atm: pressure,
          diluent: "N2",
          mode: "opposed",
          gravity_g: Math.min(1, gravity),
        })
        .then(setBand)
        .catch(() => {});
    }, 150);

    return () => clearTimeout(timer);
  }, [open, material, o2, pressure, gravity, flow, co2, he]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-40 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4">
      <div className="w-full max-w-5xl max-h-[90vh] overflow-y-auto rounded-2xl bg-slate-900 border border-slate-800 shadow-2xl">
        <div className="p-4 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <Gauge className="w-5 h-5 text-teal-400" />
            <div>
              <h2 className="text-base font-bold text-white">Laboratorio Contrafactual & Banda Gravitacional</h2>
              <p className="font-hud text-[11px] text-slate-400">
                Simulación de inflamabilidad, supresión (CO₂ / He) y acotación lunar/marciana
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 cursor-pointer">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 grid grid-cols-1 lg:grid-cols-12 gap-5">
          {/* Panel izquierdo: Sliders y Presets */}
          <div className="lg:col-span-5 space-y-3.5 bg-slate-950/70 p-4 rounded-xl border border-slate-800">
            <div>
              <label className="block font-hud text-[11px] text-slate-400 mb-1">MATERIAL / COMBUSTIBLE</label>
              <select
                value={material}
                onChange={(e) => setMaterial(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white"
              >
                {(materials.length ? materials : ["SIBAL", "PMMA", "NOMEX", "COTTON"]).map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <div className="flex justify-between font-hud text-xs">
                <span className="text-slate-400">Concentración O₂</span>
                <span className="text-amber-300 font-semibold">{Math.round(o2 * 100)}%</span>
              </div>
              <input
                type="range"
                min={0.15}
                max={1.0}
                step={0.01}
                value={o2}
                onChange={(e) => setO2(parseFloat(e.target.value))}
                className="w-full accent-teal-400"
              />
            </div>

            <div>
              <div className="flex justify-between font-hud text-xs">
                <span className="text-slate-400">Presión total</span>
                <span className="text-cyan-300">
                  {pressure.toFixed(2)} atm ({atmToPsi(pressure)} psi)
                </span>
              </div>
              <input
                type="range"
                min={0.2}
                max={1.5}
                step={0.01}
                value={pressure}
                onChange={(e) => setPressure(parseFloat(e.target.value))}
                className="w-full accent-teal-400"
              />
            </div>

            <div>
              <div className="flex justify-between font-hud text-xs">
                <span className="text-slate-400">Gravedad</span>
                <span className="text-purple-300">
                  {gravity === 0 ? "0 g (ISS µg)" : `${gravity.toFixed(3)} g`}
                </span>
              </div>
              <input
                type="range"
                min={0}
                max={1}
                step={0.005}
                value={gravity}
                onChange={(e) => setGravity(parseFloat(e.target.value))}
                className="w-full accent-teal-400"
              />
              <div className="flex flex-wrap gap-1.5 mt-1.5">
                {[
                  { l: "ISS (0g · 21%)", g: 0, o: 0.21, p: 1.0 },
                  { l: "Base Luna (0.165g · 34%)", g: 0.165, o: 0.34, p: 0.69 },
                  { l: "Rover (0.165g · 30%)", g: 0.165, o: 0.3, p: 0.69 },
                  { l: "EVA (4.3psi · 100%)", g: 0.165, o: 1.0, p: 0.29 },
                  { l: "Marte (0.38g · 34%)", g: 0.38, o: 0.34, p: 0.65 },
                ].map((preset) => (
                  <button
                    key={preset.l}
                    onClick={() => {
                      setGravity(preset.g);
                      setO2(preset.o);
                      setPressure(preset.p);
                    }}
                    className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 font-hud text-[10px] text-slate-200 cursor-pointer"
                  >
                    {preset.l}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2 pt-1">
              <div>
                <label className="block font-hud text-[10px] text-slate-400">Flujo (cm/s)</label>
                <input
                  type="number"
                  min={0}
                  max={200}
                  value={flow}
                  onChange={(e) => setFlow(Number(e.target.value))}
                  className="w-full mt-1 bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs font-hud"
                />
              </div>
              <div>
                <label className="block font-hud text-[10px] text-slate-400">Dilución CO₂ %</label>
                <input
                  type="number"
                  min={0}
                  max={60}
                  value={co2}
                  onChange={(e) => setCo2(Number(e.target.value))}
                  className="w-full mt-1 bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs font-hud"
                />
              </div>
              <div>
                <label className="block font-hud text-[10px] text-slate-400">Dilución He %</label>
                <input
                  type="number"
                  min={0}
                  max={60}
                  value={he}
                  onChange={(e) => setHe(Number(e.target.value))}
                  className="w-full mt-1 bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs font-hud"
                />
              </div>
            </div>
          </div>

          {/* Panel derecho: Resultados predictivos */}
          <div className="lg:col-span-7 space-y-4">
            {sim && (
              <div className="grid grid-cols-3 gap-3">
                <div className="p-3.5 rounded-xl bg-slate-950/70 border border-slate-800">
                  <span className="font-hud text-[10px] text-slate-400">ESTADO DE COMBUSTIÓN</span>
                  <div className="mt-1 flex items-center gap-2 font-bold text-sm">
                    {sim.quenched ? (
                      <>
                        <ShieldCheck className="w-4 h-4 text-emerald-400" />
                        <span className="text-emerald-400">EXTINGUIDA</span>
                      </>
                    ) : (
                      <>
                        <Flame className="w-4 h-4 text-rose-400" />
                        <span className="text-rose-400">LLAMA ACTIVA</span>
                      </>
                    )}
                  </div>
                </div>
                <div className="p-3.5 rounded-xl bg-slate-950/70 border border-slate-800">
                  <span className="font-hud text-[10px] text-slate-400">TASA PROPAGACIÓN</span>
                  <p className="mt-1 font-hud text-lg font-bold text-white">{sim.rate_mm_s.toFixed(2)} mm/s</p>
                </div>
                <div className="p-3.5 rounded-xl bg-slate-950/70 border border-slate-800">
                  <span className="font-hud text-[10px] text-slate-400">MARGEN SOBRE LÍMITE</span>
                  <p className={`mt-1 font-hud text-lg font-bold ${sim.excess > 0 ? "text-amber-400" : "text-teal-400"}`}>
                    {sim.excess > 0 ? `+${(sim.excess * 100).toFixed(1)}%` : `${(sim.excess * 100).toFixed(1)}%`}
                  </p>
                </div>
              </div>
            )}

            {band && (
              <div className="p-4 rounded-xl bg-slate-950/70 border border-slate-800">
                <div className="flex items-center justify-between flex-wrap gap-1">
                  <span className="font-hud text-xs text-teal-400">BANDA GRAVITACIONAL (µg vs 1g)</span>
                  <span className="font-hud text-[11px] text-slate-400">
                    Objetivo: <strong className="text-white">{band.interpolated_at} g</strong>
                  </span>
                </div>
                <div className="mt-3 grid grid-cols-3 gap-2 text-center font-hud text-xs">
                  <div className="p-2.5 rounded bg-slate-900 border border-slate-800">
                    <div className="text-[10px] text-slate-400">Cota µg (0 g)</div>
                    <div className="text-cyan-300 font-semibold mt-0.5">{band.low.toFixed(2)} mm/s</div>
                  </div>
                  <div className="p-2.5 rounded bg-teal-950/40 border border-teal-500/40">
                    <div className="text-[10px] text-teal-300">Interpolado ({band.interpolated_at} g)</div>
                    <div className="text-white font-bold mt-0.5">{band.interpolated.toFixed(2)} mm/s</div>
                  </div>
                  <div className="p-2.5 rounded bg-slate-900 border border-slate-800">
                    <div className="text-[10px] text-slate-400">Cota Tierra (1 g)</div>
                    <div className="text-amber-300 font-semibold mt-0.5">{band.high.toFixed(2)} mm/s</div>
                  </div>
                </div>
                {band.declared && (
                  <p className="mt-2.5 flex items-center gap-1.5 text-[11px] text-amber-300/90">
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                    PSI aún no contiene pruebas directas en gravedad parcial; esta banda acota el riesgo hasta recibir datos de LUCI y FM2.
                  </p>
                )}
              </div>
            )}

            {ladder && (
              <div className="p-4 rounded-xl bg-slate-950/70 border border-slate-800">
                <span className="font-hud text-xs text-slate-300">ANCLAS DE OXÍGENO DEL RETO</span>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {ladder.anchors.map((a) => (
                    <span
                      key={a.label}
                      className="font-hud text-[10px] px-2 py-1 rounded bg-slate-900 text-teal-300 border border-slate-700"
                    >
                      {Math.round(a.o2 * 100)}% O₂ · {a.label}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {fm2 && (
              <div className="p-3.5 rounded-xl bg-slate-950/70 border border-slate-800 text-xs">
                <span className="font-hud text-[10px] text-purple-300">PAYLOAD LUNAR PLANIFICADO (FM2)</span>
                <p className="text-slate-300 mt-1">{fm2.note}</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}