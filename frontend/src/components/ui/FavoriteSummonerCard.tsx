"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Clock3, Star } from "lucide-react";

import { FavoriteSummonerIdentity } from "@/lib/favoriteSummoners";
import { buildSummonerProfilePath } from "@/lib/summonerRoute";
import { getIngestionStatus, getRankedSummary, RankedQueueSummary } from "@/lib/api";

function profileIconUrl(profileIconId?: number) {
  return `https://ddragon.leagueoflegends.com/cdn/16.8.1/img/profileicon/${profileIconId ?? 29}.png`;
}

function queueLabel(queue: RankedQueueSummary | null | undefined): string {
  if (!queue) return "Unranked";
  const tier = queue.tier.charAt(0) + queue.tier.slice(1).toLowerCase();
  return queue.rank ? `${tier} ${queue.rank}` : tier;
}

function relative(value: string | null | undefined): string {
  if (!value) return "No tracked history";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "Unknown";
  const deltaMinutes = Math.max(0, Math.floor((Date.now() - parsed.getTime()) / 60000));
  if (deltaMinutes < 1) return "Just updated";
  if (deltaMinutes < 60) return `${deltaMinutes}m ago`;
  const deltaHours = Math.floor(deltaMinutes / 60);
  if (deltaHours < 24) return `${deltaHours}h ago`;
  return `${Math.floor(deltaHours / 24)}d ago`;
}

export default function FavoriteSummonerCard({
  favorite,
  compact = false,
  variant = "card",
  active = false,
  onRemove,
}: {
  favorite: FavoriteSummonerIdentity;
  compact?: boolean;
  variant?: "card" | "chip";
  active?: boolean;
  onRemove?: () => void;
}) {
  const href = buildSummonerProfilePath({
    puuid: favorite.puuid,
    region: favorite.region ?? undefined,
    gameName: favorite.gameName,
    tagLine: favorite.tagLine,
  });
  const rankedQuery = useQuery({
    queryKey: ["favorite-ranked-summary", favorite.puuid],
    queryFn: () => getRankedSummary(favorite.puuid),
    staleTime: 1000 * 60,
    refetchOnWindowFocus: false,
  });
  const freshnessQuery = useQuery({
    queryKey: ["favorite-ingestion-status", favorite.puuid],
    queryFn: () => getIngestionStatus(favorite.puuid),
    staleTime: 1000 * 30,
    refetchOnWindowFocus: false,
  });

  const liveQueue = rankedQuery.data?.solo ?? rankedQuery.data?.flex ?? null;
  const trackedWinRate = rankedQuery.data?.tracked_recent_30d?.winrate ?? null;
  const pendingTasks = freshnessQuery.data?.pending_tasks ?? 0;
  const freshnessCopy = pendingTasks > 0
    ? `${pendingTasks} ingesting`
    : relative(freshnessQuery.data?.last_ingested);

  const metaLine = useMemo(() => {
    const parts = [favorite.region?.toUpperCase() ?? "Unknown"];
    if (favorite.summonerLevel) parts.push(`Lv ${favorite.summonerLevel}`);
    return parts.join(" • ");
  }, [favorite.region, favorite.summonerLevel]);

  if (variant === "chip") {
    return (
      <Link
        href={href}
        className={`flex items-center gap-2 rounded-full border px-2.5 py-1.5 transition-colors ${
          active
            ? "border-primary/30 bg-primary/10"
            : "border-primary/10 bg-surface2/40 hover:border-primary/25 hover:bg-surface2/70"
        }`}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={profileIconUrl(favorite.profileIconId)}
          alt={`${favorite.gameName} icon`}
          className="h-6 w-6 rounded-full border border-primary/20 object-cover"
        />
        <div className="min-w-0">
          <div className="max-w-[96px] truncate text-xs font-semibold text-white">{favorite.gameName}</div>
          <div className="max-w-[120px] truncate text-[10px] text-dim">
            {queueLabel(liveQueue)} • {freshnessCopy}
          </div>
        </div>
      </Link>
    );
  }

  const content = (
    <>
      <div className="flex items-center gap-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={profileIconUrl(favorite.profileIconId)}
          alt={`${favorite.gameName} icon`}
          className={`${compact ? "h-10 w-10" : "h-11 w-11"} rounded-xl border border-primary/20 object-cover`}
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <div className="truncate text-sm font-semibold text-white">
              {favorite.gameName}#{favorite.tagLine}
            </div>
            {active ? (
              <span className="rounded-full border border-primary/25 bg-primary/15 px-2 py-0.5 text-[10px] font-mono uppercase tracking-[0.16em] text-primary">
                Live
              </span>
            ) : null}
          </div>
          <div className="mt-1 truncate text-[11px] font-mono uppercase tracking-wide text-dim">{metaLine}</div>
        </div>
        {onRemove ? null : (
          <Star className="h-4 w-4 text-amber-300" fill="currentColor" />
        )}
      </div>

      <div className={`mt-3 grid gap-2 ${compact ? "grid-cols-3" : "grid-cols-3"}`}>
        <div className="rounded-lg border border-primary/10 bg-surface px-2 py-2">
          <div className="text-[10px] font-mono uppercase tracking-[0.16em] text-dim">Rank</div>
          <div className="mt-1 truncate text-xs font-semibold text-white">{queueLabel(liveQueue)}</div>
        </div>
        <div className="rounded-lg border border-primary/10 bg-surface px-2 py-2">
          <div className="text-[10px] font-mono uppercase tracking-[0.16em] text-dim">30d WR</div>
          <div className="mt-1 text-xs font-semibold text-white">
            {trackedWinRate != null ? `${trackedWinRate.toFixed(1)}%` : "No sample"}
          </div>
        </div>
        <div className="rounded-lg border border-primary/10 bg-surface px-2 py-2">
          <div className="flex items-center gap-1 text-[10px] font-mono uppercase tracking-[0.16em] text-dim">
            <Clock3 className="h-3 w-3" />
            Fresh
          </div>
          <div className="mt-1 truncate text-xs font-semibold text-white">{freshnessCopy}</div>
        </div>
      </div>
    </>
  );

  const shellClass = `rounded-xl border transition-colors ${
    active
      ? "border-primary/30 bg-primary/10"
      : "border-primary/10 bg-surface2/35 hover:border-primary/25 hover:bg-surface2/60"
  } ${compact ? "px-3 py-3" : "px-3 py-3"}`;

  if (onRemove) {
    return (
      <div className={`${shellClass} flex items-start gap-3`}>
        <Link href={href} className="min-w-0 flex-1">
          {content}
        </Link>
        <button
          type="button"
          onClick={onRemove}
          className="mt-1 rounded-md border border-amber-400/40 bg-amber-400/10 p-2 text-amber-300 transition-colors hover:bg-amber-400/15"
          aria-label="Remove favorite"
        >
          <Star className="h-3.5 w-3.5" fill="currentColor" />
        </button>
      </div>
    );
  }

  return (
    <Link href={href} className={`block ${shellClass}`}>
      {content}
    </Link>
  );
}
