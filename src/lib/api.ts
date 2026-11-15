const BASE_URL = (
  process.env.NEXT_PUBLIC_API_URL || "https://emberwatch-api.devcoreinc.com"
).replace(/\/$/, "");

// --- TIPOS PRINCIPALES ---
export interface EnvironmentOut {
  key: string;
  label: string;
  gravity_g: number;
  o2_fraction: number;
  pressure_atm: number;
  diluent: string;
  egress_s: number;
  caption: string;
  material_fit: number;
}

export interface MetaOut {
  kernel_version: string;
  environments: Record<string, EnvironmentOut>;
  weights: Record<string, number>;
  materials: Record<string, number>;
  diluents: Record<string, number>;
  bands: Record<string, number>;
}

export interface FactorOut {
  name: string;
  value: number;
  weight: number;
  contribution: number;
}

export interface FindingOut {
  key: string;
  experiment: string;
  facility: string;
  material: string | null;
  geometry: string | null;
  flame_mode: string;
  o2_min: number | null;
  o2_max: number | null;
  pressure_atm: number | null;
  observations: number;
  quality: number;
  rpi: number;
  band: string;
  relevance: string;
  factors: FactorOut[];
  narrative: string;
  sources: string[];
  rules: string[];
}

export interface ProvenanceRow {
  row: number;
  flags: string[];
  rules: string[];
  quality: number;
  raw: Record<string, unknown>;
}

export interface ProvenanceOut {
  source_file: string;
  observations: number;
  rows: ProvenanceRow[];
}

export interface LabIn {
  material: string;
  o2_fraction: number;
  pressure_atm: number;
  gravity_g: number;
  flow_cm_s?: number | null;
  ignition_w: number;
  co2_pct: number;
  he_pct: number;
  diluent: string;
  mode: string;
}

export interface LabOut {
  limit: number;
  excess: number;
  quenched: boolean;
  rate_mm_s: number;
  curve: number[][];
}

export interface GravityBandIn {
  material: string;
  o2_fraction: number;
  pressure_atm: number;
  diluent: string;
  mode: string;
  gravity_g: number;
}

export interface GravityBandOut {
  low: number;
  high: number;
  interpolated: number;
  interpolated_at: number;
  declared: boolean;
  quenched_low: boolean;
  quenched_high: boolean;
}

export interface OxygenLadderOut {
  steps: number[];
  materials: {
    material: string;
    class: string;
    steps: {
      o2: number;
      over_cabin_limit: number;
      over_suit_limit: number;
      sustains_cabin: boolean;
      sustains_suit: boolean;
    }[];
  }[];
  anchors: { o2: number; label: string }[];
}

export interface EvidenceRow {
  file: string;
  row: number;
  quality: number;
  flags: string[];
  raw: Record<string, unknown>;
}

export interface ContextOut {
  finding: FindingOut;
  environment: EnvironmentOut;
  evidence: EvidenceRow[];
  messages: { role: string; content: string }[];
  response_schema: Record<string, unknown>;
  provider: string;
}

export interface InvestigationOut {
  key: string;
  label: string;
  facility: string;
  relevance: string;
  project?: string | null;
  project_label?: string | null;
  hardware?: string | null;
  observations: number;
  materials: string[];
  modes: string[];
}

export interface VariationOut {
  experiment: string;
  material: string | null;
  observations: number;
  varying: {
    column: string;
    distinct: number;
    minimum?: number | null;
    maximum?: number | null;
    examples: string[];
  }[];
  constant: string[];
  note: string;
}

export interface SimilarityPair {
  a: string;
  b: string;
  similarity: number;
  shared: string[];
  differing: string[];
}

export interface HardwareNodeOut {
  label: string;
  facility: string;
  hardware: string;
  project: string;
  experiments: { key: string; observations: number }[];
}

export interface FacilitiesOut {
  facilities: {
    id?: string | null;
    nombre?: string | null;
    bastidor?: string | null;
    masa_kg?: number | null;
    volumen_m3?: number | null;
  }[];
  investigations: {
    psi_id?: string | null;
    acronimo?: string | null;
    titulo?: string | null;
    pilar?: string | null;
  }[];
}

