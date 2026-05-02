"use client";

import { useQuery } from "@tanstack/react-query";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { getKdaTrend, KDATrendPoint } from "@/lib/api";
import Skeleton from "@/components/ui/Skeleton";
import ChampionIconClient from "@/components/ui/ChampionIconClient";

interface KDATrendChartProps {
  puuid: string;
}

const LIMIT_OPTIONS = [10, 20, 50] as const;

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
        background: "var(--chart-tooltip-bg)",
        borderColor: "var(--chart-tooltip-border)",
        minWidth: 160,
      }}
    >
      <div className="flex items-center gap-2">
        <ChampionIconClient championId={d.champion_id} size={28} />
        <span
          className="text-xs font-bold"
          style={{ color: d.win ? "var(--success)" : "var(--danger)" }}
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
            d.kda >= 4 ? "var(--primary)" : d.kda >= 2 ? "var(--foreground-strong)" : "var(--chart-axis)",
        }}
      >
        {d.kda.toFixed(2)} KDA
      </div>
      <div className="text-xs" style={{ color: "var(--chart-axis)" }}>
        Game {d.game_index}
      </div>
    </div>
  );
}

export default function KDATrendChart({ puuid }: KDATrendChartProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const limitFromQuery = Number(searchParams.get("limit"));
  const selectedLimit = LIMIT_OPTIONS.includes(limitFromQuery as 10 | 20 | 50)
    ? (limitFromQuery as 10 | 20 | 50)
    : 20;

  const { data, isLoading, isError } = useQuery({
    queryKey: ["kda-trend", puuid, selectedLimit],
    queryFn: () => getKdaTrend(puuid, selectedLimit),
  });

  const updateLimit = (limit: 10 | 20 | 50) => {
    const params = new URLSearchParams(searchParams.toString());
    if (limit === 20) {
      params.delete("limit");
    } else {
      params.set("limit", String(limit));
    }
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };

  if (isLoading) return <Skeleton className="h-56 w-full" />;

  if (isError || !data || data.length === 0) {
    return (
      <div
        className="h-56 flex items-center justify-center rounded-lg border text-sm font-mono"
        style={{
          borderColor: "var(--border-soft)",
          color: "var(--chart-axis)",
        }}
      >
        <span>Not enough data for trend chart.</span>
        <span className="text-xs">Play more ranked games to see your KDA trend.</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <span className="text-dim text-xs font-mono uppercase tracking-wider">Range:</span>
        {LIMIT_OPTIONS.map((limit) => (
          <button
            key={limit}
            onClick={() => updateLimit(limit)}
            className={`px-2 py-1 rounded border text-xs font-mono transition-colors ${
              selectedLimit === limit
                ? "border-primary/60 text-primary bg-primary/10"
                : "border-primary/20 text-dim hover:text-white hover:border-primary/40"
            }`}
          >
            Last {limit}
          </button>
        ))}
      </div>

      <ResponsiveContainer width="100%" height={220}>
        <LineChart
          data={data}
          margin={{ top: 8, right: 8, left: -20, bottom: 0 }}
        >
          <CartesianGrid
            strokeDasharray="3 3"
            stroke="var(--chart-grid)"
            vertical={false}
          />
          <XAxis
            dataKey="game_index"
            tick={{ fill: "var(--chart-axis)", fontSize: 11, fontFamily: "monospace" }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            tick={{ fill: "var(--chart-axis)", fontSize: 11, fontFamily: "monospace" }}
            axisLine={false}
            tickLine={false}
            domain={[0, "auto"]}
          />
          <Tooltip
            content={<CustomTooltip />}
            cursor={{ stroke: "color-mix(in srgb, var(--primary) 32%, transparent)", strokeWidth: 1 }}
          />
          <Legend
            verticalAlign="top"
            align="right"
            iconSize={10}
            wrapperStyle={{
              fontSize: "11px",
              fontFamily: "monospace",
              color: "var(--chart-axis)",
              paddingBottom: "8px",
            }}
          />
          <ReferenceLine
            y={3}
            stroke="color-mix(in srgb, var(--primary) 36%, transparent)"
            strokeDasharray="4 4"
            label={{
              value: "carry",
              fill: "var(--chart-axis)",
              fontSize: 10,
              fontFamily: "monospace",
            }}
          />
          <ReferenceLine
            y={1}
            stroke="color-mix(in srgb, var(--danger) 28%, transparent)"
            strokeDasharray="4 4"
            label={{
              value: "even",
              fill: "var(--chart-axis)",
              fontSize: 10,
              fontFamily: "monospace",
            }}
          />
          <Line
            type="monotone"
            dataKey="kda"
            name="Per Game"
            stroke="rgba(30,155,232,0.35)"
            strokeWidth={1.5}
            dot={(props: { cx?: number; cy?: number; payload?: KDATrendPoint }) => {
              const { cx, cy, payload } = props;
              if (cx == null || cy == null || !payload) return <circle r={0} />;
              return (
                <circle
                  key={`dot-${payload.game_index}`}
                  cx={cx}
                  cy={cy}
                  r={4}
                  fill={payload.win ? "var(--success)" : "var(--danger)"}
                  stroke="none"
                />
              );
            }}
            activeDot={{ r: 6, fill: "var(--primary)", stroke: "var(--surface)", strokeWidth: 2 }}
          />
          <Line
            type="monotone"
            dataKey="rolling_avg"
            name="5-Game Avg"
            stroke="color-mix(in srgb, var(--foreground-strong) 78%, transparent)"
            strokeWidth={2.5}
            dot={false}
            activeDot={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
