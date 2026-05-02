import { notFound } from "next/navigation";
import Link from "next/link";
import ChampionIconClient from "@/components/ui/ChampionIconClient";
import GoldDiffChart from "@/components/charts/GoldDiffChart";
import DataFreshnessBadge from "@/components/ui/DataFreshnessBadge";
import ParticipantIdentity from "@/components/match/ParticipantIdentity";
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

function percent(value: number): string {
  if (!Number.isFinite(value)) {
    return "0%";
  }

  const normalized = Math.abs(value) <= 1 ? value * 100 : value;
  return `${Math.round(normalized)}%`;
}

const ROLE_META: Record<string, { label: string; accent: string }> = {
  TOP: { label: "Top", accent: "rgba(77,184,255,0.92)" },
  JUNGLE: { label: "Jungle", accent: "rgba(52,199,89,0.92)" },
  MIDDLE: { label: "Mid", accent: "rgba(200,107,255,0.92)" },
  BOTTOM: { label: "Bot", accent: "rgba(232,82,60,0.92)" },
  UTILITY: { label: "Support", accent: "rgba(69,197,161,0.92)" },
};

function roleLabel(role: string): string {
  return ROLE_META[role]?.label ?? (role || "Unknown");
}

interface ParticipantRowProps {
  champion_id: number;
  game_name: string;
  tag_line?: string | null;
  profile_href?: string | null;
  puuid: string;
  match_region?: string | null;
  role: string;
  kills: number;
  deaths: number;
  assists: number;
  damage: number;
  damage_share: number;
  gold: number;
  vision: number;
  is_current_player: boolean;
  is_winner: boolean;
}

