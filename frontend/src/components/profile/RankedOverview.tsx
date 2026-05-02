"use client";

import Image from "next/image";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Activity, Flame, Shield, Swords, TrendingUp, UserRound } from "lucide-react";

import Card from "@/components/ui/Card";
import {
  getRankedSummary,
  RankHistoryPoint,
  RankedQueueSummary,
  RankedTrendPoint,
  RoleSummary,
} from "@/lib/api";

const APEX_TARGETS: Record<string, { target: number; label: string }> = {
  MASTER: { target: 200, label: "GM target" },
  GRANDMASTER: { target: 500, label: "Challenger target" },
  CHALLENGER: { target: 1000, label: "Apex LP" },
};

const ROLE_META: Record<string, { short: string; label: string; accent: string }> = {
  TOP: { short: "TOP", label: "Top", accent: "#4DB8FF" },
  JUNGLE: { short: "JGL", label: "Jungle", accent: "#34C759" },
  MIDDLE: { short: "MID", label: "Mid", accent: "#C86BFF" },
  BOTTOM: { short: "BOT", label: "Bot", accent: "#E8523C" },
  UTILITY: { short: "SUP", label: "Support", accent: "#45C5A1" },
};

function tierAccent(tier?: string | null): string {
  switch ((tier ?? "").toUpperCase()) {
    case "IRON":
      return "#7B8798";
    case "BRONZE":
      return "#B77958";
    case "SILVER":
      return "#A9B7D0";
    case "GOLD":
      return "#D9B14A";
    case "PLATINUM":
      return "#45C5A1";
    case "EMERALD":
      return "#34C759";
    case "DIAMOND":
      return "#4DB8FF";
    case "MASTER":
      return "#C86BFF";
    case "GRANDMASTER":
      return "#FF6A8A";
    case "CHALLENGER":
      return "#6EE7FF";
    default:
      return "#1E9BE8";
  }
}

function formatTierName(queue: RankedQueueSummary): string {
  const tier = queue.tier.charAt(0) + queue.tier.slice(1).toLowerCase();
  return queue.rank ? `${tier} ${queue.rank}` : tier;
}

function formatRankLabel(point: Pick<RankHistoryPoint, "tier" | "rank">): string {
  const tier = point.tier.charAt(0) + point.tier.slice(1).toLowerCase();
  return point.rank ? `${tier} ${point.rank}` : tier;
}

function formatShortDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
  }).format(date);
}

function formatShortDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function formatDaysAgo(value: string, latestValue: string): string {
  const current = new Date(value).getTime();
  const latest = new Date(latestValue).getTime();
  if (Number.isNaN(current) || Number.isNaN(latest)) return formatShortDate(value);

  const deltaDays = Math.max(0, Math.round((latest - current) / (1000 * 60 * 60 * 24)));
  if (deltaDays === 0) return "Today";
  if (deltaDays === 1) return "1 day ago";
  return `${deltaDays} days ago`;
}

function rankDivisionValue(rank: string | null): number {
  switch ((rank ?? "").toUpperCase()) {
    case "IV":
      return 0;
    case "III":
      return 1;
    case "II":
      return 2;
    case "I":
      return 3;
    default:
      return 0;
  }
}

function tierBaseValue(tier: string): number {
  switch (tier.toUpperCase()) {
    case "IRON":
      return 0;
    case "BRONZE":
      return 4;
    case "SILVER":
      return 8;
    case "GOLD":
      return 12;
    case "PLATINUM":
      return 16;
    case "EMERALD":
      return 20;
    case "DIAMOND":
      return 24;
    case "MASTER":
      return 28;
    case "GRANDMASTER":
      return 32;
    case "CHALLENGER":
      return 36;
    default:
      return 0;
  }
}

function historyScore(point: RankHistoryPoint): number {
  const apexTier = ["MASTER", "GRANDMASTER", "CHALLENGER"].includes(point.tier.toUpperCase());
  const divisionValue = apexTier ? 0 : rankDivisionValue(point.rank);
  const lpWeight = apexTier ? 1 / 1000 : 1 / 100;
  return tierBaseValue(point.tier) + divisionValue + point.league_points * lpWeight;
}

function isSameCalendarDay(left: string, right: string): boolean {
  const leftDate = new Date(left);
  const rightDate = new Date(right);
  if (Number.isNaN(leftDate.getTime()) || Number.isNaN(rightDate.getTime())) return false;

  return (
    leftDate.getUTCFullYear() === rightDate.getUTCFullYear() &&
    leftDate.getUTCMonth() === rightDate.getUTCMonth() &&
    leftDate.getUTCDate() === rightDate.getUTCDate()
  );
}

function countSnapshotDays(history: RankHistoryPoint[]): number {
  return new Set(
    history.map((point) => {
      const date = new Date(point.captured_at);
      if (Number.isNaN(date.getTime())) return point.captured_at;
      return `${date.getUTCFullYear()}-${date.getUTCMonth()}-${date.getUTCDate()}`;
    })
  ).size;
}

