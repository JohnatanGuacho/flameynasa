"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { PageShell, Panel, PanelTitle, StateMessage, useApi } from "@/components/ui";

export default function ComparadorPage() {
  const investigations = useApi(() => api.investigations());
  const similarity = useApi(() => api.similarity(20));

  const [selectedExp, setSelectedExp] = useState("");

  // Al cargar la lista, elige el primer experimento.
  useEffect(() => {
    const first = investigations.data?.[0];
    if (first && !selectedExp) setSelectedExp(first.key);
  }, [investigations.data, selectedExp]);

  const variation = useApi(
    () => (selectedExp ? api.variation(selectedExp) : Promise.resolve(null)),
    [selectedExp]
  );

  const list = investigations.data || [];
  const pairs = similarity.data || [];

  return (
    <PageShell
      title="Comparador"
      subtitle="Qué cambia entre las corridas de un experimento y qué experimentos se parecen entre sí."
    >
      <Panel>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <PanelTitle>Corridas de un experimento</PanelTitle>
          <label htmlFor="compare-exp" className="sr-only">
            Experimento
          </label>
          <select
            id="compare-exp"
            value={selectedExp}
            onChange={(e) => setSelectedExp(e.target.value)}
            disabled={list.length === 0}
            className="h-9 max-w-full cursor-pointer rounded-lg border border-slate-700 bg-slate-900 px-3 text-sm text-white"
          >
            {list.map((inv) => (
              <option key={inv.key} value={inv.key}>
                {inv.label} ({inv.observations} corridas)
              </option>
            ))}
          </select>
        </div>

        <StateMessage
          loading={investigations.loading || variation.loading}
          error={investigations.error || variation.error}
          onRetry={investigations.error ? investigations.reload : variation.reload}
        />

        {variation.data && !variation.loading && (
          <div className="mt-2 grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <p className="mb-1.5 font-hud text-xs text-amber-300">Lo que cambia</p>
              <div className="space-y-1">
                {variation.data.varying.map((v) => (
                  <div
                    key={v.column}
                    className="flex justify-between gap-2 rounded-lg bg-slate-950 px-2.5 py-1.5 text-xs"
                  >
                    <span className="font-mono text-slate-200">{v.column}</span>
                    <span className="font-hud text-slate-400">
                      {v.minimum != null && v.maximum != null
                        ? `${v.minimum} → ${v.maximum}`
                        : `${v.distinct} valores`}
                    </span>
                  </div>
                ))}
                {variation.data.varying.length === 0 && (
                  <p className="text-xs text-slate-400">Nada cambia entre corridas.</p>
                )}
              </div>
            </div>
            <div>
              <p className="mb-1.5 font-hud text-xs text-cyan-300">Lo que se mantiene igual</p>
              <div className="flex flex-wrap gap-1.5">
                {variation.data.constant.map((c) => (
                  <span
                    key={c}
                    className="rounded-lg border border-slate-800 bg-slate-950 px-2 py-1 font-mono text-[11px] text-slate-300"
                  >
                    {c}
                  </span>
                ))}
              </div>
            </div>
            {variation.data.note && (
              <p className="text-xs text-slate-400 md:col-span-2">{variation.data.note}</p>
            )}
          </div>
        )}
      </Panel>

      <Panel>
        <PanelTitle>Experimentos parecidos</PanelTitle>
        <StateMessage
          loading={similarity.loading}
          error={similarity.error}
          empty={!similarity.loading && !similarity.error && pairs.length === 0}
          onRetry={similarity.reload}
        />
        <div className="space-y-2">
          {pairs.map((s, idx) => (
            <div
              key={idx}
              className="flex flex-col justify-between gap-2 rounded-lg bg-slate-950 p-2.5 sm:flex-row sm:items-center"
            >
              <div className="min-w-0 text-sm">
                <span className="font-bold text-white">{s.a}</span>
                <span className="text-slate-400"> y </span>
                <span className="font-bold text-white">{s.b}</span>
                <p className="mt-0.5 text-xs text-slate-400">
                  En común: {s.shared.join(", ") || "nada"}
                </p>
                <p className="text-xs text-amber-200">
                  Distinto: {s.differing.join(", ") || "nada"}
                </p>
              </div>
              <span className="self-start rounded-lg border border-teal-500/30 bg-teal-500/15 px-2.5 py-1 font-hud text-xs text-teal-300 sm:self-center">
                {s.similarity}% parecido
              </span>
            </div>
          ))}
        </div>
      </Panel>
    </PageShell>
  );
}