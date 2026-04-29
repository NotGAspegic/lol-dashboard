"use client";

import type { CSSProperties } from "react";
import { AlertTriangle } from "lucide-react";
import { useQuery } from "@tanstack/react-query";

import Card from "@/components/ui/Card";
import Skeleton from "@/components/ui/Skeleton";
import { getTiltPrediction } from "@/lib/api";


interface TiltBannerProps {
  puuid: string;
}

function tiltColor(score: number) {
  if (score >= 70) return "#E8523C";
  if (score >= 40) return "#C89B3C";
  return "#4CAF72";
}

function TiltGauge({ score }: { score: number }) {
  const color = tiltColor(score);

  return (
    <div className="flex items-center gap-3">
      <div className="text-3xl font-bold font-mono" style={{ color }}>
        {Math.round(score)}
      </div>
      <div className="flex-1 h-2 bg-surface2 rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${score}%`, background: color }}
        />
      </div>
      <span className="text-dim text-xs font-mono">/ 100</span>
    </div>
  );
}

export default function TiltBanner({ puuid }: TiltBannerProps) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["tilt-prediction", puuid],
    queryFn: () => getTiltPrediction(puuid),
    staleTime: 1000 * 60 * 10,
    gcTime: 1000 * 60 * 30,
    refetchOnWindowFocus: false,
  });

  if (isLoading) {
    return (
      <Card className="flex flex-col gap-4">
        <div className="flex items-start gap-3">
          <div className="mt-0.5">
            <Skeleton className="h-10 w-10 rounded-lg" />
          </div>
          <div className="flex-1 space-y-2">
            <div className="flex items-center gap-2">
              <Skeleton className="h-3 w-28 rounded-full" />
              <Skeleton className="h-3 w-16 rounded-full" />
            </div>
            <Skeleton className="h-4 w-72 max-w-full rounded-full" />
          </div>
        </div>

        <div className="space-y-2">
          <div className="text-xs font-mono uppercase tracking-wider text-dim">
            Analyzing recent games...
          </div>
          <Skeleton className="h-12 w-full rounded-lg" />
        </div>
      </Card>
    );
  }

  if (isError || !data || data.tilt_score == null) {
    return null;
  }

  if (data.tilt_level !== "high" && data.tilt_level !== "moderate") {
    return null;
  }

  const score = Math.max(0, Math.min(100, data.tilt_score * 100));
  const isHigh = data.tilt_level === "high";
  const accent = isHigh ? "#E8523C" : "#C89B3C";
  const border = isHigh ? "rgba(232,82,60,0.45)" : "rgba(200,155,60,0.38)";
  const glow = isHigh ? "rgba(232,82,60,0.08)" : "rgba(200,155,60,0.07)";

  return (
    <Card
      className="flex flex-col gap-4"
      style={
        {
          borderColor: border,
          background: `linear-gradient(180deg, ${glow} 0%, rgba(10,22,40,0.98) 100%)`,
        } as CSSProperties
      }
    >
      <div className="flex items-start gap-3">
        <div
          className="mt-0.5 flex h-10 w-10 items-center justify-center rounded-lg border"
          style={{ borderColor: border, color: accent, background: glow }}
        >
          <AlertTriangle size={18} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span
              className="text-xs font-mono uppercase tracking-wider"
              style={{ color: accent }}
            >
              {isHigh ? "High Tilt Risk" : "Moderate Tilt Risk"}
            </span>
            <span className="text-dim text-xs font-mono">
              {data.games_analyzed} games
            </span>
          </div>
          <p className="mt-1 text-sm text-white">
            {isHigh
              ? "Consider taking a break — your recent performance suggests tilt."
              : "Heads-up: your recent games show some tilt signals."}
          </p>
        </div>
      </div>

      <TiltGauge score={score} />

      {isHigh ? (
        <ul className="grid gap-2">
          {data.reasons.slice(0, 3).map((reason) => (
            <li key={reason} className="flex gap-2 text-sm text-slate-200">
              <span className="mt-1 h-1.5 w-1.5 rounded-full" style={{ background: accent }} />
              <span>{reason}</span>
            </li>
          ))}
        </ul>
      ) : data.reasons[0] ? (
        <div
          className="rounded-lg border px-3 py-2 text-sm text-slate-200"
          style={{ borderColor: "rgba(200,155,60,0.24)", background: "rgba(200,155,60,0.05)" }}
        >
          {data.reasons[0]}
        </div>
      ) : null}
    </Card>
  );
}
