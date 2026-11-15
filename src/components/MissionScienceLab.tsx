"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Flame, Wind, Droplets, Shield, Radar, Cpu, Globe, Download, X,
  AlertTriangle, CheckCircle2, Sparkles, Layers, Zap, Gauge, ArrowRight,
  Thermometer, Eye, FlaskConical, ListOrdered, Grid3x3, BookOpen, RotateCcw,
} from "lucide-react";

/* ==================================================================
   1. TIPOS
   ================================================================== */

interface Props {
  initialEnvironment?: string;
  /** true = se muestra como página; false = botón flotante que abre un modal. */
  embedded?: boolean;
}

type LabTab = "chamber" | "ranking" | "matrix" | "catalog" | "apply";
type Diluent = "N2" | "CO2" | "He" | "Ar";
type Phase = "prevention" | "detection" | "suppression" | "flammability";
type Status = "flight" | "complete" | "future";

interface EnvProfile {
  id: string;
  label: string;
  short: string;
  g: number;
  psi: number;
  o2: number;
  diluent: Diluent;
  flow: number;
  note: string;
  bounds: string[];
  crewed: boolean;
}

interface Fuel {
  id: string;
  label: string;
  soot: number;
  limit: number;
  kind: "candle" | "drop" | "solid" | "gas";
  note: string;
}

interface Investigation {
  id: string;
  name: string;
  full: string;
  phase: Phase;
  hardware: string;
  fuels: string[];
  sensors: string[];
  conditions: string;
  finding: string;
  relevance: Record<string, number>;
  evidence: number;
  status: Status;
}

interface ChamberState { env: string; o2: number; psi: number; g: number; flow: number; }

interface Metrics {
  env: EnvProfile;
  fuel: Fuel;
  ppO2: number;
  rO2: number;
  pressureFactor: number;
  diluentFactor: number;
  reaction: number;
  extinguished: boolean;
  cause: string | null;
  tempK: number;
  soot: number;
  spread: number;
  margin: number;
  limit: number;
  blowoff: number;
  buoyancy: number;
  verdict: Verdict;
}

interface Verdict { label: string; tone: string; rank: number; }

/* ==================================================================
   2. DATOS: AMBIENTES
   ================================================================== */

const ENVIRONMENTS: EnvProfile[] = [
  {
    id: "earth",
    label: "1.0 g · Tierra, nivel del mar",
    short: "Tierra",
    g: 1,
    psi: 14.7,
    o2: 20.9,
    diluent: "N2",
    flow: 0,
    crewed: true,
    note: "Línea base: flotabilidad plena, hollín abundante, lágrima alta con base azul en la mecha y punta oscura. Todo lo demás se compara contra esto.",
    bounds: ["BASS / BASS-II (control 1 g)", "Saffire-I/-II/-III (escala real)"],
  },
  {
    id: "lunar",
    label: "0.165 g · Hábitat lunar",
    short: "Luna",
    g: 0.165,
    psi: 10.2,
    o2: 32,
    diluent: "N2",
    flow: 5,
    crewed: true,
    note: "Punto de diseño lunar: 30 % de O₂ o más a 10.2 psi o menos, con solo 0.165 g. La fracción de O₂ sube más de 40 % respecto a la Tierra, así que el material arde mucho más, pero la llama queda larga y difusiva.",
    bounds: ["BASS / BASS-II (límites sólidos)", "E-FIELD Flames (cota partial-g)", "pendiente: LUCI / FM2"],
  },
  {
    id: "mars",
    label: "0.38 g · Hábitat marciano",
    short: "Marte háb.",
    g: 0.38,
    psi: 8,
    o2: 30,
    diluent: "CO2",
    flow: 5,
    crewed: true,
    note: "Presión más baja y CO₂ de capacidad calorífica alta a 8 psi: la llama se enfría y se acorta aunque sobre O₂. El CO₂ del hábitat forma parte del sistema de supresión, no solo del aire.",
    bounds: ["FLEX / FLEX-2 (dilución CO₂)", "BRE (atmósferas quietas)", "E-FIELD Flames"],
  },
  {
    id: "iss",
    label: "0 g · Cabina ISS",
    short: "ISS",
    g: 0,
    psi: 14.7,
    o2: 21,
    diluent: "N2",
    flow: 8,
    crewed: true,
    note: "Sin flotabilidad el O₂ llega solo por difusión: cúpula azul tenue anclada a la mecha, sin hollín visible y con radiación mínima. Bajo 3 cm/s de ventilación se autoextingue por sus propios productos.",
    bounds: ["BASS / BASS-II (autoextinción)", "SPICE (ducto 5–20 cm/s)", "FLEX / FLEX-2"],
  },
  {
    id: "mrsurf",
    label: "0.38 g · Superficie de Marte",
    short: "Marte sup.",
    g: 0.38,
    psi: 0.095,
    o2: 30,
    diluent: "CO2",
    flow: 2,
    crewed: false,
    note: "0.095 psi y 95 % CO₂: la cinética se ralentiza unas 100 veces respecto a la Tierra. Sin enriquecimiento local de O₂ casi nada sostiene llama; con él queda una cúpula azul pálida al borde de la extinción.",
    bounds: ["BRE (atmósferas quietas)", "FLEX-2 (dilución CO₂)"],
  },
  {
    id: "eva",
    label: "0.165 g · Traje EVA",
    short: "Traje EVA",
    g: 0.165,
    psi: 4.3,
    o2: 100,
    diluent: "N2",
    flow: 2,
    crewed: true,
    note: "100 % O₂ a 4.3 psi. La presión es baja pero no hay diluyente: temperatura alta y límites de inflamabilidad amplísimos. Es el ambiente del Apollo 1 y la razón del pre-breathe contra la descompresión.",
    bounds: ["CFI-G (hasta 85 % O₂)", "BASS-II (límites en O₂ alto)"],
  },
];

/* ==================================================================
   3. DATOS: COMBUSTIBLES
   ================================================================== */

const FUELS: Fuel[] = [
  { id: "candle", label: "Vela de parafina", soot: 1.0, limit: 0.9, kind: "candle", note: "Referencia doméstica; hollín máximo, punta oscura." },
  { id: "heptane", label: "Gota de heptano", soot: 0.85, limit: 0.85, kind: "drop", note: "Líquido de FLEX / FLEX-2 / CFI (MDCA)." },
  { id: "methanol", label: "Gota de metanol", soot: 0.12, limit: 1.05, kind: "drop", note: "Casi sin hollín: azul incluso a 1 g." },
  { id: "pmma", label: "Placa PMMA", soot: 0.7, limit: 0.95, kind: "solid", note: "Termoplástico de BASS / Saffire." },
  { id: "cotton", label: "Tela de algodón", soot: 0.5, limit: 0.72, kind: "solid", note: "Textil de Saffire; límite bajo." },
  { id: "nomex", label: "Tela Nomex", soot: 0.55, limit: 1.18, kind: "solid", note: "Ignífugo; límite alto, referencia de prevención." },
  { id: "propane", label: "Propano", soot: 0.35, limit: 0.58, kind: "gas", note: "Gas de CFI-G y BRE." },
  { id: "ethylene", label: "Etileno", soot: 0.9, limit: 0.5, kind: "gas", note: "Muy reactivo; límite mínimo." },
];

/* ==================================================================
   4. DATOS: CATÁLOGO PSI
   ================================================================== */

