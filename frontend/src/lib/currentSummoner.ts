export const CURRENT_SUMMONER_KEY = "farsight.currentSummoner";
export const CURRENT_SUMMONER_PUUID_KEY = "farsight.currentSummonerPuuid";
export const CURRENT_SUMMONER_EVENT = "farsight:current-summoner";

export interface CurrentSummonerIdentity {
  puuid: string;
  region?: string;
  gameName?: string | null;
  tagLine?: string | null;
}

export function subscribeToCurrentSummonerStore(onStoreChange: () => void): () => void {
  const handleStorage = (event: StorageEvent) => {
    if (
      event.key === null ||
      event.key === CURRENT_SUMMONER_KEY ||
      event.key === CURRENT_SUMMONER_PUUID_KEY
    ) {
      onStoreChange();
    }
  };

  const handleCustomEvent = () => {
    onStoreChange();
  };

  window.addEventListener("storage", handleStorage);
  window.addEventListener(CURRENT_SUMMONER_EVENT, handleCustomEvent);

  return () => {
    window.removeEventListener("storage", handleStorage);
    window.removeEventListener(CURRENT_SUMMONER_EVENT, handleCustomEvent);
  };
}

export function readCurrentSummonerSnapshot(): string {
  try {
    return window.localStorage.getItem(CURRENT_SUMMONER_KEY) ?? "";
  } catch {
    return "";
  }
}

export function readCurrentSummoner(): CurrentSummonerIdentity | null {
  try {
    const raw = readCurrentSummonerSnapshot();
    if (raw) {
      return JSON.parse(raw) as CurrentSummonerIdentity;
    }

    const legacyPuuid = window.localStorage.getItem(CURRENT_SUMMONER_PUUID_KEY);
    if (legacyPuuid) {
      return { puuid: legacyPuuid };
    }
  } catch {
    return null;
  }

  return null;
}

export function writeCurrentSummoner(identity: CurrentSummonerIdentity): void {
  window.localStorage.setItem(CURRENT_SUMMONER_KEY, JSON.stringify(identity));
  window.localStorage.setItem(CURRENT_SUMMONER_PUUID_KEY, identity.puuid);
  window.dispatchEvent(new Event(CURRENT_SUMMONER_EVENT));
}
