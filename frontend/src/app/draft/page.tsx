"use client";

import { Suspense, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import {
  Bookmark,
  Crosshair,
  Flag,
  Leaf,
  RotateCcw,
  Search,
  Shield,
  Shuffle,
  Sparkles,
  Swords,
  Trash2,
} from "lucide-react";

import DraftProbabilityGauge from "@/components/ml/DraftProbabilityGauge";
import Card from "@/components/ui/Card";
import Skeleton from "@/components/ui/Skeleton";
import {
  CurrentSummonerIdentity,
  readCurrentSummonerSnapshot,
  subscribeToCurrentSummonerStore,
} from "@/lib/currentSummoner";
import {
  readSavedDraftsSnapshot,
  removeSavedDraft,
  saveDraft,
  SavedDraft,
  subscribeToSavedDraftsStore,
} from "@/lib/savedDrafts";
import { getDraftPrediction } from "@/lib/api";
import { formatSummonerDisplayName } from "@/lib/summonerRoute";


interface ChampionOption {
  id: number;
  name: string;
  key: string;
}

const TEAM_SIZE = 5;
const SLOT_LABELS = ["Top", "Jungle", "Mid", "ADC", "Support"];
const SLOT_ACCENTS = ["#4DB8FF", "#34C759", "#C86BFF", "#E8523C", "#45C5A1"];
const SLOT_ICONS = [Flag, Leaf, Sparkles, Crosshair, Shield];

function playerSlotLabel(index: number): string {
  return SLOT_LABELS[index] ?? `Slot ${index + 1}`;
}

function slotAccent(index: number): string {
  return SLOT_ACCENTS[index] ?? "#1E9BE8";
}

function describeSlot(slotKey: string | null): string | null {
  if (!slotKey) return null;
  const [team, rawIndex] = slotKey.split("-");
  const slotIndex = Number(rawIndex);
  if (!Number.isFinite(slotIndex)) return null;
  return `${team === "blue" ? "Blue" : "Red"} ${playerSlotLabel(slotIndex)}`;
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
  takenChampionIds: Set<number>;
}) {
  const selectedChampion = champions.find((champion) => champion.id === selectedChampionId) ?? null;
  const filteredChampions = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    const base = normalizedQuery
      ? champions.filter((champion) => champion.name.toLowerCase().includes(normalizedQuery))
      : champions;

    return base.slice(0, 10);
  }, [champions, query]);
  const SlotIcon = SLOT_ICONS[slotIndex] ?? Shield;
  const accent = slotAccent(slotIndex);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={onActivate}
        className={`flex w-full items-center gap-3 rounded-lg border px-3 py-3 text-left transition-colors ${
          active ? "ring-1 ring-primary/40" : ""
        }`}
        style={{
          borderColor: active
            ? "rgba(30,155,232,0.55)"
            : isPlayerSlot
            ? "rgba(30,155,232,0.45)"
            : teamLabel === "Blue"
              ? "rgba(77,184,255,0.18)"
              : "rgba(232,82,60,0.18)",
          background: active
            ? "linear-gradient(135deg, rgba(20,43,79,0.88) 0%, rgba(13,30,58,0.72) 100%)"
            : isPlayerSlot
            ? "rgba(30,155,232,0.08)"
            : teamLabel === "Blue"
              ? "linear-gradient(135deg, rgba(17,34,60,0.82) 0%, rgba(13,30,58,0.55) 100%)"
              : "linear-gradient(135deg, rgba(44,18,26,0.82) 0%, rgba(13,30,58,0.55) 100%)",
        }}
      >
        <ChampionAvatar champion={selectedChampion} patch={patch} size={40} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-xs font-mono uppercase tracking-wider text-dim">
              {teamLabel} {slotIndex + 1}
            </span>
            <span
              className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-mono uppercase tracking-[0.16em]"
              style={{
                borderColor: `${accent}33`,
                color: accent,
                background: `${accent}12`,
              }}
            >
              <SlotIcon className="h-3 w-3" />
              {playerSlotLabel(slotIndex)}
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
      </button>

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
          <div className="mt-2 text-[11px] font-mono uppercase tracking-[0.18em] text-primary/70">
            Assigning to {teamLabel} {playerSlotLabel(slotIndex)}
          </div>
          <div className="mt-3 grid max-h-72 gap-1 overflow-y-auto">
            {filteredChampions.map((champion) => (
              <button
                key={champion.id}
                type="button"
                onClick={() => onSelect(champion.id)}
                className="flex items-center gap-3 rounded-lg px-2 py-2 text-left transition-colors hover:bg-surface2"
              >
                <ChampionAvatar champion={champion} patch={patch} size={36} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm text-white">{champion.name}</div>
                  {takenChampionIds.has(champion.id) && champion.id !== selectedChampionId ? (
                    <div className="text-[11px] text-amber-300">Already picked • selecting will swap slots</div>
                  ) : null}
                </div>
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

function DraftPageContent() {
  const searchParams = useSearchParams();
  const queryPuuid = searchParams.get("puuid") ?? "";
  const storedSummonerSnapshot = useSyncExternalStore(
    subscribeToCurrentSummonerStore,
    readCurrentSummonerSnapshot,
    () => ""
  );
  const storedSummoner = useMemo<CurrentSummonerIdentity | null>(() => {
    if (!storedSummonerSnapshot) return null;

    try {
      return JSON.parse(storedSummonerSnapshot) as CurrentSummonerIdentity;
    } catch {
      return null;
    }
  }, [storedSummonerSnapshot]);
  const initialPuuid = queryPuuid || storedSummoner?.puuid || "";
  const summonerLabel = storedSummoner
    ? formatSummonerDisplayName({
        puuid: storedSummoner.puuid,
        gameName: storedSummoner.gameName,
        tagLine: storedSummoner.tagLine,
      })
    : (queryPuuid ? queryPuuid.slice(0, 8).toUpperCase() : "");
  const savedDraftSnapshot = useSyncExternalStore(
    subscribeToSavedDraftsStore,
    readSavedDraftsSnapshot,
    () => "[]"
  );
  const savedDrafts = useMemo<SavedDraft[]>(() => {
    try {
      return JSON.parse(savedDraftSnapshot) as SavedDraft[];
    } catch {
      return [];
    }
  }, [savedDraftSnapshot]);
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
  const championById = useMemo(
    () => new Map(champions.map((champion) => [champion.id, champion])),
    [champions]
  );
  const recentChampionIds = useMemo(() => {
    const counts = new Map<number, number>();
    for (const draft of savedDrafts) {
      for (const championId of [...draft.blueTeam, ...draft.redTeam]) {
        if (championId != null) {
          counts.set(championId, (counts.get(championId) ?? 0) + 1);
        }
      }
    }

    return [...counts.entries()]
      .sort((left, right) => right[1] - left[1])
      .slice(0, 6)
      .map(([championId]) => championId);
  }, [savedDrafts]);
  const activeSlotLabel = describeSlot(activeSlot);

  const draftQuery = useQuery({
    queryKey: ["draft-prediction", initialPuuid, blueTeam, redTeam, playerSlot],
    queryFn: () =>
      getDraftPrediction({
        puuid: initialPuuid,
        ally_champion_ids: blueTeam as number[],
        enemy_champion_ids: redTeam as number[],
        player_champion_id: playerChampionId as number,
      }),
    enabled: Boolean(initialPuuid.trim() && hasAllPicks && playerChampionId != null),
    staleTime: 1000 * 60,
    placeholderData: (previous) => previous,
  });

  function setChampion(team: "blue" | "red", index: number, championId: number) {
    const sourceKey = `${team}-${index}`;
    const blueSwapIndex = blueTeam.findIndex(
      (value, slotIndex) => value === championId && sourceKey !== `blue-${slotIndex}`
    );
    const redSwapIndex = redTeam.findIndex(
      (value, slotIndex) => value === championId && sourceKey !== `red-${slotIndex}`
    );
    const swapTarget =
      blueSwapIndex >= 0
        ? { team: "blue" as const, index: blueSwapIndex }
        : redSwapIndex >= 0
          ? { team: "red" as const, index: redSwapIndex }
          : null;

    const currentValue = team === "blue" ? blueTeam[index] : redTeam[index];

    if (team === "blue") {
      setBlueTeam((previous) => previous.map((value, slotIndex) => (slotIndex === index ? championId : value)));
    } else {
      setRedTeam((previous) => previous.map((value, slotIndex) => (slotIndex === index ? championId : value)));
    }

    if (swapTarget) {
      if (swapTarget.team === "blue") {
        setBlueTeam((previous) =>
          previous.map((value, slotIndex) => (slotIndex === swapTarget.index ? currentValue ?? null : value))
        );
      } else {
        setRedTeam((previous) =>
          previous.map((value, slotIndex) => (slotIndex === swapTarget.index ? currentValue ?? null : value))
        );
      }
    }

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
    setActiveSlot(null);
    setSlotQueries({});
  }

  function saveCurrentDraft() {
    const filledBlue = blueTeam.filter((value) => value != null).length;
    const filledRed = redTeam.filter((value) => value != null).length;
    const totalFilled = filledBlue + filledRed;
    if (totalFilled < 2) return;

    const stamp = new Intl.DateTimeFormat("en-GB", {
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date());

    saveDraft({
      label: `${summonerLabel || "Draft"} · ${stamp}`,
      blueTeam,
      redTeam,
      playerSlot,
      puuid: initialPuuid || undefined,
      summonerLabel: summonerLabel || undefined,
    });
  }

  function loadSavedDraft(draft: SavedDraft) {
    setBlueTeam(draft.blueTeam);
    setRedTeam(draft.redTeam);
    setPlayerSlot(draft.playerSlot);
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
              Your {playerSlotLabel(playerSlot)}: {champions.find((champion) => champion.id === playerChampionId)?.name ?? "Open slot"}
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
        <div className="rounded-xl border border-primary/15 bg-surface2/35 px-4 py-3 text-sm text-dim">
          Build both drafts, choose your blue-side role, then save comps you want to revisit.
          The prediction becomes more useful when you open this tool from a tracked summoner profile.
        </div>
        {recentChampionIds.length > 0 ? (
          <div className="rounded-xl border border-primary/10 bg-surface2/30 px-4 py-3">
            <div className="text-[11px] font-mono uppercase tracking-[0.2em] text-dim">Recently Used Champions</div>
            <div className="mt-3 flex flex-wrap gap-2">
              {recentChampionIds.map((championId) => {
                const champion = championById.get(championId) ?? null;
                if (!champion) return null;

                return (
                  <button
                    key={`recent-${championId}`}
                    type="button"
                    onClick={() => {
                      if (activeSlot) {
                        const [team, slotIndex] = activeSlot.split("-");
                        setChampion(team as "blue" | "red", Number(slotIndex), championId);
                      }
                    }}
                    className="flex items-center gap-2 rounded-full border border-primary/15 bg-surface px-2.5 py-1.5 text-xs text-white transition-colors hover:border-primary/35 hover:bg-surface2"
                    disabled={!activeSlot}
                    title={activeSlot ? `Assign ${champion.name} to selected slot` : "Select a slot first"}
                  >
                    <ChampionAvatar champion={champion} patch={patch} size={24} />
                    <span>{champion.name}</span>
                  </button>
                );
              })}
            </div>
            <div className="mt-2 text-xs text-dim">
              {activeSlot
                ? "Click a champion to drop it into the currently opened slot."
                : "Open any slot picker first, then these become one-click shortcuts."}
            </div>
          </div>
        ) : null}
        {activeSlotLabel ? (
          <div className="rounded-xl border border-primary/15 bg-primary/8 px-4 py-3">
            <div className="text-[11px] font-mono uppercase tracking-[0.2em] text-primary/70">Active Slot</div>
            <div className="mt-1 text-sm font-semibold text-white">{activeSlotLabel}</div>
            <div className="mt-1 text-xs text-dim">
              Search a champion or click a recent pick. Choosing an already-picked champion swaps the two slots.
            </div>
          </div>
        ) : null}
        <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.15fr)_minmax(280px,0.85fr)]">
          <div className="min-w-0 rounded-xl border border-primary/12 bg-surface2/20 p-3">
            <label className="mb-2 block text-xs font-mono uppercase tracking-wider text-dim">
              Tracked Summoner
            </label>
            <input
              value={summonerLabel}
              className="w-full rounded-lg border border-primary/20 bg-surface px-3 py-3 font-mono text-sm text-white outline-none placeholder:text-dim focus:border-primary/45"
              placeholder="BehindYou#Hers"
              readOnly
            />
          </div>

          <div className="min-w-0 rounded-xl border border-primary/12 bg-surface2/20 p-3">
            <div className="mb-2 block text-xs font-mono uppercase tracking-wider text-dim">
              Your Role
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-5">
              {SLOT_LABELS.map((label, index) => (
                <button
                  key={label}
                  type="button"
                  onClick={() => setPlayerSlot(index)}
                  className={`min-h-[48px] rounded-lg border px-2 py-3 text-[11px] font-mono uppercase tracking-[0.16em] transition-colors ${
                    playerSlot === index
                      ? "border-primary/35 bg-primary/12 text-primary"
                      : "border-primary/15 bg-surface text-dim hover:border-primary/30 hover:text-white"
                  }`}
                  aria-pressed={playerSlot === index}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="min-w-0 rounded-xl border border-primary/12 bg-surface2/20 p-3">
            <div className="rounded-lg border border-primary/15 bg-surface px-4 py-3 text-sm text-dim">
              {hasAllPicks
                ? `Draft locked in • ${playerSlotLabel(playerSlot)}`
                : `${filledCount}/10 picks filled • ${playerSlotLabel(playerSlot)}`}
            </div>
            <div className="mt-3 grid gap-2 sm:grid-cols-3 xl:grid-cols-1 2xl:grid-cols-3">
              <button
                type="button"
                onClick={saveCurrentDraft}
                disabled={filledCount < 2}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-primary/20 bg-surface px-4 text-sm text-white transition-colors hover:border-primary/40 hover:bg-surface2 disabled:opacity-40"
              >
                <Bookmark size={16} />
                Save Comp
              </button>
              <button
                type="button"
                onClick={resetDraft}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-primary/20 bg-surface px-4 text-sm text-white transition-colors hover:border-primary/40 hover:bg-surface2"
              >
                <RotateCcw size={16} />
                Reset
              </button>
              <button
                type="button"
                onClick={randomizeDraft}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-primary/20 bg-surface px-4 text-sm text-white transition-colors hover:border-primary/40 hover:bg-surface2"
              >
                <Shuffle size={16} />
                Random Draft
              </button>
            </div>
          </div>
        </div>
      </div>

      {savedDrafts.length > 0 ? (
        <Card className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xs font-mono uppercase tracking-[0.22em] text-dim">Saved Comps</div>
              <div className="mt-1 text-sm font-semibold text-white">Reuse previous draft setups</div>
            </div>
            <div className="text-xs text-dim">{savedDrafts.length} stored</div>
          </div>
          <div className="grid gap-2 lg:grid-cols-2">
            {savedDrafts.map((draft) => (
              <div
                key={draft.id}
                className="flex items-center justify-between gap-3 rounded-xl border border-primary/10 bg-surface2/50 px-3 py-3"
              >
                <button
                  type="button"
                  onClick={() => loadSavedDraft(draft)}
                  className="min-w-0 flex-1 text-left"
                >
                  <div className="truncate text-sm font-semibold text-white">{draft.label}</div>
                  <div className="truncate text-[11px] font-mono uppercase tracking-wide text-dim">
                    {draft.summonerLabel ?? "Saved draft"} • role {playerSlotLabel(draft.playerSlot)}
                  </div>
                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    <div className="rounded-lg border border-blue-400/10 bg-blue-500/5 px-2 py-2">
                      <div className="mb-2 text-[10px] font-mono uppercase tracking-[0.18em] text-blue-200/70">Blue</div>
                      <div className="flex flex-wrap gap-1.5">
                        {draft.blueTeam.map((championId, index) => (
                          <ChampionAvatar
                            key={`saved-blue-${draft.id}-${index}`}
                            champion={championId != null ? championById.get(championId) ?? null : null}
                            patch={patch}
                            size={26}
                          />
                        ))}
                      </div>
                    </div>
                    <div className="rounded-lg border border-red-400/10 bg-red-500/5 px-2 py-2">
                      <div className="mb-2 text-[10px] font-mono uppercase tracking-[0.18em] text-red-200/70">Red</div>
                      <div className="flex flex-wrap gap-1.5">
                        {draft.redTeam.map((championId, index) => (
                          <ChampionAvatar
                            key={`saved-red-${draft.id}-${index}`}
                            champion={championId != null ? championById.get(championId) ?? null : null}
                            patch={patch}
                            size={26}
                          />
                        ))}
                      </div>
                    </div>
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => removeSavedDraft(draft.id)}
                  className="rounded-lg border border-primary/15 p-2 text-dim transition-colors hover:text-red-300"
                  aria-label="Delete saved draft"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        </Card>
      ) : null}

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
              !initialPuuid.trim() ? (
                <div className="flex min-h-[260px] flex-col items-center justify-center gap-4 text-center">
                  <div className="text-sm font-semibold text-white">Open this tool from a tracked summoner profile</div>
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
                  <div className="rounded-lg border border-primary/10 bg-surface2/45 px-3 py-2 text-center text-xs text-dim">
                    {draftQuery.data.note}
                  </div>
                  <div className="grid w-full gap-2 text-left sm:grid-cols-2">
                    <div className="rounded-lg border border-primary/10 bg-surface2/35 px-3 py-3">
                      <div className="text-[11px] font-mono uppercase tracking-wide text-dim">Confidence</div>
                      <div className="mt-1 text-sm font-semibold text-white capitalize">
                        {draftQuery.data.confidence.replaceAll("_", " ")}
                      </div>
                      <div className="mt-1 text-xs text-dim">
                        Higher confidence usually means this player-champion pairing has enough tracked examples.
                      </div>
                    </div>
                    <div className="rounded-lg border border-primary/10 bg-surface2/35 px-3 py-3">
                      <div className="text-[11px] font-mono uppercase tracking-wide text-dim">Sample</div>
                      <div className="mt-1 text-sm font-semibold text-white">
                        {draftQuery.data.player_champion_games} games
                      </div>
                      <div className="mt-1 text-xs text-dim">
                        Player win rate on this champion: {draftQuery.data.player_champion_winrate.toFixed(1)}%.
                      </div>
                    </div>
                  </div>
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
                  <div className="text-xs text-dim">Choose your blue-side role, complete both drafts, then save the comp if you want to compare variations.</div>
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

function DraftPageFallback() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <div className="text-xs font-mono uppercase tracking-wider text-dim">Draft Analyzer</div>
        <div className="rounded-xl border border-primary/15 bg-surface2/35 px-4 py-3 text-sm text-dim">
          Loading draft tools...
        </div>
      </div>
      <div className="grid gap-6 lg:grid-cols-[1fr_320px_1fr]">
        <Skeleton className="h-[420px] w-full rounded-lg" />
        <Skeleton className="h-[420px] w-full rounded-lg" />
        <Skeleton className="h-[420px] w-full rounded-lg" />
      </div>
    </div>
  );
}

export default function DraftPage() {
  return (
    <Suspense fallback={<DraftPageFallback />}>
      <DraftPageContent />
    </Suspense>
  );
}
