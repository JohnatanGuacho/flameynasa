"use client";

import { EnvironmentOut, atmToPsi } from "@/lib/api";
import {
  ArrowRight,
  Flame,
  ShieldAlert,
  Clock,
  Wind,
  Activity,
  Radio,
} from "lucide-react";

interface Props {
  environments: EnvironmentOut[];
  activeEnvKey: string;
  onSelectEnv: (key: string) => void;
  lang: "ES" | "EN";
}

function getVisualSpot(env: EnvironmentOut, index: number) {
  const k = `${env.key} ${env.label}`.toLowerCase();

  if (k.includes("nave") || k.includes("spacecraft")) {
    return {
      code: "SPX-001",
      tagEs: "NAVE",
      tagEn: "SPACECRAFT",
      x: "31%",
      y: "47%",
      accent: "text-cyan-400 border-cyan-500/60",
      glow: "rgba(34,211,238,0.45)",
    };
  }
  if (k.includes("estac") || k.includes("iss") || k.includes("station")) {
    return {
      code: "SPX-002",
      tagEs: "ESTACIÓN ISS",
      tagEn: "ISS STATION",
      x: "61%",
      y: "21%",
      accent: "text-sky-400 border-sky-500/60",
      glow: "rgba(56,189,248,0.45)",
    };
  }
  if (k.includes("rover")) {
    return {
      code: "SPX-003",
      tagEs: "ROVER",
      tagEn: "ROVER",
      x: "53%",
      y: "66%",
      accent: "text-amber-400 border-amber-500/60",
      glow: "rgba(251,191,36,0.45)",
    };
  }
  if (k.includes("luna") || k.includes("lunar") || k.includes("moon")) {
    return {
      code: "SPX-004",
      tagEs: "BASE · LUNA",
      tagEn: "MOON BASE",
      x: "64%",
      y: "55%",
      accent: "text-teal-300 border-teal-400/60",
      glow: "rgba(45,212,191,0.5)",
    };
  }
  if (k.includes("eva") || k.includes("traje") || k.includes("suit")) {
    return {
      code: "SPX-005",
      tagEs: "TRAJE EVA",
      tagEn: "EVA SUIT",
      x: "36%",
      y: "71%",
      accent: "text-purple-400 border-purple-500/60",
      glow: "rgba(192,132,252,0.45)",
    };
  }
  if (k.includes("marte") || k.includes("mars")) {
    return {
      code: "SPX-006",
      tagEs: "BASE · MARTE",
      tagEn: "MARS BASE",
      x: "45%",
      y: "36%",
      accent: "text-orange-400 border-orange-500/60",
      glow: "rgba(251,146,60,0.45)",
    };
  }

  return {
    code: `SPX-00${index + 1}`,
    tagEs: env.label.toUpperCase(),
    tagEn: env.label.toUpperCase(),
    x: `${35 + index * 7}%`,
    y: `${38 + (index % 3) * 11}%`,
    accent: "text-teal-400 border-teal-500/60",
    glow: "rgba(20,184,166,0.45)",
  };
}

