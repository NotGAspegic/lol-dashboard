"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { RotateCcw, Search, Shuffle, Swords, UserRound } from "lucide-react";

import DraftProbabilityGauge from "@/components/ml/DraftProbabilityGauge";
import Card from "@/components/ui/Card";
import Skeleton from "@/components/ui/Skeleton";
import { getDraftPrediction } from "@/lib/api";


interface ChampionOption {
  id: number;
  name: string;
  key: string;
}

const CURRENT_SUMMONER_KEY = "farsight.currentSummonerPuuid";
const TEAM_SIZE = 5;

function subscribeToCurrentSummoner() {
  return () => {};
}

function getStoredPuuid() {
  try {
    return window.localStorage.getItem(CURRENT_SUMMONER_KEY) ?? "";
  } catch {
    return "";
  }
}

function ChampionAvatar({
  champion,
  patch,
  size = 40,
}: {
  champion: ChampionOption | null;
  patch: string;
  size?: number;
}) {
  if (!champion) {
    return (
      <div
        style={{ width: size, height: size }}
        className="flex items-center justify-center rounded-md bg-surface2"
      >
        <Search size={16} color="#3A5070" />
      </div>
    );
  }

  const imageUrl = `https://ddragon.leagueoflegends.com/cdn/${patch}/img/champion/${champion.key}.png`;

  return (
    <div
      title={champion.name}
      style={{ width: size, height: size }}
      className="overflow-hidden rounded-md border border-primary/40"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={imageUrl}
        alt={champion.name}
        width={size}
        height={size}
        className="h-full w-full object-cover"
      />
    </div>
  );
}

