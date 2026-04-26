"use client";

import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
  ZAxis,
} from "recharts";
import { getPerformanceScatter, ScatterPoint } from "@/lib/api";
import { formatDuration } from "@/lib/utils";
import ChampionIconClient from "@/components/ui/ChampionIconClient";
import Skeleton from "@/components/ui/Skeleton";

interface PerformanceScatterProps {
  puuid: string;
}

function useChampionNames(ids: number[]) {
  const [names, setNames] = useState<Record<number, string>>({});
  useMemo(() => {
    if (ids.length === 0) return;
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
        for (const c of Object.values(champions)) {
          const id = parseInt(c.key);
          if (ids.includes(id)) map[id] = c.name;
        }
        setNames(map);
      })
      .catch(() => {});
  }, [ids.join(",")]);
  return names;
}

function CustomTooltip({ active, payload }: { active?: boolean; payload?: { payload: ScatterPoint }[] }) {
  if (!active || !payload || payload.length === 0) return null;
  const d = payload[0].payload;
  return (
    <div
      className="border rounded-lg p-3 flex flex-col gap-2"
      style={{ background: "#0D1E3A", borderColor: "rgba(30,155,232,0.3)", minWidth: 160 }}
    >
      <div className="flex items-center gap-2">
        <ChampionIconClient championId={d.champion_id} size={28} />
        <span className="text-xs font-bold" style={{ color: d.win ? "#4CAF72" : "#E8523C" }}>
          {d.win ? "WIN" : "LOSS"}
        </span>
      </div>
      <div className="text-white text-sm font-mono">
        {d.kills}/{d.deaths}/{d.assists}
      </div>
      <div className="text-xs font-mono" style={{ color: "#3A5070" }}>
        {(d.damage_share * 100).toFixed(1)}% dmg share
      </div>
      <div className="text-xs font-mono" style={{ color: "#3A5070" }}>
        {d.kda.toFixed(2)} KDA · {formatDuration(d.game_duration)}
      </div>
    </div>
  );
}

const QUADRANT_LABELS = [
  { x: "right", y: "top", label: "Efficient Carry", color: "#4CAF72" },
  { x: "left", y: "top", label: "High Impact Low KDA", color: "#C89B3C" },
  { x: "right", y: "bottom", label: "Safe Low Impact", color: "#3A5070" },
  { x: "left", y: "bottom", label: "Underperforming", color: "#E8523C" },
];

export default function PerformanceScatter({ puuid }: PerformanceScatterProps) {
  const [selectedChampion, setSelectedChampion] = useState<number | null>(null);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["perf-scatter", puuid],
    queryFn: () => getPerformanceScatter(puuid),
  });

  const uniqueChampionIds = useMemo(
    () => [...new Set((data ?? []).map((d) => d.champion_id))],
    [data]
  );

  const names = useChampionNames(uniqueChampionIds);

  const filtered = useMemo(() => {
    if (!data) return [];
    if (selectedChampion === null) return data;
    return data.filter((d) => d.champion_id === selectedChampion);
  }, [data, selectedChampion]);

  const medianKda = useMemo(() => {
    if (!filtered.length) return 2;
    const sorted = [...filtered].map((d) => d.kda).sort((a, b) => a - b);
    return sorted[Math.floor(sorted.length / 2)];
  }, [filtered]);

  const medianDamageShare = useMemo(() => {
    if (!filtered.length) return 0.2;
    const sorted = [...filtered].map((d) => d.damage_share).sort((a, b) => a - b);
    return sorted[Math.floor(sorted.length / 2)];
  }, [filtered]);

  if (isLoading) return <Skeleton className="h-80 w-full" />;

  if (isError || !data || data.length === 0) {
    return (
      <div
        className="h-80 flex items-center justify-center rounded-lg border text-sm font-mono"
        style={{ borderColor: "rgba(30,155,232,0.1)", color: "#3A5070" }}
      >
      <span>Not enough data for trend chart.</span>
      <span className="text-xs">Play more ranked games to see your KDA trend.</span>
      </div>
    );
  }

  const wins = filtered.filter((d) => d.win);
  const losses = filtered.filter((d) => !d.win);

  return (
    <div className="flex flex-col gap-3">
      {/* Champion filter */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-dim text-xs font-mono">Filter:</span>
        <button
          onClick={() => setSelectedChampion(null)}
          className={`text-xs font-mono px-2 py-1 rounded border transition-colors ${
            selectedChampion === null
              ? "border-primary text-primary bg-primary/10"
              : "border-primary/20 text-dim hover:text-white"
          }`}
        >
          All
        </button>
        {uniqueChampionIds.slice(0, 8).map((id) => (
          <button
            key={id}
            onClick={() => setSelectedChampion(id === selectedChampion ? null : id)}
            className={`text-xs font-mono px-2 py-1 rounded border transition-colors ${
              selectedChampion === id
                ? "border-primary text-primary bg-primary/10"
                : "border-primary/20 text-dim hover:text-white"
            }`}
          >
            {names[id] ?? `#${id}`}
          </button>
        ))}
      </div>

      {/* Quadrant labels */}
      <div className="relative">
        <div className="absolute inset-0 pointer-events-none z-10">
          <div className="absolute top-2 right-2 text-xs font-mono opacity-40" style={{ color: "#4CAF72" }}>
            Efficient Carry ↗
          </div>
          <div className="absolute top-8 left-2 text-xs font-mono opacity-40" style={{ color: "#C89B3C" }}>
            ↖ High Impact Low KDA
          </div>
          <div className="absolute bottom-8 right-2 text-xs font-mono opacity-40" style={{ color: "#3A5070" }}>
            Safe Low Impact ↘
          </div>
          <div className="absolute bottom-8 left-2 text-xs font-mono opacity-40" style={{ color: "#E8523C" }}>
            ↙ Underperforming
          </div>
        </div>

        <ResponsiveContainer width="100%" height={320}>
          <ScatterChart margin={{ top: 16, right: 16, left: -16, bottom: 0 }}>
            <CartesianGrid
              strokeDasharray="3 3"
              stroke="rgba(30,155,232,0.08)"
            />
            <XAxis
              type="number"
              dataKey="kda"
              name="KDA"
              tick={{ fill: "#3A5070", fontSize: 11, fontFamily: "monospace" }}
              axisLine={false}
              tickLine={false}
              label={{
                value: "KDA",
                position: "insideBottom",
                offset: -4,
                fill: "#3A5070",
                fontSize: 11,
                fontFamily: "monospace",
              }}
            />
            <YAxis
              type="number"
              dataKey="damage_share"
              name="Damage Share"
              tick={{ fill: "#3A5070", fontSize: 11, fontFamily: "monospace" }}
              axisLine={false}
              tickLine={false}
              tickFormatter={(v) => `${(v * 100).toFixed(0)}%`}
            />
            <ZAxis
              type="number"
              dataKey="game_duration"
              range={[40, 160]}
            />
            <Tooltip
              content={<CustomTooltip />}
              cursor={{ strokeDasharray: "3 3", stroke: "rgba(30,155,232,0.2)" }}
            />
            <ReferenceLine
              x={medianKda}
              stroke="rgba(30,155,232,0.15)"
              strokeDasharray="4 4"
            />
            <ReferenceLine
              y={medianDamageShare}
              stroke="rgba(30,155,232,0.15)"
              strokeDasharray="4 4"
            />
            <Scatter
              name="Wins"
              data={wins}
              fill="#4CAF72"
              fillOpacity={0.7}
            />
            <Scatter
              name="Losses"
              data={losses}
              fill="#E8523C"
              fillOpacity={0.7}
            />
          </ScatterChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}