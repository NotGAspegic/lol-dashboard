"use client";

import { useQuery } from "@tanstack/react-query";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
} from "recharts";
import { getKdaTrend, KDATrendPoint } from "@/lib/api";
import Skeleton from "@/components/ui/Skeleton";
import ChampionIconClient from "@/components/ui/ChampionIconClient";

interface KDATrendChartProps {
  puuid: string;
}

function CustomTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: { payload: KDATrendPoint }[];
}) {
  if (!active || !payload || payload.length === 0) return null;
  const d = payload[0].payload;

  return (
    <div
      className="border rounded-lg p-3 flex flex-col gap-2"
      style={{
        background: "#0D1E3A",
        borderColor: "rgba(30,155,232,0.3)",
        minWidth: 160,
      }}
    >
      <div className="flex items-center gap-2">
        <ChampionIconClient championId={d.champion_id} size={28} />
        <span
          className="text-xs font-bold"
          style={{ color: d.win ? "#4CAF72" : "#E8523C" }}
        >
          {d.win ? "WIN" : "LOSS"}
        </span>
      </div>
      <div className="text-white text-sm font-mono">
        {d.kills}/{d.deaths}/{d.assists}
      </div>
      <div
        className="text-xs font-mono"
        style={{
          color:
            d.kda >= 4 ? "#1E9BE8" : d.kda >= 2 ? "#ffffff" : "#3A5070",
        }}
      >
        {d.kda.toFixed(2)} KDA
      </div>
      <div className="text-xs" style={{ color: "#3A5070" }}>
        Game {d.game_index}
      </div>
    </div>
  );
}

export default function KDATrendChart({ puuid }: KDATrendChartProps) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["kda-trend", puuid],
    queryFn: () => getKdaTrend(puuid, 20),
  });

  if (isLoading) return <Skeleton className="h-56 w-full" />;

  if (isError || !data || data.length === 0) {
    return (
      <div
        className="h-56 flex items-center justify-center rounded-lg border text-sm font-mono"
        style={{
          borderColor: "rgba(30,155,232,0.1)",
          color: "#3A5070",
        }}
      >
      <span>Not enough data for trend chart.</span>
      <span className="text-xs">Play more ranked games to see your KDA trend.</span>
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={220}>
      <LineChart
        data={data}
        margin={{ top: 8, right: 8, left: -20, bottom: 0 }}
      >
        <CartesianGrid
          strokeDasharray="3 3"
          stroke="rgba(30,155,232,0.08)"
          vertical={false}
        />
        <XAxis
          dataKey="game_index"
          tick={{ fill: "#3A5070", fontSize: 11, fontFamily: "monospace" }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          tick={{ fill: "#3A5070", fontSize: 11, fontFamily: "monospace" }}
          axisLine={false}
          tickLine={false}
          domain={[0, "auto"]}
        />
        <Tooltip
          content={<CustomTooltip />}
          cursor={{ stroke: "rgba(30,155,232,0.2)", strokeWidth: 1 }}
        />
        <ReferenceLine
          y={3}
          stroke="rgba(30,155,232,0.3)"
          strokeDasharray="4 4"
          label={{
            value: "carry",
            fill: "#3A5070",
            fontSize: 10,
            fontFamily: "monospace",
          }}
        />
        <ReferenceLine
          y={1}
          stroke="rgba(232,82,60,0.2)"
          strokeDasharray="4 4"
          label={{
            value: "even",
            fill: "#3A5070",
            fontSize: 10,
            fontFamily: "monospace",
          }}
        />
        <Line
          type="monotone"
          dataKey="kda"
          stroke="#1E9BE8"
          strokeWidth={2}
            dot={(props: { cx?: number; cy?: number; payload?: KDATrendPoint }) => {
            const { cx, cy, payload } = props;
            if (cx == null || cy == null || !payload) return <circle r={0} />;
            return (
                <circle
                key={`dot-${payload.game_index}`}
                cx={cx}
                cy={cy}
                r={4}
                fill={payload.win ? "#4CAF72" : "#E8523C"}
                stroke="none"
                />
            );
            }}
          activeDot={{ r: 6, fill: "#1E9BE8", stroke: "#0A1628", strokeWidth: 2 }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}