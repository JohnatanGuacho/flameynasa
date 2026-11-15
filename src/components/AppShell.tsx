"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { api } from "@/lib/api";
import { MissionProvider, useMission } from "@/components/MissionContext";
import { FlameyWidget } from "@/components/FlameyWidget";
import {
  Activity,
  AlertOctagon,
  AlertTriangle,
  BookOpen,
  ChevronsLeft,
  ChevronsRight,
  Cpu,
  FileDown,
  Flame,
  Gauge,
  GitCompare,
  Globe,
  LayoutGrid,
  ListOrdered,
} from "lucide-react";

const SIDEBAR_STORAGE_KEY = "sidebar-collapsed";

const NAV_GROUPS: {
  title: string;
  items: { href: string; label: string; icon: React.ElementType }[];
}[] = [
  {
    title: "Misión",
    items: [
      { href: "/", label: "Centro de mando", icon: LayoutGrid },
      { href: "/ranking", label: "Ranking de hallazgos", icon: ListOrdered },
    ],
  },
  {
    title: "Laboratorios",
    items: [
      { href: "/laboratorio", label: "Laboratorio", icon: Gauge },
      { href: "/camara", label: "Cámara A/B", icon: Flame },
    ],
  },
  {
    title: "Investigación",
    items: [
      { href: "/hardware", label: "Hardware", icon: Cpu },
      { href: "/sensores", label: "Sensores", icon: Activity },
      { href: "/comparador", label: "Comparador", icon: GitCompare },
      { href: "/brechas", label: "Brechas de evidencia", icon: AlertTriangle },
    ],
  },
  {
    title: "Contexto",
    items: [
      { href: "/incidentes", label: "Incidentes históricos", icon: AlertOctagon },
      { href: "/beneficios", label: "Beneficio en Tierra", icon: Globe },
      { href: "/guia", label: "Guía y mitos", icon: BookOpen },
    ],
  },
];

