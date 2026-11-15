"use client";

import { api } from "@/lib/api";
import { PageShell, Panel, PanelTitle, StateMessage, useApi } from "@/components/ui";

export default function HardwarePage() {
  const hardware = useApi(() => api.hardware());
  const facilities = useApi(() => api.facilities());

  const nodes = hardware.data || [];
  const racks = facilities.data?.facilities || [];

  return (
    <PageShell
      title="Hardware e instalaciones"
      subtitle="Qué equipo de la estación se usó en cada grupo de experimentos."
    >
      <StateMessage
        loading={hardware.loading}
        error={hardware.error}
        empty={!hardware.loading && !hardware.error && nodes.length === 0}
        onRetry={hardware.reload}
      />

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {nodes.map((h, i) => (
          <Panel key={i}>
            <div className="font-hud text-[11px] text-teal-300">
              {h.facility} · {h.hardware}
            </div>
            <h2 className="mt-0.5 text-sm font-bold text-white">
              {h.label} ({h.project})
            </h2>
            <div className="mt-2.5 flex flex-wrap gap-1.5">
              {h.experiments.map((e) => (
                <span
                  key={e.key}
                  className="rounded-lg border border-slate-700 bg-slate-950 px-2 py-0.5 font-hud text-[11px] text-slate-200"
                >
                  {e.key} · {e.observations} corridas
                </span>
              ))}
            </div>
          </Panel>
        ))}
      </div>

      {racks.length > 0 && (
        <Panel>
          <PanelTitle>Bastidores en la estación</PanelTitle>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            {racks.map((f, idx) => (
              <div key={idx} className="rounded-lg border border-slate-800 bg-slate-950 p-2.5">
                <div className="text-sm font-bold text-white">{f.nombre || f.id}</div>
                <div className="mt-0.5 font-hud text-[11px] text-slate-400">
                  {f.bastidor || "Sin bastidor"} · {f.masa_kg ?? "?"} kg · {f.volumen_m3 ?? "?"} m³
                </div>
              </div>
            ))}
          </div>
        </Panel>
      )}
    </PageShell>
  );
}