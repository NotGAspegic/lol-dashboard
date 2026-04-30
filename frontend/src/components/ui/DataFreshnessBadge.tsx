"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";

import { getIngestionStatus } from "@/lib/api";

function formatRelative(value: string | null): string {
  if (!value) return "No tracked matches yet";

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "Unknown";

  const deltaMs = Date.now() - parsed.getTime();
  const minutes = Math.max(0, Math.floor(deltaMs / 60000));
  if (minutes < 1) return "Updated just now";
  if (minutes < 60) return `Updated ${minutes}m ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `Updated ${hours}h ago`;

  const days = Math.floor(hours / 24);
  return `Updated ${days}d ago`;
}

export default function DataFreshnessBadge({
  puuid,
  compact = false,
  timelineMissing = false,
}: {
  puuid: string;
  compact?: boolean;
  timelineMissing?: boolean;
}) {
  const query = useQuery({
    queryKey: ["ingestion-status", puuid],
    queryFn: () => getIngestionStatus(puuid),
    staleTime: 1000 * 30,
    refetchOnWindowFocus: false,
  });

  const copy = useMemo(() => {
    if (query.isLoading || !query.data) {
      return {
        title: "Checking freshness",
        detail: "Looking up tracked ingestion status.",
        tone: "text-dim",
      };
    }

    if (query.data.pending_tasks > 0) {
      return {
        title: `${query.data.pending_tasks} match${query.data.pending_tasks === 1 ? "" : "es"} still ingesting`,
        detail: query.data.last_ingested
          ? `${formatRelative(query.data.last_ingested)} • ${query.data.total_matches} tracked`
          : "Queued work is still catching up.",
        tone: "text-amber-300",
      };
    }

    if (timelineMissing) {
      return {
        title: formatRelative(query.data.last_ingested),
        detail: "Timeline missing for this match, so the page is using scoreboard-only insight.",
        tone: "text-cyan-300",
      };
    }

    return {
      title: formatRelative(query.data.last_ingested),
      detail: `${query.data.total_matches} tracked matches in local history.`,
      tone: "text-green-300",
    };
  }, [query.data, query.isLoading, timelineMissing]);

  return (
    <div
      className={`rounded-xl border border-primary/12 bg-surface2/35 ${compact ? "px-3 py-2" : "px-3 py-3"}`}
    >
      <div className="text-[11px] font-mono uppercase tracking-[0.18em] text-dim">Data Freshness</div>
      <div className={`mt-1 font-semibold ${compact ? "text-sm" : "text-sm"} ${copy.tone}`}>{copy.title}</div>
      <div className="mt-1 text-xs leading-relaxed text-dim">{copy.detail}</div>
    </div>
  );
}