function emblemAssetPath(tier: string): string {
  return `/ranked-emblems/${tier.toLowerCase()}.png`;
}

function positionAssetPath(tier: string | null | undefined, role: string): string | null {
  const tierLabelMap: Record<string, string> = {
    IRON: "Iron",
    BRONZE: "Bronze",
    SILVER: "Silver",
    GOLD: "Gold",
    PLATINUM: "Plat",
    DIAMOND: "Diamond",
    MASTER: "Master",
    GRANDMASTER: "Grandmaster",
    CHALLENGER: "Challenger",
  };
  const roleLabelMap: Record<string, string> = {
    TOP: "Top",
    JUNGLE: "Jungle",
    MIDDLE: "Mid",
    BOTTOM: "Bot",
    UTILITY: "Support",
  };

  const tierLabel = tier ? tierLabelMap[tier.toUpperCase()] : null;
  const roleLabel = roleLabelMap[role];
  if (!tierLabel || !roleLabel) return null;

  return `/ranked-positions/Position_${tierLabel}-${roleLabel}.png`;
}

function crestLabel(queue: RankedQueueSummary): string {
  if (queue.tier.toUpperCase() === "GRANDMASTER") return "GM";
  if (queue.tier.toUpperCase() === "CHALLENGER") return "CH";
  return queue.tier.slice(0, 2).toUpperCase();
}

function RoleLabel({ role }: { role: string }) {
  return ROLE_META[role]?.label ?? role;
}

function RoleBadge({
  role,
  tier,
  isFavorite,
}: {
  role: string;
  tier: string | null;
  isFavorite: boolean;
}) {
  const [imageMissing, setImageMissing] = useState(false);
  const meta = ROLE_META[role] ?? { short: role, label: role, accent: "#1E9BE8" };
  const assetPath = positionAssetPath(tier, role);

  if (!assetPath || imageMissing) {
    return (
      <div
        className="flex h-11 w-11 items-center justify-center rounded-md border text-[11px] font-mono font-semibold"
        style={{
          borderColor: `${meta.accent}55`,
          color: meta.accent,
          background: isFavorite ? `${meta.accent}12` : "rgba(13,30,58,0.48)",
          boxShadow: isFavorite ? `0 0 18px ${meta.accent}22` : "none",
        }}
      >
        {meta.short}
      </div>
    );
  }

  return (
    <div
      className="relative h-11 w-11 overflow-hidden rounded-md"
      style={{
        background: isFavorite ? `${meta.accent}12` : "rgba(13,30,58,0.48)",
        boxShadow: isFavorite ? `0 0 18px ${meta.accent}22` : "none",
      }}
    >
      <Image
        src={assetPath}
        alt={`${meta.label} ranked position`}
        fill
        className="object-contain p-1.5"
        sizes="44px"
        onError={() => setImageMissing(true)}
      />
    </div>
  );
}

function RankEmblem({
  queue,
  compact = false,
}: {
  queue: RankedQueueSummary;
  compact?: boolean;
}) {
  const [imageMissing, setImageMissing] = useState(false);
  const accent = tierAccent(queue.tier);
  const size = compact ? 80 : 96;

  if (imageMissing) {
    return (
      <div
        className="flex items-center justify-center rounded-2xl border text-lg font-bold uppercase tracking-wide"
        style={{
          width: size,
          height: size,
          color: accent,
          borderColor: `${accent}66`,
          background: `radial-gradient(circle at 30% 20%, ${accent}22 0%, rgba(13,30,58,0.88) 65%)`,
          boxShadow: `0 0 28px ${accent}18`,
        }}
      >
        {crestLabel(queue)}
      </div>
    );
  }

  return (
    <div
      className="relative overflow-hidden rounded-2xl"
      style={{
        width: size,
        height: size,
        filter: "drop-shadow(0 0 16px rgba(0,0,0,0.35))",
      }}
    >
      <Image
        src={emblemAssetPath(queue.tier)}
        alt={`${queue.tier} emblem`}
        fill
        sizes={compact ? "80px" : "96px"}
        className="object-contain"
        onError={() => setImageMissing(true)}
      />
    </div>
  );
}

function getLpProgress(queue: RankedQueueSummary): {
  percent: number;
  leftLabel: string;
  rightLabel: string;
  centerLabel: string;
} {
  const apexTarget = APEX_TARGETS[queue.tier.toUpperCase()];
  if (apexTarget) {
    return {
      percent: Math.max(6, Math.min(100, (queue.league_points / apexTarget.target) * 100)),
      leftLabel: "0 LP",
      rightLabel: apexTarget.label,
      centerLabel: `${queue.league_points} LP`,
    };
  }

  return {
    percent: Math.max(4, Math.min(100, queue.league_points)),
    leftLabel: "0 LP",
    rightLabel: "100 LP",
    centerLabel: `${queue.league_points} LP`,
  };
}

