"use client";

import { Swords } from "lucide-react";

import { DraftPrediction } from "@/lib/api";

function probabilityColor(probability: number) {
  if (probability >= 0.6) return "#4CAF72";
  if (probability <= 0.4) return "#E8523C";
  return "#C89B3C";
}

function parseTrainingMatchCount(note: string) {
  const match = note.match(/Based on\s+([\d,]+)\s+training matches/i);
  return match?.[1] ?? null;
}

function formatChampionRecord(games: number, winrate: number) {
  if (games <= 0) {
    return "No recorded games on this champion yet";
  }

  const wins = Math.round((games * winrate) / 100);
  const losses = Math.max(games - wins, 0);
  return `You are ${wins}-${losses} on this champion`;
}

export default function DraftProbabilityGauge({
  prediction,
}: {
  prediction: DraftPrediction;
}) {
  const percent = Math.round(prediction.win_probability * 100);
  const accent = probabilityColor(prediction.win_probability);
  const trainingMatchCount = parseTrainingMatchCount(prediction.note);

  return (
    <div className="flex w-full flex-col items-center gap-5">
      <div className="flex h-14 w-14 items-center justify-center rounded-full border border-primary/20 bg-surface2/70">
        <Swords size={20} color={accent} />
      </div>

      <div className="flex flex-col items-center gap-2 text-center">
        <div className="text-xs font-mono uppercase tracking-wider text-dim">
          Blue Win Probability
        </div>
        <div className="text-5xl font-bold font-mono leading-none" style={{ color: accent }}>
          {percent}%
        </div>
        <div
          className="rounded-full border px-2 py-1 text-xs font-mono uppercase tracking-wider"
          style={{ borderColor: `${accent}55`, color: accent, background: `${accent}14` }}
        >
          {prediction.confidence} confidence
        </div>
      </div>

      <div className="relative w-full max-w-sm">
        <div
          className="h-4 overflow-hidden rounded-full border"
          style={{
            borderColor: "rgba(30,155,232,0.14)",
            background:
              "linear-gradient(90deg, rgba(232,82,60,0.35) 0%, rgba(200,155,60,0.3) 50%, rgba(76,175,114,0.35) 100%)",
          }}
        >
          <div
            className="h-full rounded-full transition-[width] duration-500 ease-in-out"
            style={{
              width: `${percent}%`,
              background: `linear-gradient(90deg, ${accent}aa 0%, ${accent} 100%)`,
            }}
          />
        </div>
        <div className="pointer-events-none absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-white/35" />
        <div
          className="pointer-events-none absolute top-1/2 h-6 w-1 -translate-x-1/2 -translate-y-1/2 rounded-full shadow-sm transition-[left] duration-500 ease-in-out"
          style={{ left: `${percent}%`, background: accent }}
        />
        <div className="mt-2 flex items-center justify-between text-[11px] font-mono uppercase tracking-wider text-dim">
          <span>0%</span>
          <span>50%</span>
          <span>100%</span>
        </div>
      </div>

      <div className="space-y-1 text-center text-xs text-dim">
        <div>{trainingMatchCount ? `Based on ${trainingMatchCount} training matches` : prediction.note}</div>
        <div>{formatChampionRecord(prediction.player_champion_games, prediction.player_champion_winrate)}</div>
        <div>
          Historical win rate on this champion: {prediction.player_champion_winrate.toFixed(1)}%
        </div>
      </div>

      <div className="max-w-sm text-center text-[11px] leading-5 text-dim">
        Predictions are based on historical data and have inherent uncertainty. This is a tool for
        insight, not a guarantee.
      </div>
    </div>
  );
}
