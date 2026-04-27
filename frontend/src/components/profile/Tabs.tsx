"use client";

import { useState } from "react";
import MatchList from "@/components/matches/MatchList";
import ChampionStatsTable from "@/components/stats/ChampionStatsTable";
import KDATrendChart from "@/components/charts/KDATrendChart";
import WinRateChart from "@/components/charts/WinRateChart";
import DamageGoldChart from "@/components/charts/DamageGoldChart";
import GoldCurveChart from "@/components/charts/GoldCurveChart";
import VisionImpactChart from "@/components/charts/VisionImpactChart";
import MatchupMatrix from "@/components/stats/MatchupMatrix";

const TABS = ["Overview", "Champions", "Performance", "Timeline"] as const;
type Tab = (typeof TABS)[number];

export default function Tabs({ puuid }: { puuid: string }) {
  const [active, setActive] = useState<Tab>("Overview");

  return (
    <div className="flex flex-col gap-6">
      {/* Tab bar */}
      <div className="flex gap-1 border-b border-primary/10">
        {TABS.map((tab) => (
          <button
            key={tab}
            onClick={() => setActive(tab)}
            className={`px-4 py-2 text-sm font-mono transition-colors border-b-2 -mb-px ${
              active === tab
                ? "border-primary text-primary"
                : "border-transparent text-dim hover:text-white"
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Overview */}
      {active === "Overview" && (
        <div className="grid grid-cols-1 md:grid-cols-5 gap-6">
          <div className="md:col-span-3 flex flex-col gap-6">
            <div className="flex flex-col gap-3">
              <p className="text-dim text-xs font-mono uppercase tracking-wider">
                // KDA Trend
              </p>
              <KDATrendChart puuid={puuid} />
            </div>
            <div className="flex flex-col gap-3">
              <p className="text-dim text-xs font-mono uppercase tracking-wider">
                // Recent Matches
              </p>
              <MatchList puuid={puuid} />
            </div>
          </div>
          <div className="md:col-span-2 flex flex-col gap-6">
            <div className="flex flex-col gap-3">
              <p className="text-dim text-xs font-mono uppercase tracking-wider">
                // Champion Stats
              </p>
              <ChampionStatsTable puuid={puuid} />
            </div>
            <div className="flex flex-col gap-3">
              <p className="text-dim text-xs font-mono uppercase tracking-wider">
                // Win Rate by Champion
              </p>
              <WinRateChart puuid={puuid} />
            </div>
          </div>
        </div>
      )}

      {/* Champions */}
      {active === "Champions" && (
        <div className="flex flex-col gap-6">
          <ChampionStatsTable puuid={puuid} />
          <WinRateChart puuid={puuid} />
          <div className="flex flex-col gap-3">
            <p className="text-dim text-xs font-mono uppercase tracking-wider">
              // Matchup History
            </p>
            <MatchupMatrix puuid={puuid} />
          </div>
        </div>
      )}

      {/* Performance */}
      {active === "Performance" && (
        <div className="flex flex-col gap-3">
          <p className="text-dim text-xs font-mono uppercase tracking-wider">
            // Damage vs Gold Efficiency
          </p>
          <DamageGoldChart puuid={puuid} />
        </div>
      )}

      {/* Timeline */}
      {active === "Timeline" && (
        <div className="flex flex-col gap-8">
          <div className="flex flex-col gap-3">
            <p className="text-dim text-xs font-mono uppercase tracking-wider">
              // Gold Curve — Average Gold Per Minute
            </p>
            <GoldCurveChart puuid={puuid} />
          </div>

          <div className="flex flex-col gap-3">
            <p className="text-dim text-xs font-mono uppercase tracking-wider">
              // Vision Score Impact on Win Rate
            </p>
            <VisionImpactChart puuid={puuid} />
          </div>

          <div className="flex flex-col gap-3">
            <p className="text-dim text-xs font-mono uppercase tracking-wider">
              // Damage vs Gold Efficiency
            </p>
            <DamageGoldChart puuid={puuid} />
          </div>
        </div>
      )}
    </div>
  );
}