"use client";

import { useEffect } from "react";


const CURRENT_SUMMONER_KEY = "farsight.currentSummonerPuuid";

export default function CurrentSummonerTracker({ puuid }: { puuid: string }) {
  useEffect(() => {
    try {
      window.localStorage.setItem(CURRENT_SUMMONER_KEY, puuid);
    } catch {
      // ignore localStorage availability issues
    }
  }, [puuid]);

  return null;
}