function TeamSlot({
  teamLabel,
  slotIndex,
  champions,
  patch,
  selectedChampionId,
  query,
  isPlayerSlot,
  active,
  onActivate,
  onQueryChange,
  onSelect,
  onMarkPlayer,
  takenChampionIds,
}: {
  teamLabel: "Blue" | "Red";
  slotIndex: number;
  champions: ChampionOption[];
  patch: string;
  selectedChampionId: number | null;
  query: string;
  isPlayerSlot: boolean;
  active: boolean;
  onActivate: () => void;
  onQueryChange: (value: string) => void;
  onSelect: (championId: number) => void;
  onMarkPlayer?: () => void;
  takenChampionIds: Set<number>;
}) {
  const selectedChampion = champions.find((champion) => champion.id === selectedChampionId) ?? null;
  const filteredChampions = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    const base = normalizedQuery
      ? champions.filter((champion) => champion.name.toLowerCase().includes(normalizedQuery))
      : champions;

    return base
      .filter((champion) => champion.id === selectedChampionId || !takenChampionIds.has(champion.id))
      .slice(0, 8);
  }, [champions, query, selectedChampionId, takenChampionIds]);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={onActivate}
        className="flex w-full items-center gap-3 rounded-lg border px-3 py-3 pr-12 text-left transition-colors"
        style={{
          borderColor: isPlayerSlot ? "rgba(30,155,232,0.45)" : "rgba(30,155,232,0.16)",
          background: isPlayerSlot ? "rgba(30,155,232,0.08)" : "rgba(13,30,58,0.55)",
        }}
      >
        <ChampionAvatar champion={selectedChampion} patch={patch} size={40} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-xs font-mono uppercase tracking-wider text-dim">
              {teamLabel} {slotIndex + 1}
            </span>
            {isPlayerSlot ? (
              <span className="rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-[11px] font-mono uppercase tracking-wider text-primary">
                You
              </span>
            ) : null}
          </div>
          <div className="truncate text-sm text-white">
            {selectedChampion?.name ?? "Select champion"}
          </div>
        </div>
        {teamLabel === "Blue" && onMarkPlayer ? (
          <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center">
            <span className="flex h-8 w-8 items-center justify-center rounded-md border border-primary/20 bg-surface/80 text-dim">
              <UserRound size={14} />
            </span>
          </span>
        ) : null}
      </button>

      {teamLabel === "Blue" && onMarkPlayer ? (
        <button
          type="button"
          onClick={onMarkPlayer}
          className="absolute right-3 top-1/2 z-10 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-md border border-primary/20 bg-surface/80 text-dim transition-colors hover:text-primary"
          aria-label={`Mark blue slot ${slotIndex + 1} as your champion`}
        >
          <UserRound size={14} />
        </button>
      ) : null}

      {active ? (
        <div
          className="absolute left-0 right-0 top-[calc(100%+0.5rem)] z-30 rounded-lg border border-primary/20 bg-surface p-3 shadow-2xl"
        >
          <input
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder="Search champion"
            autoFocus
            className="w-full rounded-lg border border-primary/20 bg-surface2 px-3 py-2 text-sm text-white outline-none placeholder:text-dim focus:border-primary/45"
          />
          <div className="mt-3 grid max-h-72 gap-1 overflow-y-auto">
            {filteredChampions.map((champion) => (
              <button
                key={champion.id}
                type="button"
                onClick={() => onSelect(champion.id)}
                className="flex items-center gap-3 rounded-lg px-2 py-2 text-left transition-colors hover:bg-surface2"
              >
                <ChampionAvatar champion={champion} patch={patch} size={36} />
                <span className="truncate text-sm text-white">{champion.name}</span>
              </button>
            ))}
            {filteredChampions.length === 0 ? (
              <div className="px-2 py-3 text-sm text-dim">No champions found.</div>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default function DraftPage() {
  const searchParams = useSearchParams();
  const queryPuuid = searchParams.get("puuid") ?? "";
  const initialPuuid = useSyncExternalStore(
    subscribeToCurrentSummoner,
    () => queryPuuid || getStoredPuuid(),
    () => queryPuuid
  );
  const [typedPuuid, setTypedPuuid] = useState<string | null>(null);
  const puuid = typedPuuid ?? initialPuuid;
  const [patch, setPatch] = useState("16.8.1");
  const [champions, setChampions] = useState<ChampionOption[]>([]);
  const [loadingChampions, setLoadingChampions] = useState(true);
  const [blueTeam, setBlueTeam] = useState<Array<number | null>>(Array(TEAM_SIZE).fill(null));
  const [redTeam, setRedTeam] = useState<Array<number | null>>(Array(TEAM_SIZE).fill(null));
  const [playerSlot, setPlayerSlot] = useState(0);
  const [activeSlot, setActiveSlot] = useState<string | null>(null);
  const [slotQueries, setSlotQueries] = useState<Record<string, string>>({});

  useEffect(() => {
    let cancelled = false;

    async function loadChampions() {
      try {
        const versionsRes = await fetch("https://ddragon.leagueoflegends.com/api/versions.json");
        const versions = (await versionsRes.json()) as string[];
        const latestPatch = versions[0] ?? "16.8.1";
        const championRes = await fetch(
          `https://ddragon.leagueoflegends.com/cdn/${latestPatch}/data/en_US/champion.json`
        );
        const payload = await championRes.json();
        const options = Object.entries(payload.data as Record<string, { key: string; name: string }>)
          .map(([key, champion]) => ({
            id: parseInt(champion.key, 10),
            key,
            name: champion.name,
          }))
          .sort((left, right) => left.name.localeCompare(right.name));

        if (!cancelled) {
          setPatch(latestPatch);
          setChampions(options);
        }
      } catch {
        if (!cancelled) {
          setChampions([]);
        }
      } finally {
        if (!cancelled) {
          setLoadingChampions(false);
        }
      }
    }

    loadChampions();
    return () => {
      cancelled = true;
    };
  }, []);

  const allSelectedIds = useMemo(
    () => new Set([...blueTeam, ...redTeam].filter((value): value is number => value != null)),
    [blueTeam, redTeam]
  );
  const filledCount = useMemo(
    () => [...blueTeam, ...redTeam].filter((value) => value != null).length,
    [blueTeam, redTeam]
  );
  const hasAllPicks = filledCount === TEAM_SIZE * 2;
  const playerChampionId = blueTeam[playerSlot];

  const draftQuery = useQuery({
    queryKey: ["draft-prediction", puuid, blueTeam, redTeam, playerSlot],
    queryFn: () =>
      getDraftPrediction({
        puuid,
        ally_champion_ids: blueTeam as number[],
        enemy_champion_ids: redTeam as number[],
        player_champion_id: playerChampionId as number,
      }),
    enabled: Boolean(puuid.trim() && hasAllPicks && playerChampionId != null),
    staleTime: 1000 * 60,
    placeholderData: (previous) => previous,
  });

  function setChampion(team: "blue" | "red", index: number, championId: number) {
    const setter = team === "blue" ? setBlueTeam : setRedTeam;
    setter((previous) => previous.map((value, slotIndex) => (slotIndex === index ? championId : value)));
    setActiveSlot(null);
    setSlotQueries((previous) => ({ ...previous, [`${team}-${index}`]: "" }));
  }

  function resetDraft() {
    setBlueTeam(Array(TEAM_SIZE).fill(null));
    setRedTeam(Array(TEAM_SIZE).fill(null));
    setPlayerSlot(0);
    setActiveSlot(null);
    setSlotQueries({});
  }

  function randomizeDraft() {
    if (champions.length < TEAM_SIZE * 2) {
      return;
    }

    const randomized = [...champions]
      .sort(() => Math.random() - 0.5)
      .slice(0, TEAM_SIZE * 2)
      .map((champion) => champion.id);

    setBlueTeam(randomized.slice(0, TEAM_SIZE));
    setRedTeam(randomized.slice(TEAM_SIZE, TEAM_SIZE * 2));
    setPlayerSlot(Math.floor(Math.random() * TEAM_SIZE));
    setActiveSlot(null);
    setSlotQueries({});
  }

  function renderTeamColumn(team: "blue" | "red") {
    const teamLabel = team === "blue" ? "Blue" : "Red";
    const values = team === "blue" ? blueTeam : redTeam;

    return (
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-xs font-mono uppercase tracking-wider text-dim">{teamLabel} Team</div>
            <div className="text-lg font-semibold text-white">{teamLabel} Draft</div>
          </div>
          {team === "blue" && playerChampionId != null ? (
            <div className="rounded-full border border-primary/25 bg-primary/10 px-3 py-1 text-xs font-mono uppercase tracking-wider text-primary">
              Your Champion: {champions.find((champion) => champion.id === playerChampionId)?.name ?? "Blue Slot"}
            </div>
          ) : null}
        </div>

        {values.map((championId, index) => {
          const slotKey = `${team}-${index}`;
          return (
            <TeamSlot
              key={slotKey}
              teamLabel={teamLabel}
              slotIndex={index}
              champions={champions}
              patch={patch}
              selectedChampionId={championId}
              query={slotQueries[slotKey] ?? ""}
              isPlayerSlot={team === "blue" && playerSlot === index}
              active={activeSlot === slotKey}
              onActivate={() => setActiveSlot((previous) => (previous === slotKey ? null : slotKey))}
              onQueryChange={(value) =>
                setSlotQueries((previous) => ({
                  ...previous,
                  [slotKey]: value,
                }))
              }
              onSelect={(selectedId) => setChampion(team, index, selectedId)}
              onMarkPlayer={team === "blue" ? () => setPlayerSlot(index) : undefined}
              takenChampionIds={allSelectedIds}
            />
          );
        })}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <div className="text-xs font-mono uppercase tracking-wider text-dim">Draft Analyzer</div>
        <div className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
          <div className="flex-1">
            <label className="mb-2 block text-xs font-mono uppercase tracking-wider text-dim">
              Player PUUID
            </label>
            <input
              value={puuid}
              onChange={(event) => setTypedPuuid(event.target.value)}
              className="w-full rounded-lg border border-primary/20 bg-surface px-3 py-3 font-mono text-sm text-white outline-none placeholder:text-dim focus:border-primary/45"
              placeholder="Tracked summoner puuid"
            />
          </div>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="rounded-lg border border-primary/15 bg-surface px-4 py-3 text-sm text-dim">
              {hasAllPicks ? "Draft locked in" : `${filledCount}/10 picks filled`}
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={resetDraft}
                className="inline-flex h-11 items-center gap-2 rounded-lg border border-primary/20 bg-surface px-4 text-sm text-white transition-colors hover:border-primary/40 hover:bg-surface2"
              >
                <RotateCcw size={16} />
                Reset
              </button>
              <button
                type="button"
                onClick={randomizeDraft}
                className="inline-flex h-11 items-center gap-2 rounded-lg border border-primary/20 bg-surface px-4 text-sm text-white transition-colors hover:border-primary/40 hover:bg-surface2"
              >
                <Shuffle size={16} />
                Random Draft
              </button>
            </div>
          </div>
        </div>
      </div>

      {loadingChampions ? (
        <div className="grid gap-6 lg:grid-cols-[1fr_320px_1fr]">
          <Skeleton className="h-[420px] w-full rounded-lg" />
          <Skeleton className="h-[420px] w-full rounded-lg" />
          <Skeleton className="h-[420px] w-full rounded-lg" />
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px_minmax(0,1fr)] lg:items-start">
          {renderTeamColumn("blue")}

          <Card className="sticky top-20 flex flex-col items-center gap-4 p-5">
            {hasAllPicks ? (
              !puuid.trim() ? (
                <div className="flex min-h-[260px] flex-col items-center justify-center gap-4 text-center">
                  <div className="text-sm font-semibold text-white">Enter a tracked summoner PUUID</div>
                  <div className="text-xs text-dim">The draft model needs player history to make a prediction.</div>
                </div>
              ) : draftQuery.isLoading ? (
                <div className="flex w-full flex-col gap-4">
                  <Skeleton className="mx-auto h-16 w-16 rounded-full" />
                  <Skeleton className="h-12 w-32 self-center" />
                  <Skeleton className="h-4 w-full rounded-full" />
                  <Skeleton className="h-4 w-40 self-center" />
                </div>
              ) : draftQuery.isError || !draftQuery.data ? (
                <div className="flex flex-col items-center gap-2 text-center">
                  <div className="text-sm font-semibold text-white">Prediction unavailable</div>
                  <div className="text-xs text-dim">Check the selected summoner and try again.</div>
                </div>
              ) : (
                <div className="flex w-full flex-col items-center gap-3">
                  <DraftProbabilityGauge prediction={draftQuery.data} />
                  {draftQuery.isFetching ? (
                    <div className="text-[11px] font-mono uppercase tracking-wider text-dim">
                      Updating prediction...
                    </div>
                  ) : null}
                </div>
              )
            ) : (
              <div className="flex min-h-[260px] flex-col items-center justify-center gap-4 text-center">
                <div className="flex h-14 w-14 items-center justify-center rounded-full border border-primary/20 bg-surface2/60">
                  <Swords size={20} color="#3A5070" />
                </div>
                <div className="space-y-1">
                  <div className="text-sm font-semibold text-white">Fill all 10 picks to see win probability</div>
                  <div className="text-xs text-dim">Choose the player’s blue-side slot, then complete both drafts.</div>
                </div>
              </div>
            )}
          </Card>

          {renderTeamColumn("red")}
        </div>
      )}
    </div>
  );
}
