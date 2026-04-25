import { Match } from "@/lib/api";
import { formatDuration, formatRelativeTime, kdaColor } from "@/lib/utils";
import ChampionIconClient from "@/components/ui/ChampionIconClient";

const POSITION_SHORT: Record<string, string> = {
  TOP: "TOP",
  JUNGLE: "JGL",
  MIDDLE: "MID",
  BOTTOM: "BOT",
  UTILITY: "SUP",
  INVALID: "—",
};

interface MatchRowProps {
  match: Match;
}

export default function MatchRow({ match }: MatchRowProps) {
  const kda = ((match.kills + match.assists) / Math.max(match.deaths, 1));
  const kdaStr = kda.toFixed(2);
  const position = POSITION_SHORT[match.individualPosition] ?? "—";

  return (
    <div className={`flex items-center gap-3 p-3 rounded-lg border ${
      match.win
        ? "border-green-500/20 bg-green-500/5"
        : "border-red-500/20 bg-red-500/5"
    }`}>
      {/* Win/loss bar */}
      <div className={`w-1 self-stretch rounded-full flex-shrink-0 ${
        match.win ? "bg-green-500" : "bg-red-500"
      }`} />

      {/* Champion icon */}
      <ChampionIconClient championId={match.championId} size={44} />

      {/* Position badge */}
      <span className="text-dim text-xs font-mono w-8 text-center flex-shrink-0">
        {position}
      </span>

      {/* KDA */}
      <div className="flex flex-col gap-0.5 min-w-[80px]">
        <span className="text-white text-sm font-semibold">
          {match.kills}/{match.deaths}/{match.assists}
        </span>
        <span className={`text-xs font-mono ${kdaColor(kda)}`}>
          {kdaStr} KDA
        </span>
      </div>

      {/* CS/min */}
      <div className="flex flex-col gap-0.5 min-w-[60px]">
        <span className="text-white text-sm">{match.cs_per_min}</span>
        <span className="text-dim text-xs font-mono">CS/min</span>
      </div>

      {/* Duration + time */}
      <div className="flex flex-col gap-0.5 ml-auto text-right">
        <span className="text-white text-sm">
          {formatDuration(match.gameDuration)}
        </span>
        <span className="text-dim text-xs font-mono">
          {formatRelativeTime(match.gameStartTimestamp)}
        </span>
      </div>

      {/* Win/loss label */}
      <span className={`text-xs font-bold font-mono w-8 text-right flex-shrink-0 ${
        match.win ? "text-green-400" : "text-red-400"
      }`}>
        {match.win ? "WIN" : "LOSS"}
      </span>
    </div>
  );
}