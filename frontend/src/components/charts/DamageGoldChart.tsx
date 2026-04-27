"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
	CartesianGrid,
	ReferenceLine,
	ResponsiveContainer,
	Scatter,
	ScatterChart,
	Tooltip,
	XAxis,
	YAxis,
} from "recharts";
import { DamageEfficiencyGame, getDamageEfficiency } from "@/lib/api";
import ChampionIconClient from "@/components/ui/ChampionIconClient";
import Skeleton from "@/components/ui/Skeleton";

interface DamageGoldChartProps {
	puuid: string;
}

interface DamageGoldPoint extends DamageEfficiencyGame {
	damage_pct: number;
	gold_pct: number;
	efficient: boolean;
}

function scoreColor(score: number): string {
	if (score >= 60) return "#4CAF72";
	if (score >= 45) return "#C89B3C";
	return "#E8523C";
}

function CustomTooltip({
	active,
	payload,
}: {
	active?: boolean;
	payload?: { payload: DamageGoldPoint }[];
}) {
	if (!active || !payload || payload.length === 0) return null;

	const d = payload[0].payload;
	const delta = d.damage_pct - d.gold_pct;

	return (
		<div
			className="border rounded-lg p-3 flex flex-col gap-1"
			style={{
				background: "#0D1E3A",
				borderColor: "rgba(30,155,232,0.3)",
				minWidth: 180,
			}}
		>
			<div className="flex items-center gap-2">
				<ChampionIconClient championId={d.championId} size={28} />
				<span
					className="text-xs font-bold"
					style={{ color: d.win ? "#4CAF72" : "#E8523C" }}
				>
					{d.win ? "WIN" : "LOSS"}
				</span>
			</div>
			<span className="text-xs font-mono" style={{ color: "#C8C0B0" }}>
				Damage: {d.damage_pct.toFixed(1)}% | Gold: {d.gold_pct.toFixed(1)}%
			</span>
			<span
				className="text-xs font-mono"
				style={{ color: d.efficient ? "#4CAF72" : "#E8523C" }}
			>
				{d.efficient ? "Efficient" : "Inefficient"} ({delta >= 0 ? "+" : ""}
				{delta.toFixed(1)} pts)
			</span>
		</div>
	);
}

