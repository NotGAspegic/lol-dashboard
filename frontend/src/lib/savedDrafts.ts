export const SAVED_DRAFTS_KEY = "farsight.savedDrafts";
export const SAVED_DRAFTS_EVENT = "farsight:saved-drafts";

export interface SavedDraft {
  id: string;
  label: string;
  createdAt: string;
  blueTeam: Array<number | null>;
  redTeam: Array<number | null>;
  playerSlot: number;
  puuid?: string;
  summonerLabel?: string;
}

function normalizeDrafts(value: unknown): SavedDraft[] {
  if (!Array.isArray(value)) return [];

  return value
    .filter((item): item is SavedDraft => {
      return Boolean(
        item &&
        typeof item === "object" &&
        "id" in item &&
        "label" in item &&
        "blueTeam" in item &&
        "redTeam" in item &&
        "playerSlot" in item
      );
    })
    .map((item) => ({
      id: item.id,
      label: item.label,
      createdAt: item.createdAt,
      blueTeam: Array.isArray(item.blueTeam) ? item.blueTeam.slice(0, 5) : Array(5).fill(null),
      redTeam: Array.isArray(item.redTeam) ? item.redTeam.slice(0, 5) : Array(5).fill(null),
      playerSlot: typeof item.playerSlot === "number" ? item.playerSlot : 0,
      puuid: item.puuid,
      summonerLabel: item.summonerLabel,
    }));
}

export function subscribeToSavedDraftsStore(onStoreChange: () => void): () => void {
  const handleStorage = (event: StorageEvent) => {
    if (event.key === null || event.key === SAVED_DRAFTS_KEY) {
      onStoreChange();
    }
  };

  const handleCustomEvent = () => onStoreChange();

  window.addEventListener("storage", handleStorage);
  window.addEventListener(SAVED_DRAFTS_EVENT, handleCustomEvent);

  return () => {
    window.removeEventListener("storage", handleStorage);
    window.removeEventListener(SAVED_DRAFTS_EVENT, handleCustomEvent);
  };
}

export function readSavedDraftsSnapshot(): string {
  try {
    return window.localStorage.getItem(SAVED_DRAFTS_KEY) ?? "[]";
  } catch {
    return "[]";
  }
}

export function readSavedDrafts(): SavedDraft[] {
  try {
    return normalizeDrafts(JSON.parse(readSavedDraftsSnapshot()));
  } catch {
    return [];
  }
}

function writeSavedDrafts(drafts: SavedDraft[]) {
  window.localStorage.setItem(SAVED_DRAFTS_KEY, JSON.stringify(drafts));
  window.dispatchEvent(new Event(SAVED_DRAFTS_EVENT));
}

export function saveDraft(draft: Omit<SavedDraft, "id" | "createdAt">): SavedDraft[] {
  const next: SavedDraft = {
    ...draft,
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
  };
  const drafts = [next, ...readSavedDrafts()].slice(0, 8);
  writeSavedDrafts(drafts);
  return drafts;
}

export function removeSavedDraft(id: string): SavedDraft[] {
  const drafts = readSavedDrafts().filter((draft) => draft.id !== id);
  writeSavedDrafts(drafts);
  return drafts;
}
