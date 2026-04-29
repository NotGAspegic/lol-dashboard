"use client";

import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { getTiltPrediction } from "@/lib/api";


export default function TiltPredictionPrefetch({ puuid }: { puuid: string }) {
  const queryClient = useQueryClient();

  useEffect(() => {
    void queryClient.prefetchQuery({
      queryKey: ["tilt-prediction", puuid],
      queryFn: () => getTiltPrediction(puuid),
      staleTime: 1000 * 60 * 10,
    });
  }, [puuid, queryClient]);

  return null;
}