export default function DamageGoldChart({ puuid }: DamageGoldChartProps) {
	const { data, isLoading, isError } = useQuery({
		queryKey: ["damage-efficiency", puuid],
		queryFn: () => getDamageEfficiency(puuid),
	});

	const points = useMemo<DamageGoldPoint[]>(() => {
		const games = data?.games ?? [];

		return games.map((g) => ({
			...g,
			damage_pct: g.damage_share * 100,
			gold_pct: g.gold_share * 100,
			efficient: g.damage_share > g.gold_share,
		}));
	}, [data]);

	const efficiencyScore = useMemo(() => {
		if (!points.length) return 0;
		const efficientGames = points.filter((g) => g.efficient).length;
		return Math.round((efficientGames / points.length) * 100);
	}, [points]);

	if (isLoading) return <Skeleton className="h-80 w-full" />;

	if (isError || !points.length) {
		return (
			<div
				className="h-80 flex items-center justify-center rounded-lg border text-sm font-mono"
				style={{ borderColor: "rgba(30,155,232,0.1)", color: "#3A5070" }}
			>
				Not enough data for damage efficiency analysis.
			</div>
		);
	}

	const wins = points.filter((p) => p.win);
	const losses = points.filter((p) => !p.win);

	return (
		<div className="flex flex-col gap-3">
			<div
				className="rounded-lg border px-3 py-2 flex items-center justify-between gap-2 flex-wrap"
				style={{ borderColor: "rgba(30,155,232,0.15)" }}
			>
				<div className="flex flex-col">
					<span className="text-dim text-xs font-mono uppercase tracking-wider">
						Efficiency Score
					</span>
					<span
						className="text-sm font-mono"
						style={{ color: scoreColor(efficiencyScore) }}
					>
						Efficient in {efficiencyScore}% of games
					</span>
				</div>
				<span className="text-xs font-mono" style={{ color: "#3A5070" }}>
					{points.length} games analyzed
				</span>
			</div>

			<div className="relative">
				<div className="absolute inset-0 pointer-events-none z-10">
					<div
						className="absolute top-0 left-0 text-xs font-mono opacity-45"
						style={{ color: "#4CAF72" }}
					>
						Efficient (Low Resources)
					</div>
					<div
						className="absolute top-0 right-2 text-xs font-mono opacity-45 text-right"
						style={{ color: "#4CAF72" }}
					>
						Dominant
					</div>
					<div
						className="absolute bottom-9 left-2 text-xs font-mono opacity-45"
						style={{ color: "#E8523C" }}
					>
						Underperforming
					</div>
					<div
						className="absolute bottom-9 right-2 text-xs font-mono opacity-45 text-right max-w-[180px]"
						style={{ color: "#C89B3C" }}
					>
						Resource-Heavy Low Output
					</div>
				</div>

				<ResponsiveContainer width="100%" height={330}>
					<ScatterChart margin={{ top: 22, right: 16, left: -10, bottom: 0 }}>
						<CartesianGrid
							strokeDasharray="3 3"
							stroke="rgba(30,155,232,0.08)"
						/>
						<XAxis
							type="number"
							dataKey="gold_pct"
							domain={[0, 50]}
							tick={{ fill: "#3A5070", fontSize: 11, fontFamily: "monospace" }}
							axisLine={false}
							tickLine={false}
							tickFormatter={(v) => `${v}%`}
							label={{
								value: "Gold Share",
								position: "insideBottom",
								offset: 4,
								fill: "#3A5070",
								fontSize: 11,
								fontFamily: "monospace",
							}}
						/>
						<YAxis
							type="number"
							dataKey="damage_pct"
							domain={[0, 50]}
							tick={{ fill: "#3A5070", fontSize: 11, fontFamily: "monospace" }}
							axisLine={false}
							tickLine={false}
							tickFormatter={(v) => `${v}%`}
							label={{
								value: "Damage Share",
								angle: -90,
								position: "insideLeft",
								fill: "#3A5070",
                                offset: 16,
								fontSize: 11,
								fontFamily: "monospace",
							}}
						/>
						<Tooltip
							content={<CustomTooltip />}
							cursor={{
								strokeDasharray: "3 3",
								stroke: "rgba(30,155,232,0.2)",
							}}
						/>
						<ReferenceLine
							x={25}
							stroke="rgba(30,155,232,0.12)"
							strokeDasharray="2 4"
						/>
						<ReferenceLine
							y={25}
							stroke="rgba(30,155,232,0.12)"
							strokeDasharray="2 4"
						/>
						<ReferenceLine
							segment={[
								{ x: 0, y: 0 },
								{ x: 50, y: 50 },
							]}
							stroke="rgba(30,155,232,0.55)"
							strokeDasharray="5 5"
							label={{
								value: "Efficiency Line",
								position: "insideTopLeft",
								fill: "#3A5070",
								fontSize: 10,
                                offset: 12,
								fontFamily: "monospace",
							}}
						/>
						<Scatter name="Wins" data={wins} fill="#4CAF72" fillOpacity={0.75} />
						<Scatter name="Losses" data={losses} fill="#E8523C" fillOpacity={0.75} />
					</ScatterChart>
				</ResponsiveContainer>
			</div>

			<div
				className="flex items-center gap-4 text-xs font-mono"
				style={{ color: "#3A5070" }}
			>
				<div className="flex items-center gap-1">
					<span className="h-2 w-2 rounded-full" style={{ background: "#4CAF72" }} />
					Wins
				</div>
				<div className="flex items-center gap-1">
					<span className="h-2 w-2 rounded-full" style={{ background: "#E8523C" }} />
					Losses
				</div>
			</div>
		</div>
	);
}