function RecentFormSparkline({
  trend,
  color,
}: {
  trend: RankedTrendPoint[];
  color: string;
}) {
  if (trend.length === 0) {
    return (
      <div className="flex h-36 items-center justify-center rounded-lg border border-primary/10 bg-surface/40 text-xs font-mono text-dim">
        Not enough tracked games yet
      </div>
    );
  }

  const values = trend.map((point) => point.net_wins);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = Math.max(max - min, 1);
  const width = 520;
  const height = 144;
  const step = trend.length === 1 ? 0 : width / (trend.length - 1);

  const points = trend
    .map((point, index) => {
      const x = index * step;
      const normalized = (point.net_wins - min) / range;
      const y = height - normalized * (height - 12) - 6;
      return `${x},${y}`;
    })
    .join(" ");

  return (
    <div className="rounded-lg border border-primary/10 p-3" style={{ background: "var(--panel-strong)" }}>
      <svg viewBox={`0 0 ${width} ${height}`} className="h-36 w-full">
        <line x1="0" y1={height - 8} x2={width} y2={height - 8} stroke="color-mix(in srgb, var(--chart-axis) 45%, transparent)" strokeDasharray="4 4" />
        <polyline
          fill="none"
          stroke={color}
          strokeWidth="3"
          strokeLinejoin="round"
          strokeLinecap="round"
          points={points}
        />
      </svg>
      <div className="mt-2 flex items-center justify-between text-[11px] font-mono uppercase tracking-wide text-dim">
        <span>Older</span>
        <span>Latest {trend.length}</span>
      </div>
    </div>
  );
}

