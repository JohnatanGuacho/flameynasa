"use client";

import { MissionScienceLab } from "@/components/MissionScienceLab";
import { useMission } from "@/components/MissionContext";

export default function CamaraPage() {
  const { activeEnv } = useMission();
  return <MissionScienceLab initialEnvironment={activeEnv} embedded />;
}