export interface MeasurementsOut {
  experiments: {
    experiment: string;
    measurements: { instrument: string; variable: string; kind: string }[];
    kinds: string[];
  }[];
  missing_variables: string[];
  note: string;
}

export interface IncidentOut {
  slug: string;
  name: string;
  year: number;
  environment: string;
  atmosphere: string;
  timeline: string;
  verdict: string;
  evidence: string[];
  summary: string;
  linked_observations: number;
  mean_rpi?: number | null;
}

export interface IncidentSourceOut {
  slug: string;
  excerpt: string[];
  lines: number;
  chars: number;
}

export interface SpinoffOut {
  name: string;
  source: string;
  benefit: string;
}

export interface GapsOut {
  cells: {
    environment: string;
    material_class: string;
    observations: number;
    affinity: number;
    state: string;
  }[];
  declared: { area: string; detail: string; bound: string }[];
  note: string;
}

export interface RulesOut {
  rules: {
    id?: string | null;
    mito?: string | null;
    hecho?: string | null;
    fuente?: string | null;
  }[];
  count: number;
  source: string;
}

export interface Fm2Out {
  payload: Record<string, unknown>;
  note: string;
}

// --- UTILIDADES ---
export const atmToPsi = (atm: number) => +(atm * 14.6959).toFixed(1);

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers || {}) },
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`Error ${res.status} en ${path}`);
  }
  return res.json();
}

// --- CLIENTE ÚNICO EMBERWATCH ---
export const api = {
  health: () => request<Record<string, unknown>>("/health"),
  meta: () => request<MetaOut>("/api/meta"),
  findings: (environment: string, minRpi = 0, material?: string) => {
    const params = new URLSearchParams({
      environment,
      min_rpi: String(minRpi),
      limit: "50",
    });
    if (material) params.set("material", material);
    return request<FindingOut[]>(`/api/findings?${params.toString()}`);
  },
  findingContext: (clave: string, environment: string) =>
    request<ContextOut>(
      `/api/findings/${encodeURIComponent(clave)}/context?environment=${encodeURIComponent(environment)}`
    ),
  provenance: (sourceFile: string) =>
    request<ProvenanceOut>(`/api/provenance/${encodeURIComponent(sourceFile)}`),
  simulate: (body: LabIn) =>
    request<LabOut>("/api/lab/simulate", { method: "POST", body: JSON.stringify(body) }),
  gravityBand: (body: GravityBandIn) =>
    request<GravityBandOut>("/api/lab/gravity-band", { method: "POST", body: JSON.stringify(body) }),
  oxygenLadder: () => request<OxygenLadderOut>("/api/oxygen-ladder"),
  fm2: () => request<Fm2Out>("/api/fm2"),
  investigations: () => request<InvestigationOut[]>("/api/investigations"),
  variation: (clave: string) =>
    request<VariationOut>(`/api/investigations/${encodeURIComponent(clave)}/variation`),
  similarity: (minimo = 0) => request<SimilarityPair[]>(`/api/similarity?minimo=${minimo}`),
  hardware: () => request<HardwareNodeOut[]>("/api/hardware"),
  facilities: () => request<FacilitiesOut>("/api/facilities"),
  measurements: () => request<MeasurementsOut>("/api/measurements"),
  incidents: () => request<IncidentOut[]>("/api/incidents"),
  incidentSource: (slug: string) =>
    request<IncidentSourceOut>(`/api/incidents/${encodeURIComponent(slug)}/source`),
  spinoffs: () => request<SpinoffOut[]>("/api/spinoffs"),
  gaps: () => request<GapsOut>("/api/gaps"),
  rules: () => request<RulesOut>("/api/rules"),
  exportUrl: (environment: string, format: "md" | "json" = "md") =>
    `${BASE_URL}/api/export?environment=${encodeURIComponent(environment)}&format=${format}`,
};