function LpHistoryChart({
  history,
  color,
}: {
  history: RankHistoryPoint[];
  color: string;
}) {
  if (history.length === 0) {
    return (
      <div className="flex h-36 items-center justify-center rounded-lg border border-primary/10 bg-surface/40 text-xs font-mono text-dim">
        No LP snapshots yet
      </div>
    );
  }

  if (history.length === 1) {
    const point = history[0];

    return (
      <div className="rounded-lg border border-primary/10 p-4" style={{ background: "var(--panel-strong)" }}>
        <div className="flex min-h-36 flex-col justify-between gap-4 rounded-lg border border-dashed border-primary/10 p-4" style={{ background: "var(--panel-subtle)" }}>
          <div className="text-[11px] font-mono uppercase tracking-wide text-dim">Single ranked snapshot</div>
          <div className="flex items-end justify-between gap-4">
            <div>
              <div className="text-xs font-mono uppercase tracking-wide text-dim">
                {point.tier} {point.rank ?? ""}
              </div>
              <div className="mt-1 text-2xl font-semibold" style={{ color }}>
                {point.league_points} LP
              </div>
            </div>
            <div className="text-right text-[11px] font-mono uppercase tracking-wide text-dim">
              Snapshot history needs at least 2 points
            </div>
          </div>
        </div>
      </div>
    );
  }

  const scoredHistory = history.map((point) => ({
    ...point,
    score: historyScore(point),
  }));
  const values = scoredHistory.map((point) => point.score);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const uniqueSnapshotDays = new Set(
    history.map((point) => {
      const date = new Date(point.captured_at);
      if (Number.isNaN(date.getTime())) return point.captured_at;
      return `${date.getUTCFullYear()}-${date.getUTCMonth()}-${date.getUTCDate()}`;
    })
  ).size;
  const latestPoint = scoredHistory.at(-1) ?? scoredHistory[0];
  const peakPoint = scoredHistory.reduce((best, point) => (point.score > best.score ? point : best), scoredHistory[0]);
  const sparseHistory =
    scoredHistory.length < 3 ||
    uniqueSnapshotDays < 3 ||
    Math.abs(max - min) < 0.02;

  if (sparseHistory) {
    const earliestPoint = scoredHistory[0];
    const delta = latestPoint.league_points - earliestPoint.league_points;
    const sameDayWindow = isSameCalendarDay(earliestPoint.captured_at, latestPoint.captured_at);

    return (
      <div className="rounded-lg border border-primary/10 p-3" style={{ background: "var(--panel-strong)" }}>
        <div className="mb-3 flex items-center justify-between gap-4">
          <div className="flex items-baseline gap-2">
            <span className="text-sm font-semibold text-white">Last 30d</span>
            <span className={`text-xs font-mono ${delta >= 0 ? "text-green-400" : "text-red-400"}`}>
              {delta >= 0 ? "+" : ""}
              {delta} LP
            </span>
          </div>
          <span className="text-xs font-mono uppercase tracking-wide text-dim">
            Peak: {formatRankLabel(peakPoint)} {peakPoint.league_points} LP
          </span>
        </div>

        <div className="rounded-lg border border-primary/10 p-4" style={{ background: "var(--panel-muted)" }}>
          <div className="flex items-center justify-between text-[11px] font-mono uppercase tracking-wide text-dim">
            <span>{sameDayWindow ? "Earlier snapshot" : formatShortDate(earliestPoint.captured_at)}</span>
            <span>{formatShortDate(latestPoint.captured_at)}</span>
          </div>

          <div className="relative mt-6 h-16">
            <div className="absolute left-6 right-6 top-1/2 h-px -translate-y-1/2 border-t border-dashed border-primary/20" />
            <div className="absolute left-6 top-1/2 flex -translate-x-1/2 -translate-y-1/2 items-center justify-center">
              <span className="h-4 w-4 rounded-full border-2 border-white shadow-[0_0_18px_color-mix(in_srgb,var(--warning)_35%,transparent)]" style={{ background: "var(--warning)" }} />
            </div>
            <div className="absolute right-6 top-1/2 flex translate-x-1/2 -translate-y-1/2 items-center justify-center">
              <span
                className="h-4 w-4 rounded-full border-2 border-white shadow-[0_0_18px_color-mix(in_srgb,var(--primary)_30%,transparent)]"
                style={{ backgroundColor: color }}
              />
            </div>
          </div>

          <div className="mt-2 grid grid-cols-2 gap-4">
            <div>
              <div className="text-xs font-mono uppercase tracking-wide text-dim">
                {sameDayWindow ? formatShortDateTime(earliestPoint.captured_at) : formatRankLabel(earliestPoint)}
              </div>
              <div className="mt-1 text-lg font-semibold text-white">
                {formatRankLabel(earliestPoint)}
              </div>
              <div className="text-sm text-dim">{earliestPoint.league_points} LP</div>
            </div>
            <div className="text-right">
              <div className="text-xs font-mono uppercase tracking-wide text-dim">
                {formatShortDateTime(latestPoint.captured_at)}
              </div>
              <div className="mt-1 text-lg font-semibold text-white">
                {formatRankLabel(latestPoint)}
              </div>
              <div className="text-sm font-semibold" style={{ color }}>
                {latestPoint.league_points} LP
              </div>
            </div>
          </div>

          <div className="mt-4 text-[11px] font-mono uppercase tracking-wide text-dim">
            Collecting daily LP snapshots. The full 30d rank chart appears after more snapshot days are stored.
          </div>
        </div>
      </div>
    );
  }

  const range = Math.max(max - min, 1.25);
  const width = 520;
  const height = 184;
  const paddingX = 8;
  const paddingTop = 12;
  const paddingBottom = 26;
  const graphWidth = width - paddingX * 2;
  const graphHeight = height - paddingTop - paddingBottom;
  const step = scoredHistory.length === 1 ? 0 : graphWidth / (scoredHistory.length - 1);
  const points = scoredHistory
    .map((point, index) => {
      const x = paddingX + index * step;
      const normalized = (point.score - min) / range;
      const y = height - paddingBottom - normalized * graphHeight;
      return `${x},${y}`;
    })
    .join(" ");
  const circles = scoredHistory.map((point, index) => {
    const x = paddingX + index * step;
    const normalized = (point.score - min) / range;
    const y = height - paddingBottom - normalized * graphHeight;
    return { ...point, x, y };
  });
  const xAxisLabels = [
    circles[0],
    circles[Math.floor((circles.length - 1) / 2)],
    circles.at(-1),
  ].filter((point, index, arr): point is NonNullable<typeof point> => Boolean(point) && arr.findIndex((candidate) => candidate?.captured_at === point?.captured_at) === index);

  return (
    <div className="rounded-lg border border-primary/10 bg-[rgba(9,18,34,0.78)] p-3">
      <div className="mb-3 flex items-center justify-between gap-4">
        <div className="flex items-baseline gap-2">
          <span className="text-sm font-semibold text-white">Last 30d</span>
          <span className={`text-xs font-mono ${latestPoint.score >= scoredHistory[0].score ? "text-green-400" : "text-red-400"}`}>
            {latestPoint.score >= scoredHistory[0].score ? "+" : ""}
            {latestPoint.league_points - scoredHistory[0].league_points} LP
          </span>
        </div>
        <span className="text-xs font-mono uppercase tracking-wide text-dim">
          Peak: {formatRankLabel(peakPoint)} {peakPoint.league_points} LP
        </span>
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} className="h-48 w-full">
        <defs>
          <linearGradient id="lpHistoryFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.24" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        {[0.25, 0.5, 0.75].map((ratio) => {
          const y = paddingTop + graphHeight * ratio;
          return (
            <line
              key={ratio}
              x1={paddingX}
              y1={y}
              x2={width - paddingX}
              y2={y}
              stroke="color-mix(in srgb, var(--chart-axis) 30%, transparent)"
              strokeDasharray="4 6"
            />
          );
        })}
        {xAxisLabels.map((point) => (
          <line
            key={point.captured_at}
            x1={point.x}
            y1={paddingTop}
            x2={point.x}
            y2={height - paddingBottom}
            stroke="color-mix(in srgb, var(--chart-axis) 22%, transparent)"
            strokeDasharray="3 6"
          />
        ))}
        <path
          d={`M ${circles.map((point) => `${point.x} ${point.y}`).join(" L ")} L ${circles.at(-1)?.x ?? width - paddingX} ${height - paddingBottom} L ${circles[0]?.x ?? paddingX} ${height - paddingBottom} Z`}
          fill="url(#lpHistoryFill)"
        />
        <polyline
          fill="none"
          stroke={color}
          strokeWidth="3.5"
          strokeLinejoin="round"
          strokeLinecap="round"
          points={points}
        />
        {circles.map((point) => {
          const isPeak = point.captured_at === peakPoint.captured_at;
          const isLatest = point.captured_at === latestPoint.captured_at;
          if (!isPeak && !isLatest) return null;

          return (
            <g key={`${point.captured_at}-${isPeak ? "peak" : "latest"}`}>
              <circle cx={point.x} cy={point.y} r="8" fill={`${color}30`} />
              <circle cx={point.x} cy={point.y} r="5.5" fill={isPeak ? "var(--warning)" : color} stroke="var(--selection-text)" strokeWidth="1.5" />
            </g>
          );
        })}
        <line x1={paddingX} y1={height - paddingBottom} x2={width - paddingX} y2={height - paddingBottom} stroke="color-mix(in srgb, var(--chart-axis) 45%, transparent)" strokeDasharray="4 4" />
      </svg>
      <div className="mt-2 grid grid-cols-3 gap-2 text-[11px] font-mono uppercase tracking-wide text-dim">
        {xAxisLabels.map((point, index) => (
          <span
            key={`${point.captured_at}-label`}
            className={index === 1 ? "text-center" : index === 2 ? "text-right" : "text-left"}
          >
            {formatDaysAgo(point.captured_at, latestPoint.captured_at)}
          </span>
        ))}
      </div>
      <div className="mt-3 rounded-lg border border-primary/10 p-3" style={{ background: "var(--panel-soft)" }}>
        <div className="text-xs font-mono uppercase tracking-wide text-dim">
          Latest snapshot
        </div>
        <div className="mt-1 flex items-baseline justify-between gap-3">
          <div className="text-sm font-semibold text-white">
            {formatRankLabel(latestPoint)}
          </div>
          <div className="text-lg font-semibold" style={{ color }}>
            {latestPoint.league_points} LP
          </div>
        </div>
        <div className="mt-1 text-[11px] font-mono uppercase tracking-wide text-dim">
          {formatShortDate(latestPoint.captured_at)}
        </div>
      </div>
    </div>
  );
}

