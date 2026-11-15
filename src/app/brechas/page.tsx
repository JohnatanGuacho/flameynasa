"use client";

import { api } from "@/lib/api";
import { PageShell, Panel, PanelTitle, StateMessage, useApi } from "@/components/ui";

export default function BrechasPage() {
  const { data, loading, error, reload } = useApi(() => api.gaps());

  const declared = data?.declared || [];
  const emptyCells = (data?.cells || []).filter((c) => c.observations === 0);

  return (
    <PageShell
      title="Brechas de evidencia"
      subtitle="Lo que la base PSI todavía no puede responder, y con qué dato se acota mientras tanto."
    >
      <StateMessage
        loading={loading}
        error={error}
        empty={!loading && !error && declared.length === 0 && emptyCells.length === 0}
        onRetry={reload}
      />

      {data?.note && <p className="text-sm text-slate-300">{data.note}</p>}

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {declared.map((d, i) => (
          <div key={i} className="rounded-xl border border-amber-500/30 bg-amber-950/20 p-4">
            <h2 className="font-hud text-sm font-semibold text-amber-300">{d.area}</h2>
            <p className="mt-1 text-sm text-slate-200">{d.detail}</p>
            <p className="mt-2 font-hud text-xs text-slate-400">
              Mientras tanto se usa: {d.bound}
            </p>
          </div>
        ))}
      </div>

      {emptyCells.length > 0 && (
        <Panel>
          <PanelTitle>Combinaciones sin ningún ensayo</PanelTitle>
          <div className="flex flex-wrap gap-1.5">
            {emptyCells.map((c, i) => (
              <span
                key={i}
                className="rounded-lg border border-slate-700 bg-slate-950 px-2 py-0.5 font-hud text-[11px] text-slate-300"
              >
                {c.environment} · {c.material_class}
              </span>
            ))}
          </div>
        </Panel>
      )}
    </PageShell>
  );
}