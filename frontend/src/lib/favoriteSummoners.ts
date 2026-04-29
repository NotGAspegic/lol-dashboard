export const FAVORITE_SUMMONERS_KEY = "farsight.favoriteSummoners";
export const FAVORITE_SUMMONERS_EVENT = "farsight:favorite-summoners";

export interface FavoriteSummonerIdentity {
  puuid: string;
  region?: string | null;
  gameName: string;
  tagLine: string;
  profileIconId?: number;
  summonerLevel?: number;
}

function normalizeFavorites(value: unknown): FavoriteSummonerIdentity[] {
  if (!Array.isArray(value)) return [];

  return value
    .filter((item): item is FavoriteSummonerIdentity => {
      return Boolean(
        item &&
        typeof item === "object" &&
        "puuid" in item &&
        "gameName" in item &&
        "tagLine" in item
      );
    })
    .map((item) => ({
      puuid: item.puuid,
      region: item.region ?? null,
      gameName: item.gameName,
      tagLine: item.tagLine,
      profileIconId: item.profileIconId,
      summonerLevel: item.summonerLevel,
    }));
}

export function subscribeToFavoriteSummonersStore(onStoreChange: () => void): () => void {
  const handleStorage = (event: StorageEvent) => {
    if (event.key === null || event.key === FAVORITE_SUMMONERS_KEY) {
      onStoreChange();
    }
  };

  const handleCustomEvent = () => {
    onStoreChange();
  };

  window.addEventListener("storage", handleStorage);
  window.addEventListener(FAVORITE_SUMMONERS_EVENT, handleCustomEvent);

  return () => {
    window.removeEventListener("storage", handleStorage);
    window.removeEventListener(FAVORITE_SUMMONERS_EVENT, handleCustomEvent);
  };
}

export function readFavoriteSummonersSnapshot(): string {
  try {
    return window.localStorage.getItem(FAVORITE_SUMMONERS_KEY) ?? "[]";
  } catch {
    return "[]";
  }
}

export function readFavoriteSummoners(): FavoriteSummonerIdentity[] {
  try {
    const raw = readFavoriteSummonersSnapshot();
    return normalizeFavorites(JSON.parse(raw));
  } catch {
    return [];
  }
}

function writeFavoriteSummoners(favorites: FavoriteSummonerIdentity[]): void {
  window.localStorage.setItem(FAVORITE_SUMMONERS_KEY, JSON.stringify(favorites));
  window.dispatchEvent(new Event(FAVORITE_SUMMONERS_EVENT));
}

export function isFavoriteSummoner(puuid: string): boolean {
  return readFavoriteSummoners().some((favorite) => favorite.puuid === puuid);
}

export function toggleFavoriteSummoner(identity: FavoriteSummonerIdentity): FavoriteSummonerIdentity[] {
  const favorites = readFavoriteSummoners();
  const exists = favorites.some((favorite) => favorite.puuid === identity.puuid);

  const nextFavorites = exists
    ? favorites.filter((favorite) => favorite.puuid !== identity.puuid)
    : [identity, ...favorites.filter((favorite) => favorite.puuid !== identity.puuid)].slice(0, 8);

  writeFavoriteSummoners(nextFavorites);
  return nextFavorites;
}
