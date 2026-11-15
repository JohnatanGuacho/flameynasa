"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";

/** Marco común de todas las páginas de contenido. */
export function PageShell(props: {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  const { title, subtitle, actions, children } = props;
  return (
    <div className="mx-auto w-full max-w-6xl flex-1 space-y-4 p-4 pb-24 sm:p-6 sm:pb-24">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-lg font-bold text-white">{title}</h1>
          {subtitle && <p className="mt-0.5 text-sm text-slate-400">{subtitle}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
      {children}
    </div>
  );
}

export function Panel(props: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={`rounded-xl border border-slate-800 bg-slate-900/70 p-4 ${props.className || ""}`}
    >
      {props.children}
    </div>
  );
}

export function PanelTitle({ children }: { children: React.ReactNode }) {
  return <p className="mb-2 font-hud text-xs text-teal-300">{children}</p>;
}

/** Estados de carga, error y vacío con el mismo aspecto en todas las páginas. */
export function StateMessage(props: {
  loading?: boolean;
  error?: boolean;
  empty?: boolean;
  emptyText?: string;
  onRetry?: () => void;
}) {
  const { loading, error, empty, emptyText, onRetry } = props;

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-12 text-sm text-teal-300">
        <Loader2 className="h-4 w-4 animate-spin" />
        Cargando datos...
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-2 py-12 text-center text-sm text-slate-300">
        <p>No se pudieron cargar los datos de la API.</p>
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="cursor-pointer rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 font-hud text-xs text-teal-300 hover:bg-slate-800"
          >
            Reintentar
          </button>
        )}
      </div>
    );
  }

  if (empty) {
    return (
      <p className="py-12 text-center text-sm text-slate-400">
        {emptyText || "No hay datos para mostrar."}
      </p>
    );
  }

  return null;
}

/** Carga un recurso de la API y expone datos, carga, error y reintento. */
export function useApi<T>(fetcher: () => Promise<T>, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(false);

    fetcher()
      .then((result) => {
        if (!cancelled) setData(result);
      })
      .catch(() => {
        if (!cancelled) {
          setData(null);
          setError(true);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, attempt]);

  const reload = useCallback(() => setAttempt((n) => n + 1), []);

  return { data, loading, error, reload };
}