"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { EnvironmentOut, FindingOut, atmToPsi } from "@/lib/api";
import {
  ArrowRight,
  Flame,
  ShieldAlert,
  Clock,
  Wind,
  Activity,
  Radio,
  Gauge,
  Move,
  Plus,
  Minus,
  Crosshair,
  Loader2,
  Sparkles,
  ChevronUp,
  ChevronDown,
} from "lucide-react";

interface Props {
  environments: EnvironmentOut[];
  activeEnvKey: string;
  onSelectEnv: (key: string) => void;
  lang: "ES" | "EN";
  /** Hallazgos del entorno activo, para elegirlos desde el propio mapa. */
  findings?: FindingOut[];
  loadingFindings?: boolean;
  onAskFlamey?: (finding: FindingOut) => void;
}

/* ------------------------------------------------------------------ */
/*  Utilidades                                                         */
/* ------------------------------------------------------------------ */

const MAX_X = 380; // límite de arrastre horizontal sin zoom (px)
const MAX_Y = 220; // límite de arrastre vertical sin zoom (px)

const MIN_ZOOM = 0.8;
const MAX_ZOOM = 3;

// Anchos (px) a partir de los cuales cambia la distribución.
const PHONE_MAX = 640;
const TABLET_MAX = 1024;

/**
 * Encuadre de cámara según el tamaño de pantalla.
 * x, y: punto donde queda el módulo enfocado (fracción del ancho y alto),
 * elegido para que no caiga bajo el título ni bajo el panel.
 * near, far: zoom para módulos cercanos (Luna) y lejanos (Marte, ISS).
 */
function focusPreset(width: number) {
  if (width < PHONE_MAX) return { x: 0.5, y: 0.3, near: 2.4, far: 2.9 };
  if (width < TABLET_MAX) return { x: 0.38, y: 0.52, near: 2.0, far: 2.5 };
  return { x: 0.44, y: 0.6, near: 1.9, far: 2.4 };
}

const clamp = (v: number, min: number, max: number) =>
  Math.min(max, Math.max(min, v));

const fmt = (n: number, d = 2) =>
  n.toLocaleString("es", { maximumFractionDigits: d });

const stop = (e: React.PointerEvent) => e.stopPropagation();

// Generador pseudoaleatorio con semilla: mismas estrellas en servidor y cliente.
function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Cada capa se mueve distinto según su profundidad: eso da la sensación de espacio 3D. */
const layerStyle = (depth: number): React.CSSProperties => ({
  transform: `translate3d(calc(var(--px) * ${depth}px), calc(var(--py) * ${depth}px), 0) scale(calc(1 + (var(--z) - 1) * ${depth}))`,
  willChange: "transform",
});

/* ------------------------------------------------------------------ */
/*  Posición de cada módulo en la escena                               */
/* ------------------------------------------------------------------ */

type Spot = {
  code: string;
  tagEs: string;
  tagEn: string;
  kind: string;
  where: "mid" | "lunar" | "rover";
  x: string; // posición del botón (% de su contenedor)
  y: string;
  fx: number; // punto aproximado de respaldo, si no se puede medir el real
  fy: number;
  depth: number;
  accent: string;
  glow: string;
  color: string; // color sólido del módulo, para el panel
};

function getVisualSpot(env: EnvironmentOut, index: number): Spot {
  const k = `${env.key} ${env.label}`.toLowerCase();
  const has = (re: RegExp) => re.test(k);

  if (has(/nave|spacecraft/)) {
    return {
      code: "SPX-001", tagEs: "NAVE", tagEn: "SPACECRAFT", kind: "nave",
      where: "lunar", x: "12%", y: "-1%", fx: 0.28, fy: 0.55, depth: 1,
      accent: "text-cyan-400 border-cyan-500/60", glow: "rgba(34,211,238,0.45)",
      color: "#22d3ee",
    };
  }
  if (has(/estac|\biss\b|station/)) {
    return {
      code: "SPX-002", tagEs: "ESTACIÓN ISS", tagEn: "ISS STATION", kind: "iss",
      where: "mid", x: "62%", y: "32%", fx: 0.62, fy: 0.22, depth: 0.55,
      accent: "text-sky-400 border-sky-500/60", glow: "rgba(56,189,248,0.45)",
      color: "#38bdf8",
    };
  }
  if (has(/rover/)) {
    return {
      code: "SPX-003", tagEs: "ROVER", tagEn: "ROVER", kind: "rover",
      where: "rover", x: "50%", y: "-22px", fx: 0.62, fy: 0.8, depth: 1,
      accent: "text-amber-400 border-amber-500/60", glow: "rgba(251,191,36,0.45)",
      color: "#fbbf24",
    };
  }
  if (has(/luna|lunar|moon/)) {
    return {
      code: "SPX-004", tagEs: "BASE · LUNA", tagEn: "MOON BASE", kind: "luna",
      where: "lunar", x: "50%", y: "30%", fx: 0.45, fy: 0.72, depth: 1,
      accent: "text-teal-300 border-teal-400/60", glow: "rgba(45,212,191,0.5)",
      color: "#2dd4bf",
    };
  }
  if (has(/\beva\b|traje|suit/)) {
    return {
      code: "SPX-005", tagEs: "TRAJE EVA", tagEn: "EVA SUIT", kind: "eva",
      where: "lunar", x: "25%", y: "66%", fx: 0.3, fy: 0.76, depth: 1,
      accent: "text-purple-400 border-purple-500/60", glow: "rgba(192,132,252,0.45)",
      color: "#c084fc",
    };
  }
  if (has(/marte|mars/)) {
    return {
      code: "SPX-006", tagEs: "BASE · MARTE", tagEn: "MARS BASE", kind: "marte",
      where: "mid", x: "38%", y: "38.5%", fx: 0.38, fy: 0.3, depth: 0.55,
      accent: "text-orange-400 border-orange-500/60", glow: "rgba(251,146,60,0.45)",
      color: "#fb923c",
    };
  }

  return {
    code: `SPX-00${index + 1}`,
    tagEs: env.label.toUpperCase(),
    tagEn: env.label.toUpperCase(),
    kind: "other",
    where: "mid",
    x: `${22 + (index % 4) * 9}%`,
    y: `${48 + (index % 3) * 9}%`,
    fx: 0.4,
    fy: 0.5,
    depth: 0.55,
    accent: "text-teal-400 border-teal-500/60",
    glow: "rgba(20,184,166,0.45)",
    color: "#14b8a6",
  };
}

/* ------------------------------------------------------------------ */
/*  Piezas visuales                                                    */
/* ------------------------------------------------------------------ */

function Layer({
  depth,
  children,
}: {
  depth: number;
  children: React.ReactNode;
}) {
  return (
    <div
      className="pointer-events-none absolute inset-0"
      style={layerStyle(depth)}
    >
      {children}
    </div>
  );
}

const STAR_COLORS = ["#ffffff", "#e2e8f0", "#bae6fd", "#fde68a", "#a5f3fc"];

function StarLayer({
  count,
  seed,
  rMin,
  rMax,
}: {
  count: number;
  seed: number;
  rMin: number;
  rMax: number;
}) {
  const stars = useMemo(() => {
    const rnd = mulberry32(seed);
    return Array.from({ length: count }, () => ({
      x: Math.round(rnd() * 1000) / 10,
      y: Math.round(rnd() * 1000) / 10,
      r: Math.round((rMin + rnd() * (rMax - rMin)) * 100) / 100,
      c: STAR_COLORS[Math.floor(rnd() * STAR_COLORS.length)],
      delay: Math.round(rnd() * 50) / 10,
      dur: Math.round((3 + rnd() * 4) * 10) / 10,
      o: Math.round((0.4 + rnd() * 0.6) * 100) / 100,
    }));
  }, [count, seed, rMin, rMax]);

  return (
    <svg
      aria-hidden
      width="100%"
      height="100%"
      className="absolute -left-[20%] -top-[20%] h-[140%] w-[140%]"
    >
      {stars.map((s, i) => (
        <circle
          key={i}
          cx={`${s.x}%`}
          cy={`${s.y}%`}
          r={s.r}
          fill={s.c}
          opacity={s.o}
          className="cmd-twinkle"
          style={{ animationDelay: `${s.delay}s`, animationDuration: `${s.dur}s` }}
        />
      ))}
    </svg>
  );
}

type GlobeLayer = {
  blobs: string[];
  fill: string;
  opacity: number;
  duration: number;
};