function QueueStatusPills({ queue }: { queue: RankedQueueSummary }) {
  const pills = [
    queue.hot_streak ? "Hot streak" : null,
    queue.fresh_blood ? "Fresh blood" : null,
    queue.veteran ? "Veteran" : null,
    queue.inactive ? "Inactive" : null,
  ].filter(Boolean);

  if (pills.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-2">
      {pills.map((pill) => (
        <span
          key={pill}
          className="rounded-full border border-primary/15 bg-surface2 px-2.5 py-1 text-[11px] font-mono uppercase tracking-wide text-dim"
        >
          {pill}
        </span>
      ))}
    </div>
  );
}

function RankedCoverageStrip({
  snapshotDays,
  snapshots,
  trackedGames,
  liveSource,
  recentGames,
}: {
  snapshotDays: number;
  snapshots: number;
  trackedGames: number;
  liveSource: string;
  recentGames: number;
}) {
  const coverageTone =
    snapshotDays >= 7 ? "text-green-300" : snapshotDays >= 3 ? "text-cyan-300" : "text-amber-300";
  const liveSourceLabel =
    liveSource === "live" ? "Live Riot" : liveSource === "snapshot" ? "Stored snapshot" : "Unavailable";

  return (
    <div className="grid gap-2 md:grid-cols-2 2xl:grid-cols-4">
      <div className="min-w-0 rounded-lg border border-primary/10 bg-surface2/45 p-3">
        <div className="text-[11px] font-mono uppercase tracking-wide text-dim">Snapshot Days</div>
        <div className={`mt-1 text-lg font-semibold ${coverageTone}`}>{snapshotDays}</div>
        <div className="text-[11px] text-dim">{snapshots} total captures</div>
      </div>
      <div className="min-w-0 rounded-lg border border-primary/10 bg-surface2/45 p-3">
        <div className="text-[11px] font-mono uppercase tracking-wide text-dim">Tracked Ranked</div>
        <div className="mt-1 text-lg font-semibold text-white">{trackedGames}</div>
        <div className="text-[11px] text-dim">{recentGames} games in last 30d</div>
      </div>
      <div className="min-w-0 rounded-lg border border-primary/10 bg-surface2/45 p-3">
        <div className="text-[11px] font-mono uppercase tracking-wide text-dim">LP Chart Mode</div>
        <div className="mt-1 text-lg font-semibold text-white">
          {snapshotDays >= 3 ? "Trend" : snapshotDays >= 1 ? "Snapshot" : "Pending"}
        </div>
        <div className="text-[11px] text-dim">
          {snapshotDays >= 3 ? "Enough history for a real curve" : "Collecting daily coverage"}
        </div>
      </div>
      <div className="min-w-0 rounded-lg border border-primary/10 bg-surface2/45 p-3">
        <div className="text-[11px] font-mono uppercase tracking-wide text-dim">Live Queue Source</div>
        <div className="mt-1 break-words text-base font-semibold text-white xl:text-lg">{liveSourceLabel}</div>
        <div className="text-[11px] text-dim">
          {liveSource === "live" ? "Fresh queue lookup from Riot" : "Falling back to tracked rank state"}
        </div>
      </div>
    </div>
  );
}

