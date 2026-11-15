"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { api, EnvironmentOut, FindingOut, MetaOut } from "@/lib/api";

export type Lang = "ES" | "EN";

interface MissionState {
  meta: MetaOut | null;
  online: boolean;
  environments: EnvironmentOut[];
  currentEnv?: EnvironmentOut;
  activeEnv: string;
  setActiveEnv: (key: string) => void;
  materialKeys: string[];
  findings: FindingOut[];
  loadingFindings: boolean;
  /** Hallazgo que se le pasó a Flamey. Empieza vacío: Flamey espera. */
  selectedFinding: FindingOut | null;
  askFlamey: (finding: FindingOut) => void;
  lang: Lang;
  setLang: (lang: Lang) => void;
}

const MissionCtx = createContext<MissionState | null>(null);

export function MissionProvider({ children }: { children: React.ReactNode }) {
  const [meta, setMeta] = useState<MetaOut | null>(null);
  const [online, setOnline] = useState(false);
  const [activeEnv, setActiveEnv] = useState("lunar");
  const [findings, setFindings] = useState<FindingOut[]>([]);
  const [loadingFindings, setLoadingFindings] = useState(false);
  const [selectedFinding, setSelectedFinding] = useState<FindingOut | null>(null);
  const [lang, setLang] = useState<Lang>("ES");

  useEffect(() => {
    api
      .health()
      .then(() => setOnline(true))
      .catch(() => setOnline(false));

    api
      .meta()
      .then((data) => {
        setMeta(data);
        const keys = Object.keys(data.environments || {});
        if (keys.length) {
          setActiveEnv((curr) => (keys.includes(curr) ? curr : keys[0]));
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!activeEnv) return;
    let cancelled = false;
    setLoadingFindings(true);

    api
      .findings(activeEnv)
      .then((list) => {
        if (!cancelled) setFindings(list);
      })
      .catch(() => {
        if (!cancelled) setFindings([]);
      })
      .finally(() => {
        if (!cancelled) setLoadingFindings(false);
      });

    return () => {
      cancelled = true;
    };
  }, [activeEnv]);

  // Copia nueva en cada clic: así Flamey reacciona aunque sea el mismo hallazgo.
  const askFlamey = useCallback((finding: FindingOut) => {
    setSelectedFinding({ ...finding });
  }, []);

  const value = useMemo<MissionState>(() => {
    const environments = meta ? Object.values(meta.environments) : [];
    return {
      meta,
      online,
      environments,
      currentEnv: environments.find((e) => e.key === activeEnv),
      activeEnv,
      setActiveEnv,
      materialKeys: meta ? Object.keys(meta.materials) : [],
      findings,
      loadingFindings,
      selectedFinding,
      askFlamey,
      lang,
      setLang,
    };
  }, [meta, online, activeEnv, findings, loadingFindings, selectedFinding, askFlamey, lang]);

  return <MissionCtx.Provider value={value}>{children}</MissionCtx.Provider>;
}

export function useMission(): MissionState {
  const value = useContext(MissionCtx);
  if (!value) throw new Error("useMission debe usarse dentro de MissionProvider");
  return value;
}