/** Planeta que "gira": franjas de continentes que se deslizan bajo la sombra. */
function Globe({
  size,
  gradient,
  glow,
  layers,
  children,
}: {
  size: number;
  gradient: string;
  glow: string;
  layers: GlobeLayer[];
  children?: React.ReactNode;
}) {
  return (
    <div className="relative rounded-full" style={{ width: size, height: size, boxShadow: glow }}>
      <div
        className="absolute inset-0 overflow-hidden rounded-full"
        style={{ background: gradient }}
      >
        {layers.map((layer, li) => (
          <div
            key={li}
            className="cmd-globe absolute inset-y-0 left-0 flex w-[200%]"
            style={{ animationDuration: `${layer.duration}s`, opacity: layer.opacity }}
          >
            {[0, 1].map((i) => (
              <svg key={i} viewBox="0 0 200 200" preserveAspectRatio="none" className="h-full w-1/2">
                {layer.blobs.map((d, j) => (
                  <path key={j} d={d} fill={layer.fill} />
                ))}
              </svg>
            ))}
          </div>
        ))}
        <div
          className="absolute inset-0 rounded-full"
          style={{
            background:
              "radial-gradient(circle at 30% 28%, rgba(255,255,255,0.2), transparent 38%, rgba(2,6,23,0.82) 100%)",
          }}
        />
      </div>
      {children}
    </div>
  );
}

const EARTH_LAND = [
  "M15,60 Q35,35 60,50 T70,90 Q50,115 28,100 Q10,90 15,60 Z",
  "M95,30 Q130,15 150,45 T140,95 Q115,110 98,85 Q85,55 95,30 Z",
  "M120,115 Q150,105 175,125 T165,165 Q140,175 122,150 Z",
  "M60,125 Q80,120 85,145 T68,175 Q50,160 60,125 Z",
];
const EARTH_CLOUDS = [
  "M20,40 Q50,30 80,42 Q50,52 20,40 Z",
  "M110,70 Q145,58 178,74 Q145,86 110,70 Z",
  "M40,150 Q75,138 110,152 Q75,164 40,150 Z",
  "M130,20 Q150,14 170,22 Q150,30 130,20 Z",
];
const MARS_PATCHES = [
  "M20,70 Q45,50 70,72 T65,105 Q40,115 22,95 Z",
  "M100,40 Q135,28 155,58 T140,100 Q112,98 100,40 Z",
  "M130,125 Q165,112 188,140 T160,180 Q135,172 130,125 Z",
  "M40,135 Q62,130 70,150 T52,178 Q35,165 40,135 Z",
];

/** Elipse de órbita con un satélite que da vueltas. */
function OrbitRing({
  radius,
  tilt,
  duration,
  color,
  reverse,
}: {
  radius: number;
  tilt: number;
  duration: number;
  color: string;
  reverse?: boolean;
}) {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute left-1/2 top-1/2"
      style={{
        width: radius * 2,
        height: radius * 2,
        transform: `translate(-50%, -50%) rotate(${tilt}deg) scaleY(0.32)`,
      }}
    >
      <div className="absolute inset-0 rounded-full border border-dashed" style={{ borderColor: `${color}55` }} />
      <div
        className="cmd-spin absolute inset-0"
        style={{
          animationDuration: `${duration}s`,
          animationDirection: reverse ? "reverse" : "normal",
        }}
      >
        <span
          className="absolute left-1/2 top-0 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full"
          style={{ background: color, boxShadow: `0 0 10px ${color}` }}
        />
      </div>
    </div>
  );
}

function IssSvg() {
  return (
    <svg
      className="h-24 w-56 text-slate-200 drop-shadow-[0_6px_18px_rgba(56,189,248,0.3)]"
      viewBox="0 0 220 80"
      fill="none"
    >
      <rect x="18" y="38" width="184" height="3.5" fill="currentColor" />
      {[30, 54, 148, 172].map((x) => (
        <rect
          key={x}
          x={x}
          y="12"
          width="18"
          height="54"
          rx="2"
          stroke="#38bdf8"
          strokeWidth="1.4"
          fill="rgba(56,189,248,0.2)"
        />
      ))}
      <rect x="90" y="26" width="40" height="24" rx="5" fill="#1e293b" stroke="#94a3b8" strokeWidth="1.5" />
      <circle cx="110" cy="38" r="2.5" fill="#2dd4bf" className="cmd-twinkle" />
    </svg>
  );
}

function AstronautSvg() {
  return (
    <svg viewBox="0 0 64 72" className="h-full w-full drop-shadow-[0_4px_10px_rgba(148,163,184,0.35)]">
      <rect x="14" y="26" width="10" height="26" rx="4" fill="#cbd5e1" />
      <rect x="22" y="24" width="24" height="30" rx="9" fill="#f8fafc" />
      <rect x="22" y="40" width="24" height="4" fill="#6366f1" />
      <circle cx="34" cy="16" r="12" fill="#e2e8f0" />
      <ellipse cx="36" cy="16" rx="8" ry="6.5" fill="#0f172a" />
      <ellipse cx="38" cy="14" rx="3" ry="2" fill="#38bdf8" opacity="0.7" />
      <rect x="44" y="28" width="9" height="20" rx="4.5" fill="#f1f5f9" transform="rotate(-18 48 38)" />
      <rect x="22" y="52" width="10" height="16" rx="5" fill="#f1f5f9" />
      <rect x="35" y="52" width="10" height="16" rx="5" fill="#e2e8f0" />
    </svg>
  );
}

function SatelliteSvg() {
  return (
    <svg viewBox="0 0 90 60" className="h-full w-full drop-shadow-[0_4px_10px_rgba(56,189,248,0.3)]">
      <rect x="2" y="18" width="26" height="24" rx="2" fill="rgba(56,189,248,0.25)" stroke="#38bdf8" strokeWidth="1.4" />
      <rect x="62" y="18" width="26" height="24" rx="2" fill="rgba(56,189,248,0.25)" stroke="#38bdf8" strokeWidth="1.4" />
      <line x1="28" y1="30" x2="62" y2="30" stroke="#94a3b8" strokeWidth="2" />
      <rect x="34" y="20" width="22" height="20" rx="4" fill="#1e293b" stroke="#cbd5e1" strokeWidth="1.5" />
      <path d="M45 20 L45 8" stroke="#94a3b8" strokeWidth="1.5" />
      <path d="M36 8 Q45 18 54 8" stroke="#2dd4bf" strokeWidth="1.8" fill="none" />
      <circle cx="45" cy="30" r="2.5" fill="#f97316" className="cmd-twinkle" />
    </svg>
  );
}

function FlameSphere() {
  return (
    <div className="relative h-full w-full">
      <div
        className="cmd-flame absolute inset-0 rounded-full"
        style={{
          background:
            "radial-gradient(circle at 50% 50%, rgba(224,242,254,0.95) 0%, rgba(56,189,248,0.75) 30%, rgba(37,99,235,0.45) 58%, transparent 74%)",
          boxShadow: "0 0 34px rgba(56,189,248,0.55)",
        }}
      />
      <div className="absolute inset-[34%] rounded-full bg-sky-100/90 blur-[2px]" />
    </div>
  );
}

/** Objeto flotante que se puede agarrar y lanzar: en 0 g no hay fricción. */
function Floater({
  boundsRef,
  start,
  size,
  vx0,
  vy0,
  label,
  children,
}: {
  boundsRef: React.RefObject<HTMLDivElement | null>;
  start: { x: number; y: number };
  size: number;
  vx0: number;
  vy0: number;
  label: string;
  children: React.ReactNode;
}) {
  const el = useRef<HTMLDivElement>(null);
  const s = useRef({
    x: 0, y: 0, vx: vx0, vy: vy0, rot: 0, vr: vx0 * 1.5,
    drag: false, lx: 0, ly: 0, dvx: 0, dvy: 0, lt: 0, init: false,
  });

  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const bounds = boundsRef.current;
      const node = el.current;
      const st = s.current;

      if (bounds && node) {
        const w = Math.max(0, bounds.clientWidth - size);
        const h = Math.max(0, bounds.clientHeight - size);

        if (!st.init) {
          st.x = start.x * w;
          st.y = start.y * h;
          st.init = true;
        }

        if (!st.drag) {
          st.x += st.vx;
          st.y += st.vy;
          st.rot += st.vr;

          if (st.x < 0) { st.x = 0; st.vx = Math.abs(st.vx) * 0.9; }
          else if (st.x > w) { st.x = w; st.vx = -Math.abs(st.vx) * 0.9; }
          if (st.y < 0) { st.y = 0; st.vy = Math.abs(st.vy) * 0.9; }
          else if (st.y > h) { st.y = h; st.vy = -Math.abs(st.vy) * 0.9; }

          st.vx *= 0.9994;
          st.vy *= 0.9994;
          st.vr *= 0.998;

          // Velocidad mínima: en microgravedad nada se queda quieto.
          const sp = Math.hypot(st.vx, st.vy);
          if (sp < 0.15) {
            if (sp === 0) st.vx = 0.15;
            else { st.vx *= 0.15 / sp; st.vy *= 0.15 / sp; }
          }
        } else {
          st.x = clamp(st.x, 0, w);
          st.y = clamp(st.y, 0, h);
        }

        node.style.transform = `translate3d(${st.x}px, ${st.y}px, 0) rotate(${st.rot}deg)`;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [boundsRef, size, start.x, start.y]);

  const down = (e: React.PointerEvent<HTMLDivElement>) => {
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    const st = s.current;
    st.drag = true;
    st.lx = e.clientX;
    st.ly = e.clientY;
    st.dvx = 0;
    st.dvy = 0;
    st.lt = performance.now();
    e.currentTarget.style.cursor = "grabbing";
  };
  const move = (e: React.PointerEvent<HTMLDivElement>) => {
    const st = s.current;
    if (!st.drag) return;
    const dx = e.clientX - st.lx;
    const dy = e.clientY - st.ly;
    st.x += dx;
    st.y += dy;
    st.dvx = dx * 0.6 + st.dvx * 0.4;
    st.dvy = dy * 0.6 + st.dvy * 0.4;
    st.lx = e.clientX;
    st.ly = e.clientY;
    st.lt = performance.now();
  };
  const up = (e: React.PointerEvent<HTMLDivElement>) => {
    const st = s.current;
    if (!st.drag) return;
    st.drag = false;
    const fresh = performance.now() - st.lt < 90 ? 1 : 0;
    st.vx = clamp(st.dvx * fresh, -18, 18);
    st.vy = clamp(st.dvy * fresh, -18, 18);
    st.vr = st.vx * 0.6;
    e.currentTarget.style.cursor = "grab";
  };

  return (
    <div
      ref={el}
      role="img"
      aria-label={label}
      title={label}
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={up}
      className="pointer-events-auto absolute left-0 top-0 cursor-grab touch-none"
      style={{ width: size, height: size }}
    >
      {children}
    </div>
  );
}

