"use client";

import Link from "next/link";
import { api } from "@/lib/api";
import { PageShell, Panel, PanelTitle, StateMessage, useApi } from "@/components/ui";

const STEPS = [
  {
    href: "/",
    title: "Elige un entorno",
    text: "En el centro de mando o en el selector de arriba: estación, base lunar, rover, Marte o traje.",
  },
  {
    href: "/ranking",
    title: "Revisa el ranking",
    text: "Los experimentos se ordenan por su puntaje RPI para ese entorno. Abre uno para ver cómo se calcula.",
  },
  {
    href: "/ranking",
    title: "Pregúntale a Flamey",
    text: "Con «Explicar con Flamey» el asistente lo explica y responde preguntas con los datos de la base.",
  },
  {
    href: "/laboratorio",
    title: "Prueba otra atmósfera",
    text: "En el laboratorio cambia oxígeno, presión y gravedad para ver si el material sigue ardiendo.",
  },
];

export default function GuiaPage() {
  const { data, loading, error, reload } = useApi(() => api.rules());
  const rules = data?.rules || [];

  return (
    <PageShell
      title="Guía y mitos"
      subtitle="Cómo usar el panel y qué dice la física sobre el fuego en el espacio."
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {STEPS.map((step, i) => (
          <Link
            key={step.title}
            href={step.href}
            className="rounded-xl border border-slate-800 bg-slate-900/70 p-4 hover:border-teal-500/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-400"
          >
            <span className="font-hud text-xs text-teal-300">Paso {i + 1}</span>
            <h2 className="mt-0.5 text-sm font-bold text-white">{step.title}</h2>
            <p className="mt-1 text-xs leading-relaxed text-slate-300">{step.text}</p>
          </Link>
        ))}
      </div>

      <Panel>
        <PanelTitle>
          Mitos y hechos{data ? ` (${data.count})` : ""}
        </PanelTitle>
        <StateMessage
          loading={loading}
          error={error}
          empty={!loading && !error && rules.length === 0}
          onRetry={reload}
        />
        <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
          {rules.map((r, i) => (
            <div key={r.id || i} className="rounded-lg border border-slate-800 bg-slate-950 p-3">
              <p className="text-sm text-rose-300">
                <span className="font-hud text-[11px] uppercase">Mito · </span>
                {r.mito}
              </p>
              <p className="mt-1.5 text-sm text-emerald-200">
                <span className="font-hud text-[11px] uppercase">Hecho · </span>
                {r.hecho}
              </p>
              {r.fuente && (
                <p className="mt-1.5 font-hud text-[11px] text-slate-400">{r.fuente}</p>
              )}
            </div>
          ))}
        </div>
      </Panel>
    </PageShell>
  );
}