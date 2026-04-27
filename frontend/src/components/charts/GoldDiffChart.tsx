"use client";

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import { GoldDiffPoint } from "@/lib/api";
import { ValueType, NameType, Formatter } from "recharts/types/component/DefaultTooltipContent";

interface GoldDiffChartProps {
  data: GoldDiffPoint[];
}

export default function GoldDiffChart({ data }: GoldDiffChartProps) {
  if (!data || data.length === 0) {
    return (
      <div className="text-dim text-sm">
        No gold data available.
      </div>
    );
  }

  return (
    <div className="w-full h-94 rounded-lg border border-primary/20 bg-surface2/30 p-4">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart
          data={data}
          margin={{ top: 20, right: 30, left: 10, bottom: 10 }}
        >
          <defs>
            {/* Blue gradient for positive values */}
            <linearGradient id="colorBlue" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#1E9BE8" stopOpacity={0.3} />
              <stop offset="95%" stopColor="#1E9BE8" stopOpacity={0} />
            </linearGradient>
            {/* Red gradient for negative values */}
            <linearGradient id="colorRed" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#E8523C" stopOpacity={0.3} />
              <stop offset="95%" stopColor="#E8523C" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
          <XAxis
            dataKey="minute"
            stroke="rgba(255,255,255,0.3)"
            style={{ fontSize: "12px" }}
            label={{ value: "Minute", position: "insideBottomRight", offset: -5 }}
          />
          <YAxis
            stroke="rgba(255,255,255,0.3)"
            style={{ fontSize: "12px" }}
            label={{ value: "Gold Diff (Blue - Red)", angle: -90, position: "insideLeft" }}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: "rgba(0, 0, 0, 0.8)",
              border: "1px solid rgba(255, 255, 255, 0.2)",
              borderRadius: "6px",
            }}
            formatter={((value, name) => {
            if (typeof value !== "number") return [value ?? "", name ?? ""];
            return [`${value >= 0 ? "+" : ""}${value.toLocaleString()} gold`, name ?? ""];
            }) as Formatter<ValueType, NameType>}
            labelFormatter={(label) => `Minute ${label}`}
          />
          {/* Reference line at 0 */}
          <ReferenceLine
            y={0}
            stroke="rgba(255,255,255,0.2)"
            strokeDasharray="3 3"
          />
          {/* Blue area for positive values */}
          <Area
            type="monotone"
            dataKey={(d: GoldDiffPoint) => (d.gold_diff >= 0 ? d.gold_diff : 0)}
            stroke="#1E9BE8"
            strokeWidth={2}
            fill="url(#colorBlue)"
            isAnimationActive={false}
          />
          {/* Red area for negative values (inverted) */}
          <Area
            type="monotone"
            dataKey={(d: GoldDiffPoint) => (d.gold_diff < 0 ? d.gold_diff : 0)}
            stroke="#E8523C"
            strokeWidth={2}
            fill="url(#colorRed)"
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