function Hotspot({
  env,
  spot,
  selected,
  lang,
  compact,
  onSelect,
  didDrag,
  style,
}: {
  env: EnvironmentOut;
  spot: Spot;
  selected: boolean;
  lang: "ES" | "EN";
  /** En teléfonos solo se rotula el módulo activo, para que no se pisen. */
  compact: boolean;
  onSelect: (key: string) => void;
  didDrag: React.MutableRefObject<boolean>;
  style: React.CSSProperties;
}) {
  const label = lang === "ES" ? spot.tagEs : spot.tagEn;
  const showLabel = !compact || selected;
  return (
    <button
      type="button"
      data-spot={env.key}
      onClick={() => {
        if (!didDrag.current) onSelect(env.key);
      }}
      aria-pressed={selected}
      aria-label={label}
      title={label}
      style={{ ...style, boxShadow: selected ? `0 0 26px ${spot.glow}` : undefined }}
      className={`group pointer-events-auto absolute z-10 flex -translate-x-1/2 -translate-y-1/2 cursor-pointer items-center gap-2 whitespace-nowrap rounded-full border backdrop-blur-md transition-all duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-300 ${
        showLabel ? "px-3 py-1.5" : "p-2"
      } ${
        selected
          ? "scale-110 border-teal-300 bg-teal-950/95 text-teal-300"
          : `bg-slate-950/85 hover:scale-105 ${spot.accent}`
      }`}
    >
      <span className="relative flex h-2.5 w-2.5">
        {selected && (
          <span className="cmd-radar absolute inline-flex h-full w-full rounded-full bg-teal-400" />
        )}
        <span
          className={`relative inline-flex h-2.5 w-2.5 rounded-full ${
            selected ? "bg-teal-300" : "bg-current"
          }`}
        />
      </span>
      {showLabel && (
        <span className="font-hud text-[11px] font-semibold tracking-wider text-slate-100">
          {label}
        </span>
      )}
      <span
        aria-hidden
        className="absolute left-1/2 top-full h-5 w-px -translate-x-1/2 bg-gradient-to-b from-current to-transparent opacity-60"
      />
    </button>
  );
}

/* ------------------------------------------------------------------ */
/*  Componente principal                                               */
/* ------------------------------------------------------------------ */