const INVESTIGATIONS: Investigation[] = [
  {
    id: "bass", name: "BASS", full: "Burning and Suppression of Solids",
    phase: "flammability", hardware: "MSG · ducto SPICE",
    fuels: ["cotton", "pmma", "nomex"], sensors: ["video HD", "termopares", "anemómetro"],
    conditions: "Sólidos en flujo forzado 0–25 cm/s, 0 g, 21 % O₂",
    finding: "Sin flujo, las muestras se autoextinguen por acumulación de productos. Con 5–20 cm/s arden y propagan.",
    relevance: { iss: 10, lunar: 6, mars: 5, eva: 4, mrsurf: 2, earth: 5 }, evidence: 5, status: "complete",
  },
  {
    id: "bass2", name: "BASS-II", full: "Burning and Suppression of Solids II",
    phase: "flammability", hardware: "MSG · ducto SPICE",
    fuels: ["pmma", "cotton", "nomex"], sensors: ["radiometría", "termopares", "video"],
    conditions: "Barrido amplio de flujo y O₂ sobre sólidos, 0 g",
    finding: "Amplió el mapa de límites: la ventilación mínima de sostenimiento cae al subir el O₂ disponible.",
    relevance: { iss: 9, lunar: 8, mars: 6, eva: 7, mrsurf: 2, earth: 4 }, evidence: 5, status: "complete",
  },
  {
    id: "saffire1", name: "Saffire-I", full: "Spacecraft Fire Safety Demonstration I",
    phase: "flammability", hardware: "Cygnus · módulo autónomo",
    fuels: ["cotton", "pmma"], sensors: ["CO", "CO₂", "O₂", "humo", "flujo multipunto"],
    conditions: "Panel de 0.4 × 1.0 m, 0 g, gran volumen",
    finding: "Primera propagación a escala real de cabina: la llama alcanza régimen estacionario lejos de las paredes.",
    relevance: { iss: 8, lunar: 7, mars: 6, eva: 3, mrsurf: 2, earth: 6 }, evidence: 5, status: "complete",
  },
  {
    id: "saffire2", name: "Saffire-II", full: "Spacecraft Fire Safety Demonstration II",
    phase: "flammability", hardware: "Cygnus · módulo autónomo",
    fuels: ["nomex", "cotton"], sensors: ["CO", "CO₂", "O₂", "humo"],
    conditions: "Nueve muestras, 0 g, atmósfera de cabina",
    finding: "Comparó materiales de uso real; el Nomex confirma su límite alto frente al algodón.",
    relevance: { iss: 8, lunar: 8, mars: 6, eva: 4, mrsurf: 2, earth: 6 }, evidence: 4, status: "complete",
  },
  {
    id: "saffire3", name: "Saffire-III", full: "Spacecraft Fire Safety Demonstration III",
    phase: "flammability", hardware: "Cygnus · módulo autónomo",
    fuels: ["pmma", "cotton"], sensors: ["CO", "CO₂", "O₂", "humo", "radiometría"],
    conditions: "Presión reducida y O₂ elevado, 0 g",
    finding: "Acercó la demostración a atmósferas de hábitat: el O₂ alto domina sobre la presión en el límite.",
    relevance: { iss: 7, lunar: 9, mars: 7, eva: 8, mrsurf: 3, earth: 4 }, evidence: 4, status: "complete",
  },
  {
    id: "same", name: "SAME", full: "Smoke and Aerosol Measurement Experiment",
    phase: "detection", hardware: "MSG · cámara de aerosoles",
    fuels: ["cotton", "pmma"], sensors: ["fotómetro", "espectrómetro", "impactores"],
    conditions: "Humo generado por pirolisis, 0 g",
    finding: "El humo en 0 g no asciende: se dispersa por la ventilación. Caracterizó tamaño y distribución de partículas.",
    relevance: { iss: 10, lunar: 7, mars: 6, eva: 4, mrsurf: 3, earth: 5 }, evidence: 5, status: "complete",
  },
  {
    id: "samer", name: "SAME-R", full: "Smoke and Aerosol Measurement Experiment Refight",
    phase: "detection", hardware: "MSG · cámara de aerosoles",
    fuels: ["cotton", "pmma"], sensors: ["fotómetro", "espectrómetro"],
    conditions: "Repetición con mayor resolución, 0 g",
    finding: "Reprodujo y refinó SAME; base de la discriminación humo real contra polvo.",
    relevance: { iss: 9, lunar: 7, mars: 6, eva: 4, mrsurf: 4, earth: 6 }, evidence: 4, status: "complete",
  },
  {
    id: "daft", name: "DAFT", full: "Dust and Aerosol Measurement Feasibility Test",
    phase: "detection", hardware: "MSG · sensor reutilizado",
    fuels: [], sensors: ["contador de partículas P-Trak"],
    conditions: "Polvo ambiental, 0 g",
    finding: "El mismo instrumento de SAME sirvió para cuantificar polvo: riesgo de falsa alarma en cabina.",
    relevance: { iss: 8, lunar: 9, mars: 8, eva: 3, mrsurf: 5, earth: 6 }, evidence: 4, status: "complete",
  },
  {
    id: "daft2", name: "DAFT-2", full: "Dust and Aerosol Measurement Feasibility Test 2",
    phase: "detection", hardware: "MSG · sensor reutilizado",
    fuels: [], sensors: ["contador de partículas", "video"],
    conditions: "Polvo lunar simulado, 0 g",
    finding: "Cuantificó la interferencia del regolito en detectores ópticos antes de un hábitat lunar.",
    relevance: { iss: 7, lunar: 10, mars: 8, eva: 3, mrsurf: 6, earth: 5 }, evidence: 4, status: "complete",
  },
  {
    id: "flex", name: "FLEX", full: "Flame Extinguishment Experiment",
    phase: "suppression", hardware: "CIR · MDCA",
    fuels: ["heptane", "methanol"], sensors: ["radiometría", "cámara UV/OH*", "interferometría"],
    conditions: "Gotas en caída libre, dilución con CO₂ y He, 0 g",
    finding: "La dilución reduce la temperatura de llama bajo el umbral de extinción: base cuantitativa del supresor gaseoso.",
    relevance: { iss: 10, lunar: 8, mars: 9, eva: 7, mrsurf: 6, earth: 5 }, evidence: 5, status: "complete",
  },
  {
    id: "flex2", name: "FLEX-2", full: "Flame Extinguishment Experiment 2",
    phase: "suppression", hardware: "CIR · MDCA",
    fuels: ["heptane", "methanol"], sensors: ["radiometría", "cámara UV/OH*", "cromatografía"],
    conditions: "Barrido de diluyente y flujo relativo, 0 g",
    finding: "Cuantificó el blow-off y el límite de extinción por dilución; referencia para dimensionar supresión.",
    relevance: { iss: 10, lunar: 8, mars: 9, eva: 6, mrsurf: 7, earth: 5 }, evidence: 5, status: "complete",
  },
  {
    id: "cfi", name: "CFI", full: "Cool Flames Investigation",
    phase: "flammability", hardware: "CIR · MDCA",
    fuels: ["heptane", "methanol"], sensors: ["radiometría", "cámara UV/OH*"],
    conditions: "Gotas en régimen de llama fría, 0 g",
    finding: "Documentó combustión sin llama visible: riesgo de ignición latente que los detectores ópticos no ven.",
    relevance: { iss: 9, lunar: 7, mars: 6, eva: 5, mrsurf: 4, earth: 4 }, evidence: 4, status: "complete",
  },
  {
    id: "cfig", name: "CFI-G", full: "Cool Flames Investigation with Gases",
    phase: "flammability", hardware: "CIR · ACME · quemador esférico",
    fuels: ["propane"], sensors: ["radiometría", "cámara UV/OH*", "termopares"],
    conditions: "O₂ hasta 85 %, llama invertida de dentro hacia fuera, 0 g",
    finding: "Las concentraciones de O₂ más altas del programa PSI. Extiende el límite superior de inflamabilidad medido.",
    relevance: { iss: 7, lunar: 10, mars: 8, eva: 10, mrsurf: 5, earth: 3 }, evidence: 5, status: "complete",
  },
  {
    id: "bre", name: "BRE", full: "Burning Rate Emulator",
    phase: "flammability", hardware: "CIR · ACME",
    fuels: ["propane", "ethylene"], sensors: ["radiometría", "termopares", "balanza"],
    conditions: "Llamas gaseosas en atmósfera quieta, 0 g",
    finding: "Emula la tasa de quemado de sólidos con gas, aislando el efecto de las propiedades del material del flujo.",
    relevance: { iss: 8, lunar: 7, mars: 8, eva: 6, mrsurf: 7, earth: 5 }, evidence: 4, status: "complete",
  },
  {
    id: "spice", name: "SPICE", full: "Smoke Point In Co-flow Experiment",
    phase: "flammability", hardware: "MSG · ducto de flujo modular",
    fuels: ["propane", "ethylene"], sensors: ["anemómetro", "cámara", "fotómetro"],
    conditions: "Llamas de gas en co-flujo controlado, 0 g",
    finding: "Definió el ducto de flujo reutilizado por BASS y SLICE; midió el punto de humo en microgravedad.",
    relevance: { iss: 9, lunar: 6, mars: 6, eva: 4, mrsurf: 3, earth: 4 }, evidence: 4, status: "complete",
  },
  {
    id: "slice", name: "SLICE", full: "Structure and Liftoff In Combustion Experiment",
    phase: "flammability", hardware: "MSG · ducto de flujo modular",
    fuels: ["propane", "ethylene"], sensors: ["cámara de alta velocidad", "termopares"],
    conditions: "Llamas de gas en co-flujo, 0 g",
    finding: "Caracterizó estructura y desprendimiento de llama: geometría de referencia para modelos de propagación.",
    relevance: { iss: 7, lunar: 6, mars: 6, eva: 3, mrsurf: 3, earth: 5 }, evidence: 3, status: "complete",
  },
  {
    id: "efield", name: "E-FIELD Flames", full: "Electric-Field Effects on Laminar Diffusion Flames",
    phase: "flammability", hardware: "CIR · ACME",
    fuels: ["propane", "ethylene"], sensors: ["cámara", "radiometría", "sonda de iones"],
    conditions: "Campo eléctrico sobre iones de llama, 0 g",
    finding: "El campo iónico imita el efecto de la gravedad parcial: única vía PSI para acotar Luna y Marte hoy.",
    relevance: { iss: 8, lunar: 10, mars: 10, eva: 6, mrsurf: 6, earth: 3 }, evidence: 5, status: "complete",
  },
  {
    id: "luci", name: "LUCI", full: "Lunar-g Combustion Investigation",
    phase: "flammability", hardware: "Por definir · superficie lunar",
    fuels: ["cotton", "pmma"], sensors: ["cámara", "radiometría"],
    conditions: "0.165 g real en superficie lunar",
    finding: "Primera medición de inflamabilidad a gravedad lunar real. Aún sin datos en PSI.",
    relevance: { iss: 5, lunar: 10, mars: 6, eva: 5, mrsurf: 8, earth: 3 }, evidence: 2, status: "future",
  },
  {
    id: "fm2", name: "FM2", full: "Flammability of Materials on the Moon",
    phase: "flammability", hardware: "Por definir · superficie lunar",
    fuels: ["cotton", "nomex"], sensors: ["cámara", "termopares"],
    conditions: "Materiales reales a 0.165 g y O₂ lunar",
    finding: "Cerrará el hueco de datos partial-g. Aún sin datos en PSI.",
    relevance: { iss: 5, lunar: 10, mars: 7, eva: 7, mrsurf: 8, earth: 3 }, evidence: 2, status: "future",
  },
];

