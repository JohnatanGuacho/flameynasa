"use client";

import { api } from "@/lib/api";
import { PageShell, Panel, StateMessage, useApi } from "@/components/ui";

export default function BeneficiosPage() {
  const { data, loading, error, reload } = useApi(() => api.spinoffs());
  const spinoffs = data || [];

  return (
    <PageShell
      title="Beneficio en Tierra"
      subtitle="Tecnología de seguridad contra incendios del espacio que hoy se usa en la Tierra."
    >
      <StateMessage
        loading={loading}
        error={error}
        empty={!loading && !error && spinoffs.length === 0}
        onRetry={reload}
      />

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {spinoffs.map((sp, i) => (
          <Panel key={i}>
            <span className="font-hud text-[11px] text-emerald-300">{sp.source}</span>
            <h2 className="mt-0.5 text-sm font-bold text-white">{sp.name}</h2>
            <p className="mt-1.5 text-sm leading-relaxed text-slate-300">{sp.benefit}</p>
          </Panel>
        ))}
      </div>
    </PageShell>
  );
}