export function CommandViewport({
  environments,
  activeEnvKey,
  onSelectEnv,
  lang,
  findings = [],
  loadingFindings = false,
  onAskFlamey,
}: Props) {
  const es = lang === "ES";
  const rootRef = useRef<HTMLDivElement>(null);

  // Panel de misión: lista de ambientes o hallazgos del ambiente activo.
  const [panelTab, setPanelTab] = useState<"env" | "findings">("env");
  const [pickedKey, setPickedKey] = useState<string | null>(null);
  // En teléfonos el panel es una hoja inferior que se pliega para ver la escena.
  const [sheetOpen, setSheetOpen] = useState(false);
  const [compact, setCompact] = useState(false);
  // Encuadre de cámara activo (se muestra la mira mientras está enfocado).
  const [focus, setFocus] = useState<{
    label: string;
    zoom: number;
    x: number;
    y: number;
  } | null>(null);
  const focusedRef = useRef(false);

  // Estado del movimiento: se actualiza directo en el DOM para mantener 60 fps.
  const pan = useRef({
    x: 0, y: 0, vx: 0, vy: 0, z: 1, tz: 1,
    tx: 0, ty: 0, fly: false,
  });
  const drag = useRef<{
    id: number; sx: number; sy: number; ox: number; oy: number;
    lx: number; ly: number; lt: number; active: boolean;
  } | null>(null);
  const didDrag = useRef(false);
  // Dedos sobre la escena, para el zoom con pellizco.
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ startDist: number; startZoom: number } | null>(null);

  const envRef = useRef(environments);
  envRef.current = environments;
  const prevKey = useRef<string | null>(null);

  const active =
    environments.find((e) => e.key === activeEnvKey) || environments[0];

  const riskPercent = active
    ? Math.min(100, Math.round(((active.o2_fraction - 0.15) / 0.85) * 100))
    : 35;

  const spots = environments.map((env, i) => ({ env, spot: getVisualSpot(env, i) }));
  const roverEntry = spots.find((s) => s.spot.kind === "rover");
  const activeSpot = spots.find((s) => s.env.key === active?.key)?.spot;

  /* ---- Tamaño de pantalla: se lee en un efecto para no romper el prerender ---- */
  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${PHONE_MAX - 1}px)`);
    const apply = () => setCompact(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  /** Con zoom se puede arrastrar más lejos sin perder la escena. */
  const limits = () => {
    const root = rootRef.current;
    const extra = Math.max(0, Math.max(pan.current.z, pan.current.tz) - 1);
    return {
      x: MAX_X + extra * (root?.clientWidth ?? 0),
      y: MAX_Y + extra * (root?.clientHeight ?? 0),
    };
  };

  /** Elegir un ambiente: mueve la cámara y abre sus hallazgos en el panel. */
  const selectEnv = (key: string) => {
    onSelectEnv(key);
    setPanelTab("findings");
    setSheetOpen(true);
  };

  /* ---- Bucle de movimiento: inercia, zoom suave, vuelo de cámara y deriva ---- */
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let raf = 0;
    const t0 = performance.now();

    const tick = (now: number) => {
      const p = pan.current;
      const t = (now - t0) / 1000;

      if (!drag.current?.active) {
        if (p.fly) {
          p.x += (p.tx - p.x) * 0.07;
          p.y += (p.ty - p.y) * 0.07;
          if (Math.abs(p.tx - p.x) < 0.5 && Math.abs(p.ty - p.y) < 0.5) p.fly = false;
        } else {
          p.x += p.vx;
          p.y += p.vy;
          p.vx *= 0.93;
          p.vy *= 0.93;
        }
      }

      const extra = Math.max(0, Math.max(p.z, p.tz) - 1);
      const limX = MAX_X + extra * root.clientWidth;
      const limY = MAX_Y + extra * root.clientHeight;
      p.x = clamp(p.x, -limX, limX);
      p.y = clamp(p.y, -limY, limY);
      p.z += (p.tz - p.z) * 0.1;

      // Deriva suave; al enfocar es más amplia, como una cámara orbitando el objeto.
      const sway = focusedRef.current ? 2.6 : 1;
      const ix = reduce ? 0 : Math.sin(t * 0.25) * 5 * sway;
      const iy = reduce ? 0 : Math.cos(t * 0.21) * 4 * sway;
      root.style.setProperty("--px", (p.x + ix).toFixed(2));
      root.style.setProperty("--py", (p.y + iy).toFixed(2));
      root.style.setProperty("--z", p.z.toFixed(3));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    const onWheel = (e: WheelEvent) => {
      // Dentro de los paneles la rueda desplaza su contenido, no hace zoom.
      if ((e.target as HTMLElement | null)?.closest?.("[data-hud]")) return;
      e.preventDefault();
      pan.current.tz = clamp(pan.current.tz - e.deltaY * 0.0016, MIN_ZOOM, MAX_ZOOM);
    };
    root.addEventListener("wheel", onWheel, { passive: false });

    return () => {
      cancelAnimationFrame(raf);
      root.removeEventListener("wheel", onWheel);
    };
  }, []);

  /* ---- Al elegir un módulo, la cámara vuela y hace zoom sobre él ---- */
  useEffect(() => {
    const isFirst = prevKey.current === null;
    if (prevKey.current === activeEnvKey) return;
    prevKey.current = activeEnvKey;
    if (isFirst) return;

    const root = rootRef.current;
    const list = envRef.current;
    const idx = list.findIndex((e) => e.key === activeEnvKey);
    if (!root || idx < 0) return;

    const spot = getVisualSpot(list[idx], idx);
    const W = root.clientWidth;
    const H = root.clientHeight;
    const preset = focusPreset(W);
    const zoom = spot.depth >= 1 ? preset.near : preset.far;
    // Escala real de la capa donde vive el módulo.
    const layerScale = 1 + (zoom - 1) * spot.depth;
    const p = pan.current;

    // Posición real del módulo: se mide su marcador en pantalla y se deshace
    // la transformación actual de la capa. Así apunta bien en cualquier tamaño.
    let fx = spot.fx;
    let fy = spot.fy;
    const marker = Array.from(
      root.querySelectorAll<HTMLElement>("[data-spot]")
    ).find((node) => node.dataset.spot === activeEnvKey);

    if (marker) {
      const rootRect = root.getBoundingClientRect();
      const rect = marker.getBoundingClientRect();
      const screenX = rect.left + rect.width / 2 - rootRect.left;
      const screenY = rect.top + rect.height / 2 - rootRect.top;
      const curPx = parseFloat(root.style.getPropertyValue("--px")) || 0;
      const curPy = parseFloat(root.style.getPropertyValue("--py")) || 0;
      const curScale = 1 + (p.z - 1) * spot.depth;

      const baseX = W / 2 + (screenX - W / 2 - curPx * spot.depth) / curScale;
      const baseY = H / 2 + (screenY - H / 2 - curPy * spot.depth) / curScale;
      // El objeto no está justo en la etiqueta: Marte y la ISS quedan encima,
      // y los módulos lunares, debajo.
      const offsetY = spot.where === "mid" ? -0.07 * H : 30;

      fx = baseX / W;
      fy = (baseY + offsetY) / H;
    }

    // Se desplaza la escena para que el módulo, ya ampliado, caiga en el punto de foco.
    p.tz = zoom;
    p.tx = ((preset.x - 0.5) * W - (fx - 0.5) * W * layerScale) / spot.depth;
    p.ty = ((preset.y - 0.5) * H - (fy - 0.5) * H * layerScale) / spot.depth;
    p.vx = 0;
    p.vy = 0;
    p.fly = true;

    focusedRef.current = true;
    setFocus({ label: list[idx].label, zoom: layerScale, x: preset.x, y: preset.y });
  }, [activeEnvKey]);

  /* ---- Arrastre del espacio y zoom con pellizco ---- */
  const releaseFocus = () => {
    focusedRef.current = false;
    setFocus(null);
  };

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    const p = pan.current;
    p.vx = 0;
    p.vy = 0;
    p.fly = false;

    // Segundo dedo: empieza el pellizco y se cancela el arrastre.
    if (pointers.current.size === 2) {
      const [a, b] = Array.from(pointers.current.values());
      pinch.current = {
        startDist: Math.hypot(a.x - b.x, a.y - b.y) || 1,
        startZoom: p.tz,
      };
      drag.current = null;
      didDrag.current = true;
      releaseFocus();
      return;
    }

    didDrag.current = false;
    drag.current = {
      id: e.pointerId, sx: e.clientX, sy: e.clientY, ox: p.x, oy: p.y,
      lx: e.clientX, ly: e.clientY, lt: performance.now(), active: false,
    };
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (pointers.current.has(e.pointerId)) {
      pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    }

    if (pinch.current && pointers.current.size >= 2) {
      const [a, b] = Array.from(pointers.current.values());
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      pan.current.tz = clamp(
        pinch.current.startZoom * (dist / pinch.current.startDist),
        MIN_ZOOM,
        MAX_ZOOM
      );
      return;
    }

    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    const dx = e.clientX - d.sx;
    const dy = e.clientY - d.sy;

    if (!d.active) {
      if (Math.hypot(dx, dy) < 6) return;
      d.active = true;
      didDrag.current = true;
      e.currentTarget.setPointerCapture(e.pointerId);
      e.currentTarget.style.cursor = "grabbing";
      // Al mover la escena a mano se suelta el encuadre.
      releaseFocus();
    }

    const p = pan.current;
    const lim = limits();
    p.vx = (e.clientX - d.lx) * 0.6 + p.vx * 0.4;
    p.vy = (e.clientY - d.ly) * 0.6 + p.vy * 0.4;
    p.x = clamp(d.ox + dx, -lim.x, lim.x);
    p.y = clamp(d.oy + dy, -lim.y, lim.y);
    d.lx = e.clientX;
    d.ly = e.clientY;
    d.lt = performance.now();
  };

  const endDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinch.current = null;

    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    if (performance.now() - d.lt > 80) {
      pan.current.vx = 0;
      pan.current.vy = 0;
    }
    drag.current = null;
    e.currentTarget.style.cursor = "grab";
  };

  const zoomBy = (delta: number) => {
    pan.current.tz = clamp(pan.current.tz + delta, MIN_ZOOM, MAX_ZOOM);
  };
  const recenter = () => {
    const p = pan.current;
    p.tx = 0;
    p.ty = 0;
    p.tz = 1;
    p.vx = 0;
    p.vy = 0;
    p.fly = true;
    releaseFocus();
  };

  const pickFinding = (f: FindingOut) => {
    setPickedKey(f.key);
    onAskFlamey?.(f);
  };

  const rootStyle = { "--px": 0, "--py": 0, "--z": 1, cursor: "grab" } as React.CSSProperties;

  return (
    <div
      ref={rootRef}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      style={rootStyle}
      className="cmd-root relative h-full min-h-[calc(100dvh-3.5rem)] w-full touch-none select-none overflow-hidden bg-[radial-gradient(ellipse_at_top,#0f1f3d_0%,#050a14_72%)]"
    >
      <style>{`
        @keyframes twinkle { 0%,100% { opacity: .25 } 50% { opacity: 1 } }
        @keyframes floatSlow { 0%,100% { transform: translateY(0) } 50% { transform: translateY(-8px) } }
        @keyframes orbitSpin { to { transform: rotate(360deg) } }
        @keyframes globeSpin { from { transform: translateX(0) } to { transform: translateX(-50%) } }
        @keyframes radarPulse { 0% { transform: scale(.85); opacity: .75 } 100% { transform: scale(2.2); opacity: 0 } }
        @keyframes nebulaDrift { 0% { transform: translate3d(0,0,0) scale(1) } 100% { transform: translate3d(40px,-24px,0) scale(1.12) } }
        @keyframes shoot {
          0% { opacity: 0; transform: translate3d(0,0,0) rotate(-28deg) }
          2% { opacity: 1 }
          12%, 100% { opacity: 0; transform: translate3d(-720px,390px,0) rotate(-28deg) }
        }
        @keyframes dashFlow { to { stroke-dashoffset: -48 } }
        @keyframes roverPatrol { from { left: 50% } to { left: 78% } }
        @keyframes roverFlip { 0%,49.99% { transform: scaleX(1) } 50%,100% { transform: scaleX(-1) } }
        @keyframes windowPulse { 0%,100% { opacity: .5 } 50% { opacity: 1 } }
        @keyframes signal { 0% { opacity: 0; transform: scale(.6) } 30% { opacity: .9 } 100% { opacity: 0; transform: scale(1.5) } }
        @keyframes steam { 0% { opacity: .45; transform: translateY(0) scale(.6) } 100% { opacity: 0; transform: translateY(-28px) scale(1.6) } }
        @keyframes bob { 0%,100% { transform: translateY(0) } 50% { transform: translateY(-2px) } }
        @keyframes flameBreath { 0%,100% { transform: scale(1); opacity: .9 } 50% { transform: scale(1.12); opacity: 1 } }
        @keyframes reticleIn { 0% { opacity: 0; transform: translate(-50%,-50%) scale(1.35) } 100% { opacity: 1; transform: translate(-50%,-50%) scale(1) } }
        @keyframes scanLine { 0% { top: 0; opacity: 0 } 15% { opacity: .7 } 85% { opacity: .7 } 100% { top: 100%; opacity: 0 } }

        .cmd-twinkle { animation: twinkle 4s ease-in-out infinite }
        .cmd-float { animation: floatSlow 6s ease-in-out infinite }
        .cmd-spin { animation: orbitSpin 30s linear infinite }
        .cmd-globe { animation: globeSpin 60s linear infinite }
        .cmd-radar { animation: radarPulse 2.4s cubic-bezier(0,0,.2,1) infinite }
        .cmd-nebula { animation: nebulaDrift 38s ease-in-out infinite alternate }
        .cmd-shoot { animation: shoot 11s linear infinite }
        .cmd-dash { animation: dashFlow 3.5s linear infinite }
        .cmd-window { animation: windowPulse 3.2s ease-in-out infinite }
        .cmd-flame { animation: flameBreath 2.6s ease-in-out infinite }
        .cmd-signal, .cmd-steam, .cmd-bob, .cmd-wheel { transform-box: fill-box; transform-origin: center }
        .cmd-signal { transform-origin: bottom; animation: signal 2.6s ease-out infinite }
        .cmd-steam { animation: steam 3.4s ease-out infinite }
        .cmd-bob { animation: bob 1.2s ease-in-out infinite }
        .cmd-wheel { animation: orbitSpin 1.6s linear infinite }
        .cmd-reticle { animation: reticleIn .55s cubic-bezier(.2,.8,.2,1) both }
        .cmd-scan { animation: scanLine 3.6s linear infinite }

        @media (prefers-reduced-motion: reduce) {
          .cmd-root *, .cmd-root *::before, .cmd-root *::after { animation: none !important }
        }
      `}</style>

      {/* ===== CAPA 0: espacio profundo ===== */}
      <Layer depth={0.08}>
        <StarLayer count={90} seed={11} rMin={0.5} rMax={1.1} />
      </Layer>

      <Layer depth={0.12}>
        <div className="cmd-nebula absolute -top-24 left-1/3 h-[320px] w-[520px] rounded-full bg-teal-500/10 blur-[110px]" />
        <div className="cmd-nebula absolute right-10 top-1/4 h-[400px] w-[400px] rounded-full bg-sky-500/10 blur-[120px]" style={{ animationDelay: "-12s" }} />
        <div className="cmd-nebula absolute bottom-1/4 left-[8%] h-[300px] w-[360px] rounded-full bg-purple-500/10 blur-[110px]" style={{ animationDelay: "-24s" }} />
      </Layer>

      <Layer depth={0.22}>
        <StarLayer count={55} seed={29} rMin={0.9} rMax={1.7} />
        {[
          { top: "8%", left: "92%", delay: "1s" },
          { top: "24%", left: "70%", delay: "5s" },
          { top: "4%", left: "48%", delay: "8s" },
        ].map((s, i) => (
          <span
            key={i}
            aria-hidden
            className="cmd-shoot absolute block h-[1.5px] w-28"
            style={{
              top: s.top,
              left: s.left,
              animationDelay: s.delay,
              animationDuration: `${10 + i * 3}s`,
              background: "linear-gradient(to left, #ffffff, transparent)",
            }}
          />
        ))}
      </Layer>

      {/* ===== CAPA 2: Tierra y satélites ===== */}
      <Layer depth={0.35}>
        <div className="absolute right-[7%] top-[11%] hidden h-56 w-56 md:block">
          <OrbitRing radius={190} tilt={-18} duration={34} color="#2dd4bf" />
          <OrbitRing radius={150} tilt={14} duration={24} color="#fb923c" reverse />
          <Globe
            size={224}
            glow="0 0 80px rgba(56,189,248,0.3), inset 0 0 26px rgba(125,211,252,0.25)"
            gradient="radial-gradient(circle at 32% 32%, #38bdf8 0%, #1d4ed8 52%, #020617 92%)"
            layers={[
              { blobs: EARTH_LAND, fill: "#34d399", opacity: 0.42, duration: 90 },
              { blobs: EARTH_CLOUDS, fill: "#ffffff", opacity: 0.3, duration: 55 },
            ]}
          />
        </div>
      </Layer>

      {/* Rutas orbitales entre módulos */}
      <Layer depth={0.5}>
        <svg
          aria-hidden
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          fill="none"
          className="absolute inset-0 hidden h-full w-full opacity-50 md:block"
        >
          <path d="M 86 22 Q 74 12 62 22" stroke="#2dd4bf" strokeWidth="1.2" strokeDasharray="6 6" vectorEffect="non-scaling-stroke" className="cmd-dash" />
          <path d="M 62 22 Q 52 40 46 58" stroke="#38bdf8" strokeWidth="1.1" strokeDasharray="5 7" vectorEffect="non-scaling-stroke" className="cmd-dash" />
          <path d="M 46 58 Q 30 46 38 30" stroke="#fb923c" strokeWidth="1.1" strokeDasharray="5 7" vectorEffect="non-scaling-stroke" className="cmd-dash" />
        </svg>
      </Layer>

      {/* ===== CAPA 3: Marte, ISS y sus marcadores ===== */}
      <Layer depth={0.55}>
        {/* Marte */}
        <div className="absolute left-[38%] top-[30%] -translate-x-1/2 -translate-y-1/2">
          <OrbitRing radius={64} tilt={-24} duration={12} color="#fdba74" />
          <Globe
            size={72}
            glow="0 0 36px rgba(251,146,60,0.45)"
            gradient="radial-gradient(circle at 35% 35%, #fdba74 0%, #ea580c 55%, #431407 100%)"
            layers={[{ blobs: MARS_PATCHES, fill: "#7c2d12", opacity: 0.45, duration: 70 }]}
          />
        </div>

        {/* ISS: en teléfonos se muestra más pequeña en lugar de ocultarse */}
        <div className="absolute left-[62%] top-[22%] -translate-x-1/2 -translate-y-1/2">
          <div className="origin-center scale-[0.55] sm:scale-100">
            <div className="cmd-float">
              <IssSvg />
            </div>
          </div>
        </div>

        {spots
          .filter((s) => s.spot.where === "mid")
          .map(({ env, spot }) => (
            <Hotspot
              key={env.key}
              env={env}
              spot={spot}
              selected={env.key === activeEnvKey}
              lang={lang}
              compact={compact}
              onSelect={selectEnv}
              didDrag={didDrag}
              style={{ left: spot.x, top: spot.y }}
            />
          ))}
      </Layer>

      {/* Colinas lejanas de la Luna */}
      <Layer depth={0.7}>
        <div className="absolute -bottom-[52%] -left-[20%] h-[70%] w-[140%] rounded-[50%] bg-slate-800/70 shadow-[0_-20px_60px_rgba(15,23,42,0.8)]" />
      </Layer>

      {/* ===== CAPA 4: objetos flotantes que se pueden lanzar ===== */}
      <Layer depth={0.8}>
        <Floater
          boundsRef={rootRef}
          start={{ x: 0.5, y: 0.42 }}
          size={compact ? 44 : 64}
          vx0={0.5}
          vy0={-0.3}
          label={es ? "Astronauta: arrástralo y suéltalo" : "Astronaut: drag and release"}
        >
          <AstronautSvg />
        </Floater>
        {/* En teléfonos hay menos espacio: el satélite se omite */}
        {!compact && (
          <Floater
            boundsRef={rootRef}
            start={{ x: 0.82, y: 0.55 }}
            size={84}
            vx0={-0.4}
            vy0={0.25}
            label={es ? "Satélite: arrástralo y suéltalo" : "Satellite: drag and release"}
          >
            <SatelliteSvg />
          </Floater>
        )}
        <Floater
          boundsRef={rootRef}
          start={{ x: 0.28, y: 0.34 }}
          size={compact ? 38 : 52}
          vx0={0.3}
          vy0={0.4}
          label={es ? "Llama esférica: así arde el fuego en 0 g" : "Spherical flame: how fire burns in 0 g"}
        >
          <FlameSphere />
        </Floater>
      </Layer>

      {/* ===== CAPA 5: superficie lunar y base ===== */}
      <Layer depth={1}>
        <div
          className="absolute -bottom-[46%] -left-[30%] h-[78%] w-[160%] rounded-[50%] border-t border-teal-300/30"
          style={{
            background:
              "linear-gradient(180deg, #7c8aa0 0%, #586377 18%, #2a3447 55%, #0f172a 100%)",
            boxShadow:
              "0 -30px 90px rgba(15,23,42,0.9), inset 0 20px 60px rgba(148,163,184,0.12)",
          }}
        >
          <div className="absolute left-[30%] top-[14%] h-[4%] w-[9%] rounded-full border-b border-slate-300/15 bg-slate-950/30" />
          <div className="absolute left-[48%] top-[22%] h-[5%] w-[13%] rounded-full border-b border-slate-300/15 bg-slate-950/25" />
          <div className="absolute left-[64%] top-[12%] h-[3.5%] w-[7%] rounded-full border-b border-slate-300/15 bg-slate-950/30" />
          <div className="absolute left-[20%] top-[26%] h-[4%] w-[8%] rounded-full border-b border-slate-300/15 bg-slate-950/25" />
          <div className="absolute left-[76%] top-[24%] h-[4.5%] w-[10%] rounded-full border-b border-slate-300/15 bg-slate-950/30" />
        </div>

        {/* Complejo lunar: en teléfonos va más grande y más arriba, sobre la hoja inferior */}
        <div className="absolute bottom-[24%] left-[7%] aspect-[760/300] w-[min(86vw,780px)] sm:bottom-[11%] sm:left-[14%] sm:w-[min(64vw,780px)]">
          <svg viewBox="0 0 760 300" className="absolute inset-0 h-full w-full overflow-visible drop-shadow-[0_12px_24px_rgba(2,6,23,0.75)]" fill="none">
            <defs>
              <linearGradient id="cmdHab" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="#f1f5f9" />
                <stop offset="100%" stopColor="#94a3b8" />
              </linearGradient>
            </defs>

            {/* Sombras de contacto */}
            <ellipse cx="90" cy="274" rx="60" ry="5" fill="#020617" opacity="0.45" />
            <ellipse cx="395" cy="274" rx="140" ry="6" fill="#020617" opacity="0.4" />

            {/* Torre y cohete */}
            <rect x="36" y="60" width="14" height="212" stroke="#64748b" strokeWidth="1.2" />
            {[95, 130, 165, 200, 235].map((y) => (
              <line key={y} x1="36" y1={y} x2="50" y2={y} stroke="#64748b" />
            ))}
            <line x1="50" y1="110" x2="78" y2="110" stroke="#64748b" strokeWidth="2" />
            <polygon points="78,232 62,272 78,272" fill="#94a3b8" />
            <polygon points="100,232 116,272 100,272" fill="#94a3b8" />
            <rect x="78" y="40" width="22" height="232" rx="6" fill="#f1f5f9" />
            <polygon points="89,10 78,42 100,42" fill="#cbd5e1" />
            <rect x="78" y="150" width="22" height="40" fill="#6366f1" />
            <circle cx="89" cy="72" r="3.5" fill="#38bdf8" />
            <circle cx="89" cy="8" r="3" fill="#22d3ee" className="cmd-twinkle" />
            {[0, 1, 2].map((i) => (
              <circle
                key={i}
                cx={64 + i * 26}
                cy="266"
                r="6"
                fill="#e2e8f0"
                className="cmd-steam"
                style={{ animationDelay: `${i * 1.1}s` }}
              />
            ))}

            {/* Astronauta caminando */}
            <g className="cmd-bob">
              <circle cx="168" cy="228" r="6" fill="#e2e8f0" />
              <ellipse cx="170" cy="228" rx="3.6" ry="3" fill="#0f172a" />
              <rect x="159" y="234" width="5" height="16" rx="2" fill="#cbd5e1" />
              <rect x="161" y="234" width="14" height="22" rx="5" fill="#f8fafc" />
              <rect x="162" y="255" width="5" height="12" rx="2" fill="#e2e8f0" />
              <rect x="169" y="255" width="5" height="12" rx="2" fill="#f1f5f9" />
            </g>

            {/* Hábitats presurizados */}
            <rect x="355" y="222" width="18" height="14" fill="#94a3b8" />
            <rect x="428" y="222" width="16" height="14" fill="#94a3b8" />
            <rect x="290" y="150" width="70" height="122" rx="30" fill="url(#cmdHab)" stroke="#475569" strokeWidth="1.5" />
            <rect x="313" y="190" width="24" height="12" rx="4" fill="#2dd4bf" className="cmd-window" />
            <rect x="368" y="176" width="64" height="96" rx="26" fill="url(#cmdHab)" stroke="#475569" strokeWidth="1.5" />
            <rect x="388" y="208" width="24" height="10" rx="4" fill="#38bdf8" className="cmd-window" style={{ animationDelay: "-1s" }} />
            <rect x="440" y="160" width="60" height="112" rx="26" fill="url(#cmdHab)" stroke="#475569" strokeWidth="1.5" />
            <rect x="458" y="196" width="22" height="10" rx="4" fill="#fbbf24" className="cmd-window" style={{ animationDelay: "-2s" }} />

            {/* Antena con señal */}
            <line x1="560" y1="200" x2="560" y2="272" stroke="#94a3b8" strokeWidth="2" />
            <path d="M544 192 Q560 214 576 192" stroke="#2dd4bf" strokeWidth="2" fill="none" />
            {[0, 1, 2].map((i) => (
              <path
                key={i}
                d={`M${548 - i * 4} ${182 - i * 5} Q560 ${168 - i * 8} ${572 + i * 4} ${182 - i * 5}`}
                stroke="#2dd4bf"
                strokeWidth="1.5"
                fill="none"
                className="cmd-signal"
                style={{ animationDelay: `${i * 0.7}s` }}
              />
            ))}

            {/* Campo solar */}
            <polygon points="600,266 640,250 662,262 622,278" fill="#1d4ed8" opacity="0.8" stroke="#38bdf8" strokeWidth="1" />
            <polygon points="660,262 696,248 718,260 682,274" fill="#1d4ed8" opacity="0.8" stroke="#38bdf8" strokeWidth="1" />
          </svg>

          {/* Marcadores dentro del complejo (se alinean aunque cambie el tamaño) */}
          {spots
            .filter((s) => s.spot.where === "lunar")
            .map(({ env, spot }) => (
              <Hotspot
                key={env.key}
                env={env}
                spot={spot}
                selected={env.key === activeEnvKey}
                lang={lang}
                compact={compact}
                onSelect={selectEnv}
                didDrag={didDrag}
                style={{ left: spot.x, top: spot.y }}
              />
            ))}

          {/* Rover patrullando */}
          <div
            className="absolute bottom-[4%] w-[13%]"
            style={{ left: "50%", animation: "roverPatrol 26s ease-in-out infinite alternate" }}
          >
            {roverEntry && (
              <Hotspot
                env={roverEntry.env}
                spot={roverEntry.spot}
                selected={roverEntry.env.key === activeEnvKey}
                lang={lang}
                compact={compact}
                onSelect={selectEnv}
                didDrag={didDrag}
                style={{ left: "50%", top: "-22px" }}
              />
            )}
            <div style={{ animation: "roverFlip 52s linear infinite" }}>
              <svg viewBox="0 0 100 50" className="h-full w-full" fill="none">
                <rect x="14" y="14" width="62" height="20" rx="6" fill="#94a3b8" stroke="#334155" />
                <rect x="44" y="8" width="26" height="12" rx="4" fill="#fbbf24" opacity="0.9" />
                <line x1="24" y1="14" x2="24" y2="4" stroke="#cbd5e1" strokeWidth="1.5" />
                <circle cx="24" cy="3" r="2" fill="#ef4444" className="cmd-twinkle" />
                {[26, 66].map((cx) => (
                  <g key={cx}>
                    <circle cx={cx} cy="38" r="8" fill="#0f172a" stroke="#e2e8f0" strokeWidth="2" />
                    <g className="cmd-wheel" stroke="#e2e8f0" strokeWidth="1.4">
                      <line x1={cx - 5} y1="38" x2={cx + 5} y2="38" />
                      <line x1={cx} y1="33" x2={cx} y2="43" />
                    </g>
                  </g>
                ))}
              </svg>
            </div>
          </div>
        </div>
      </Layer>

      {/* ===== Mira de cámara: aparece al enfocar un módulo ===== */}
      {focus && (
        <div
          key={focus.label}
          aria-hidden
          className="cmd-reticle pointer-events-none absolute z-[5] h-32 w-48 sm:h-44 sm:w-64 lg:h-52 lg:w-72"
          style={{ left: `${focus.x * 100}%`, top: `${focus.y * 100}%` }}
        >
          {/* Esquinas del encuadre */}
          <span className="absolute left-0 top-0 h-5 w-5 border-l-2 border-t-2 border-teal-300/80" />
          <span className="absolute right-0 top-0 h-5 w-5 border-r-2 border-t-2 border-teal-300/80" />
          <span className="absolute bottom-0 left-0 h-5 w-5 border-b-2 border-l-2 border-teal-300/80" />
          <span className="absolute bottom-0 right-0 h-5 w-5 border-b-2 border-r-2 border-teal-300/80" />
          {/* Línea de barrido */}
          <span className="cmd-scan absolute inset-x-3 h-px bg-gradient-to-r from-transparent via-teal-300/70 to-transparent" />
          {/* Etiqueta de cámara */}
          <span className="absolute -top-6 left-0 flex max-w-full items-center gap-1.5 truncate whitespace-nowrap font-hud text-[10px] uppercase tracking-[0.18em] text-teal-200">
            <span className="h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-rose-400" />
            CAM · {focus.label} · ×{focus.zoom.toFixed(1)}
          </span>
        </div>
      )}

      {/* ===== HUD: título + telemetría ===== */}
      <div
        data-hud
        onPointerDown={stop}
        className="relative z-10 max-w-xl cursor-default pl-4 pr-4 pt-3 sm:pl-10 sm:pr-6 sm:pt-5"
      >
        {/* En teléfonos esta línea deja sitio a los controles de cámara de la derecha */}
        <div className="flex min-h-9 items-center gap-2 pr-28 font-hud text-[11px] uppercase tracking-[0.22em] text-teal-400 sm:min-h-0 sm:pr-0">
          <Radio className="h-3.5 w-3.5 shrink-0 animate-pulse" />
          <span className="truncate">
            <span className="hidden sm:inline">
              {es ? "CENTRO DE MANDO · " : "COMMAND CENTER · "}
            </span>
            {active?.label || "SITIO LUNAR"}
          </span>
        </div>

        <h1 className="mt-1 text-xl font-bold leading-tight tracking-tight text-white sm:mt-1.5 sm:text-3xl">
          {es
            ? "Seguridad contra incendios en ambientes habitables"
            : "Fire safety in habitable environments"}
        </h1>

        <div className="mt-2.5 hidden items-center gap-2 rounded-full border border-slate-700/80 bg-slate-900/85 px-3 py-1 text-xs text-slate-300 sm:inline-flex">
          <Flame className="h-3.5 w-3.5 text-teal-400" />
          <span>
            {es
              ? "Toca un módulo para acercar la cámara y ver sus hallazgos"
              : "Tap a module to zoom in and see its findings"}
          </span>
        </div>

        {/* Telemetría: en teléfonos la resume la cabecera de la hoja inferior */}
        {active && (
          <div className="mt-4 hidden rounded-xl border border-slate-800/90 bg-slate-950/80 p-3 shadow-xl backdrop-blur-md sm:block">
            <div className="flex items-center justify-between gap-2 font-hud text-[10px] text-slate-400">
              <span className="font-semibold uppercase text-teal-300">
                {es ? "TELEMETRÍA" : "TELEMETRY"} · {active.label}
              </span>
              <span>
                {active.gravity_g === 0 ? "0 g (µg)" : `${active.gravity_g} g`} ·{" "}
                {fmt(active.pressure_atm)} atm ({atmToPsi(active.pressure_atm)} psi)
              </span>
            </div>

            <div className="mt-2 grid grid-cols-2 gap-2 font-hud text-[11px] sm:grid-cols-4">
              <div className="flex items-center gap-1.5 rounded-lg border border-slate-800 bg-slate-900/90 px-2 py-1.5">
                <Wind className="h-3.5 w-3.5 shrink-0 text-cyan-400" />
                <div>
                  <div className="text-[10px] text-slate-400">{es ? "ATMÓSFERA" : "ATMOSPHERE"}</div>
                  <div className="font-semibold text-slate-200">
                    {Math.round(active.o2_fraction * 100)}% O₂ / {active.diluent}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-1.5 rounded-lg border border-slate-800 bg-slate-900/90 px-2 py-1.5">
                <Gauge className="h-3.5 w-3.5 shrink-0 text-sky-400" />
                <div>
                  <div className="text-[10px] text-slate-400">{es ? "PRESIÓN DE O₂" : "O₂ PRESSURE"}</div>
                  <div className="font-semibold text-slate-200">
                    {fmt(active.o2_fraction * active.pressure_atm)} atm
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-1.5 rounded-lg border border-slate-800 bg-slate-900/90 px-2 py-1.5">
                <Clock className="h-3.5 w-3.5 shrink-0 text-amber-400" />
                <div>
                  <div className="text-[10px] text-slate-400">{es ? "EVACUACIÓN" : "EGRESS"}</div>
                  <div className="font-semibold text-slate-200">{active.egress_s} s</div>
                </div>
              </div>

              <div className="flex items-center gap-1.5 rounded-lg border border-slate-800 bg-slate-900/90 px-2 py-1.5">
                <Activity className="h-3.5 w-3.5 shrink-0 text-rose-400" />
                <div className="w-full">
                  <div className="flex justify-between text-[10px] text-slate-400">
                    <span>{es ? "IGNICIÓN" : "IGNITION"}</span>
                    <span className="text-amber-300">{riskPercent}%</span>
                  </div>
                  <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-slate-800">
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
      </div>

      {/* ===== Controles de cámara ===== */}
      <div
        data-hud
        onPointerDown={stop}
        className="absolute right-2 top-3 z-20 flex cursor-default items-center gap-0.5 rounded-full border border-slate-700/80 bg-slate-950/85 p-1 backdrop-blur-md sm:right-4 sm:top-4 sm:gap-1"
      >
        <span className="hidden items-center gap-1.5 pl-2.5 pr-1 text-[11px] text-slate-300 md:inline-flex">
          <Move className="h-3.5 w-3.5 text-teal-300" />
          {es ? "Arrastra el espacio" : "Drag the scene"}
        </span>
        <button
          type="button"
          onClick={() => zoomBy(-0.25)}
          aria-label={es ? "Alejar" : "Zoom out"}
          title={es ? "Alejar" : "Zoom out"}
          className="cursor-pointer rounded-full p-2 text-slate-300 hover:bg-slate-800 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-300 sm:p-1.5"
        >
          <Minus className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={() => zoomBy(0.25)}
          aria-label={es ? "Acercar" : "Zoom in"}
          title={es ? "Acercar" : "Zoom in"}
          className="cursor-pointer rounded-full p-2 text-slate-300 hover:bg-slate-800 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-300 sm:p-1.5"
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={recenter}
          aria-label={es ? "Ver toda la escena" : "Show whole scene"}
          title={es ? "Ver toda la escena" : "Show whole scene"}
          className="cursor-pointer rounded-full p-2 text-teal-300 hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-300 sm:p-1.5"
        >
          <Crosshair className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* ===== Panel de misión: ambientes y hallazgos =====
          Teléfono: hoja inferior plegable, por encima del botón de Flamey.
          Tablet y escritorio: tarjeta flotante abajo a la derecha, siempre abierta. */}
      <div
        data-hud
        onPointerDown={stop}
        className="absolute bottom-16 left-2 right-2 z-20 cursor-default overflow-hidden rounded-2xl border border-slate-700/70 bg-slate-950/92 shadow-[0_24px_70px_rgba(2,6,23,0.85)] backdrop-blur-xl sm:bottom-4 sm:left-auto sm:right-4 sm:w-[380px] lg:bottom-5 lg:right-5 lg:w-[400px]"
      >
        {/* Línea de acento con el color del módulo activo */}
        <div
          className="h-0.5 transition-colors duration-500"
          style={{
            background: `linear-gradient(90deg, transparent, ${activeSpot?.color || "#2dd4bf"}, transparent)`,
          }}
        />

        {/* Ambiente activo. En teléfonos, tocarlo pliega o despliega la hoja. */}
        <div
          onClick={compact ? () => setSheetOpen((v) => !v) : undefined}
          className="flex items-center gap-3 px-3 pb-2.5 pt-2.5 sm:px-4 sm:pt-3"
        >
          <span
            className="h-9 w-1 shrink-0 rounded-full transition-colors duration-500"
            style={{
              background: activeSpot?.color || "#2dd4bf",
              boxShadow: `0 0 14px ${activeSpot?.glow || "rgba(45,212,191,0.5)"}`,
            }}
          />
          <div className="min-w-0 flex-1">
            <div className="truncate font-hud text-[10px] tracking-[0.2em] text-slate-400">
              {activeSpot?.code || "SPX"} · {es ? "AMBIENTE ACTIVO" : "ACTIVE ENVIRONMENT"}
            </div>
            <div className="truncate text-sm font-bold text-white">
              {active?.label || (es ? "Cargando..." : "Loading...")}
            </div>
          </div>
          {active && (
            <div className="shrink-0 text-right font-hud">
              <div
                className={`text-lg font-bold leading-none ${
                  active.o2_fraction >= 0.3 ? "text-amber-300" : "text-slate-100"
                }`}
              >
                {Math.round(active.o2_fraction * 100)}%
                <span className="ml-0.5 text-[10px] font-normal text-slate-400">O₂</span>
              </div>
              <div className="mt-0.5 text-[10px] text-slate-400">
                {active.gravity_g === 0 ? "µg" : `${active.gravity_g} g`} ·{" "}
                {fmt(active.pressure_atm)} atm
              </div>
            </div>
          )}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setSheetOpen((v) => !v);
            }}
            aria-expanded={sheetOpen}
            aria-label={
              sheetOpen
                ? es ? "Plegar panel" : "Collapse panel"
                : es ? "Desplegar panel" : "Expand panel"
            }
            className="shrink-0 cursor-pointer rounded-lg border border-slate-700 bg-slate-900 p-1.5 text-slate-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-300 sm:hidden"
          >
            {sheetOpen ? (
              <ChevronDown className="h-4 w-4" />
            ) : (
              <ChevronUp className="h-4 w-4" />
            )}
          </button>
        </div>

        {/* Cuerpo: plegable en teléfonos, siempre visible desde tablet */}
        <div className={`${sheetOpen ? "block" : "hidden"} sm:block`}>
          {/* Pestañas */}
          <div
            role="tablist"
            aria-label={es ? "Panel de misión" : "Mission panel"}
            className="mx-3 grid grid-cols-2 gap-1 rounded-lg border border-slate-800 bg-slate-900/80 p-1"
          >
            {(
              [
                { id: "env", label: es ? "Ambientes" : "Environments", count: environments.length },
                { id: "findings", label: es ? "Hallazgos" : "Findings", count: findings.length },
              ] as const
            ).map((tabItem) => (
              <button
                key={tabItem.id}
                type="button"
                role="tab"
                aria-selected={panelTab === tabItem.id}
                onClick={() => setPanelTab(tabItem.id)}
                className={`flex h-8 cursor-pointer items-center justify-center gap-1.5 rounded-md font-hud text-[11px] font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-300 sm:h-7 ${
                  panelTab === tabItem.id
                    ? "bg-teal-500/20 text-teal-200"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                {tabItem.label}
                <span
                  className={`rounded-full px-1.5 text-[10px] ${
                    panelTab === tabItem.id ? "bg-teal-400/20" : "bg-slate-800"
                  }`}
                >
                  {tabItem.id === "findings" && loadingFindings ? "…" : tabItem.count}
                </span>
              </button>
            ))}
          </div>

          {/* ---------- Pestaña: ambientes ---------- */}
          {panelTab === "env" && (
            <div role="tabpanel" className="p-3">
              <div className="max-h-[34vh] touch-pan-y space-y-1 overflow-y-auto overscroll-contain sm:max-h-none">
                {spots.map(({ env, spot }) => {
                  const isSelected = env.key === activeEnvKey;
                  const enriched = env.o2_fraction >= 0.3;
                  const o2 = Math.round(env.o2_fraction * 100);
                  return (
                    <button
                      key={env.key}
                      type="button"
                      onClick={() => selectEnv(env.key)}
                      aria-pressed={isSelected}
                      className={`group flex w-full cursor-pointer items-center gap-2.5 rounded-lg border px-2.5 py-2 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-300 ${
                        isSelected
                          ? "border-teal-400/50 bg-teal-500/10"
                          : "border-transparent hover:border-slate-700 hover:bg-slate-900/90"
                      }`}
                    >
                      <span
                        className="h-2 w-2 shrink-0 rounded-full"
                        style={{ background: spot.color, boxShadow: `0 0 8px ${spot.glow}` }}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-baseline gap-2">
                          <span className="shrink-0 font-hud text-[10px] text-slate-400">
                            {spot.code}
                          </span>
                          <span
                            className={`truncate text-xs font-medium ${
                              isSelected ? "text-white" : "text-slate-200"
                            }`}
                          >
                            {env.label}
                          </span>
                        </div>
                        {/* Barra de oxígeno: el dato que más mueve el riesgo */}
                        <div className="mt-1 h-1 overflow-hidden rounded-full bg-slate-800">
                          <div
                            className={`h-full ${enriched ? "bg-amber-400" : "bg-teal-400"}`}
                            style={{ width: `${o2}%` }}
                          />
                        </div>
                      </div>
                      <div className="shrink-0 text-right font-hud text-[11px]">
                        <div className={enriched ? "font-semibold text-amber-300" : "text-slate-200"}>
                          {o2}% O₂
                        </div>
                        <div className="text-[10px] text-slate-400">
                          {env.gravity_g === 0 ? "µg" : `${env.gravity_g} g`} ·{" "}
                          {fmt(env.pressure_atm)} atm
                        </div>
                      </div>
                      <ArrowRight
                        className={`h-3.5 w-3.5 shrink-0 transition-transform group-hover:translate-x-0.5 ${
                          isSelected ? "text-teal-300" : "text-slate-500"
                        }`}
                      />
                    </button>
                  );
                })}
              </div>

              {active && active.o2_fraction >= 0.3 && (
                <div className="mt-2.5 flex items-start gap-2 rounded-lg border border-amber-500/25 bg-amber-950/20 px-2.5 py-2 text-[11px] text-amber-200">
                  <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-400" />
                  <span>
                    {es
                      ? `${active.label}: ${Math.round(active.o2_fraction * 100)}% de O₂ a ${fmt(active.pressure_atm)} atm (${atmToPsi(active.pressure_atm)} psi) eleva mucho el riesgo de ignición.`
                      : `${active.label}: ${Math.round(active.o2_fraction * 100)}% O₂ at ${fmt(active.pressure_atm)} atm (${atmToPsi(active.pressure_atm)} psi) sharply increases ignition risk.`}
                  </span>
                </div>
              )}
            </div>
          )}

          {/* ---------- Pestaña: hallazgos del ambiente activo ---------- */}
          {panelTab === "findings" && (
            <div role="tabpanel" className="p-3">
              {/* Cambio rápido de ambiente sin salir de la pestaña */}
              <div className="-mx-3 mb-2 flex touch-pan-x gap-1 overflow-x-auto overscroll-contain px-3 pb-1">
                {spots.map(({ env, spot }) => {
                  const isSelected = env.key === activeEnvKey;
                  return (
                    <button
                      key={env.key}
                      type="button"
                      onClick={() => selectEnv(env.key)}
                      aria-pressed={isSelected}
                      className={`inline-flex shrink-0 cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-1 font-hud text-[10px] transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-300 sm:px-2 sm:py-0.5 ${
                        isSelected
                          ? "border-teal-400/60 bg-teal-500/15 text-teal-100"
                          : "border-slate-800 bg-slate-900 text-slate-400 hover:text-white"
                      }`}
                    >
                      <span
                        className="h-1.5 w-1.5 rounded-full"
                        style={{ background: spot.color }}
                      />
                      {env.label}
                    </button>
                  );
                })}
              </div>

              {loadingFindings ? (
                <div className="flex items-center justify-center gap-2 py-8 font-hud text-xs text-teal-300">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {es ? "Cargando hallazgos..." : "Loading findings..."}
                </div>
              ) : findings.length === 0 ? (
                <p className="py-8 text-center text-xs text-slate-400">
                  {es
                    ? "Este ambiente no tiene hallazgos."
                    : "This environment has no findings."}
                </p>
              ) : (
                <div className="max-h-[26vh] touch-pan-y space-y-1 overflow-y-auto overscroll-contain pr-1 sm:max-h-64">
                  {findings.map((f, idx) => {
                    const picked = pickedKey === f.key;
                    return (
                      <button
                        key={f.key}
                        type="button"
                        onClick={() => pickFinding(f)}
                        aria-pressed={picked}
                        title={es ? "Explicar con Flamey" : "Explain with Flamey"}
                        className={`group flex w-full cursor-pointer items-center gap-2.5 rounded-lg border px-2.5 py-2 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-300 sm:py-1.5 ${
                          picked
                            ? "border-teal-400/50 bg-teal-500/10"
                            : "border-transparent hover:border-slate-700 hover:bg-slate-900/90"
                        }`}
                      >
                        <span className="w-5 shrink-0 text-center font-hud text-[10px] text-slate-400">
                          {String(idx + 1).padStart(2, "0")}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-xs font-semibold text-white">
                            {f.experiment}
                          </div>
                          <div className="truncate text-[10px] text-slate-400">
                            {f.material || (es ? "Sin material" : "No material")} · {f.flame_mode}
                          </div>
                          <div className="mt-1 h-1 overflow-hidden rounded-full bg-slate-800">
                            <div
                              className="h-full bg-teal-400"
                              style={{ width: `${clamp(f.rpi, 0, 100)}%` }}
                            />
                          </div>
                        </div>
                        <div className="shrink-0 text-right font-hud">
                          <div className="text-sm font-bold leading-none text-teal-300">{f.rpi}</div>
                          <div className="mt-0.5 text-[9px] uppercase text-slate-400">{f.band}</div>
                        </div>
                        <Sparkles
                          className={`h-3.5 w-3.5 shrink-0 transition ${
                            picked ? "text-teal-300" : "text-slate-600 group-hover:text-teal-300"
                          }`}
                        />
                      </button>
                    );
                  })}
                </div>
              )}

              <div className="mt-2.5 flex items-center justify-between gap-2 border-t border-slate-800 pt-2.5">
                <span className="text-[11px] text-slate-400">
                  {es ? "Toca uno y Flamey lo explica." : "Tap one and Flamey explains it."}
                </span>
                <Link
                  href="/ranking"
                  className="inline-flex shrink-0 items-center gap-1 font-hud text-[11px] text-teal-300 hover:text-teal-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-300"
                >
                  {es ? "Ranking completo" : "Full ranking"}
                  <ArrowRight className="h-3 w-3" />
                </Link>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}