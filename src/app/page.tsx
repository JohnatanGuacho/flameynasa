"use client";

import Link from "next/link";
import { ArrowRight, Loader2, WifiOff } from "lucide-react";
import { CommandViewport } from "@/components/CommandViewport";
import { useMission } from "@/components/MissionContext";

export default function HomePage() {
  const {
    online,
    environments,
    activeEnv,
    setActiveEnv,
    currentEnv,
    findings,
    loadingFindings,
    askFlamey,
    lang,
  } = useMission();

  const es = lang === "ES";
  const noData = environments.length === 0;

  return (
    <div className="relative flex-1">
      <CommandViewport
        environments={environments}
        activeEnvKey={activeEnv}
        onSelectEnv={setActiveEnv}
        lang={lang}
        findings={findings}
        loadingFindings={loadingFindings}
        onAskFlamey={askFlamey}
      />

      {/* Sin ambientes todavía: se avisa si está cargando o si la API no responde */}
      {noData && (
        <div
          role="status"
          className="absolute left-1/2 top-24 z-20 flex -translate-x-1/2 items-center gap-2 whitespace-nowrap rounded-full border border-slate-700 bg-slate-950/95 px-4 py-2 font-hud text-xs text-slate-200 shadow-2xl"
        >
          {online ? (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin text-teal-300" />
              {es ? "Cargando ambientes..." : "Loading environments..."}
            </>
          ) : (
            <>
              <WifiOff className="h-3.5 w-3.5 text-rose-300" />
              {es
                ? "Sin conexión con la API. Los ambientes aparecerán cuando responda."
                : "No connection to the API. Environments will appear once it responds."}
            </>
          )}
        </div>
      )}

      {/* En pantallas angostas no cabe el panel de hallazgos: acceso directo al ranking */}
      {currentEnv && (
        <Link
          href="/ranking"
          className="absolute bottom-5 left-1/2 z-20 inline-flex -translate-x-1/2 items-center gap-2 whitespace-nowrap rounded-full border border-teal-400/60 bg-slate-950/95 px-4 py-2 font-hud text-xs text-teal-200 shadow-2xl hover:border-teal-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-400 lg:hidden"
        >
          {loadingFindings
            ? es
              ? `Cargando hallazgos de ${currentEnv.label}...`
              : `Loading ${currentEnv.label} findings...`
            : es
            ? `Ver ${findings.length} hallazgos de ${currentEnv.label}`
            : `See ${findings.length} findings for ${currentEnv.label}`}
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      )}
    </div>
  );
}