function Clock() {
  const [clock, setClock] = useState("");

  useEffect(() => {
    const update = () => setClock(new Date().toTimeString().slice(0, 8));
    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, []);

  return <span className="hidden font-hud text-xs text-slate-400 sm:inline">{clock}</span>;
}

function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const {
    online,
    environments,
    activeEnv,
    setActiveEnv,
    selectedFinding,
    lang,
    setLang,
  } = useMission();

  const [collapsed, setCollapsed] = useState(false);

  // Se lee en un efecto para no romper el prerender.
  useEffect(() => {
    try {
      if (window.localStorage.getItem(SIDEBAR_STORAGE_KEY) === "1") setCollapsed(true);
    } catch {
      // Sin acceso a localStorage: queda expandido
    }
  }, []);

  const toggleCollapsed = () => {
    const next = !collapsed;
    setCollapsed(next);
    try {
      window.localStorage.setItem(SIDEBAR_STORAGE_KEY, next ? "1" : "0");
    } catch {
      // Ignorar
    }
  };

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  // El ancho del sidebar se publica en --sidebar-w: lo usan el contenido y Flamey.
  // En pantallas angostas siempre va en modo iconos.
  const widthVar = collapsed
    ? "[--sidebar-w:3.5rem]"
    : "[--sidebar-w:3.5rem] lg:[--sidebar-w:14rem]";
  const labelClass = collapsed ? "hidden" : "hidden truncate lg:inline";
  const rowAlign = collapsed ? "justify-center" : "justify-center lg:justify-start";

  return (
    <div className={`flex min-h-screen flex-col bg-[#050a14] text-slate-100 ${widthVar}`}>
      {/* BARRA SUPERIOR */}
      <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center justify-between gap-3 border-b border-slate-800/90 bg-slate-950/90 px-4 backdrop-blur-md">
        <div className="flex min-w-0 items-center gap-4">
          <Link href="/" className="flex items-center gap-2.5">
            <span className="flex h-7 w-7 items-center justify-center rounded-full border border-teal-400/50 bg-teal-500/20">
              <Flame className="h-4 w-4 text-teal-400" />
            </span>
            <span className="font-hud text-xs font-bold tracking-widest text-white sm:text-sm">
              FLAME IN FREEFALL
            </span>
          </Link>

          <span
            className={`hidden items-center gap-1.5 font-hud text-[11px] sm:inline-flex ${
              online ? "text-emerald-400" : "text-rose-300"
            }`}
          >
            <span
              className={`h-2 w-2 rounded-full ${online ? "bg-emerald-400" : "bg-rose-500"}`}
            />
            {online ? "API en línea" : "Conectando con la API..."}
          </span>
        </div>

        <div className="flex shrink-0 items-center gap-2 sm:gap-3">
          {environments.length > 0 && (
            <>
              <label htmlFor="env-select" className="sr-only">
                Entorno
              </label>
              <select
                id="env-select"
                value={activeEnv}
                onChange={(e) => setActiveEnv(e.target.value)}
                className="h-8 max-w-[11rem] cursor-pointer rounded-lg border border-teal-500/40 bg-slate-900 px-2 font-hud text-[11px] text-teal-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-400"
              >
                {environments.map((env) => (
                  <option key={env.key} value={env.key}>
                    {env.label} · {env.gravity_g === 0 ? "µg" : `${env.gravity_g} g`}
                  </option>
                ))}
              </select>
            </>
          )}

          <div className="flex overflow-hidden rounded-lg border border-slate-700 font-hud text-[11px]">
            {(["ES", "EN"] as const).map((l) => (
              <button
                key={l}
                type="button"
                aria-pressed={lang === l}
                onClick={() => setLang(l)}
                className={`cursor-pointer px-2 py-1 ${
                  lang === l
                    ? "bg-teal-500 font-bold text-slate-950"
                    : "bg-slate-900 text-slate-400"
                }`}
              >
                {l}
              </button>
            ))}
          </div>

          <Clock />
        </div>
      </header>

      {/* SIDEBAR */}
      <nav
        aria-label="Secciones"
        className="fixed bottom-0 left-0 top-14 z-20 flex w-[var(--sidebar-w)] flex-col overflow-y-auto overflow-x-hidden border-r border-slate-800/90 bg-slate-950/95 py-3 transition-[width] duration-200"
      >
        <div className="flex-1 space-y-3 px-2">
          {NAV_GROUPS.map((group, groupIdx) => (
            <div key={group.title}>
              {/* Con el menú contraído, el título se cambia por una línea divisoria */}
              <p
                className={`mb-1 px-2 font-hud text-[10px] uppercase tracking-widest text-slate-500 ${
                  collapsed ? "hidden" : "hidden lg:block"
                }`}
              >
                {group.title}
              </p>
              {groupIdx > 0 && (
                <div
                  className={`mx-2 mb-2 border-t border-slate-800 ${
                    collapsed ? "block" : "block lg:hidden"
                  }`}
                />
              )}
              <div className="space-y-0.5">
                {group.items.map(({ href, label, icon: Icon }) => {
                  const active = isActive(href);
                  return (
                    <Link
                      key={href}
                      href={href}
                      title={label}
                      aria-label={label}
                      aria-current={active ? "page" : undefined}
                      className={`flex h-9 items-center gap-2.5 rounded-lg border px-2 text-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-400 ${rowAlign} ${
                        active
                          ? "border-teal-500/40 bg-teal-500/15 text-teal-200"
                          : "border-transparent text-slate-400 hover:bg-slate-900 hover:text-white"
                      }`}
                    >
                      <Icon className="h-4 w-4 shrink-0" />
                      <span className={labelClass}>{label}</span>
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        <div className="mt-3 space-y-0.5 border-t border-slate-800/90 px-2 pt-3">
          <a
            href={api.exportUrl(activeEnv, "md")}
            target="_blank"
            rel="noreferrer"
            title="Descargar informe de misión"
            aria-label="Descargar informe de misión"
            className={`flex h-9 items-center gap-2.5 rounded-lg px-2 text-sm text-teal-300 hover:bg-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-400 ${rowAlign}`}
          >
            <FileDown className="h-4 w-4 shrink-0" />
            <span className={labelClass}>Descargar informe</span>
          </a>

          {/* Contraer / expandir: solo tiene sentido en pantallas anchas */}
          <button
            type="button"
            onClick={toggleCollapsed}
            aria-expanded={!collapsed}
            title={collapsed ? "Expandir menú" : "Contraer menú"}
            aria-label={collapsed ? "Expandir menú" : "Contraer menú"}
            className={`hidden h-9 w-full cursor-pointer items-center gap-2.5 rounded-lg px-2 text-sm text-slate-400 hover:bg-slate-900 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-400 lg:flex ${rowAlign}`}
          >
            {collapsed ? (
              <ChevronsRight className="h-4 w-4 shrink-0" />
            ) : (
              <ChevronsLeft className="h-4 w-4 shrink-0" />
            )}
            <span className={labelClass}>Contraer menú</span>
          </button>
        </div>
      </nav>

      {/* CONTENIDO */}
      <main className="flex min-w-0 flex-1 flex-col pl-[var(--sidebar-w)] transition-[padding] duration-200">
        {children}
      </main>

      {/* Flamey vive aquí para estar disponible en todas las páginas */}
      <FlameyWidget activeFinding={selectedFinding} environmentKey={activeEnv} />
    </div>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <MissionProvider>
      <Shell>{children}</Shell>
    </MissionProvider>
  );
}