/* ==================================================================
   5. MOTOR FÍSICO
   ================================================================== */

const DILUENT_FACTOR: Record<Diluent, number> = { N2: 1, CO2: 0.6, He: 0.82, Ar: 0.9 };
const EARTH_PPO2 = 3.07;

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const smoothstep = (a: number, b: number, x: number) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

function derive(
  env: EnvProfile,
  fuel: Fuel,
  s: ChamberState,
  sup: boolean,
  ef: boolean,
  inv: boolean
): Metrics {
  const ppO2 = s.psi * (s.o2 / 100);
  const rO2 = clamp(ppO2 / EARTH_PPO2, 0, 2);
  const pressureFactor = clamp(Math.pow(s.psi / 14.7, 0.33), 0.16, 1.1);
  const diluentFactor = DILUENT_FACTOR[env.diluent];
  const limit = fuel.limit * (diluentFactor < 0.7 ? 1.55 : 1);
  const blowoff = 26 * (0.4 + rO2) * (ef ? 1.6 : 1);
  const buoyancy = clamp(s.g * 1.15, 0, 1);

  let reaction =
    rO2 *
    pressureFactor *
    diluentFactor *
    (1 + 0.055 * s.flow) *
    (0.55 + 0.45 * clamp(s.g * 3 + 0.35, 0, 1));
  if (ef) reaction *= 1.08;
  if (inv) reaction *= 1.05;

  let cause: string | null = null;
  if (sup) cause = "Dilución supresora CO₂ / He (FLEX)";
  else if (ppO2 < limit) cause = "pO₂ por debajo del límite de inflamabilidad";
  else if (s.g < 0.02 && s.flow < 3) cause = "Autoextinción por productos a 0 g sin ventilación (BASS)";
  else if (s.flow > blowoff) cause = "Blow-off: el flujo desprende la llama";
  else if (reaction < 0.1) cause = "Cinética insuficiente a esta presión";

  const extinguished = cause !== null;
  const tempK = extinguished
    ? 320
    : Math.round(320 + (1750 * clamp(reaction, 0, 1.6) / 1.6) * (0.7 + 0.3 * clamp(s.o2 / 30, 0, 1)));

  let soot = clamp(
    fuel.soot *
      (0.22 + 0.78 * clamp(s.g * 2.5, 0, 1)) *
      (0.42 + rO2 * 0.72) *
      (s.psi > 1 ? 1 : 0.42),
    0,
    1
  );
  if (ef) soot *= 0.45;

  const spread = extinguished
    ? 0
    : +(0.05 + 1.1 * rO2 * pressureFactor * diluentFactor * (1 + s.flow / 40)).toFixed(2);

  const margin = Math.round(((ppO2 - limit) / limit) * 100);

  const verdict: Verdict = extinguished
    ? { label: "Extinguido", tone: "text-rose-300 border-rose-500/60", rank: 0 }
    : margin < 25
    ? { label: "Marginal", tone: "text-amber-300 border-amber-500/60", rank: 1 }
    : margin < 90
    ? { label: "Inflamable", tone: "text-emerald-300 border-emerald-500/60", rank: 2 }
    : { label: "Muy inflamable", tone: "text-red-300 border-red-500/60", rank: 3 };

  return {
    env, fuel, ppO2, rO2, pressureFactor, diluentFactor, reaction, extinguished, cause,
    tempK, soot, spread, margin, limit, blowoff, buoyancy, verdict,
  };
}

/* --- ranking de ambientes por margen invertido --- */
function rankEnvironments(fuel: Fuel, sup: boolean, ef: boolean) {
  return ENVIRONMENTS.map((env) => {
    const s: ChamberState = { env: env.id, o2: env.o2, psi: env.psi, g: env.g, flow: env.flow };
    const m = derive(env, fuel, s, sup, ef, false);
    return { env, m };
  }).sort((a, b) => b.m.margin - a.m.margin);
}

/* --- ranking de investigaciones por ambiente --- */
function rankInvestigations(envId: string, fuel: Fuel) {
  return INVESTIGATIONS.map((inv) => {
    let score = inv.relevance[envId] ?? 0;
    if (inv.fuels.includes(fuel.id)) score += 3;
    score += inv.evidence;
    if (inv.status === "future") score -= 2;
    return { inv, score };
  }).sort((a, b) => b.score - a.score);
}

/* ==================================================================
   6. RENDER: TABLA DE COLOR
   ================================================================== */

const HW = 112;
const HH = 80;

function buildLUT(soot: number): Uint8ClampedArray {
  const out = new Uint8ClampedArray(256 * 4);
  const band = 0.06 + 0.52 * (1 - soot);
  const dim = 0.72 + 0.28 * soot;

  for (let i = 0; i < 256; i++) {
    const t = i / 255;
    let r: number, g: number, b: number, a: number;

    if (t < band) {
      const k = t / band;
      r = 6 + 34 * k * k;
      g = 14 + 130 * Math.pow(k, 1.6);
      b = 46 + 200 * Math.pow(k, 0.85);
      a = 200 * Math.pow(k, 0.8) * dim;
    } else {
      const k = (t - band) / (1 - band);
      if (k < 0.3) { const u = k / 0.3; r = 95 + 140 * u; g = 40 + 70 * u; b = 230 - 190 * u; a = 205 + 35 * u; }
      else if (k < 0.62) { const u = (k - 0.3) / 0.32; r = 235 + 20 * u; g = 110 + 80 * u; b = 40 + 40 * u; a = 240; }
      else if (k < 0.85) { const u = (k - 0.62) / 0.23; r = 255; g = 190 + 45 * u; b = 80 + 90 * u; a = 248; }
      else { const u = (k - 0.85) / 0.15; r = 255; g = 235 + 20 * u; b = 170 + 82 * u; a = 252; }
    }
    out[i * 4] = r;
    out[i * 4 + 1] = g;
    out[i * 4 + 2] = b;
    out[i * 4 + 3] = clamp(a, 0, 255);
  }
  return out;
}

/* ==================================================================
   7. RENDER: SILUETA DE LLAMA
   ================================================================== */

interface FlameGeometry {
  cx: number;
  cy: number;
  rx: number;
  ry: number;
  intensity: number;
  flicker: number;
}

function flameGeometry(m: Metrics, W: number, H: number, scale: number): FlameGeometry {
  const R = 4.2 + 15 * clamp(m.reaction, 0, 1.45);
  const b = m.buoyancy;
  return {
    cx: (W / 2) * scale,
    cy: (H - 46) * scale,
    rx: R * (1.55 - 0.55 * b) * scale * 2.4,
    ry: R * (0.72 + 1.6 * b) * scale * 2.4,
    intensity: m.soot < 0.35 ? 95 + 240 * clamp(m.reaction, 0, 1.4) : 130 + 430 * clamp(m.reaction, 0, 1.4),
    flicker: 0.055 + 0.1 * b,
  };
}

