"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useDebounce } from "use-debounce";
import Image from "next/image";
import RegionSelect from "@/components/ui/RegionSelect";
import { searchSummoner, getTaskStatus } from "@/lib/api";

export default function Home() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [region, setRegion] = useState("euw1");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [debouncedQuery] = useDebounce(query, 500);

  const parts = debouncedQuery.split("#");
  const isValid = parts.length === 2 && parts[0].trim() !== "" && parts[1].trim() !== "";

  const handleSearch = async () => {
    if (!isValid || loading) return;

    const [gameName, tagLine] = parts;
    setLoading(true);
    setMessage("Searching...");

    try {
      const result = await searchSummoner(
        gameName.trim(),
        tagLine.trim(),
        region
      );

      if (result.status === "ready") {
        router.push(`/summoner/${result.puuid}`);
        return;
      }

      // onboarding — poll until done
      setMessage("Fetching summoner data...");
      const interval = setInterval(async () => {
        try {
          const status = await getTaskStatus(result.task_id!);
          setMessage(status.message ?? "Ingesting match history...");

          if (status.status === "SUCCESS") {
            clearInterval(interval);
            router.push(`/summoner/${result.puuid}`);
          }
          if (status.status === "FAILURE") {
            clearInterval(interval);
            setMessage("Something went wrong. Please try again.");
            setLoading(false);
          }
        } catch {
          clearInterval(interval);
          setMessage("Lost connection. Please try again.");
          setLoading(false);
        }
      }, 2000);
    } catch {
      setMessage("Failed to reach the API. Is it running?");
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-[80vh] gap-8 px-4">
      {/* Logo + title */}
      <div className="flex flex-col items-center gap-3">
        <Image
          src="/farsight.png"
          alt="Farsight"
          width={72}
          height={72}
          className="rounded-xl"
          priority
        />
        <h1 className="text-4xl font-bold text-white tracking-tight">
          Farsight
        </h1>
        <p className="text-dim text-sm">
          League of Legends advanced analytics
        </p>
      </div>

      {/* Search box */}
      <div className="w-full max-w-lg flex flex-col gap-3">
        <div className="flex gap-2">
          <input
            className="flex-1 bg-surface2 border border-primary/20 rounded-lg px-4 py-3 text-white placeholder:text-dim focus:outline-none focus:border-primary/50 transition-colors text-sm"
            placeholder="Name#TAG"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            disabled={loading}
            autoFocus
          />
          <RegionSelect value={region} onChange={setRegion} />
          <button
            className="bg-primary hover:bg-primary-dim text-white font-semibold px-5 py-3 rounded-lg disabled:opacity-40 transition-colors text-sm"
            onClick={handleSearch}
            disabled={!isValid || loading}
          >
            {loading ? "..." : "Search"}
          </button>
        </div>

        {/* Hint or status message */}
        <div className="h-5 flex items-center justify-center">
          {message ? (
            <div className="flex items-center gap-2">
              {loading && (
                <span className="inline-block w-3 h-3 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              )}
              <p className="text-primary text-xs">{message}</p>
            </div>
          ) : (
            <p className="text-dim text-xs">
              Enter your Riot ID in{" "}
              <span className="text-white font-mono">Name#TAG</span> format
            </p>
          )}
        </div>
      </div>
    </div>
  );
}