function TopRolesCard({
  favoriteRole,
  roles,
  tier,
}: {
  favoriteRole: string | null;
  roles: RoleSummary[];
  tier: string | null;
}) {
  const visibleRoles = roles.slice(0, 5);

  return (
    <Card className="flex min-h-[210px] flex-col gap-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <UserRound className="h-4 w-4 text-primary" />
          <span className="text-sm font-semibold text-white">Top Roles</span>
        </div>
        <span className="text-xs font-mono uppercase tracking-wide text-dim">
          {favoriteRole ? `Fav: ${ROLE_META[favoriteRole]?.short ?? favoriteRole}` : "Tracked ranked"}
        </span>
      </div>

      {visibleRoles.length > 0 ? (
        <>
          <div className="flex min-h-[92px] items-end gap-3 rounded-lg border border-primary/10 px-3 pb-3 pt-4" style={{ background: "var(--panel-strong)" }}>
            {visibleRoles.map((role) => {
              const meta = ROLE_META[role.role] ?? { short: role.role, label: role.role, accent: "#1E9BE8" };
              const height = Math.max(12, Math.round(role.share * 0.72));
              const isFavorite = favoriteRole === role.role;

              return (
                <div key={role.role} className="flex flex-1 flex-col items-center gap-2">
                  <div className="text-[11px] font-mono text-dim">
                    {role.games}
                  </div>
                  <div className="flex h-16 items-end">
                    <div
                      className="w-4 rounded-t-sm transition-[height] duration-500 ease-in-out"
                      style={{
                        height,
                        background: meta.accent,
                        boxShadow: isFavorite ? `0 0 14px ${meta.accent}66` : "none",
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>

          <div className="grid grid-cols-5 gap-2">
            {visibleRoles.map((role) => {
              const isFavorite = favoriteRole === role.role;
              return (
                <div key={role.role} className="flex flex-col items-center gap-1 text-center">
                  <RoleBadge role={role.role} tier={tier} isFavorite={isFavorite} />
                  <div className="text-[11px] font-mono text-dim">{role.share.toFixed(0)}%</div>
                </div>
              );
            })}
          </div>

          <div className="grid gap-2 sm:grid-cols-2">
            {visibleRoles.slice(0, 2).map((role) => (
              <div key={role.role} className="rounded-lg border border-primary/10 bg-surface2/45 p-3">
                <div className="flex items-center justify-between text-xs font-mono uppercase tracking-wide text-dim">
                  <span><RoleLabel role={role.role} /></span>
                  <span>{role.games}G</span>
                </div>
                <div className="mt-1 text-sm font-semibold text-white">
                  {role.winrate.toFixed(1)}% WR
                </div>
                <div className="text-xs text-dim">{role.avg_kda.toFixed(2)} KDA</div>
              </div>
            ))}
          </div>
        </>
      ) : (
        <div className="flex flex-1 items-center justify-center rounded-lg border border-dashed border-primary/15 px-4 text-center text-sm text-dim" style={{ background: "var(--panel-soft)" }}>
          Play more ranked across roles to build a role profile.
        </div>
      )}
    </Card>
  );
}

function QueueCard({
  label,
  queue,
  compact = false,
  emptyMessage,
  source = "unavailable",
}: {
  label: string;
  queue: RankedQueueSummary | null;
  compact?: boolean;
  emptyMessage?: string;
  source?: string;
}) {
  if (!queue) {
    return (
      <Card className={compact ? "flex min-h-[168px] flex-col justify-between gap-4" : "flex min-h-[280px] flex-col justify-between gap-5"}>
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold text-white">{label}</span>
          <span className="text-xs font-mono uppercase tracking-wide text-dim">Unavailable</span>
        </div>
        <div className="flex flex-1 items-center justify-center rounded-lg border border-dashed border-primary/15 px-4 text-center text-sm text-dim" style={{ background: "var(--panel-soft)" }}>
          {emptyMessage ?? "No current ranked entry from Riot for this queue."}
        </div>
      </Card>
    );
  }

  const accent = tierAccent(queue.tier);
  const progress = getLpProgress(queue);

  return (
    <Card
      className={compact ? "flex min-h-[168px] flex-col gap-4" : "flex min-h-[280px] flex-col gap-5"}
      style={{
        borderColor: `${accent}40`,
        background: `linear-gradient(180deg, color-mix(in srgb, var(--surface) 96%, ${accent}10) 0%, color-mix(in srgb, var(--surface2) 90%, ${accent}8) 100%)`,
      }}
    >
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold text-white">{label}</span>
        <span className="text-xs font-mono uppercase tracking-wide text-dim">
          {source === "snapshot" ? "Last stored snapshot" : "Live Riot rank"}
        </span>
      </div>

      <div className={`grid gap-4 ${compact ? "grid-cols-[80px_minmax(0,1fr)]" : "grid-cols-[84px_minmax(0,1fr)] md:grid-cols-[96px_minmax(0,1fr)_140px]"}`}>
        <RankEmblem queue={queue} compact={compact} />

        <div className="flex min-w-0 flex-col justify-center gap-1">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <h2 className="text-2xl font-bold tracking-tight" style={{ color: accent }}>
              {formatTierName(queue)}
            </h2>
            <span className="text-lg font-semibold text-white">
              {queue.league_points} LP
            </span>
          </div>
          <p className="text-sm text-dim">
            {queue.wins + queue.losses} ranked games on this queue
          </p>
        </div>

        {!compact ? (
          <div className="flex flex-col justify-center gap-1 md:text-right">
            <div className="text-lg font-semibold text-white">
              {queue.wins}W {queue.losses}L
            </div>
            <div className="text-sm text-dim">
              Win Rate <span className="font-semibold text-white">{queue.winrate.toFixed(1)}%</span>
            </div>
          </div>
        ) : null}
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between text-sm font-semibold">
          <span style={{ color: accent }}>{progress.centerLabel}</span>
          {compact ? (
            <span className="text-dim">{queue.wins}W {queue.losses}L</span>
          ) : (
            <span className="text-dim">{queue.winrate.toFixed(1)}% WR</span>
          )}
        </div>
        <div className="relative h-3 overflow-hidden rounded-full bg-[rgba(58,80,112,0.24)]">
          <div
            className="h-full rounded-full transition-[width] duration-500 ease-in-out"
            style={{
              width: `${progress.percent}%`,
              background: `linear-gradient(90deg, ${accent}AA 0%, ${accent} 100%)`,
            }}
          />
          <div
            className="absolute top-1/2 h-5 w-5 -translate-y-1/2 rounded-full border-2 bg-surface"
            style={{
              left: `calc(${progress.percent}% - 10px)`,
              borderColor: accent,
              boxShadow: `0 0 12px ${accent}55`,
            }}
          />
        </div>
        <div className="flex items-center justify-between text-[11px] font-mono uppercase tracking-wide text-dim">
          <span>{progress.leftLabel}</span>
          <span>{progress.rightLabel}</span>
        </div>
      </div>

      <QueueStatusPills queue={queue} />
    </Card>
  );
}

function LoadingState() {
  return (
    <div className="grid gap-4">
      <div className="h-[280px] animate-pulse rounded-lg border border-primary/15 bg-surface2/50" />
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.5fr)_minmax(280px,1fr)]">
        <div className="h-[260px] animate-pulse rounded-lg border border-primary/15 bg-surface2/50" />
        <div className="h-[168px] animate-pulse rounded-lg border border-primary/15 bg-surface2/50" />
      </div>
    </div>
  );
}

export default function RankedOverview({ puuid }: { puuid: string }) {
  const rankedSummaryQuery = useQuery({
    queryKey: ["ranked-summary", puuid],
    queryFn: () => getRankedSummary(puuid),
    staleTime: 1000 * 60 * 10,
    gcTime: 1000 * 60 * 20,
    refetchOnWindowFocus: false,
  });

  if (rankedSummaryQuery.isLoading) {
    return <LoadingState />;
  }

  if (rankedSummaryQuery.isError || !rankedSummaryQuery.data) {
    return null;
  }

  const {
    solo,
    flex,
    solo_source: soloSource,
    flex_source: flexSource,
    solo_history: soloHistory,
    flex_history: flexHistory,
    favorite_role: favoriteRole,
    top_roles: topRoles,
    tracked_recent_30d: recent,
    live_rank_status: liveRankStatus,
    live_rank_message: liveRankMessage,
    note,
  } = rankedSummaryQuery.data;
  if (!solo && !flex && !recent && soloHistory.length === 0 && flexHistory.length === 0) {
    return null;
  }

  const soloAccent = tierAccent(solo?.tier);
  const liveLookupUnavailable = liveRankStatus === "missing_region";
  const noLiveEntry = liveRankStatus === "no_entry";
  const soloSnapshotDays = countSnapshotDays(soloHistory);
  const trackedGames = recent?.games ?? 0;

  return (
    <div className="flex flex-col gap-4">
      {(liveLookupUnavailable || noLiveEntry) ? (
        <Card
          className="flex items-start gap-3"
          style={{
            borderColor: liveLookupUnavailable ? "rgba(200,155,60,0.35)" : "rgba(58,80,112,0.35)",
            background: liveLookupUnavailable
              ? "rgba(200,155,60,0.08)"
              : "rgba(58,80,112,0.08)",
          }}
        >
          <div className={`mt-0.5 h-2.5 w-2.5 flex-shrink-0 rounded-full ${liveLookupUnavailable ? "bg-yellow-400" : "bg-primary"}`} />
          <div className="flex flex-col gap-1">
            <p className="text-sm font-semibold text-white">
              {liveLookupUnavailable ? "Live Riot rank unavailable" : "No live ranked queue entry"}
            </p>
            <p className="text-sm text-dim">{liveRankMessage}</p>
          </div>
        </Card>
      ) : null}

      <QueueCard
        label="Solo Queue"
        queue={solo}
        source={soloSource}
        emptyMessage={
          liveLookupUnavailable
            ? "Riot did not return the live league lookup id for this profile."
            : "No current solo queue entry returned by Riot."
        }
      />

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1.5fr)_minmax(280px,1fr)]">
        <Card className="flex min-h-[260px] flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-primary" />
              <span className="text-sm font-semibold text-white">Tracked Ranked · 30d</span>
            </div>
            {recent ? (
              <span className="text-xs font-mono uppercase tracking-wide text-dim">
                {recent.games} games
              </span>
            ) : (
              <span className="text-xs font-mono uppercase tracking-wide text-dim">
                No recent tracked games
              </span>
            )}
          </div>

          {recent || soloHistory.length > 0 ? (
            <>
              <RankedCoverageStrip
                snapshotDays={soloSnapshotDays}
                snapshots={soloHistory.length}
                trackedGames={trackedGames}
                liveSource={soloSource}
                recentGames={trackedGames}
              />
              {recent ? (
                <div className="grid gap-3 sm:grid-cols-4">
                  <div className="rounded-lg border border-primary/10 bg-surface2/45 p-3">
                    <div className="flex items-center gap-2 text-xs font-mono uppercase tracking-wide text-dim">
                      <Swords className="h-3.5 w-3.5" />
                      Record
                    </div>
                    <div className="mt-1 text-lg font-semibold text-white">
                      {recent.wins}W {recent.losses}L
                    </div>
                  </div>
                  <div className="rounded-lg border border-primary/10 bg-surface2/45 p-3">
                    <div className="flex items-center gap-2 text-xs font-mono uppercase tracking-wide text-dim">
                      <Shield className="h-3.5 w-3.5" />
                      Win Rate
                    </div>
                    <div className="mt-1 text-lg font-semibold text-white">
                      {recent.winrate.toFixed(1)}%
                    </div>
                  </div>
                  <div className="rounded-lg border border-primary/10 bg-surface2/45 p-3">
                    <div className="flex items-center gap-2 text-xs font-mono uppercase tracking-wide text-dim">
                      <Activity className="h-3.5 w-3.5" />
                      Avg KDA
                    </div>
                    <div className="mt-1 text-lg font-semibold text-white">
                      {recent.avg_kda.toFixed(2)}
                    </div>
                  </div>
                  <div className="rounded-lg border border-primary/10 bg-surface2/45 p-3">
                    <div className="flex items-center gap-2 text-xs font-mono uppercase tracking-wide text-dim">
                      <Flame className="h-3.5 w-3.5" />
                      Net Wins
                    </div>
                    <div className={`mt-1 text-lg font-semibold ${recent.net_wins >= 0 ? "text-green-400" : "text-red-400"}`}>
                      {recent.net_wins >= 0 ? "+" : ""}
                      {recent.net_wins}
                    </div>
                  </div>
                </div>
              ) : null}
              {soloHistory.length > 0 ? (
                <div className="flex flex-col gap-3">
                  <div className="flex items-center justify-between text-[11px] font-mono uppercase tracking-wide text-dim">
                    <span>LP History</span>
                    <span>{soloHistory.length} snapshots • {soloSnapshotDays} days</span>
                  </div>
                  <LpHistoryChart history={soloHistory} color={soloAccent} />
                </div>
              ) : (
                <div className="flex flex-col gap-3">
                  <div className="flex items-center justify-between text-[11px] font-mono uppercase tracking-wide text-dim">
                    <span>Recent Form</span>
                    <span>Tracked matches</span>
                  </div>
                  <RecentFormSparkline trend={recent?.trend ?? []} color={soloAccent} />
                </div>
              )}
            </>
          ) : (
            <div className="flex flex-1 items-center justify-center rounded-lg border border-dashed border-primary/15 bg-[rgba(13,30,58,0.38)] px-4 text-center text-sm text-dim">
              No tracked ranked matches in the last 30 days yet.
            </div>
          )}
        </Card>

        <div className="flex flex-col gap-4">
          <QueueCard
            label="Flex Queue"
            queue={flex}
            compact
            source={flexSource}
            emptyMessage={
              liveLookupUnavailable
                ? "Riot did not return the live league lookup id for this profile."
                : "No current flex queue entry returned by Riot."
            }
          />
          <TopRolesCard favoriteRole={favoriteRole} roles={topRoles} tier={solo?.tier ?? flex?.tier ?? null} />
        </div>
      </div>

      <p className="text-xs text-dim">{note}</p>
    </div>
  );
}