function paintFlame(
  heat: Uint8ClampedArray,
  m: Metrics,
  geo: FlameGeometry,
  t: number,
  ign: number
) {
  const b = m.buoyancy;
  const { cx, cy, rx, ry, intensity, flicker } = geo;

  for (let y = 0; y < HH; y++) {
    for (let x = 0; x < HW; x++) {
      const nx = (x - cx) / rx;
      const ny = (cy - y) / ry;
      const idx = y * HW + x;

      if (ny < 0 || ny > 1.18) { heat[idx] = 0; continue; }

      const width =
        b > 0.12
          ? Math.sqrt(clamp(ny, 0.001, 1)) * Math.pow(1 - clamp(ny, 0, 1), 0.42) * 1.12
          : Math.sqrt(Math.max(0, 1 - Math.pow(clamp(ny, 0, 1.05), 2)));

      const inside = 1 - Math.abs(nx) / Math.max(width, 0.001);

      if (inside < 0) {
        heat[idx] = inside > -0.55 ? (10 + 22 * m.reaction) * ign : 0;
        continue;
      }

      let v = Math.pow(clamp(inside, 0, 1), 0.62);
      v *= 1 - 0.45 * smoothstep(0.62, 1.05, ny) * m.soot;
      v *= 1 + 1.15 * m.soot * Math.exp(-Math.pow((ny - 0.26) / 0.2, 2));
      v *= 1 + Math.sin(nx * 4.1 + t * 9) * flicker + Math.sin(ny * 11 - t * 6.5) * flicker * 0.6;
      v *= ign;
      heat[idx] = clamp(v * intensity, 0, 255);
    }
  }

  // anillo azul de base: solo con hollín y gravedad suficiente
  if (m.soot > 0.45 && b > 0.25) {
    for (let x = -9; x <= 9; x++) {
      const xx = Math.round(cx + x);
      const yy = Math.round(cy - Math.abs(x) * 0.18);
      if (xx >= 0 && xx < HW && yy >= 0 && yy < HH) {
        heat[yy * HW + xx] = Math.max(heat[yy * HW + xx], 150 * ign);
      }
    }
  }
}

/* ==================================================================
   8. COMPONENTE: CÁMARA
   ================================================================== */

interface ChamberProps {
  side: "A" | "B";
  metrics: Metrics;
  state: ChamberState;
  sup: boolean;
  ef: boolean;
  inv: boolean;
  drop: number;
  onEnv: (id: string) => void;
  onSlider: (k: keyof ChamberState, v: number) => void;
  onFocus: (side: "A" | "B") => void;
  focused: boolean;
}

