"use client";

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Brush,
  ReferenceArea,
  ReferenceLine,
} from "recharts";
import { getGoldCurves, getChampionStats, GoldCurvePoint } from "@/lib/api";
import Skeleton from "@/components/ui/Skeleton";


interface GoldCurveChartProps {
  puuid: string;
}

function formatGold(value: number): string {
  if (value >= 1000) return `${(value / 1000).toFixed(1)}k`;
  return String(value);
}

function formatGoldCommas(value: number): string {
  return value.toLocaleString("en-US");
}

function CustomTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: { value: number }[];
  label?: number;
}) {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <div
      className="border rounded-lg px-3 py-2"
      style={{
        background: "#0D1E3A",
        borderColor: "rgba(30,155,232,0.3)",
      }}
    >
      <p className="text-white text-xs font-mono">
        Minute {label}: {formatGoldCommas(payload[0].value)} gold
      </p>
    </div>
  );
}

function useChampionOptions(puuid: string) {
  const { data } = useQuery({
    queryKey: ["champion-stats", puuid],
    queryFn: () => getChampionStats(puuid),
  });
  return data ?? [];
}

function useChampionName(championId: number): string {
  const [name, setName] = useState("");
  useEffect(() => {
    if (!championId) return;
    fetch("https://ddragon.leagueoflegends.com/api/versions.json")
      .then((r) => r.json())
      .then(async (versions: string[]) => {
        const patch = versions[0];
        const res = await fetch(
          `https://ddragon.leagueoflegends.com/cdn/${patch}/data/en_US/champion.json`
        );
        const data = await res.json();
        const champions = data.data as Record<string, { key: string; name: string }>;
        const found = Object.values(champions).find(
          (c) => parseInt(c.key) === championId
        );
        if (found) setName(found.name);
      })
      .catch(() => {});
  }, [championId]);
  return name;
}

