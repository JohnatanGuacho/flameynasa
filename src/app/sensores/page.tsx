"use client";

import { api } from "@/lib/api";
import { PageShell, Panel, PanelTitle, StateMessage, useApi } from "@/components/ui";

export default function SensoresPage() {
  const { data, loading, error, reload } = useApi(() => api.measurements());
  const experiments = data?.experiments || [];

  return (
    <PageShell
      title="Sensores y mediciones"
      subtitle="Qué se midió en cada experimento y con qué instrumento."
    >
      <StateMessage
        loading={loading}
        error={error}
        empty={!loading && !error && experiments.length === 0}
        onRetry={reload}
      />

      {data?.note && <p className="text-sm text-slate-300">{data.note}</p>}

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {experiments.map((exp) => (
          <Panel key={exp.experiment}>
            <h2 className="text-sm font-bold text-white">{exp.experiment}</h2>
            <div className="mt-2 space-y-1">
              {exp.measurements.map((m, i) => (
                <div
                  key={i}
                  className="flex justify-between gap-2 rounded-lg bg-slate-950 px-2 py-1.5 font-hud text-[11px]"
                >
                  <span className="text-cyan-300">{m.instrument}</span>
                  <span className="text-right text-slate-300">
                    {m.variable} ({m.kind})
                  </span>
                </div>
              ))}
            </div>
          </Panel>
        ))}
      </div>

      {data && data.missing_variables.length > 0 && (
        <Panel>
          <PanelTitle>Variables que no se midieron</PanelTitle>
          <div className="flex flex-wrap gap-1.5">
            {data.missing_variables.map((v) => (
              <span
                key={v}
                className="rounded-lg border border-amber-500/30 bg-amber-950/20 px-2 py-0.5 font-hud text-[11px] text-amber-200"
              >
                {v}
              </span>
            ))}
          </div>
        </Panel>
      )}
    </PageShell>
  );
}