function Chamber(props: ChamberProps) {
  const { side, metrics, state, onEnv, onSlider, onFocus, focused } = props;
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // El bucle de dibujo lee siempre las props más recientes desde esta ref.
  const latest = useRef(props);
  useEffect(() => {
    latest.current = props;
  });

  // El bucle se monta UNA sola vez. Antes dependía de `drop`, que cambia cada
  // 70 ms, y eso reiniciaba la llama, la ignición y las partículas sin parar.
  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    const heat = new Uint8ClampedArray(HW * HH);
    const colCv = document.createElement("canvas");
    colCv.width = HW;
    colCv.height = HH;
    const colCtx = colCv.getContext("2d");
    if (!colCtx) return;
    const colImg = colCtx.createImageData(HW, HH);

    let W = 0;
    let H = 0;
    let raf = 0;
    let last = performance.now();
    let t = 0;
    let ign = 0;

    const SM: { x: number; y: number; vx: number; vy: number; l: number; ml: number; s: number }[] = [];
    const P: { x: number; y: number; vx: number; vy: number; l: number; ml: number }[] = [];

    const resize = () => {
      const rect = canvas.parentElement?.getBoundingClientRect();
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      W = rect?.width ?? 300;
      H = rect?.height ?? 212;
      canvas.width = Math.round(W * dpr);
      canvas.height = Math.round(H * dpr);
      canvas.style.width = `${W}px`;
      canvas.style.height = `${H}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.imageSmoothingEnabled = true;
    };
    resize();
    window.addEventListener("resize", resize);

    // El sidebar o el cambio de pestaña pueden cambiar el ancho sin evento resize.
    let observer: ResizeObserver | null = null;
    if (typeof ResizeObserver !== "undefined" && canvas.parentElement) {
      observer = new ResizeObserver(resize);
      observer.observe(canvas.parentElement);
    }

    const drawBackdrop = (m: Metrics) => {
      const sky =
        m.env.id === "mrsurf" ? "#1d0e07" :
        m.env.id === "mars" ? "#150e0d" :
        m.env.id === "lunar" ? "#0e1014" :
        m.env.id === "earth" ? "#080e19" : "#03050a";
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, W, H);

      if (m.env.id === "mrsurf") {
        ctx.fillStyle = "rgba(140,64,26,.2)";
        ctx.beginPath();
        ctx.moveTo(0, H - 50);
        ctx.lineTo(W * 0.32, H - 80);
        ctx.lineTo(W * 0.64, H - 56);
        ctx.lineTo(W, H - 86);
        ctx.lineTo(W, H - 50);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = "rgba(200,120,64,.09)";
        ctx.fillRect(0, H - 50, W, 50);
      }

      if (m.env.id === "iss" || m.env.id === "eva") {
        for (let i = 0; i < 40; i++) {
          const x = (i * 97.3) % W;
          const y = (i * 61.7) % H;
          ctx.fillStyle = `rgba(180,205,255,${0.05 + ((i * 13) % 6) / 110})`;
          ctx.fillRect(x, y, 1, 1);
        }
      }

      ctx.strokeStyle = "rgba(148,163,184,.045)";
      for (let x = 0; x < W; x += 44) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
      for (let y = 0; y < H; y += 44) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
    };

    const drawHardware = (m: Metrics, drop: number) => {
      const bx = W / 2;
      const by = H - 46;

      ctx.fillStyle = "rgba(71,85,105,.55)";
      ctx.fillRect(0, 0, 4, H);
      ctx.fillRect(W - 4, 0, 4, H);
      ctx.fillStyle = "#334155";
      ctx.fillRect(bx - 28, by + 6, 56, 8);
      ctx.fillStyle = "#475569";
      ctx.fillRect(bx - 20, by, 40, 6);

      const k = m.fuel.kind;
      if (k === "candle") {
        ctx.fillStyle = "#e7e5e4";
        ctx.fillRect(bx - 5.5, by - 24, 11, 26);
        ctx.fillStyle = "#cfccc9";
        ctx.fillRect(bx - 5.5, by - 24, 3.5, 26);
        ctx.fillStyle = "#292524";
        ctx.fillRect(bx - 0.5, by - 29, 1.4, 6);
      } else if (k === "drop") {
        const r = Math.max(1, 9 * drop);
        const grad = ctx.createRadialGradient(bx - 2, by - r * 1.3, 0.5, bx, by - r * 1.1, r * 1.5);
        grad.addColorStop(0, "#fef9c3");
        grad.addColorStop(1, "#a16207");
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.ellipse(bx, by - r * 1.1, r * 0.8, r, 0, 0, Math.PI * 2);
        ctx.fill();
      } else if (k === "solid") {
        ctx.fillStyle = "#94a3b8";
        ctx.fillRect(bx - 8, by - 38, 16, 40);
        ctx.fillStyle = "#1c1917";
        ctx.fillRect(bx - 8, by - 38, 16, 40 * clamp(0.2 + m.soot * 0.55, 0, 0.8));
        ctx.fillStyle = "#78716c";
        ctx.fillRect(bx - 8, by - 38, 16, 1.5);
      } else {
        ctx.fillStyle = "#64748b";
        ctx.beginPath();
        ctx.moveTo(bx - 6, by + 6);
        ctx.lineTo(bx - 2, by - 3);
        ctx.lineTo(bx + 2, by - 3);
        ctx.lineTo(bx + 6, by + 6);
        ctx.closePath();
        ctx.fill();
      }

      // sonda de termopar
      ctx.strokeStyle = "rgba(148,163,184,.5)";
      ctx.beginPath();
      ctx.moveTo(W - 26, H - 92);
      ctx.lineTo(W - 26, H - 62);
      ctx.stroke();
      ctx.fillStyle = "rgba(148,163,184,.7)";
      ctx.beginPath();
      ctx.arc(W - 26, H - 60, 1.8, 0, Math.PI * 2);
      ctx.fill();
    };

    const drawOverlays = (st: ChamberState, efOn: boolean, invOn: boolean) => {
      if (invOn) {
        ctx.strokeStyle = "rgba(125,211,252,.7)";
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.arc(W / 2, H - 49, 13, 0, Math.PI * 2);
        ctx.stroke();
      }
      if (efOn) {
        ctx.strokeStyle = "rgba(168,85,247,.22)";
        ctx.lineWidth = 1;
        for (let x = W / 2 - 42; x <= W / 2 + 42; x += 11) {
          ctx.beginPath();
          ctx.moveTo(x, 8);
          ctx.lineTo(x, H - 54);
          ctx.stroke();
        }
      }
      if (st.flow > 0) {
        ctx.strokeStyle = "rgba(45,212,191,.35)";
        ctx.lineWidth = 1;
        [38, H - 82].forEach((y) => {
          const len = 12 + st.flow * 1.7;
          ctx.beginPath(); ctx.moveTo(10, y); ctx.lineTo(10 + len, y); ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(10 + len - 4, y - 2.6);
          ctx.lineTo(10 + len, y);
          ctx.lineTo(10 + len - 4, y + 2.6);
          ctx.stroke();
        });
      }
    };

    const stepParticles = (m: Metrics, st: ChamberState, dt: number) => {
      const bx = W / 2;
      const by = H - 46;
      const buoy = 300 * st.g * (0.45 + 0.55 * clamp(st.psi / 10, 0, 1));

      if (!m.extinguished && ign > 0.35) {
        if (Math.random() < clamp(m.reaction * 0.5, 0, 0.55) * m.soot) {
          P.push({
            x: bx + (Math.random() - 0.5) * 10,
            y: by - 6 - Math.random() * 22,
            vx: (Math.random() - 0.5) * 14,
            vy: -20 - Math.random() * 35,
            l: 0,
            ml: 0.5 + Math.random() * 0.6,
          });
        }
        if (m.soot > 0.4 && Math.random() < 0.55) {
          SM.push({
            x: bx + (Math.random() - 0.5) * 10,
            y: by - 30 - Math.random() * 26,
            vx: (Math.random() - 0.5) * 8,
            vy: -14,
            l: 0,
            ml: 1.6 + Math.random(),
            s: 5 + Math.random() * 7,
          });
        }
      }

      for (let i = P.length - 1; i >= 0; i--) {
        const q = P[i];
        q.l += dt;
        if (q.l > q.ml) { P.splice(i, 1); continue; }
        q.vy -= buoy * 0.5 * dt;
        q.vx += st.flow * 2 * dt;
        q.x += q.vx * dt;
        q.y += q.vy * dt;
      }

      for (let i = SM.length - 1; i >= 0; i--) {
        const q = SM[i];
        q.l += dt;
        if (q.l > q.ml) { SM.splice(i, 1); continue; }
        q.vy -= buoy * 0.4 * dt;
        q.vx += st.flow * 1.2 * dt + (Math.random() - 0.5) * 10 * dt;
        q.x += q.vx * dt;
        q.y += q.vy * dt;
        q.s += dt * 5;
      }
    };

    const composite = (m: Metrics, supOn: boolean) => {
      const L = buildLUT(m.soot);
      const out = colImg.data;
      for (let i = 0, j = 0; i < heat.length; i++, j += 4) {
        const v = heat[i];
        if (!v) { out[j + 3] = 0; continue; }
        const o = v * 4;
        out[j] = L[o];
        out[j + 1] = L[o + 1];
        out[j + 2] = L[o + 2];
        out[j + 3] = L[o + 3];
      }
      colCtx.putImageData(colImg, 0, 0);

      if (ign > 0.02) {
        const halo = ctx.createRadialGradient(W / 2, H - 52, 4, W / 2, H - 52, W * 0.5);
        halo.addColorStop(0, `rgba(255,150,60,${(0.05 + 0.1 * m.soot) * ign})`);
        halo.addColorStop(1, "rgba(255,150,60,0)");
        ctx.fillStyle = halo;
        ctx.fillRect(0, 0, W, H);
      }

      ctx.globalCompositeOperation = "lighter";
      ctx.drawImage(colCv, 0, 0, W, H);
      ctx.globalCompositeOperation = "source-over";

      for (const q of SM) {
        ctx.fillStyle = `rgba(20,17,15,${(1 - q.l / q.ml) * 0.16})`;
        ctx.beginPath();
        ctx.arc(q.x, q.y, q.s, 0, Math.PI * 2);
        ctx.fill();
      }
      for (const q of P) {
        ctx.fillStyle = `rgba(255,190,90,${(1 - q.l / q.ml) * 0.6})`;
        ctx.fillRect(q.x, q.y, 1.4, 1.4);
      }

      if (supOn) {
        ctx.fillStyle = "rgba(20,184,166,.07)";
        ctx.fillRect(0, 0, W, H);
        ctx.strokeStyle = "rgba(45,212,191,.4)";
        ctx.setLineDash([4, 4]);
        ctx.strokeRect(6, 6, W - 14, H - 14);
        ctx.setLineDash([]);
      }
    };

    const frame = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      t += dt;

      const p = latest.current;
      const m = p.metrics;
      const st = p.state;

      // Transitorio: la llama crece al encender y se apaga del todo al extinguirse.
      if (m.extinguished) ign = Math.max(0, ign - dt * 4);
      else ign = Math.min(1, ign + dt * 1.6);

      drawBackdrop(m);
      drawHardware(m, p.drop);
      drawOverlays(st, p.ef, p.inv);
      stepParticles(m, st, dt);

      for (let i = 0; i < heat.length; i++) heat[i] *= 0.86;
      if (ign > 0.02) {
        paintFlame(heat, m, flameGeometry(m, W, H, HW / W), t, ign);
      }
      composite(m, p.sup);

      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      observer?.disconnect();
    };
  }, []);

  const m = metrics;

  return (
    <div
      className={`space-y-1.5 rounded-xl transition ${focused ? "ring-1 ring-teal-400/50 p-1.5" : ""}`}
      onClick={() => onFocus(side)}
    >
      <div className="flex items-center gap-1.5">
        <span className="font-hud text-[11px] text-slate-400 w-3">{side}</span>
        <label htmlFor={`chamber-env-${side}`} className="sr-only">
          Ambiente de la cámara {side}
        </label>
        <select
          id={`chamber-env-${side}`}
          value={state.env}
          onChange={(e) => onEnv(e.target.value)}
          className="flex-1 px-1.5 py-1 rounded-md bg-slate-950 border border-slate-800 font-hud text-xs text-slate-200 cursor-pointer"
        >
          {ENVIRONMENTS.map((e) => (
            <option key={e.id} value={e.id}>{e.label}</option>
          ))}
        </select>
      </div>

      <div className="relative h-56 rounded-lg overflow-hidden border border-slate-800 bg-[#03050a]">
        <canvas ref={canvasRef} className="block" />
        <div className="absolute left-2 top-1.5 font-hud text-[11px] text-cyan-300/80">
          {state.psi.toFixed(2)} psi · {state.o2.toFixed(0)}% O₂ · {m.env.diluent} · {state.g.toFixed(2)} g
        </div>
        <span className={`absolute right-1.5 top-1.5 px-1.5 py-0.5 rounded-full border font-hud text-[11px] bg-slate-950/60 ${m.verdict.tone}`}>
          {m.verdict.label}
        </span>
        {m.extinguished && m.cause && (
          <div className="absolute inset-x-0 bottom-12 text-center font-hud text-[11px] text-rose-300 px-2">
            {m.cause}
          </div>
        )}
        <div className="absolute right-1.5 bottom-1.5 flex items-center gap-1 font-hud text-[10px] text-slate-400">
          <Thermometer className="w-3 h-3" />
          {m.extinguished ? "—" : `${m.tempK} K`}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-1">
        {[
          { k: "pO₂ (psi)", v: m.ppO2.toFixed(2), warn: m.ppO2 < m.limit },
          { k: "límite (psi)", v: m.limit.toFixed(2), warn: false },
          { k: "propag. (mm/s)", v: m.extinguished ? "0" : `${m.spread}`, warn: false },
        ].map((c) => (
          <div key={c.k} className="px-1.5 py-1 rounded-md border border-slate-800 bg-slate-950">
            <div className="font-hud text-[10px] text-slate-400">{c.k}</div>
            <div className={`font-hud text-[13px] font-bold ${c.warn ? "text-rose-300" : "text-cyan-200"}`}>{c.v}</div>
          </div>
        ))}
      </div>

      <div className="space-y-1 pt-0.5">
        {([
          ["o2", "O₂ %", 5, 100, 1, (v: number) => `${v.toFixed(0)}%`],
          ["psi", "presión psi", 0.05, 20, 0.05, (v: number) => v.toFixed(2)],
          ["g", "gravedad g", 0, 1, 0.01, (v: number) => v.toFixed(2)],
          ["flow", "flujo cm/s", 0, 40, 1, (v: number) => `${v}`],
        ] as const).map(([key, lab, min, max, step, fmt]) => (
          <div key={key}>
            <label
              htmlFor={`chamber-${side}-${key}`}
              className="flex justify-between font-hud text-[11px]"
            >
              <span className="text-slate-400">{lab}</span>
              <span className="text-teal-300">{fmt(state[key])}</span>
            </label>
            <input
              id={`chamber-${side}-${key}`}
              type="range"
              min={min}
              max={max}
              step={step}
              value={state[key]}
              onChange={(e) => onSlider(key, Number(e.target.value))}
              className="w-full accent-teal-400 h-1.5 bg-slate-800 rounded cursor-pointer"
            />
          </div>
        ))}
        <p className="font-hud text-[10px] text-slate-400">
          blow-off sobre {m.blowoff.toFixed(0)} cm/s
        </p>
      </div>
    </div>
  );
}

/* ==================================================================
   9. LABORATORIO
   ================================================================== */

export function MissionScienceLab({ initialEnvironment, embedded = false }: Props) {
  const [open, setOpen] = useState(embedded);
  const [tab, setTab] = useState<LabTab>("chamber");
  const [fuelId, setFuelId] = useState("candle");
  const [sup, setSup] = useState(false);
  const [ef, setEf] = useState(false);
  const [inv, setInv] = useState(false);
  const [focus, setFocus] = useState<"A" | "B">("A");

  const startId =
    initialEnvironment === "lunar" ? "lunar" :
    initialEnvironment === "mars" ? "mars" :
    initialEnvironment === "eva" ? "eva" : "iss";

  const mk = useCallback((id: string): ChamberState => {
    const e = ENVIRONMENTS.find((x) => x.id === id) ?? ENVIRONMENTS[3];
    return { env: e.id, o2: e.o2, psi: e.psi, g: e.g, flow: e.flow };
  }, []);

  const [A, setA] = useState<ChamberState>(() => mk("earth"));
  const [B, setB] = useState<ChamberState>(() => mk(startId));
  const [dropA, setDropA] = useState(1);
  const [dropB, setDropB] = useState(1);

  const fuel = useMemo(() => FUELS.find((f) => f.id === fuelId) ?? FUELS[0], [fuelId]);
  const envA = useMemo(() => ENVIRONMENTS.find((e) => e.id === A.env) ?? ENVIRONMENTS[0], [A.env]);
  const envB = useMemo(() => ENVIRONMENTS.find((e) => e.id === B.env) ?? ENVIRONMENTS[3], [B.env]);

  const mA = useMemo(() => derive(envA, fuel, A, sup, ef, inv), [envA, fuel, A, sup, ef, inv]);
  const mB = useMemo(() => derive(envB, fuel, B, sup, ef, inv), [envB, fuel, B, sup, ef, inv]);

  const envRanking = useMemo(() => rankEnvironments(fuel, sup, ef), [fuel, sup, ef]);
  const invRanking = useMemo(
    () => rankInvestigations(focus === "A" ? A.env : B.env, fuel),
    [focus, A.env, B.env, fuel]
  );

  // Regresión de la gota: solo corre con combustibles de tipo gota y con el
  // laboratorio visible, para no re-renderizar todo 14 veces por segundo sin motivo.
  useEffect(() => {
    if (!open || fuel.kind !== "drop") return;
    const id = window.setInterval(() => {
      const step = (d: number, m: Metrics) => {
        const next = d - 0.012 * (m.extinguished ? 0.25 : 1) * (0.4 + m.reaction);
        return next <= 0.02 ? 1 : next;
      };
      setDropA((d) => step(d, mA));
      setDropB((d) => step(d, mB));
    }, 70);
    return () => window.clearInterval(id);
  }, [open, fuel.kind, mA, mB]);

  const setEnvOf = useCallback(
    (which: "A" | "B", id: string) => {
      const next = mk(id);
      if (which === "A") { setA(next); setDropA(1); }
      else { setB(next); setDropB(1); }
    },
    [mk]
  );

  const setSlider = (which: "A" | "B", k: keyof ChamberState, v: number) =>
    which === "A" ? setA((s) => ({ ...s, [k]: v })) : setB((s) => ({ ...s, [k]: v }));

  const reset = () => {
    setA(mk("earth"));
    setB(mk(startId));
    setFuelId("candle");
    setSup(false);
    setEf(false);
    setInv(false);
    setDropA(1);
    setDropB(1);
  };

  const delta = useMemo(() => {
    const sameEnv =
      A.env === B.env && A.o2 === B.o2 && A.psi === B.psi && A.g === B.g && A.flow === B.flow;
    if (sameEnv) return "Las dos columnas están en el mismo ambiente: cambia presión, O₂ o gravedad en una y aparece la diferencia.";
    if (mA.extinguished && mB.extinguished)
      return `Ningún ambiente sostiene llama con ${fuel.label}. A: ${mA.cause}. B: ${mB.cause}.`;
    if (mA.extinguished) return `A no arde (${mA.cause}); B sí, con ${mB.spread} mm/s y ${mB.tempK} K.`;
    if (mB.extinguished) return `B no arde (${mB.cause}); A sí, con ${mA.spread} mm/s y ${mA.tempK} K.`;
    const ratio = mB.spread > 0 ? mA.spread / mB.spread : 0;
    return `Δ propagación ${(mA.spread - mB.spread).toFixed(2)} mm/s (×${ratio.toFixed(1)}) · Δ T ${mA.tempK - mB.tempK} K · Δ pO₂ ${(mA.ppO2 - mB.ppO2).toFixed(2)} psi. Margen al límite: A ${mA.margin > 0 ? "+" : ""}${mA.margin} %, B ${mB.margin > 0 ? "+" : ""}${mB.margin} %.`;
  }, [mA, mB, fuel, A, B]);

  const exportJson = () => {
    const payload = {
      schema: "NASA-PSI-FireSafety-LabProfile-v4",
      generatedAt: new Date().toISOString(),
      sharedSample: {
        id: fuel.id,
        kind: fuel.kind,
        soot_index: fuel.soot,
        ppO2_limit_psi: +mA.limit.toFixed(2),
      },
      controls: { suppressant_CO2_He: sup, e_field: ef, cfi_g_inverted: inv },
      columns: [
        { side: "A", state: A, m: mA },
        { side: "B", state: B, m: mB },
      ].map(({ side, state, m }) => ({
        side,
        environment: {
          regime: m.env.label,
          gravity_g: state.g,
          pressure_psi: +state.psi.toFixed(3),
          o2_percent: state.o2,
          o2_partial_psi: +m.ppO2.toFixed(3),
          diluent: m.env.diluent,
          airflow_cm_s: state.flow,
        },
        prediction: {
          geometry: m.extinguished
            ? "none"
            : inv
            ? "inside-out spherical (CFI-G)"
            : state.g < 0.02
            ? "spherical dome diffusive (0 g)"
            : "buoyant elongated teardrop",
          peakTemp_K: m.tempK,
          spreadRate_mm_s: m.spread,
          sootIndex: +m.soot.toFixed(2),
          margin_pct: m.margin,
          extinguished: m.extinguished,
          cause: m.cause,
        },
        topInvestigations: rankInvestigations(state.env, fuel)
          .slice(0, 5)
          .map((r) => ({ id: r.inv.id, score: r.score })),
      })),
      environmentRanking: envRanking.map((r) => ({
        env: r.env.id,
        margin_pct: r.m.margin,
        extinguished: r.m.extinguished,
      })),
    };

    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" }));
    a.download = `psi-lab-${fuel.id}-${A.env}-vs-${B.env}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const TABS = [
    { id: "chamber", label: "1. Cámara A/B", icon: Flame },
    { id: "ranking", label: "2. Ranking de ambientes", icon: ListOrdered },
    { id: "matrix", label: "3. Matriz comparativa", icon: Grid3x3 },
    { id: "catalog", label: "4. Catálogo PSI", icon: BookOpen },
    { id: "apply", label: "5. Aplicación", icon: Shield },
  ] as const;

  return (
    <>
      {/* Botón flotante: solo en modo modal */}
      {!embedded && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="fixed right-5 bottom-5 z-30 flex items-center gap-2 px-4 py-2.5 rounded-full bg-slate-950/95 border border-cyan-400/60 text-cyan-200 shadow-2xl hover:border-teal-300 transition cursor-pointer"
        >
          <Flame className="w-4 h-4 text-cyan-400" />
          <span className="font-hud text-xs font-bold tracking-wide">LAB PSI · CÁMARA A/B</span>
        </button>
      )}

      {open && (
        <div
          role={embedded ? "region" : "dialog"}
          aria-modal={embedded ? undefined : true}
          aria-label="Laboratorio de combustión comparativa NASA PSI"
          className={
            embedded
              ? "flex-1 p-3 pb-24 sm:p-4 sm:pb-24"
              : "fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-md p-3"
          }
        >
          <div
            className={`w-full flex flex-col rounded-2xl bg-slate-950 border border-slate-800 overflow-hidden ${
              embedded ? "mx-auto max-w-6xl" : "max-w-6xl max-h-[94vh] shadow-2xl"
            }`}
          >
            {/* cabecera */}
            <div className="px-4 py-3 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3 bg-slate-900/70">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-8 h-8 shrink-0 rounded-lg bg-gradient-to-br from-cyan-400 to-teal-500 flex items-center justify-center text-slate-950">
                  <Sparkles className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <h2 className="font-hud text-sm font-bold text-white">
                    LABORATORIO DE COMBUSTIÓN COMPARATIVA · NASA PSI
                  </h2>
                  <p className="text-xs text-slate-400">
                    El fuego no se dibuja: se resuelve con presión, diluyente y gravedad por columna.
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={reset}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-slate-700 font-hud text-xs text-slate-300 hover:text-white cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Reiniciar</span>
                </button>
                <button
                  type="button"
                  onClick={exportJson}
                  title="Descargar esta comparación en JSON"
                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-teal-500/20 hover:bg-teal-500/30 border border-teal-400/50 font-hud text-xs text-teal-200 cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>JSON</span>
                </button>
                {!embedded && (
                  <button
                    type="button"
                    onClick={() => setOpen(false)}
                    aria-label="Cerrar laboratorio"
                    className="p-2 rounded-lg bg-slate-900 border border-slate-700 text-slate-300 hover:text-white cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>

            {/* pestañas */}
            <div
              role="tablist"
              aria-label="Secciones del laboratorio"
              className="px-4 pt-2.5 border-b border-slate-800 flex flex-wrap gap-1.5"
            >
              {TABS.map((it) => (
                <button
                  key={it.id}
                  type="button"
                  role="tab"
                  aria-selected={tab === it.id}
                  onClick={() => setTab(it.id as LabTab)}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-t-lg font-hud text-xs font-semibold border-t border-x cursor-pointer ${
                    tab === it.id
                      ? "bg-slate-900 border-slate-700 text-cyan-300"
                      : "border-transparent text-slate-400 hover:text-slate-200"
                  }`}
                >
                  <it.icon className="w-3.5 h-3.5" />
                  <span>{it.label}</span>
                </button>
              ))}
            </div>

            <div className={`p-4 space-y-3 ${embedded ? "" : "overflow-y-auto"}`}>
              {/* ============ PESTAÑA 1: CÁMARA ============ */}
              {tab === "chamber" && (
                <>
                  <div className="flex flex-wrap items-center gap-2">
                    <Layers className="w-3.5 h-3.5 text-teal-400" />
                    <label htmlFor="lab-fuel" className="sr-only">
                      Combustible
                    </label>
                    <select
                      id="lab-fuel"
                      value={fuelId}
                      onChange={(e) => { setFuelId(e.target.value); setDropA(1); setDropB(1); }}
                      className="px-2 py-1 rounded-md bg-slate-950 border border-slate-800 font-hud text-xs text-slate-200 cursor-pointer"
                    >
                      {FUELS.map((f) => (
                        <option key={f.id} value={f.id}>{f.label}</option>
                      ))}
                    </select>
                    <span className="text-[11px] text-slate-400">{fuel.note}</span>
                    <div className="ml-auto flex flex-wrap gap-1.5">
                      <button
                        type="button"
                        aria-pressed={sup}
                        title="Diluye la atmósfera con CO₂ y helio, como en FLEX"
                        onClick={() => setSup((v) => !v)}
                        className={`inline-flex items-center gap-1 px-2 py-1 rounded-md border font-hud text-[11px] cursor-pointer ${
                          sup ? "bg-emerald-500/20 border-emerald-400 text-emerald-200" : "border-slate-800 text-slate-400 hover:text-slate-200"
                        }`}
                      >
                        <Droplets className="w-3 h-3" />Supresor
                      </button>
                      <button
                        type="button"
                        aria-pressed={ef}
                        title="Campo eléctrico que imita la gravedad parcial"
                        onClick={() => setEf((v) => !v)}
                        className={`inline-flex items-center gap-1 px-2 py-1 rounded-md border font-hud text-[11px] cursor-pointer ${
                          ef ? "bg-violet-500/20 border-violet-400 text-violet-200" : "border-slate-800 text-slate-400 hover:text-slate-200"
                        }`}
                      >
                        <Zap className="w-3 h-3" />E-FIELD
                      </button>
                      <button
                        type="button"
                        aria-pressed={inv}
                        title="Llama invertida con O₂ alto, como en CFI-G"
                        onClick={() => {
                          setInv((v) => !v);
                          if (!inv && A.o2 < 70) {
                            setA((s) => ({ ...s, o2: 85 }));
                            setB((s) => ({ ...s, o2: 85 }));
                          }
                        }}
                        className={`px-2 py-1 rounded-md border font-hud text-[11px] cursor-pointer ${
                          inv ? "bg-amber-500/20 border-amber-400 text-amber-200" : "border-slate-800 text-slate-400 hover:text-slate-200"
                        }`}
                      >
                        CFI-G invertida
                      </button>
                      <button
                        type="button"
                        title="Copiar las condiciones de A en B"
                        onClick={() => { setB({ ...A }); setDropB(1); }}
                        className="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-slate-800 font-hud text-[11px] text-slate-400 hover:text-slate-200 cursor-pointer"
                      >
                        A<ArrowRight className="w-3 h-3" />B
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <Chamber
                      side="A"
                      metrics={mA}
                      state={A}
                      sup={sup}
                      ef={ef}
                      inv={inv}
                      drop={dropA}
                      onEnv={(id) => setEnvOf("A", id)}
                      onSlider={(k, v) => setSlider("A", k, v)}
                      onFocus={setFocus}
                      focused={focus === "A"}
                    />
                    <Chamber
                      side="B"
                      metrics={mB}
                      state={B}
                      sup={sup}
                      ef={ef}
                      inv={inv}
                      drop={dropB}
                      onEnv={(id) => setEnvOf("B", id)}
                      onSlider={(k, v) => setSlider("B", k, v)}
                      onFocus={setFocus}
                      focused={focus === "B"}
                    />
                  </div>

                  <div
                    aria-live="polite"
                    className="p-2.5 rounded-lg bg-teal-500/10 border-l-2 border-teal-400 font-hud text-xs text-teal-100"
                  >
                    {delta}
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {[mA, mB].map((m, i) => (
                      <div
                        key={i}
                        className="p-2.5 rounded-lg bg-slate-900/80 border border-amber-500/25 text-xs text-slate-300 space-y-1"
                      >
                        <div className="font-hud text-[11px] font-bold text-amber-300 flex items-center gap-1">
                          <AlertTriangle className="w-3 h-3" />
                          {i === 0 ? "A" : "B"} · {m.env.short}
                        </div>
                        <p className="leading-relaxed">{m.env.note}</p>
                        <p className="text-[11px] text-cyan-300/80">{m.env.bounds.join(" · ")}</p>
                      </div>
                    ))}
                  </div>

                  <div className="flex items-start gap-2 p-2 rounded-lg bg-slate-900/60 border border-slate-800">
                    <Eye className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />
                    <p className="text-[11px] text-slate-400 leading-relaxed">
                      Referencia real NASA: a 1 g la llama es una lágrima alta con base azul en la mecha y punta
                      oscura por hollín; a 0 g es una cúpula azul tenue y más ancha que alta, anclada a la mecha.
                      El motor reproduce ambas geometrías con la misma fórmula y distinto peso de flotabilidad.
                    </p>
                  </div>
                </>
              )}

              {/* ============ PESTAÑA 2: RANKING ============ */}
              {tab === "ranking" && (
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <ListOrdered className="w-3.5 h-3.5 text-teal-400" />
                    <h3 className="font-hud text-xs font-bold text-white">
                      AMBIENTES ORDENADOS POR MARGEN AL LÍMITE DE INFLAMABILIDAD
                    </h3>
                    <span className="ml-auto font-hud text-[11px] text-slate-400">
                      muestra: {fuel.label} · límite base {fuel.limit.toFixed(2)} psi pO₂
                    </span>
                  </div>

                  <p className="text-xs text-slate-400 leading-relaxed">
                    Orden descendente por margen. Cuanto más arriba, más lejos queda la atmósfera del límite del
                    material y más rápido propaga. Es el ranking de riesgo, no de comodidad: el primer puesto es el
                    peor para la seguridad de la tripulación.
                  </p>

                  <div className="space-y-1.5">
                    {envRanking.map((r, i) => (
                      <div
                        key={r.env.id}
                        className="p-2.5 rounded-lg bg-slate-900 border border-slate-800 flex items-center gap-3"
                      >
                        <span className="font-hud text-xs text-slate-400 w-4">{i + 1}</span>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-hud text-xs text-white truncate">{r.env.label}</span>
                            <span className={`font-hud text-[11px] px-1.5 py-0.5 rounded-full border ${r.m.verdict.tone}`}>
                              {r.m.verdict.label}
                            </span>
                          </div>
                          <div className="mt-1 h-1.5 rounded-full bg-slate-800 overflow-hidden">
                            <div
                              className={`h-full ${r.m.extinguished ? "bg-rose-500/60" : r.m.margin < 25 ? "bg-amber-500/70" : "bg-teal-500/70"}`}
                              style={{ width: `${clamp(Math.abs(r.m.margin) / 2.2, 4, 100)}%` }}
                            />
                          </div>
                          <div className="mt-1 flex flex-wrap gap-3 font-hud text-[10px] text-slate-400">
                            <span>pO₂ {r.m.ppO2.toFixed(2)} psi</span>
                            <span>margen {r.m.margin > 0 ? "+" : ""}{r.m.margin} %</span>
                            <span>{r.m.extinguished ? "sin llama" : `${r.m.spread} mm/s · ${r.m.tempK} K`}</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800 text-xs text-slate-300">
                    <div className="font-hud text-[11px] font-bold text-cyan-300 mb-1">Cómo leerlo</div>
                    Lo que más mueve el orden es el oxígeno, no la gravedad: la gravedad parcial solo alarga la
                    llama, mientras que un O₂ alto aleja la atmósfera del límite del material. Una presión muy
                    baja, como la de la superficie de Marte, frena la cinética aunque la fracción de O₂ sea alta.
                  </div>
                </div>
              )}

              {/* ============ PESTAÑA 3: MATRIZ ============ */}
              {tab === "matrix" && (
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <Grid3x3 className="w-3.5 h-3.5 text-teal-400" />
                    <h3 className="font-hud text-xs font-bold text-white">
                      MATRIZ DE AMBIENTES CONTRA MATERIALES
                    </h3>
                  </div>
                  <p className="text-xs text-slate-400">
                    Cada celda es el margen al límite de ese material en ese ambiente, con el O₂ de diseño. Verde
                    holgado, ámbar marginal, rojo extinguido. Sirve para elegir material por hábitat sin abrir la
                    cámara.
                  </p>

                  <div className="overflow-x-auto">
                    <table className="w-full border-collapse font-hud text-[11px]">
                      <thead>
                        <tr>
                          <th scope="col" className="text-left p-1.5 text-slate-400 font-normal">material</th>
                          {ENVIRONMENTS.map((e) => (
                            <th key={e.id} scope="col" className="p-1.5 text-slate-300 font-normal whitespace-nowrap">
                              {e.short}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {FUELS.map((f) => (
                          <tr key={f.id} className="border-t border-slate-800">
                            <th scope="row" className="p-1.5 text-left font-normal text-slate-300 whitespace-nowrap">
                              {f.label}
                            </th>
                            {ENVIRONMENTS.map((e) => {
                              const m = derive(e, f, { env: e.id, o2: e.o2, psi: e.psi, g: e.g, flow: e.flow }, sup, ef, false);
                              const tone = m.extinguished
                                ? "text-rose-300 bg-rose-500/10"
                                : m.margin < 25
                                ? "text-amber-300 bg-amber-500/10"
                                : "text-emerald-300 bg-emerald-500/10";
                              return (
                                <td
                                  key={e.id}
                                  title={m.extinguished ? m.cause || "Sin llama" : `${m.spread} mm/s · ${m.tempK} K`}
                                  className={`p-1.5 text-center ${tone}`}
                                >
                                  {m.extinguished ? "—" : `${m.margin > 0 ? "+" : ""}${m.margin}%`}
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <p className="text-[11px] text-slate-400 leading-relaxed">
                    Nota de rigor: los márgenes son relativos al límite del material usado por el motor, no valores
                    LOI certificados. Sirven para ordenar, no para sustituir un ensayo.
                  </p>
                </div>
              )}

              {/* ============ PESTAÑA 4: CATÁLOGO ============ */}
              {tab === "catalog" && (
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <BookOpen className="w-3.5 h-3.5 text-teal-400" />
                    <h3 className="font-hud text-xs font-bold text-white">
                      INVESTIGACIONES PSI ORDENADAS POR RELEVANCIA
                    </h3>
                    <div className="ml-auto flex items-center gap-1.5 font-hud text-[11px] text-slate-400">
                      <span>ordenar para:</span>
                      {(["A", "B"] as const).map((s) => (
                        <button
                          key={s}
                          type="button"
                          aria-pressed={focus === s}
                          onClick={() => setFocus(s)}
                          className={`px-2 py-0.5 rounded-md border cursor-pointer ${
                            focus === s
                              ? "border-teal-400 bg-teal-500/20 text-teal-100"
                              : "border-slate-800 text-slate-400 hover:text-slate-200"
                          }`}
                        >
                          {s} · {s === "A" ? envA.short : envB.short}
                        </button>
                      ))}
                    </div>
                  </div>

                  <p className="text-xs text-slate-400 leading-relaxed">
                    Puntaje = relevancia declarada para el ambiente + coincidencia de combustible + fuerza de la
                    evidencia − penalización si aún no hay datos.
                  </p>

                  <div className="space-y-1.5">
                    {invRanking.map(({ inv: v, score }) => (
                      <div key={v.id} className="p-2.5 rounded-lg bg-slate-900 border border-slate-800 space-y-1">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-hud text-xs font-bold text-cyan-300">{v.name}</span>
                          <div className="flex items-center gap-1.5">
                            {v.status === "future" && (
                              <span className="font-hud text-[10px] px-1.5 py-0.5 rounded-full border border-slate-700 text-slate-400">
                                sin datos
                              </span>
                            )}
                            <span
                              title="Puntaje de relevancia"
                              className="font-hud text-[10px] px-1.5 py-0.5 rounded-full bg-teal-500/15 border border-teal-500/40 text-teal-300"
                            >
                              {score}
                            </span>
                          </div>
                        </div>
                        <p className="text-[11px] text-slate-400">{v.full}</p>
                        <p className="text-[11px] text-slate-300 leading-relaxed">{v.finding}</p>
                        <div className="flex flex-wrap gap-2 pt-0.5 font-hud text-[10px] text-slate-400">
                          <span>{v.hardware}</span>
                          <span>{v.conditions}</span>
                          {v.sensors.length > 0 && <span>sensores: {v.sensors.join(", ")}</span>}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* ============ PESTAÑA 5: APLICACIÓN ============ */}
              {tab === "apply" && (
                <div className="space-y-3">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    {[
                      { icon: Shield, t: "1. Prevención", b: "Selección de materiales según límites de inflamabilidad. A ≥30 % O₂ y ≤10.2 psi el margen cae más del 40 %: el Nomex resiste, el algodón no. La matriz de la pestaña 3 permite elegir material por hábitat sin ensayo.", r: "BASS, BASS-II, Saffire, BRE" },
                      { icon: Radar, t: "2. Detección temprana", b: "En 0 g el humo no sube: viaja con la ventilación. SAME y SAME-R caracterizaron aerosoles de combustión; el mismo sensor se reutilizó en DAFT y DAFT-2 para polvo lunar, que es la principal fuente de falsa alarma.", r: "SAME, SAME-R, DAFT, DAFT-2" },
                      { icon: Droplets, t: "3. Supresión", b: "FLEX y FLEX-2 cuantificaron la extinción por dilución con CO₂ y He: suben el límite y bajan la temperatura bajo el umbral. Se complementa con niebla fina de agua para no mojar la aviónica.", r: "FLEX, FLEX-2, CFI" },
                    ].map((p) => (
                      <div key={p.t} className="p-3 rounded-xl bg-slate-900 border border-slate-800 space-y-1.5">
                        <div className="flex items-center gap-1.5 font-hud text-xs font-bold text-cyan-300">
                          <p.icon className="w-3.5 h-3.5" />
                          {p.t}
                        </div>
                        <p className="text-xs text-slate-300 leading-relaxed">{p.b}</p>
                        <div className="text-[11px] text-teal-300 font-hud pt-1 border-t border-slate-800">{p.r}</div>
                      </div>
                    ))}
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    {[
                      { t: "Niebla fina de agua", b: "Apaga en la ISS sin dañar electrónica; en Tierra usa hasta 90 % menos agua en hospitales, centros de datos y museos." },
                      { t: "Detectores multi-aerosol", b: "El sensor de SAME derivó en DAFT: distingue humo real de vapor de cocina o polvo, reduciendo falsas alarmas domésticas e industriales." },
                      { t: "Trajes PBI / Nomex", b: "Los límites medidos en O₂ puro (Apollo y EVA) dieron trajes térmicos más ligeros y cilindros de alta presión para bomberos." },
                    ].map((sp) => (
                      <div key={sp.t} className="p-3 rounded-xl bg-slate-900 border border-emerald-500/25 space-y-1.5">
                        <div className="flex items-center gap-1.5 font-hud text-xs font-bold text-emerald-300">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          {sp.t}
                        </div>
                        <p className="text-xs text-slate-300 leading-relaxed">{sp.b}</p>
                      </div>
                    ))}
                  </div>

                  <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800 flex items-start gap-2">
                    <FlaskConical className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />
                    <p className="text-[11px] text-slate-400 leading-relaxed">
                      Límites del modelo: la tasa de propagación es un ajuste, no un solver; el transitorio de
                      ignición es visual; no hay datos partial-g en PSI, así que Luna y Marte se acotan entre 0 g y
                      1 g con el campo eléctrico de E-FIELD como única vía experimental disponible hoy.
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* pie */}
            <div className="px-4 py-2 border-t border-slate-800 bg-slate-900/60 flex flex-wrap items-center gap-3 font-hud text-[10px] text-slate-400">
              <span className="flex items-center gap-1"><Gauge className="w-3 h-3" />{mA.extinguished ? "A sin llama" : `A ${mA.spread} mm/s`}</span>
              <span className="flex items-center gap-1"><Gauge className="w-3 h-3" />{mB.extinguished ? "B sin llama" : `B ${mB.spread} mm/s`}</span>
              <span className="ml-auto flex items-center gap-1"><Cpu className="w-3 h-3" />CIR · MSG · Saffire</span>
              <span className="flex items-center gap-1"><Globe className="w-3 h-3" />PSI</span>
              <span className="flex items-center gap-1"><Wind className="w-3 h-3" />SPICE</span>
            </div>
          </div>
        </div>
      )}
    </>
  );
}