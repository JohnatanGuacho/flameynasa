"use client";

import { useState } from "react";
import { api, IncidentSourceOut } from "@/lib/api";
import { PageShell, Panel, StateMessage, useApi } from "@/components/ui";
import { Loader2 } from "lucide-react";

export default function IncidentesPage() {
  const { data, loading, error, reload } = useApi(() => api.incidents());
  const incidents = data || [];

  const [openSlug, setOpenSlug] = useState<string | null>(null);
  const [excerpt, setExcerpt] = useState<IncidentSourceOut | null>(null);
  const [loadingExcerpt, setLoadingExcerpt] = useState(false);

  const toggleExcerpt = async (slug: string) => {
    if (openSlug === slug) {
      setOpenSlug(null);
      setExcerpt(null);
      return;
    }
    setOpenSlug(slug);
    setExcerpt(null);
    setLoadingExcerpt(true);
    try {
      setExcerpt(await api.incidentSource(slug));
    } catch {
      setOpenSlug(null);
    } finally {
      setLoadingExcerpt(false);
    }
  };

  return (
    <PageShell
      title="Incidentes históricos"
      subtitle="Incendios y alarmas reales en misiones, revisados con los datos de la base PSI."
    >
      <StateMessage
        loading={loading}
        error={error}
        empty={!loading && !error && incidents.length === 0}
        onRetry={reload}
      />

      <div className="grid grid-cols-1 items-start gap-3 md:grid-cols-2">
        {incidents.map((inc) => {
          const isOpen = openSlug === inc.slug;
          return (
            <Panel key={inc.slug}>
              <div className="flex justify-between gap-2 font-hud text-[11px] text-rose-300">
                <span>
                  {inc.year} · {inc.environment}
                </span>
                {inc.mean_rpi != null && <span>RPI medio {inc.mean_rpi}</span>}
              </div>
              <h2 className="mt-1 text-sm font-bold text-white">{inc.name}</h2>
              <p className="mt-0.5 font-hud text-[11px] text-slate-400">{inc.atmosphere}</p>
              <p className="mt-2 text-sm leading-relaxed text-slate-300">{inc.summary}</p>

              <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                <span className="font-hud text-xs text-teal-300">{inc.verdict}</span>
                <button
                  type="button"
                  onClick={() => toggleExcerpt(inc.slug)}
                  aria-expanded={isOpen}
                  className="cursor-pointer rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-1 font-hud text-xs text-slate-200 hover:bg-slate-800"
                >
                  {isOpen ? "Ocultar informe" : "Ver informe original"}
                </button>
              </div>

              {isOpen && (
                <div className="mt-3 rounded-lg border border-slate-800 bg-slate-950 p-2.5">
                  {loadingExcerpt ? (
                    <div className="flex items-center gap-2 font-hud text-xs text-teal-300">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      Cargando informe...
                    </div>
                  ) : excerpt ? (
                    <div className="max-h-48 space-y-1 overflow-y-auto text-xs text-slate-300">
                      {excerpt.excerpt.map((line, idx) => (
                        <p key={idx}>{line}</p>
                      ))}
                    </div>
                  ) : null}
                </div>
              )}
            </Panel>
          );
        })}
      </div>
    </PageShell>
  );
}