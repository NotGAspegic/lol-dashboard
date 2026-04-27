"use client";

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
import { getVisionImpact, VisionImpactPoint } from "@/lib/api";
import Skeleton from "@/components/ui/Skeleton";

interface VisionImpactChartProps {
  puuid: string;
}

function barColor(winrate: number): string {
  if (winrate >= 55) return "#4CAF72";
  if (winrate >= 45) return "#C89B3C";
  return "#E8523C";
}

function CustomTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: { payload: VisionImpactPoint }[];
}) {
  if (!active || !payload || payload.length === 0) return null;
  const d = payload[0].payload;
  return (
    <div
      className="border rounded-lg p-3 flex flex-col gap-1"
      style={{ background: "#0D1E3A", borderColor: "rgba(30,155,232,0.3)", minWidth: 150 }}
    >
      <span className="text-white text-sm font-semibold">{d.label}</span>
      <span className="text-xs font-mono" style={{ color: barColor(d.win_rate) }}>
        {d.win_rate.toFixed(1)}% win rate
      </span>
      <span className="text-xs font-mono" style={{ color: "#3A5070" }}>
        avg vision: {d.avg_vision}
      </span>
      <span className="text-xs font-mono" style={{ color: "#3A5070" }}>
        {d.game_count} games
      </span>
    </div>
  );
}

export default function VisionImpactChart({ puuid }: VisionImpactChartProps) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["vision-impact", puuid],
    queryFn: () => getVisionImpact(puuid),
  });

  if (isLoading) return <Skeleton className="h-48 w-full" />;

  if (isError || !data || data.length === 0) {
    return (
      <div
        className="h-48 flex items-center justify-center rounded-lg border text-sm font-mono"
        style={{ borderColor: "rgba(30,155,232,0.1)", color: "#3A5070" }}
      >
        Not enough data for vision analysis.
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart
        data={data}
        margin={{ top: 16, right: 16, left: 0, bottom: 0 }}
      >
        <CartesianGrid
          strokeDasharray="3 3"
          stroke="rgba(30,155,232,0.08)"
          vertical={false}
        />
        <XAxis
          dataKey="label"
          tick={{ fill: "#C8C0B0", fontSize: 11, fontFamily: "monospace" }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          domain={[0, 100]}
          tick={{ fill: "#3A5070", fontSize: 11, fontFamily: "monospace" }}
          axisLine={false}
          tickLine={false}
          tickFormatter={(v) => `${v}%`}
          width={36}
        />
        <Tooltip content={<CustomTooltip />} cursor={{ fill: "rgba(30,155,232,0.05)" }} />
        <ReferenceLine
          y={50}
          stroke="rgba(30,155,232,0.3)"
          strokeDasharray="4 4"
        />
        <Bar dataKey="win_rate" radius={[4, 4, 0, 0]} maxBarSize={64}>
          {data.map((entry, index) => (
            <Cell
              key={`cell-${index}`}
              fill={barColor(entry.win_rate)}
              fillOpacity={0.85}
            />
          ))}
          <LabelList
            dataKey="avg_vision"
            position="insideTop"
            formatter={(v: unknown) => `avg: ${v}`}
            style={{ fill: "rgba(255,255,255,0.6)", fontSize: 10, fontFamily: "monospace" }}
          />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}