export function CommandViewport({
  environments,
  activeEnvKey,
  onSelectEnv,
  lang,
}: Props) {
  const active =
    environments.find((e) => e.key === activeEnvKey) || environments[0];

  const riskPercent = active
    ? Math.min(100, Math.round(((active.o2_fraction - 0.15) / 0.85) * 100))
    : 35;

  return (
    <div className="relative w-full h-full min-h-[calc(100vh-3.5rem)] overflow-hidden bg-[radial-gradient(ellipse_at_top,#0f1f3d_0%,#050a14_72%)] select-none">
      {/* Animaciones CSS puras para presentación fluida */}
      <style>{`
        @keyframes floatSlow {
          0%, 100% { transform: translateY(0px); }
          50% { transform: translateY(-7px); }
        }
        @keyframes dashFlow {
          to { stroke-dashoffset: -48; }
        }
        @keyframes radarPulse {
          0% { transform: scale(0.85); opacity: 0.75; }
          100% { transform: scale(2.1); opacity: 0; }
        }
        @keyframes twinkle {
          0%, 100% { opacity: 0.35; }
          50% { opacity: 0.9; }
        }
        .animate-float-slow { animation: floatSlow 6s ease-in-out infinite; }
        .animate-orbit-dash { animation: dashFlow 3.5s linear infinite; }
        .animate-radar { animation: radarPulse 2.4s cubic-bezier(0, 0, 0.2, 1) infinite; }
        .animate-twinkle { animation: twinkle 4s ease-in-out infinite; }
      `}</style>

      {/* Nebulosa ambiental sutil */}
      <div className="pointer-events-none absolute -top-24 left-1/3 w-[520px] h-[320px] rounded-full bg-teal-500/10 blur-[110px]" />
      <div className="pointer-events-none absolute top-1/4 right-10 w-[400px] h-[400px] rounded-full bg-sky-500/10 blur-[120px]" />

      {/* Campo de estrellas en 2 capas */}
      <div
        className="pointer-events-none absolute inset-0 animate-twinkle"
        style={{
          backgroundImage:
            "radial-gradient(1.2px 1.2px at 14% 18%, #fff, transparent), radial-gradient(1px 1px at 72% 14%, #94a3b8, transparent), radial-gradient(1.8px 1.8px at 46% 9%, #e2e8f0, transparent), radial-gradient(1px 1px at 88% 42%, #cbd5e1, transparent), radial-gradient(1.3px 1.3px at 22% 52%, #fff, transparent), radial-gradient(1px 1px at 54% 15%, #38bdf8, transparent)",
        }}
      />

      {/* Arcos de trayectoria orbital (Tierra -> ISS -> Luna -> Marte) */}
      <svg
        className="pointer-events-none hidden md:block absolute inset-0 w-full h-full opacity-45"
        viewBox="0 0 1440 820"
        fill="none"
        preserveAspectRatio="none"
      >
        <path
          d="M 1220 150 Q 940 120 860 220 T 880 510"
          stroke="#2dd4bf"
          strokeWidth="1.2"
          strokeDasharray="6 6"
          className="animate-orbit-dash"
        />
        <path
          d="M 880 510 Q 720 420 650 300"
          stroke="#fb923c"
          strokeWidth="1.1"
          strokeDasharray="5 7"
          className="animate-orbit-dash"
        />
      </svg>

      {/* Planeta Tierra con atmósfera y continentes estilizados */}
      <div className="pointer-events-none hidden md:block absolute right-14 top-10 w-56 h-56 rounded-full bg-[radial-gradient(circle_at_32%_32%,#38bdf8_0%,#1d4ed8_48%,#020617_88%)] shadow-[0_0_80px_rgba(56,189,248,0.28)] border border-sky-300/30 overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_70%_75%,rgba(2,6,23,0.85),transparent_60%)]" />
        <svg viewBox="0 0 200 200" className="w-full h-full opacity-35">
          <path
            d="M45,55 Q70,40 85,62 T75,98 Q55,105 42,85 Z"
            fill="#34d399"
          />
          <path
            d="M110,70 Q140,60 150,90 T125,135 Q105,120 110,70 Z"
            fill="#34d399"
          />
        </svg>
      </div>

      {/* Planeta Marte con halo orbital */}
      <div className="pointer-events-none absolute left-[44%] top-[32%] w-12 h-12 rounded-full bg-[radial-gradient(circle_at_35%_35%,#fdba74_0%,#ea580c_55%,#431407_100%)] shadow-[0_0_32px_rgba(251,146,60,0.45)] border border-orange-300/30" />

      {/* Estación Espacial ISS flotando */}
      <div className="pointer-events-none hidden sm:block absolute left-[54%] top-[23%] animate-float-slow">
        <svg
          className="w-56 h-24 text-slate-200 drop-shadow-[0_6px_18px_rgba(56,189,248,0.25)]"
          viewBox="0 0 220 80"
          fill="none"
        >
          <rect x="18" y="38" width="184" height="3.5" fill="currentColor" />
          <rect
            x="30"
            y="12"
            width="18"
            height="54"
            rx="2"
            stroke="#38bdf8"
            strokeWidth="1.4"
            fill="rgba(56,189,248,0.18)"
          />
          <rect
            x="54"
            y="12"
            width="18"
            height="54"
            rx="2"
            stroke="#38bdf8"
            strokeWidth="1.4"
            fill="rgba(56,189,248,0.18)"
          />
          <rect
            x="148"
            y="12"
            width="18"
            height="54"
            rx="2"
            stroke="#38bdf8"
            strokeWidth="1.4"
            fill="rgba(56,189,248,0.18)"
          />
          <rect
            x="172"
            y="12"
            width="18"
            height="54"
            rx="2"
            stroke="#38bdf8"
            strokeWidth="1.4"
            fill="rgba(56,189,248,0.18)"
          />
          <rect
            x="90"
            y="26"
            width="40"
            height="24"
            rx="5"
            fill="#1e293b"
            stroke="#94a3b8"
            strokeWidth="1.5"
          />
          <circle cx="110" cy="38" r="2.5" fill="#2dd4bf" />
        </svg>
      </div>

      {/* Superficie Lunar con relieve y cráteres */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-[37%] bg-[linear-gradient(180deg,#64748b_0%,#475569_20%,#1e293b_68%,#0f172a_100%)] rounded-t-[100%] scale-x-125 border-t border-teal-300/25 shadow-[0_-25px_80px_rgba(15,23,42,0.98)]">
        {/* Cráteres sutiles */}
        <div className="absolute left-[22%] top-12 w-24 h-6 rounded-full bg-slate-900/35 border-b border-slate-300/15" />
        <div className="absolute left-[48%] top-20 w-36 h-8 rounded-full bg-slate-900/30 border-b border-slate-300/15" />
        <div className="absolute right-[28%] top-14 w-20 h-5 rounded-full bg-slate-900/35 border-b border-slate-300/15" />
      </div>

      {/* Complejo Lunar: Cohete en rampa + Hábitats presurizados + Antena + Rover */}
      <svg
        className="pointer-events-none hidden sm:block absolute left-[24%] bottom-[25%] w-[520px] h-56 drop-shadow-[0_12px_24px_rgba(2,6,23,0.75)]"
        viewBox="0 0 520 210"
        fill="none"
      >
        {/* Torre de lanzamiento y Nave */}
        <rect x="40" y="42" width="16" height="138" stroke="#64748b" strokeWidth="1.2" />
        <line x1="40" y1="68" x2="56" y2="68" stroke="#64748b" />
        <line x1="40" y1="98" x2="56" y2="98" stroke="#64748b" />
        <line x1="40" y1="128" x2="56" y2="128" stroke="#64748b" />
        <rect x="74" y="28" width="15" height="152" rx="4" fill="#f1f5f9" />
        <polygon points="81.5,10 74,28 89,28" fill="#cbd5e1" />
        <rect x="74" y="108" width="15" height="28" fill="#6366f1" />
        <circle cx="81.5" cy="9" r="3" fill="#22d3ee" />

        {/* Astronauta EVA junto a la rampa */}
        <circle cx="132" cy="162" r="4" fill="#e2e8f0" />
        <rect x="128" y="167" width="8" height="12" rx="3" fill="#f8fafc" />

        {/* Módulos de Base Lunar presurizada con esclusas iluminadas */}
        <rect
          x="265"
          y="112"
          width="52"
          height="64"
          rx="20"
          fill="#cbd5e1"
          stroke="#475569"
          strokeWidth="1.5"
        />
        <rect x="283" y="132" width="16" height="9" rx="3" fill="#2dd4bf" opacity="0.85" />

        <rect
          x="323"
          y="126"
          width="48"
          height="50"
          rx="16"
          fill="#e2e8f0"
          stroke="#475569"
          strokeWidth="1.5"
        />
        <rect x="339" y="142" width="14" height="8" rx="3" fill="#38bdf8" opacity="0.85" />

        <rect
          x="377"
          y="116"
          width="44"
          height="60"
          rx="16"
          fill="#cbd5e1"
          stroke="#475569"
          strokeWidth="1.5"
        />

        {/* Antena de telemetría */}
        <line x1="448" y1="145" x2="448" y2="176" stroke="#94a3b8" strokeWidth="2" />
        <path d="M436 138 Q448 152 460 138" stroke="#2dd4bf" strokeWidth="2" fill="none" />

        {/* Rover Presurizado */}
        <rect x="235" y="164" width="38" height="15" rx="5" fill="#94a3b8" stroke="#334155" />
        <rect x="256" y="167" width="12" height="6" rx="2" fill="#fbbf24" opacity="0.9" />
        <circle cx="244" cy="182" r="5.5" fill="#0f172a" stroke="#e2e8f0" strokeWidth="1.8" />
        <circle cx="264" cy="182" r="5.5" fill="#0f172a" stroke="#e2e8f0" strokeWidth="1.8" />
      </svg>

      {/* Bloque superior izquierdo: Título + Telemetría en vivo del módulo activo */}
      <div className="relative z-10 pt-5 pl-6 sm:pl-10 pr-6 max-w-xl">
        <div className="inline-flex items-center gap-2 font-hud text-[11px] tracking-[0.22em] text-teal-400 uppercase">
          <Radio className="w-3.5 h-3.5 animate-pulse" />
          <span>
            {lang === "ES" ? "CENTRO DE MANDO · " : "COMMAND CENTER · "}
            {active?.label || "SITIO LUNAR"}
          </span>
        </div>

        <h1 className="mt-1.5 text-2xl sm:text-3xl font-bold tracking-tight text-white leading-tight">
          {lang === "ES"
            ? "Seguridad contra incendios en ambientes habitables"
            : "Fire safety in habitable environments"}
        </h1>

        <div className="mt-2.5 inline-flex items-center gap-2 px-3 py-1 rounded-full bg-slate-900/85 border border-slate-700/80 text-xs text-slate-300">
          <Flame className="w-3.5 h-3.5 text-teal-400" />
          <span>
            {lang === "ES"
              ? "Haz clic en un módulo o fila SPX para rankear hallazgos PSI"
              : "Click a module or SPX row to rank PSI findings"}
          </span>
        </div>

        {/* Tarjeta HUD de telemetría del entorno seleccionado */}
        {active && (
          <div className="mt-4 rounded-xl bg-slate-950/82 backdrop-blur-md border border-slate-800/90 p-3 shadow-xl">
            <div className="flex items-center justify-between gap-2 text-[10px] font-hud text-slate-400">
              <span className="text-teal-300 font-semibold uppercase">
                TELEMETRÍA · {active.label}
              </span>
              <span>
                {active.gravity_g === 0 ? "0 g (µg)" : `${active.gravity_g} g`} ·{" "}
                {active.pressure_atm} atm ({atmToPsi(active.pressure_atm)} psi)
              </span>
            </div>

            <div className="mt-2 grid grid-cols-3 gap-2 font-hud text-[11px]">
              <div className="px-2 py-1.5 rounded-lg bg-slate-900/90 border border-slate-800 flex items-center gap-1.5">
                <Wind className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                <div>
                  <div className="text-[9px] text-slate-500">ATMÓSFERA</div>
                  <div className="text-slate-200 font-semibold">
                    {Math.round(active.o2_fraction * 100)}% O₂ / {active.diluent}
                  </div>
                </div>
              </div>

              <div className="px-2 py-1.5 rounded-lg bg-slate-900/90 border border-slate-800 flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                <div>
                  <div className="text-[9px] text-slate-500">EVACUACIÓN</div>
                  <div className="text-slate-200 font-semibold">{active.egress_s} s</div>
                </div>
              </div>

              <div className="px-2 py-1.5 rounded-lg bg-slate-900/90 border border-slate-800 flex items-center gap-1.5">
                <Activity className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                <div className="w-full">
                  <div className="flex justify-between text-[9px] text-slate-500">
                    <span>IGNICIÓN</span>
                    <span className="text-amber-300">{riskPercent}%</span>
                  </div>
                  <div className="mt-1 h-1.5 w-full bg-slate-800 rounded-full overflow-hidden">
                    <div
                      className={`h-full transition-all duration-500 ${
                        riskPercent > 60
                          ? "bg-rose-500"
                          : riskPercent > 25
                          ? "bg-amber-400"
                          : "bg-teal-400"
                      }`}
                      style={{ width: `${riskPercent}%` }}
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Selector rápido visible en pantallas medianas/pequeñas */}
        <div className="mt-3 flex lg:hidden flex-wrap gap-1.5">
          {environments.map((env) => (
            <button
              key={env.key}
              onClick={() => onSelectEnv(env.key)}
              className={`px-2.5 py-1 rounded-lg font-hud text-[11px] border cursor-pointer transition ${
                env.key === activeEnvKey
                  ? "bg-teal-500/20 border-teal-400 text-teal-200"
                  : "bg-slate-900/85 border-slate-800 text-slate-400"
              }`}
            >
              {env.label} ({Math.round(env.o2_fraction * 100)}% O₂)
            </button>
          ))}
        </div>
      </div>

      {/* Hotspots interactivos sobre la escena */}
      {environments.map((env, idx) => {
        const spot = getVisualSpot(env, idx);
        const isSelected = env.key === activeEnvKey;

        return (
          <button
            key={env.key}
            onClick={() => onSelectEnv(env.key)}
            style={{
              left: spot.x,
              top: spot.y,
              boxShadow: isSelected ? `0 0 26px ${spot.glow}` : undefined,
            }}
            className={`group absolute z-10 -translate-x-1/2 -translate-y-1/2 flex items-center gap-2 px-3 py-1.5 rounded-full backdrop-blur-md border transition-all duration-300 cursor-pointer ${
              isSelected
                ? "bg-teal-950/95 border-teal-300 scale-110"
                : `bg-slate-950/85 ${spot.accent} hover:scale-105`
            }`}
          >
            <span className="relative flex h-2.5 w-2.5">
              {isSelected && (
                <span className="animate-radar absolute inline-flex h-full w-full rounded-full bg-teal-400" />
              )}
              <span
                className={`relative inline-flex rounded-full h-2.5 w-2.5 ${
                  isSelected ? "bg-teal-300" : "bg-current"
                }`}
              />
            </span>
            <span className="font-hud text-[11px] font-semibold tracking-wider text-slate-100 whitespace-nowrap">
              {lang === "ES" ? spot.tagEs : spot.tagEn}
            </span>
          </button>
        );
      })}

      {/* Tabla táctica inferior derecha: AMBIENTES HABITABLES */}
      <div className="hidden lg:block absolute right-5 bottom-5 z-20 w-[405px] rounded-xl bg-slate-950/90 backdrop-blur-xl border border-slate-800/90 p-3.5 shadow-2xl">
        <div className="flex items-center justify-between text-[10px] font-hud tracking-widest text-slate-400 pb-2 border-b border-slate-800">
          <span>{lang === "ES" ? "AMBIENTES HABITABLES" : "HABITABLE ENVIRONMENTS"}</span>
          <span>{lang === "ES" ? "GRAVEDAD · O₂ · PSI" : "GRAVITY · O₂ · PSI"}</span>
        </div>

        <div className="mt-1.5 divide-y divide-slate-800/60">
          {environments.map((env, idx) => {
            const spot = getVisualSpot(env, idx);
            const isSelected = env.key === activeEnvKey;
            const enriched = env.o2_fraction >= 0.3;

            return (
              <button
                key={env.key}
                onClick={() => onSelectEnv(env.key)}
                className={`w-full flex items-center justify-between py-2 px-2.5 rounded-lg text-left transition-all cursor-pointer ${
                  isSelected
                    ? "bg-teal-500/15 text-white border-l-2 border-teal-400"
                    : "hover:bg-slate-900/90 text-slate-300"
                }`}
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <span className="font-hud text-[11px] text-teal-400 shrink-0">
                    {spot.code}
                  </span>
                  <span className="text-xs font-medium truncate">{env.label}</span>
                </div>

                <div className="flex items-center gap-2.5 font-hud text-[11px] shrink-0">
                  <span className="text-slate-400">
                    {env.gravity_g === 0 ? "µg" : `${env.gravity_g} g`}
                  </span>
                  <span
                    className={
                      enriched ? "text-amber-400 font-semibold" : "text-slate-200"
                    }
                  >
                    {Math.round(env.o2_fraction * 100)} % O₂
                  </span>
                  <span className="text-slate-500">{atmToPsi(env.pressure_atm)}psi</span>
                  <ArrowRight
                    className={`w-3 h-3 transition-transform ${
                      isSelected
                        ? "text-teal-400 translate-x-0.5"
                        : "text-slate-600"
                    }`}
                  />
                </div>
              </button>
            );
          })}
        </div>

        {active && active.o2_fraction >= 0.3 && (
          <div className="mt-2 pt-2 border-t border-slate-800 flex items-center gap-2 text-[11px] text-amber-300/95">
            <ShieldAlert className="w-3.5 h-3.5 shrink-0 text-amber-400 animate-pulse" />
            <span>
              {lang === "ES"
                ? `${active.label}: ${Math.round(active.o2_fraction * 100)}% O₂ a ${atmToPsi(active.pressure_atm)} psi eleva drásticamente el riesgo de ignición.`
                : `${active.label}: ${Math.round(active.o2_fraction * 100)}% O₂ at ${atmToPsi(active.pressure_atm)} psi sharply increases ignition risk.`}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}