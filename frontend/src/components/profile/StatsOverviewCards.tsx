import Card from "@/components/ui/Card";
import { StatsOverview } from "@/lib/api";

interface StatsOverviewCardsProps {
  stats: StatsOverview;
}

function winrateColor(winrate: number): string {
  if (winrate >= 55) return "text-green-400";
  if (winrate >= 45) return "text-yellow-400";
  return "text-red-400";
}

export default function StatsOverviewCards({ stats }: StatsOverviewCardsProps) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      <Card className="flex flex-col gap-1">
        <span className="text-dim text-xs font-mono uppercase tracking-wider">
          Total Games
        </span>
        <span className="text-white text-2xl font-bold">
          {stats.total_games}
        </span>
      </Card>

      <Card className="flex flex-col gap-1">
        <span className="text-dim text-xs font-mono uppercase tracking-wider">
          Win Rate
        </span>
        <span className={`text-2xl font-bold ${winrateColor(stats.winrate)}`}>
          {stats.winrate.toFixed(1)}%
        </span>
      </Card>

      <Card className="flex flex-col gap-1">
        <span className="text-dim text-xs font-mono uppercase tracking-wider">
          Avg KDA
        </span>
        <span className="text-white text-2xl font-bold">
          {stats.avg_kda.toFixed(2)}
        </span>
      </Card>

      <Card className="flex flex-col gap-1">
        <span className="text-dim text-xs font-mono uppercase tracking-wider">
          Win Streak
        </span>
        <span className="text-white text-2xl font-bold">
          {stats.win_streak > 0 ? (
            <span className="text-green-400">{stats.win_streak}W</span>
          ) : (
            "—"
          )}
        </span>
      </Card>
    </div>
  );
}