"use client";

import { useEffect, useState } from "react";
import { api, EnvironmentOut, FindingOut, MetaOut } from "@/lib/api";
import { CommandViewport } from "@/components/CommandViewport";
import { FindingsDrawer } from "@/components/FindingsDrawer";
import { LabPanel } from "@/components/LabPanel";
import { IntelModal, IntelTab } from "@/components/IntelModal";
import { FlameyWidget } from "@/components/FlameyWidget";
import {
  Flame,
  LayoutGrid,
  ListOrdered,
  Cpu,
  Activity,
  GitCompare,
  AlertOctagon,
  Globe,
  FileDown,
} from "lucide-react";

export default function HomePage() {
  const [meta, setMeta] = useState<MetaOut | null>(null);
  const [online, setOnline] = useState(false);
  const [activeEnv, setActiveEnv] = useState("lunar");
  const [findings, setFindings] = useState<FindingOut[]>([]);
  const [loadingFindings, setLoadingFindings] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [labOpen, setLabOpen] = useState(false);
  const [intelTab, setIntelTab] = useState<IntelTab | null>(null);
  const [selectedFinding, setSelectedFinding] = useState<FindingOut | null>(null);
  const [lang, setLang] = useState<"ES" | "EN">("ES");
  const [clock, setClock] = useState("");

  useEffect(() => {
    const updateClock = () => setClock(new Date().toTimeString().slice(0, 8));
    updateClock();
    const id = setInterval(updateClock, 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    api.health().then(() => setOnline(true)).catch(() => setOnline(false));
    api
      .meta()
      .then((data) => {
        setMeta(data);
        const keys = Object.keys(data.environments || {});
        if (keys.length && !keys.includes(activeEnv)) {
          setActiveEnv(keys[0]);
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!activeEnv) return;
    setLoadingFindings(true);
    api
      .findings(activeEnv)
      .then((list) => {
        setFindings(list);
        if (list[0]) setSelectedFinding(list[0]);
      })
      .catch(() => setFindings([]))
      .finally(() => setLoadingFindings(false));
  }, [activeEnv]);

  const environments: EnvironmentOut[] = meta ? Object.values(meta.environments) : [];
  const currentEnv = environments.find((e) => e.key === activeEnv);
  const materialKeys = meta ? Object.keys(meta.materials) : [];

  const handleSelectEnv = (key: string) => {
    setActiveEnv(key);
    setDrawerOpen(true);
  };

  return (
    <main className="min-h-screen flex flex-col bg-[#050a14] text-slate-100">
      {/* Barra superior idéntica a tu captura */}
      <header className="h-14 px-4 border-b border-slate-800/90 bg-slate-950/90 backdrop-blur-md flex items-center justify-between z-30">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-full bg-teal-500/20 border border-teal-400/50 flex items-center justify-center">
              <Flame className="w-4 h-4 text-teal-400" />
            </div>
            <span className="font-hud text-xs sm:text-sm font-bold tracking-widest text-white">
              FLAME IN FREEFALL
            </span>
          </div>

          <span className="hidden sm:inline-flex items-center gap-1.5 font-hud text-[11px] text-emerald-400">
            <span className={`w-2 h-2 rounded-full ${online ? "bg-emerald-400" : "bg-rose-500"}`} />
            {online ? "SISTEMA EN LÍNEA" : "CONECTANDO API..."}
          </span>
        </div>

        <div className="flex items-center gap-2 sm:gap-3">
          {currentEnv && (
            <button
              onClick={() => setDrawerOpen((v) => !v)}
              className="hidden md:inline-flex items-center gap-2 px-3 py-1 rounded-full bg-slate-900 border border-teal-500/40 font-hud text-[11px] text-teal-300 cursor-pointer"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-teal-400" />
              {currentEnv.label.toUpperCase()}{" "}
              {currentEnv.gravity_g === 0 ? "µg" : `${currentEnv.gravity_g} g`}
            </button>
          )}

          <button
            onClick={() => setIntelTab("info")}
            className="hidden sm:inline-block px-2 py-1 font-hud text-xs text-slate-300 hover:text-white cursor-pointer"
          >
            INFO
          </button>

          <button
            onClick={() => setLabOpen(true)}
            className="px-2.5 py-1 rounded-lg hover:bg-slate-800 font-hud text-xs text-slate-200 border border-slate-700 cursor-pointer"
          >
            {lang === "ES" ? "LABORATORIO" : "LABORATORY"}
          </button>

          <button
            onClick={() => setIntelTab("gaps")}
            className="hidden sm:inline-block px-2 py-1 font-hud text-xs text-slate-300 hover:text-white cursor-pointer"
          >
            {lang === "ES" ? "AYUDA" : "HELP"}
          </button>

          <div className="flex rounded-lg overflow-hidden border border-slate-700 font-hud text-[11px]">
            {(["ES", "EN"] as const).map((l) => (
              <button
                key={l}
                onClick={() => setLang(l)}
                className={`px-2 py-1 cursor-pointer ${
                  lang === l ? "bg-teal-500 text-slate-950 font-bold" : "bg-slate-900 text-slate-400"
                }`}
              >
                {l}
              </button>
            ))}
          </div>

          <span className="hidden sm:inline font-hud text-xs text-slate-400">{clock}</span>
        </div>
      </header>

      {/* Menú vertical izquierdo */}
      <nav className="fixed left-0 top-14 bottom-0 w-12 bg-slate-950/90 border-r border-slate-800/90 z-30 flex flex-col items-center py-3 gap-3">
        <button
          title="Centro de Mando"
          onClick={() => {
            setDrawerOpen(false);
            setLabOpen(false);
            setIntelTab(null);
          }}
          className="p-2 rounded-lg bg-teal-500/20 text-teal-300 border border-teal-500/40 cursor-pointer"
        >
          <LayoutGrid className="w-4 h-4" />
        </button>

        <button
          title="Ranking RPI por Entorno"
          onClick={() => setDrawerOpen((v) => !v)}
          className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 cursor-pointer"
        >
          <ListOrdered className="w-4 h-4" />
        </button>

        <button
          title="Hardware & Instalaciones (CIR / MDCA / MSG)"
          onClick={() => setIntelTab("hardware")}
          className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 cursor-pointer"
        >
          <Cpu className="w-4 h-4" />
        </button>

        <button
          title="Sensores & Mediciones"
          onClick={() => setIntelTab("sensors")}
          className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 cursor-pointer"
        >
          <Activity className="w-4 h-4" />
        </button>

        <button
          title="Comparador & Variación entre Corridas"
          onClick={() => setIntelTab("compare")}
          className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 cursor-pointer"
        >
          <GitCompare className="w-4 h-4" />
        </button>

        <button
          title="Incidentes Históricos (Apollo / Mir / Artemis II)"
          onClick={() => setIntelTab("incidents")}
          className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 cursor-pointer"
        >
          <AlertOctagon className="w-4 h-4" />
        </button>

        <button
          title="Beneficio en Tierra (Spin-offs)"
          onClick={() => setIntelTab("spinoffs")}
          className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 cursor-pointer"
        >
          <Globe className="w-4 h-4" />
        </button>

        <a
          title="Exportar Informe de Misión (.md)"
          href={api.exportUrl(activeEnv, "md")}
          target="_blank"
          rel="noreferrer"
          className="mt-auto p-2 rounded-lg text-teal-400 hover:bg-slate-800"
        >
          <FileDown className="w-4 h-4" />
        </a>
      </nav>

      {/* Escena principal */}
      <div className="flex-1 pl-12">
        <CommandViewport
          environments={environments}
          activeEnvKey={activeEnv}
          onSelectEnv={handleSelectEnv}
          lang={lang}
        />
      </div>

      {/* Paneles conectados a https://emberwatch-api.devcoreinc.com */}
      <FindingsDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        environment={currentEnv}
        findings={findings}
        loading={loadingFindings}
        onAskFlamey={(f) => setSelectedFinding(f)}
      />

      <LabPanel open={labOpen} onClose={() => setLabOpen(false)} materials={materialKeys} />

      <IntelModal tab={intelTab} onClose={() => setIntelTab(null)} onChangeTab={setIntelTab} />

      <FlameyWidget activeFinding={selectedFinding} environmentKey={activeEnv} />
    </main>
  );
}