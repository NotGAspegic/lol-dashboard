"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { onboardSummonerByPuuid, type SummonerSearchResponse } from "@/lib/api";
import { buildSummonerProfilePath } from "@/lib/summonerRoute";

interface ParticipantIdentityProps {
  puuid: string;
  initialGameName: string;
  initialTagLine?: string | null;
  initialProfileHref?: string | null;
  matchRegion?: string | null;
  roleLabel: string;
  roleAccent: string;
  isCurrentPlayer: boolean;
}

function IdentityLink({
  href,
  gameName,
  tagLine,
  roleLabel,
  roleAccent,
  isCurrentPlayer,
}: {
  href: string;
  gameName: string;
  tagLine?: string | null;
  roleLabel: string;
  roleAccent: string;
  isCurrentPlayer: boolean;
}) {
  return (
    <Link
      href={href}
      className="group inline-flex min-w-0 flex-col rounded-md border border-transparent px-2 py-1 transition-colors hover:border-primary/20 hover:bg-primary/5"
    >
      <div className="flex min-w-0 items-center gap-2">
        <span className="truncate text-sm font-semibold text-white transition-colors group-hover:text-primary">
          {gameName}
        </span>
        {tagLine ? (
          <span className="rounded-full border border-primary/20 bg-primary/10 px-2 py-0.5 text-[10px] font-mono uppercase tracking-[0.18em] text-primary/75">
            #{tagLine}
          </span>
        ) : null}
      </div>
      <div className="mt-1 flex items-center gap-2 text-[11px] font-mono uppercase tracking-[0.16em] text-dim">
        <span
          className="rounded-full border px-2 py-0.5"
          style={{
            borderColor: `${roleAccent}55`,
            color: roleAccent,
          }}
        >
          {roleLabel}
        </span>
        {isCurrentPlayer ? (
          <span className="rounded-full border border-primary/25 bg-primary/15 px-2 py-0.5 text-primary">
            You
          </span>
        ) : null}
      </div>
    </Link>
  );
}

export default function ParticipantIdentity({
  puuid,
  initialGameName,
  initialTagLine,
  initialProfileHref,
  matchRegion,
  roleLabel,
  roleAccent,
  isCurrentPlayer,
}: ParticipantIdentityProps) {
  const router = useRouter();
  const [identity, setIdentity] = useState<{
    gameName: string;
    tagLine?: string | null;
    profileHref?: string | null;
  }>({
    gameName: initialGameName,
    tagLine: initialTagLine,
    profileHref: initialProfileHref,
  });
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [queued, setQueued] = useState(false);

  const handleOnboard = async () => {
    if (!matchRegion) {
      setError("Region missing");
      return;
    }

    setError(null);
    setIsLoading(true);

    try {
      const response: SummonerSearchResponse = await onboardSummonerByPuuid(puuid, matchRegion);
      const nextHref = buildSummonerProfilePath({
        puuid: response.puuid,
        region: response.region,
        gameName: response.game_name,
        tagLine: response.tag_line,
      });

      setIdentity({
        gameName: response.game_name,
        tagLine: response.tag_line,
        profileHref: response.status === "ready" ? nextHref : null,
      });
      setQueued(response.status === "onboarding");

      if (response.status === "ready") {
        router.refresh();
      }
    } catch {
      setError("Try again");
    } finally {
      setIsLoading(false);
    }
  };

  if (identity.profileHref) {
    return (
      <IdentityLink
        href={identity.profileHref}
        gameName={identity.gameName}
        tagLine={identity.tagLine}
        roleLabel={roleLabel}
        roleAccent={roleAccent}
        isCurrentPlayer={isCurrentPlayer}
      />
    );
  }

  return (
    <div className="inline-flex min-w-0 flex-col rounded-md border border-primary/10 bg-primary/5 px-2 py-1">
      <div className="flex min-w-0 items-center gap-2">
        <span className="truncate text-sm font-semibold text-white">
          {isLoading ? "Resolving player..." : identity.gameName}
        </span>
        {identity.tagLine ? (
          <span className="rounded-full border border-primary/20 bg-primary/10 px-2 py-0.5 text-[10px] font-mono uppercase tracking-[0.18em] text-primary/75">
            #{identity.tagLine}
          </span>
        ) : null}
        <button
          type="button"
          onClick={handleOnboard}
          disabled={isLoading || queued || !matchRegion}
          className="rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-[10px] font-mono uppercase tracking-[0.18em] text-primary transition-colors hover:border-primary/50 hover:bg-primary/15 disabled:cursor-not-allowed disabled:border-primary/10 disabled:text-dim"
        >
          {isLoading ? "Onboarding" : queued ? "Queued" : matchRegion ? "Onboard" : "No region"}
        </button>
      </div>
      <div className="mt-1 flex items-center gap-2 text-[11px] font-mono uppercase tracking-[0.16em] text-dim">
        <span
          className="rounded-full border px-2 py-0.5"
          style={{
            borderColor: `${roleAccent}55`,
            color: roleAccent,
          }}
        >
          {roleLabel}
        </span>
        {isCurrentPlayer ? (
          <span className="rounded-full border border-primary/25 bg-primary/15 px-2 py-0.5 text-primary">
            You
          </span>
        ) : null}
      </div>
      <div className="mt-1 text-[10px] text-dim">
        {error
          ? error
          : queued
            ? "Riot ID resolved. Profile is being ingested now."
            : "Resolve Riot ID and add this summoner to tracked profiles."}
      </div>
    </div>
  );
}
