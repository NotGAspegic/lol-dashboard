import { notFound } from "next/navigation";
import Link from "next/link";
import ChampionIconClient from "@/components/ui/ChampionIconClient";
import GoldDiffChart from "@/components/charts/GoldDiffChart";
import { getMatchDetail, getMatchGoldDiff, getSummoner } from "@/lib/api";
import { buildSummonerProfilePath } from "@/lib/summonerRoute";

interface MatchPageProps {
  params: Promise<{ gameId: string }>;
  searchParams: Promise<{ puuid?: string }>;
}

function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}m ${secs}s`;
}

function kdaColor(kda: number): string {
  if (kda >= 3.5) return "text-green-400";
  if (kda >= 2.5) return "text-yellow-400";
  else if (kda < 2.5) return "text-red-400";
  return "text-dim";
}

interface ParticipantRowProps {
  champion_id: number;
  display_name: string;
  profile_href: string;
  kills: number;
  deaths: number;
  assists: number;
  damage: number;
  gold: number;
  vision: number;
  is_current_player: boolean;
  is_winner: boolean;
}

function ParticipantRow({
  champion_id,
  display_name,
  profile_href,
  kills,
  deaths,
  assists,
  damage,
  gold,
  vision,
  is_current_player,
  is_winner,
}: ParticipantRowProps) {
  const kda = (kills + assists) / Math.max(deaths, 1);

  return (
    <tr
      className={`border-b border-primary/10 transition-colors ${
        is_current_player
          ? "bg-primary/15 border-l-4 border-l-primary"
          : is_winner
            ? "hover:bg-green-500/5"
            : "hover:bg-red-500/5"
      }`}
    >
      <td className="px-3 py-3 flex items-center gap-2">
        <ChampionIconClient championId={champion_id} size={32} />
      </td>
      <td className="px-3 py-3 text-sm font-mono text-dim">
        <Link href={profile_href} className="hover:text-white transition-colors">
          {display_name}
        </Link>
        {is_current_player && (
          <span className="ml-2 inline-block text-xs bg-primary/20 text-primary px-2 py-0.5 rounded">
            You
          </span>
        )}
      </td>
      <td className={`px-3 py-3 text-sm font-mono ${kdaColor(kda)}`}>
        {kills}/{deaths}/{assists}
      </td>
      <td className="px-3 py-3 text-sm font-mono text-dim text-right">
        {damage.toLocaleString()}
      </td>
      <td className="px-3 py-3 text-sm font-mono text-dim text-right">
        {gold.toLocaleString()}
      </td>
      <td className="px-3 py-3 text-sm font-mono text-dim text-right">
        {vision.toFixed(1)}
      </td>
    </tr>
  );
}

export default async function MatchPage({ params, searchParams }: MatchPageProps) {
  const { gameId } = await params;
  const { puuid: currentPuuid } = await searchParams;

  let gameIdNum: number;
  try {
    gameIdNum = parseInt(gameId, 10);
  } catch {
    notFound();
  }

  // Fetch in parallel
  const [matchDetail, goldDiff] = await Promise.allSettled([
    getMatchDetail(gameIdNum),
    getMatchGoldDiff(gameIdNum),
  ]);

  if (
    matchDetail.status === "rejected" ||
    goldDiff.status === "rejected"
  ) {
    notFound();
  }

  const match = matchDetail.value;
  const golds = goldDiff.value;
  const participantPuuids = Array.from(
    new Set([...match.blue_team, ...match.red_team].map((participant) => participant.puuid))
  );
  const participantSummoners = await Promise.all(
    participantPuuids.map(async (puuid) => {
      const summoner = await getSummoner(puuid).catch(() => null);
      return [puuid, summoner] as const;
    })
  );
  const summonerByPuuid = new Map(participantSummoners);

  // Sort teams by damage descending
  const blueTeamSorted = [...match.blue_team].sort(
    (a, b) => b.totalDamageDealtToChampions - a.totalDamageDealtToChampions
  );
  const redTeamSorted = [...match.red_team].sort(
    (a, b) => b.totalDamageDealtToChampions - a.totalDamageDealtToChampions
  );

  function renderParticipantRow(
    participant: (typeof match.blue_team)[number],
    isWinner: boolean
  ) {
    const summoner = summonerByPuuid.get(participant.puuid) ?? null;
    const profileHref = summoner
      ? buildSummonerProfilePath({
          puuid: participant.puuid,
          region: summoner.region,
          gameName: summoner.game_name,
          tagLine: summoner.tag_line,
        })
      : `/summoner/${participant.puuid}`;
    const displayName = summoner?.game_name && summoner.tag_line
      ? `${summoner.game_name}#${summoner.tag_line}`
      : participant.puuid.slice(0, 8).toUpperCase();

    return (
      <ParticipantRow
        key={participant.puuid}
        champion_id={participant.championId}
        display_name={displayName}
        profile_href={profileHref}
        kills={participant.kills}
        deaths={participant.deaths}
        assists={participant.assists}
        damage={participant.totalDamageDealtToChampions}
        gold={participant.goldEarned}
        vision={participant.visionScore}
        is_current_player={currentPuuid === participant.puuid}
        is_winner={isWinner}
      />
    );
  }

  const matchDuration = match.match.duration
    ? formatDuration(match.match.duration * 1000)
    : "Unknown";

  let backHref = "/";
  if (currentPuuid) {
    const currentSummoner = summonerByPuuid.get(currentPuuid) ?? null;
    backHref = currentSummoner
      ? buildSummonerProfilePath({
          puuid: currentPuuid,
          region: currentSummoner.region,
          gameName: currentSummoner.game_name,
          tagLine: currentSummoner.tag_line,
        })
      : `/summoner/${currentPuuid}`;
  }
  const isBlueWin = match.match.winning_team === 100;

  return (
    <div className="flex flex-col gap-6">
      {/* Back button */}
      <Link
        href={backHref}
        className="inline-flex items-center gap-2 text-sm text-primary/60 hover:text-primary transition-colors max-w-fit"
      >
        <span>←</span> Back to Profile
      </Link>

      {/* Match metadata */}
      <div className="border border-primary/20 rounded-lg bg-surface2/30 p-4">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold mb-2">
              <span className={isBlueWin ? "text-blue-400" : "text-red-400"}>
                {isBlueWin ? "BLUE" : "RED"}
              </span>
              {" "}
              <span className="text-dim">VICTORY</span>
            </h1>
            <div className="flex flex-col gap-1 text-sm text-dim font-mono">
              <div>Duration: {matchDuration}</div>
              {match.match.patch && (
                <div>Patch: {match.match.patch}</div>
              )}
              <div>Game ID: {gameId}</div>
            </div>
          </div>
        </div>
      </div>

      {/* Main scoreboards + gold chart */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Blue team */}
        <div className="border border-primary/20 rounded-lg bg-surface2/30 overflow-hidden">
          <div className="bg-blue-500/10 border-b border-blue-500/20 px-4 py-3">
            <h2 className="text-lg font-bold text-blue-400">Blue Team</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-primary/10 bg-surface2/50">
                  <th className="px-3 py-2 text-left text-xs font-mono text-dim"></th>
                  <th className="px-3 py-2 text-left text-xs font-mono text-dim">
                    Summoner
                  </th>
                  <th className="px-3 py-2 text-left text-xs font-mono text-dim">
                    KDA
                  </th>
                  <th className="px-3 py-2 text-right text-xs font-mono text-dim">
                    DMG
                  </th>
                  <th className="px-3 py-2 text-right text-xs font-mono text-dim">
                    GOLD
                  </th>
                  <th className="px-3 py-2 text-right text-xs font-mono text-dim">
                    VISION
                  </th>
                </tr>
              </thead>
              <tbody>
                {blueTeamSorted.map((participant) => renderParticipantRow(participant, isBlueWin))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Gold diff chart */}
        <div className="lg:col-span-1 flex items-center justify-center">
          <GoldDiffChart data={golds} />
        </div>

        {/* Red team */}
        <div className="border border-primary/20 rounded-lg bg-surface2/30 overflow-hidden">
          <div className="bg-red-500/10 border-b border-red-500/20 px-4 py-3">
            <h2 className="text-lg font-bold text-red-400">Red Team</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-primary/10 bg-surface2/50">
                  <th className="px-3 py-2 text-left text-xs font-mono text-dim"></th>
                  <th className="px-3 py-2 text-left text-xs font-mono text-dim">
                    Summoner
                  </th>
                  <th className="px-3 py-2 text-left text-xs font-mono text-dim">
                    KDA
                  </th>
                  <th className="px-3 py-2 text-right text-xs font-mono text-dim">
                    DMG
                  </th>
                  <th className="px-3 py-2 text-right text-xs font-mono text-dim">
                    GOLD
                  </th>
                  <th className="px-3 py-2 text-right text-xs font-mono text-dim">
                    VISION
                  </th>
                </tr>
              </thead>
              <tbody>
                {redTeamSorted.map((participant) => renderParticipantRow(participant, !isBlueWin))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Gold summary */}
      {golds.length > 0 && (
        <div className="text-sm text-dim font-mono text-center">
          Final gold diff: {golds[golds.length - 1].gold_diff > 0 ? "+" : ""}
          {golds[golds.length - 1].gold_diff.toLocaleString()} gold
          {golds[golds.length - 1].gold_diff > 0 ? " (Blue advantage)" : " (Red advantage)"}
        </div>
      )}
    </div>
  );
}