export default function GoldCurveChart({ puuid }: GoldCurveChartProps) {
  const [selectedChampion, setSelectedChampion] = useState<number | undefined>(
    undefined
  );
  const [brushStart, setBrushStart] = useState(0);
  const [brushEnd, setBrushEnd] = useState(35);

  const champions = useChampionOptions(puuid);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["gold-curves", puuid, selectedChampion],
    queryFn: () => getGoldCurves(puuid, selectedChampion),
  });

  if (isLoading) return <Skeleton className="h-64 w-full" />;

  if (isError || !data || data.length === 0) {
    return (
      <div
        className="h-64 flex items-center justify-center rounded-lg border text-sm font-mono"
        style={{ borderColor: "rgba(30,155,232,0.1)", color: "#3A5070" }}
      >
        Not enough timeline data to build gold curve.
      </div>
    );
  }

  // quick-select helpers — find data index by minute value
  const indexOfMinute = (minute: number) => {
    if (!data) return 0;
    const idx = data.findIndex((d) => d.minute >= minute);
    return idx === -1 ? data.length - 1 : idx;
  };

  const setPhase = (phase: "early" | "mid" | "late") => {
    if (!data) return;
    if (phase === "early") { setBrushStart(0); setBrushEnd(indexOfMinute(15) - 1); }
    if (phase === "mid")   { setBrushStart(indexOfMinute(15)); setBrushEnd(indexOfMinute(25) - 1); }
    if (phase === "late")  { setBrushStart(indexOfMinute(25)); setBrushEnd(data.length - 1); }
  };

  return (
    <div className="flex flex-col gap-3">
      {/* Champion filter */}
      <div className="flex items-center gap-3">
        <span className="text-dim text-xs font-mono">Champion:</span>
        <select
          value={selectedChampion ?? ""}
          onChange={(e) =>
            setSelectedChampion(
              e.target.value === "" ? undefined : parseInt(e.target.value)
            )
          }
          className="bg-surface2 border border-primary/20 rounded px-3 py-1 text-white text-xs font-mono focus:outline-none focus:border-primary/50"
        >
          <option value="">All Champions</option>
          {champions.slice(0, 15).map((c) => (
            <option key={c.championId} value={c.championId}>
              ID {c.championId} ({c.games}g)
            </option>
          ))}
        </select>
      </div>

      {/* Phase quick-select */}
      <div className="flex items-center gap-2">
        <span className="text-dim text-xs font-mono">Phase:</span>
        {(["early", "mid", "late"] as const).map((phase) => (
          <button
            key={phase}
            onClick={() => setPhase(phase)}
            className="text-xs font-mono px-2 py-1 rounded border border-primary/20 text-dim hover:text-white hover:border-primary/40 transition-colors capitalize"
          >
            {phase === "early" ? "Early (0–14m)" : phase === "mid" ? "Mid (15–24m)" : "Late (25m+)"}
          </button>
        ))}
        <button
          onClick={() => { if (data) { setBrushStart(0); setBrushEnd(data.length - 1); } }}
          className="text-xs font-mono px-2 py-1 rounded border border-primary/20 text-dim hover:text-white hover:border-primary/40 transition-colors"
        >
          All
        </button>
      </div>

      {/* Chart */}
      <ResponsiveContainer width="100%" height={300}>
        <AreaChart
          data={data}
          margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
        >
          <defs>
            <linearGradient id="goldGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#1E9BE8" stopOpacity={0.3} />
              <stop offset="95%" stopColor="#1E9BE8" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid
            strokeDasharray="3 3"
            stroke="rgba(30,155,232,0.08)"
            vertical={false}
          />
          <XAxis
            dataKey="minute"
            tick={{ fill: "#3A5070", fontSize: 11, fontFamily: "monospace" }}
            axisLine={false}
            tickLine={false}
            tickFormatter={(v) => `${v}m`}
            interval={4}
          />
          <YAxis
            tick={{ fill: "#3A5070", fontSize: 11, fontFamily: "monospace" }}
            axisLine={false}
            tickLine={false}
            tickFormatter={formatGold}
            width={40}
          />
          <Tooltip content={<CustomTooltip />} />
          <Area
            type="monotone"
            dataKey="avg_gold"
            stroke="#1E9BE8"
            strokeWidth={2}
            fill="url(#goldGradient)"
            dot={false}
            activeDot={{ r: 4, fill: "#1E9BE8", stroke: "#0A1628", strokeWidth: 2 }}
          />

          {/* Game phase reference areas */}
          {/* Phase reference areas — no labels */}
          <ReferenceArea x1={0}  x2={14} fill="rgba(76,175,114,0.04)" />
          <ReferenceArea x1={15} x2={24} fill="rgba(200,155,60,0.04)" />
          <ReferenceArea x1={25} x2={35} fill="rgba(232,82,60,0.04)" />

          {/* Phase boundary lines with labels at the bottom */}
          <ReferenceLine
            x={0}
            stroke="transparent"
            label={{ value: "Early", position: "insideBottomLeft", fill: "#4CAF72", fontSize: 9, fontFamily: "monospace", offset: 8 }}
          />
          <ReferenceLine
            x={15}
            stroke="rgba(200,155,60,0.2)"
            strokeDasharray="3 3"
            label={{ value: "Mid", position: "insideBottomRight", fill: "#C89B3C", fontSize: 9, fontFamily: "monospace", offset: 8 }}
          />
          <ReferenceLine
            x={25}
            stroke="rgba(232,82,60,0.2)"
            strokeDasharray="3 3"
            label={{ value: "Late", position: "insideBottomRight", fill: "#E8523C", fontSize: 9, fontFamily: "monospace", offset: 8 }}
          />

          {/* Brush */}
          <Brush
            dataKey="minute"
            height={20}
            stroke="rgba(30,155,232,0.3)"
            fill="rgba(10,22,40,0.8)"
            travellerWidth={8}
            startIndex={brushStart}
            endIndex={brushEnd}
            onChange={(range) => {
              if (range.startIndex !== undefined) setBrushStart(range.startIndex);
              if (range.endIndex !== undefined) setBrushEnd(range.endIndex);
            }}
            tickFormatter={(v) => `${v}m`}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}