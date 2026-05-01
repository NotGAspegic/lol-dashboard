"use client";

import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { AlertCircle, CheckCircle2, LoaderCircle, Sparkles } from "lucide-react";

import { getTaskStatus, refreshSummoner } from "@/lib/api";

interface RefreshButtonProps {
  puuid: string;
}

type RefreshPhase =
  | "idle"
  | "queued"
  | "checking"
  | "ingesting"
  | "done"
  | "up_to_date"
  | "error";

function sleep(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function terminalStatus(status: string) {
  return status === "SUCCESS" || status === "FAILURE";
}

interface RefreshSummary {
  inserted: number;
  refreshed: number;
  skipped: number;
  notFound: number;
  failed: number;
  remaining: number;
}

interface RefreshTaskResult {
  fanout_task_id?: string;
}

interface FanoutTaskResult {
  dispatched_count?: number;
  dispatched_tasks?: Array<{ task_id?: string }>;
}

interface IngestTaskResult {
  inserted?: boolean;
  refreshed?: boolean;
  skipped?: boolean;
  not_found?: boolean;
}

export default function RefreshButton({ puuid }: RefreshButtonProps) {
  const [loading, setLoading] = useState(false);
  const [phase, setPhase] = useState<RefreshPhase>("idle");
  const [message, setMessage] = useState("Pull the latest Riot data for this profile.");
  const [detail, setDetail] = useState("Manual refresh uses the priority queue so your profile gets checked first.");
  const [summary, setSummary] = useState<RefreshSummary | null>(null);
  const mountedRef = useRef(true);
  const queryClient = useQueryClient();

  useEffect(() => {
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const invalidateProfileQueries = () => {
    queryClient.invalidateQueries({ queryKey: ["matches", puuid] });
    queryClient.invalidateQueries({ queryKey: ["champion-stats", puuid] });
    queryClient.invalidateQueries({ queryKey: ["stats-overview", puuid] });
    queryClient.invalidateQueries({ queryKey: ["tilt-prediction", puuid] });
    queryClient.invalidateQueries({ queryKey: ["ranked-summary", puuid] });
    queryClient.invalidateQueries({ queryKey: ["playstyle", puuid] });
    queryClient.invalidateQueries({ queryKey: ["matchups", puuid] });
    queryClient.invalidateQueries({ queryKey: ["damage-efficiency", puuid] });
    queryClient.invalidateQueries({ queryKey: ["vision-impact", puuid] });
    queryClient.invalidateQueries({ queryKey: ["gold-curves", puuid] });
  };

  const pollTask = async (taskId: string, pendingPhase: RefreshPhase, pendingMessage: string) => {
    while (mountedRef.current) {
      const status = await getTaskStatus(taskId);
      if (!terminalStatus(status.status)) {
        setPhase(pendingPhase);
        setMessage(pendingMessage);
        await sleep(1500);
        continue;
      }
      return status;
    }

    return null;
  };

  const handleRefresh = async () => {
    setLoading(true);
    setPhase("queued");
    setMessage("Refresh queued. Reserving a priority slot for your profile.");
    setDetail("This checks Riot for a newer solo-queue match and live rank updates before ingest starts.");
    setSummary(null);

    try {
      const accepted = await refreshSummoner(puuid);
      const refreshTask = await pollTask(
        accepted.task_id,
        "checking",
        "Checking Riot for newer ranked matches and rank changes."
      );

      if (!refreshTask || refreshTask.status === "FAILURE") {
        throw new Error("refresh_failed");
      }

      const refreshResult = (refreshTask.result ?? {}) as RefreshTaskResult;
      const fanoutTaskId = typeof refreshResult.fanout_task_id === "string"
        ? refreshResult.fanout_task_id
        : null;

      invalidateProfileQueries();

      if (!fanoutTaskId) {
        setPhase("done");
        setMessage("Refresh completed.");
        setDetail("Live rank data synced, but no incremental match fanout was needed for this profile.");
        return;
      }

      const fanoutTask = await pollTask(
        fanoutTaskId,
        "checking",
        "Comparing stored history with Riot's latest ranked match list."
      );

      if (!fanoutTask || fanoutTask.status === "FAILURE") {
        throw new Error("fanout_failed");
      }

      const fanoutResult = (fanoutTask.result ?? {}) as FanoutTaskResult;
      const dispatchedTasks = Array.isArray(fanoutResult.dispatched_tasks) ? fanoutResult.dispatched_tasks : [];
      const dispatchedCount = typeof fanoutResult.dispatched_count === "number"
        ? fanoutResult.dispatched_count
        : dispatchedTasks.length;

      if (dispatchedCount === 0) {
        setPhase("up_to_date");
        setMessage("No newer ranked solo matches were returned by Riot.");
        setDetail("Your stored ranked history already matches Riot's latest solo queue window.");
        invalidateProfileQueries();
        return;
      }

      setPhase("ingesting");
      setMessage(`Ingesting ${dispatchedCount} new ranked ${dispatchedCount === 1 ? "match" : "matches"} from Riot.`);

      const taskIds = dispatchedTasks
        .map((task: { task_id?: string }) => task.task_id)
        .filter((taskId: string | undefined): taskId is string => Boolean(taskId));

      const deadline = Date.now() + 45000;
      let lastStatuses: Awaited<ReturnType<typeof getTaskStatus>>[] = [];
      while (mountedRef.current && Date.now() < deadline && taskIds.length > 0) {
        const statuses = await Promise.all(taskIds.map((taskId: string) => getTaskStatus(taskId)));
        lastStatuses = statuses;
        invalidateProfileQueries();

        if (statuses.every((status) => terminalStatus(status.status))) {
          break;
        }

        await sleep(2000);
      }

      invalidateProfileQueries();
      const finalStatuses =
        taskIds.length > 0
          ? await Promise.all(taskIds.map((taskId: string) => getTaskStatus(taskId)))
          : lastStatuses;
      const refreshSummary = finalStatuses.reduce<RefreshSummary>(
        (acc: RefreshSummary, status: Awaited<ReturnType<typeof getTaskStatus>>) => {
          if (status.status === "FAILURE") {
            acc.failed += 1;
            return acc;
          }

          if (!terminalStatus(status.status)) {
            acc.remaining += 1;
            return acc;
          }

          const result = (status.result ?? {}) as IngestTaskResult;

          if (result.not_found) acc.notFound += 1;
          if (result.inserted) acc.inserted += 1;
          else if (result.refreshed) acc.refreshed += 1;
          else if (result.skipped) acc.skipped += 1;
          return acc;
        },
        { inserted: 0, refreshed: 0, skipped: 0, notFound: 0, failed: 0, remaining: 0 }
      );
      setSummary(refreshSummary);
      setPhase("done");
      if (refreshSummary.inserted > 0) {
        setMessage(
          `${refreshSummary.inserted} new ranked ${refreshSummary.inserted === 1 ? "match" : "matches"} added.`
        );
      } else if (refreshSummary.refreshed > 0) {
        setMessage(
          `${refreshSummary.refreshed} ranked ${refreshSummary.refreshed === 1 ? "match was" : "matches were"} refreshed.`
        );
      } else {
        setMessage(`Refresh completed. ${dispatchedCount} ranked ${dispatchedCount === 1 ? "match was" : "matches were"} checked.`);
      }

      const detailParts = [
        refreshSummary.skipped > 0
          ? `${refreshSummary.skipped} already tracked`
          : null,
        refreshSummary.notFound > 0
          ? `${refreshSummary.notFound} unavailable from Riot`
          : null,
        refreshSummary.remaining > 0
          ? `${refreshSummary.remaining} still finishing in worker`
          : null,
      ].filter(Boolean);
      setDetail(
        detailParts.length > 0
          ? detailParts.join(" • ")
          : "Profile caches were invalidated so the latest tracked data can re-render immediately."
      );
    } catch (error: unknown) {
      const detail =
        typeof error === "object" &&
        error !== null &&
        "response" in error &&
        typeof (error as { response?: { status?: number } }).response?.status === "number"
          ? (error as { response?: { status?: number } }).response?.status
          : null;

      if (detail === 429) {
        setPhase("error");
        setMessage("Refresh already triggered recently. Wait a few minutes and try again.");
        setDetail("Riot rate limits are being respected, so the priority refresh lane is temporarily cooling down.");
      } else {
        setPhase("error");
        setMessage("Refresh failed before Riot data could be synced.");
        setDetail("No tracked data was changed. Try again in a minute if Riot or the worker lane was having trouble.");
      }
    } finally {
      setLoading(false);
    }
  };

  const statusTone =
    phase === "done" || phase === "up_to_date"
      ? "text-green-300"
      : phase === "error"
        ? "text-red-300"
        : "text-dim";
  const phaseLabel =
    phase === "idle"
      ? "Manual refresh"
      : phase === "queued"
        ? "Queued"
        : phase === "checking"
          ? "Checking Riot"
          : phase === "ingesting"
            ? "Ingesting"
            : phase === "up_to_date"
              ? "Up to date"
              : phase === "done"
                ? "Completed"
                : "Attention";

  return (
    <div className="flex flex-col items-start gap-2 sm:items-end">
      <button
        aria-label="Refresh summoner data"
        onClick={handleRefresh}
        disabled={loading}
        className="flex items-center gap-2 rounded-lg border border-primary/30 px-4 py-2 text-sm text-primary transition-colors hover:bg-primary/10 disabled:opacity-40"
      >
        {loading ? (
          <>
            <LoaderCircle className="h-4 w-4 animate-spin" />
            Refreshing
          </>
        ) : (
          <>
            <Sparkles className="h-4 w-4" />
            Refresh
          </>
        )}
      </button>
      <div className="w-full max-w-md rounded-xl border border-primary/15 bg-surface2/45 px-3 py-3 sm:min-w-[320px]">
        <div className={`flex items-center gap-2 text-xs font-mono uppercase tracking-[0.18em] ${statusTone}`}>
          {phase === "done" || phase === "up_to_date" ? (
            <CheckCircle2 className="h-3.5 w-3.5" />
          ) : phase === "error" ? (
            <AlertCircle className="h-3.5 w-3.5" />
          ) : loading ? (
            <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
          ) : null}
          <span>{phaseLabel}</span>
        </div>
        <div className="mt-2 text-sm font-semibold text-white">{message}</div>
        <div className="mt-1 text-xs leading-relaxed text-dim">{detail}</div>
        {summary ? (
          <div className="mt-3 grid grid-cols-2 gap-2 text-[11px] font-mono uppercase tracking-wide text-dim">
            <div className="rounded-lg border border-primary/10 bg-surface px-2 py-2">
              Added <span className="text-white">{summary.inserted}</span>
            </div>
            <div className="rounded-lg border border-primary/10 bg-surface px-2 py-2">
              Existing <span className="text-white">{summary.skipped}</span>
            </div>
            <div className="rounded-lg border border-primary/10 bg-surface px-2 py-2">
              Refreshed <span className="text-white">{summary.refreshed}</span>
            </div>
            <div className="rounded-lg border border-primary/10 bg-surface px-2 py-2">
              Missing <span className="text-white">{summary.notFound}</span>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
