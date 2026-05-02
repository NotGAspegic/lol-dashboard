"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  Radar,
  ResponsiveContainer,
} from "recharts";
import { getPlaystyle } from "@/lib/api";
import Skeleton from "@/components/ui/Skeleton";

interface PlaystyleRadarProps {
  puuid: string;
}

const AXIS_EMOJI = {
  aggression: "⚔",
  farming: "🌾",
  vision: "👁",
  objective_control: "🎯",
  teamfight: "⚡",
  consistency: "🎲",
};

const AXIS_LABELS = {
  aggression: "Aggression",
  farming: "Farming",
  vision: "Vision",
  objective_control: "Objectives",
  teamfight: "Teamfight",
  consistency: "Consistency",
};

export default function PlaystyleRadar({ puuid }: PlaystyleRadarProps) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["playstyle", puuid],
    queryFn: () => getPlaystyle(puuid),
  });

  const radarData = useMemo(() => {
    if (!data) return [];
    return [
      { axis: `${AXIS_EMOJI.aggression} Aggression`, value: data.aggression },
      { axis: `${AXIS_EMOJI.farming} Farming`, value: data.farming },
      { axis: `${AXIS_EMOJI.vision} Vision`, value: data.vision },
      { axis: `${AXIS_EMOJI.objective_control} Objectives`, value: data.objective_control },
      { axis: `${AXIS_EMOJI.teamfight} Teamfight`, value: data.teamfight },
      { axis: `${AXIS_EMOJI.consistency} Consistency`, value: data.consistency },
    ];
  }, [data]);

  const interpretation = useMemo(() => {
    if (!data) return "";

    const scores = [
      { name: "Aggression", score: data.aggression },
      { name: "Farming", score: data.farming },
      { name: "Vision", score: data.vision },
      { name: "Objectives", score: data.objective_control },
      { name: "Teamfight", score: data.teamfight },
      { name: "Consistency", score: data.consistency },
    ];

    const sorted = [...scores].sort((a, b) => b.score - a.score);
    const highest1 = sorted[0];
    const highest2 = sorted[1];
    const lowest = sorted[sorted.length - 1];

    return `You excel at ${highest1.name} and ${highest2.name}, but your ${lowest.name} needs work.`;
  }, [data]);

  if (isLoading) return <Skeleton className="h-80 w-full" />;

  if (isError || !data) {
    return (
      <div
        className="h-80 flex items-center justify-center rounded-lg border text-sm font-mono"
        style={{ borderColor: "var(--border-soft)", color: "var(--chart-axis)" }}
      >
        Not enough data for playstyle analysis.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <ResponsiveContainer width="100%" height={280}>
        <RadarChart data={radarData}>
          <PolarGrid stroke="color-mix(in srgb, var(--primary) 18%, transparent)" />
          <PolarAngleAxis
            dataKey="axis"
            tick={{ fill: "var(--muted-strong)", fontSize: 10, fontFamily: "monospace" }}
          />
          <Radar
            dataKey="value"
            stroke="var(--primary)"
            fill="color-mix(in srgb, var(--primary) 22%, transparent)"
            strokeWidth={2}
          />
        </RadarChart>
      </ResponsiveContainer>

      <p
        className="text-xs font-mono text-center"
        style={{ color: "var(--chart-axis)", lineHeight: "1.4" }}
      >
        {interpretation}
      </p>
    </div>
  );
}
