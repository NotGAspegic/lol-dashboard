"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  Cell,
  LabelList,
  ResponsiveContainer,
} from "recharts";
import { getChampionStats, ChampionStat } from "@/lib/api";
import Skeleton from "@/components/ui/Skeleton";
import { useEffect, useState as useChampName } from "react";

interface WinRateChartProps {
  puuid: string;
}

function barColor(winrate: number): string {
  if (winrate >= 55) return "#4CAF72";
  if (winrate >= 45) return "#C89B3C";
  return "#E8523C";
}

// resolve champion name client-side
function useChampionNames(championIds: number[]) {
  const [names, setNames] = useState<Record<number, string>>({});

  useEffect(() => {
    if (championIds.length === 0) return;
    fetch("https://ddragon.leagueoflegends.com/api/versions.json")
      .then((r) => r.json())
      .then(async (versions: string[]) => {
        const patch = versions[0];
        const res = await fetch(
          `https://ddragon.leagueoflegends.com/cdn/${patch}/data/en_US/champion.json`
        );
        const data = await res.json();
        const champions = data.data as Record<string, { key: string; name: string }>;
        const map: Record<number, string> = {};
        for (const [, c] of Object.entries(champions)) {
          const id = parseInt(c.key);
          if (championIds.includes(id)) {
            map[id] = c.name;
          }
        }
        setNames(map);
      })
      .catch(() => {});
  }, [championIds.join(",")]);

  return names;
}

function CustomTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: { payload: ChampionStat & { name: string } }[];
}) {
  if (!active || !payload || payload.length === 0) return null;
  const d = payload[0].payload;
  return (
    <div
      className="border rounded-lg p-3 flex flex-col gap-1"
      style={{
        background: "#0D1E3A",
        borderColor: "rgba(30,155,232,0.3)",
        minWidth: 140,
      }}
    >
      <span className="text-white text-sm font-semibold">{d.name}</span>
      <span
        className="text-sm font-mono font-bold"
        style={{ color: barColor(d.winrate) }}
      >
        {d.winrate.toFixed(1)}% WR
      </span>
      <span className="text-xs font-mono" style={{ color: "#3A5070" }}>
        {d.games} games · {d.kda.toFixed(2)} KDA
      </span>
    </div>
  );
}

export default function WinRateChart({ puuid }: WinRateChartProps) {
  const [minGames, setMinGames] = useState(3);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["champion-stats", puuid],
    queryFn: () => getChampionStats(puuid),
  });

  const filtered = (data ?? [])
    .filter((c: ChampionStat) => c.games >= minGames)
    .sort((a: ChampionStat, b: ChampionStat) => b.games - a.games)
    .slice(0, 8);

  const championIds = filtered.map((c: ChampionStat) => c.championId);
  const names = useChampionNames(championIds);

  const chartData = filtered.map((c: ChampionStat) => ({
    ...c,
    name: names[c.championId] ?? `ID ${c.championId}`,
  }));

  if (isLoading) return <Skeleton className="h-64 w-full" />;

  if (isError || !data || filtered.length === 0) {
    return (
      <div
        className="h-64 flex items-center justify-center rounded-lg border text-sm font-mono"
        style={{ borderColor: "rgba(30,155,232,0.1)", color: "#3A5070" }}
      >
        No champions with {minGames}+ games yet.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Min games filter */}
      <div className="flex items-center gap-3">
        <span className="text-dim text-xs font-mono">Min games:</span>
        {[3, 5, 10].map((n) => (
          <button
            key={n}
            onClick={() => setMinGames(n)}
            className={`text-xs font-mono px-2 py-1 rounded border transition-colors ${
              minGames === n
                ? "border-primary text-primary bg-primary/10"
                : "border-primary/20 text-dim hover:text-white"
            }`}
          >
            {n}+
          </button>
        ))}
      </div>

      <ResponsiveContainer width="100%" height={Math.max(chartData.length * 44, 200)}>
        <BarChart
          layout="vertical"
          data={chartData}
          margin={{ top: 0, right: 48, left: 0, bottom: 0 }}
        >
          <CartesianGrid
            strokeDasharray="3 3"
            stroke="rgba(30,155,232,0.08)"
            horizontal={false}
          />
          <XAxis
            type="number"
            domain={[0, 100]}
            tick={{ fill: "#3A5070", fontSize: 11, fontFamily: "monospace" }}
            axisLine={false}
            tickLine={false}
            tickFormatter={(v) => `${v}%`}
          />
          <YAxis
            type="category"
            dataKey="name"
            width={80}
            tick={{ fill: "#C8C0B0", fontSize: 12 }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip
            content={<CustomTooltip />}
            cursor={{ fill: "rgba(30,155,232,0.05)" }}
          />
          <ReferenceLine
            x={50}
            stroke="rgba(30,155,232,0.3)"
            strokeDasharray="4 4"
          />
          <Bar dataKey="winrate" radius={[0, 4, 4, 0]} maxBarSize={24}>
            {chartData.map(
              (entry: ChampionStat & { name: string }, index: number) => (
                <Cell
                  key={`cell-${index}`}
                  fill={barColor(entry.winrate)}
                  fillOpacity={0.85}
                />
              )
            )}
            <LabelList
              dataKey="games"
              position="right"
              formatter={(v: unknown) => `${v}g`}
              style={{
                fill: "#3A5070",
                fontSize: 11,
                fontFamily: "monospace",
              }}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}