function ParticipantRow({
  champion_id,
  game_name,
  tag_line,
  profile_href,
  puuid,
  match_region,
  role,
  kills,
  deaths,
  assists,
  damage,
  damage_share,
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
      <td className="px-3 py-3">
        <ParticipantIdentity
          puuid={puuid}
          initialGameName={game_name}
          initialTagLine={tag_line}
          initialProfileHref={profile_href}
          matchRegion={match_region}
          roleLabel={roleLabel(role)}
          roleAccent={ROLE_META[role]?.accent ?? "#8FB9FF"}
          isCurrentPlayer={is_current_player}
        />
      </td>
      <td className={`px-3 py-3 text-sm font-mono ${kdaColor(kda)}`}>
        {kills}/{deaths}/{assists}
      </td>
      <td className="px-3 py-3 text-sm font-mono text-dim text-right">
        <div>{damage.toLocaleString()}</div>
        <div className="mt-1 h-1.5 w-20 overflow-hidden rounded-full bg-surface">
          <div
            className="h-full rounded-full bg-primary"
            style={{ width: `${Math.max(6, Math.min(100, Math.round((Math.abs(damage_share) <= 1 ? damage_share * 100 : damage_share))))}%` }}
          />
        </div>
        <div className="mt-1 text-[10px] text-dim">{percent(damage_share)}</div>
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
  const matchRegion =
    (currentPuuid ? (summonerByPuuid.get(currentPuuid)?.region ?? null) : null) ??
    participantSummoners.find(([, summoner]) => summoner?.region)?.[1]?.region ??
    null;

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
      : null;
    const gameName = summoner?.game_name ?? "Untracked player";
    const tagLine = summoner?.tag_line ?? null;

    return (
      <ParticipantRow
        key={participant.puuid}
        champion_id={participant.championId}
        game_name={gameName}
        tag_line={tagLine}
        profile_href={profileHref}
        puuid={participant.puuid}
        match_region={matchRegion}
        role={participant.individualPosition}
        kills={participant.kills}
        deaths={participant.deaths}
        assists={participant.assists}
        damage={participant.totalDamageDealtToChampions}
        damage_share={participant.damage_share}
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
  const winningTeam = isBlueWin ? blueTeamSorted : redTeamSorted;
  const topCarry = winningTeam[0] ?? null;
  const pressureAnchor = [...winningTeam].sort((left, right) => right.kill_participation - left.kill_participation)[0] ?? null;
  const currentPlayer =
    currentPuuid != null
      ? [...match.blue_team, ...match.red_team].find((participant) => participant.puuid === currentPuuid) ?? null
      : null;
  const hasGoldTimeline = golds.length > 0;
  const peakGoldPoint = hasGoldTimeline
    ? golds.reduce(
        (best, point) => (Math.abs(point.gold_diff) > Math.abs(best.gold_diff) ? point : best),
        golds[0]
      )
    : null;
  const finalGoldDiff = hasGoldTimeline ? golds.at(-1)?.gold_diff ?? null : null;
  const blueDamage = match.blue_team.reduce((sum, participant) => sum + participant.totalDamageDealtToChampions, 0);
  const redDamage = match.red_team.reduce((sum, participant) => sum + participant.totalDamageDealtToChampions, 0);
  const teamDamageGap = Math.abs(blueDamage - redDamage);
  const totalWinningKills = winningTeam.reduce((sum, participant) => sum + participant.kills, 0);
  const blueKills = match.blue_team.reduce((sum, participant) => sum + participant.kills, 0);
  const redKills = match.red_team.reduce((sum, participant) => sum + participant.kills, 0);
  const blueGold = match.blue_team.reduce((sum, participant) => sum + participant.goldEarned, 0);
  const redGold = match.red_team.reduce((sum, participant) => sum + participant.goldEarned, 0);
  const blueObjectives = match.objectives.blue;
  const redObjectives = match.objectives.red;
  const objectiveWinner = [
    { label: "Dragons", blue: blueObjectives.dragons, red: redObjectives.dragons },
    { label: "Barons", blue: blueObjectives.barons, red: redObjectives.barons },
    { label: "Heralds", blue: blueObjectives.heralds, red: redObjectives.heralds },
    { label: "Turrets", blue: blueObjectives.turrets, red: redObjectives.turrets },
    { label: "Plates", blue: blueObjectives.plates, red: redObjectives.plates },
  ].filter((row) => row.blue > 0 || row.red > 0);
  const whyWonLines = [
    teamDamageGap > 0
      ? `${blueDamage >= redDamage ? "Blue" : "Red"} created a ${teamDamageGap.toLocaleString()} damage edge`
      : null,
    objectiveWinner.length > 0
      ? `${objectiveWinner
          .filter((row) => row.blue !== row.red)
          .map((row) => `${row.label} ${row.blue}-${row.red}`)
          .slice(0, 2)
          .join(" • ")}`
      : null,
    hasGoldTimeline && finalGoldDiff != null
      ? `${finalGoldDiff > 0 ? "Blue" : "Red"} ended with ${Math.abs(finalGoldDiff).toLocaleString()} more gold`
      : "Timeline missing, so this read leans on combat and objective pressure.",
  ].filter(Boolean);
  const narrativeCards = [
    {
      label: "Match Story",
      title: hasGoldTimeline && finalGoldDiff != null
        ? `${isBlueWin ? "Blue side" : "Red side"} closed with ${finalGoldDiff > 0 ? "+" : ""}${finalGoldDiff.toLocaleString()} gold`
        : "No minute-by-minute gold timeline stored",
      body: hasGoldTimeline && peakGoldPoint
        ? `The largest gold separation hit ${Math.abs(peakGoldPoint.gold_diff).toLocaleString()} at ${peakGoldPoint.minute}m, which is where this game really opened up.`
        : `We can still read the scoreboard cleanly: the winning side dealt ${Math.max(blueDamage, redDamage).toLocaleString()} champion damage and finished with the stronger combat profile.`,
    },
    topCarry
      ? {
          label: "Primary Carry",
          title: `${summonerByPuuid.get(topCarry.puuid)?.game_name ?? topCarry.puuid.slice(0, 8)} drove the winning side`,
          body: `${topCarry.kills}/${topCarry.deaths}/${topCarry.assists} with ${topCarry.totalDamageDealtToChampions.toLocaleString()} champion damage and ${percent(topCarry.damage_share)} damage share.`,
        }
      : null,
    pressureAnchor
      ? {
          label: "Teamfight Engine",
          title: `${summonerByPuuid.get(pressureAnchor.puuid)?.game_name ?? pressureAnchor.puuid.slice(0, 8)} touched most winning kills`,
          body: `${percent(pressureAnchor.kill_participation)} kill participation across ${totalWinningKills} team kills made them the connective tissue in this draft.`,
        }
      : null,
    {
      label: "Why It Was Won",
      title: `${isBlueWin ? "Blue" : "Red"} converted pressure better`,
      body: whyWonLines.join(" "),
    },
    currentPlayer
      ? {
          label: "Your Read",
          title: `${currentPlayer.kills}/${currentPlayer.deaths}/${currentPlayer.assists} on this patch sample`,
          body: `${currentPlayer.cs_per_min.toFixed(1)} CS/min, ${percent(currentPlayer.damage_share)} damage share, and ${percent(currentPlayer.kill_participation)} kill participation for your slot.`,
        }
      : {
          label: "Damage Split",
          title: `Team damage gap landed at ${teamDamageGap.toLocaleString()}`,
          body: "Use the scoreboards below to see whether this was decided by one carry or a broader team-wide advantage.",
        },
  ].filter(Boolean) as Array<{ label: string; title: string; body: string }>;

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
          {currentPuuid ? (
            <div className="w-full sm:w-[280px]">
              <DataFreshnessBadge puuid={currentPuuid} compact timelineMissing={!hasGoldTimeline} />
            </div>
          ) : null}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {narrativeCards.map((card) => (
          <div
            key={card.label}
            className="rounded-lg border border-primary/15 bg-surface2/35 p-4"
          >
            <div className="text-[11px] font-mono uppercase tracking-[0.22em] text-dim">
              {card.label}
            </div>
            <div className="mt-2 text-lg font-semibold text-white">
              {card.title}
            </div>
            <div className="mt-2 text-sm text-dim">
              {card.body}
            </div>
          </div>
        ))}
      </div>

      {/* Main scoreboards + gold chart */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Blue team */}
        <div className="border border-primary/20 rounded-lg bg-surface2/30 overflow-hidden">
          <div className="bg-blue-500/10 border-b border-blue-500/20 px-4 py-3">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-lg font-bold text-blue-400">Blue Team</h2>
              <div className="text-right text-[11px] font-mono uppercase tracking-wide text-blue-200/70">
                <div>{blueKills} kills</div>
                <div>{blueDamage.toLocaleString()} dmg • {blueGold.toLocaleString()} gold</div>
              </div>
            </div>
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
        <div className="lg:col-span-1 flex flex-col gap-3">
          <div className="rounded-lg border border-primary/15 bg-surface2/30 px-4 py-3">
            <div className="text-[11px] font-mono uppercase tracking-[0.22em] text-dim">Center Read</div>
            <div className="mt-2 text-sm font-semibold text-white">
              {hasGoldTimeline
                ? "Gold rhythm and team totals"
                : "Combat read without timeline frames"}
            </div>
            <div className="mt-1 text-sm text-dim">
              {hasGoldTimeline
                ? "Use the center chart to see when tempo broke open, then compare the team tables for who cashed in."
                : "Timeline data is missing for this match, so this page leans on scoreboard pressure, role lanes, and carry share instead."}
            </div>
          </div>
          <GoldDiffChart data={golds} />
          <div className="rounded-lg border border-primary/15 bg-surface2/30 px-4 py-3">
            <div className="text-[11px] font-mono uppercase tracking-[0.22em] text-dim">Objective Summary</div>
            {objectiveWinner.length > 0 ? (
              <div className="mt-3 grid gap-2">
                {objectiveWinner.map((row) => (
                  <div key={row.label} className="flex items-center justify-between rounded-lg border border-primary/10 bg-surface px-3 py-2">
                    <div className="text-xs font-mono uppercase tracking-wide text-dim">{row.label}</div>
                    <div className="flex items-center gap-3 text-sm font-semibold text-white">
                      <span className="text-blue-300">{row.blue}</span>
                      <span className="text-dim">-</span>
                      <span className="text-red-300">{row.red}</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="mt-2 text-sm text-dim">No objective summary was stored for this match.</div>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-lg border border-primary/10 bg-surface2/35 px-3 py-3">
              <div className="text-[11px] font-mono uppercase tracking-wide text-dim">Damage Edge</div>
              <div className="mt-1 text-lg font-semibold text-white">{teamDamageGap.toLocaleString()}</div>
              <div className="text-xs text-dim">
                {blueDamage >= redDamage ? "Blue dealt more" : "Red dealt more"}
              </div>
            </div>
            <div className="rounded-lg border border-primary/10 bg-surface2/35 px-3 py-3">
              <div className="text-[11px] font-mono uppercase tracking-wide text-dim">Kill Edge</div>
              <div className="mt-1 text-lg font-semibold text-white">{Math.abs(blueKills - redKills)}</div>
              <div className="text-xs text-dim">
                {blueKills >= redKills ? "Blue secured more kills" : "Red secured more kills"}
              </div>
            </div>
          </div>
        </div>

        {/* Red team */}
        <div className="border border-primary/20 rounded-lg bg-surface2/30 overflow-hidden">
          <div className="bg-red-500/10 border-b border-red-500/20 px-4 py-3">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-lg font-bold text-red-400">Red Team</h2>
              <div className="text-right text-[11px] font-mono uppercase tracking-wide text-red-200/70">
                <div>{redKills} kills</div>
                <div>{redDamage.toLocaleString()} dmg • {redGold.toLocaleString()} gold</div>
              </div>
            </div>
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
