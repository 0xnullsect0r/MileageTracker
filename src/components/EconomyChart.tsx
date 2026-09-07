"use client";

import {
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Scatter,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export interface EconomyPoint {
  date: string;
  economy: number | null;
  pricePerUnit: number | null;
  merged: number;
}

/**
 * Economy against price paid.
 *
 * Discrete markers, not a smoothed curve: fill-ups are irregular real
 * events, and a spline would draw values that never happened. Colours come
 * from the same tokens as the rest of the app, never Recharts' defaults.
 */
export function EconomyChart({ data, unit }: { data: EconomyPoint[]; unit: string }) {
  if (data.length < 2) {
    return <p className="mt-4 text-sm text-ink-muted">Not enough full tanks yet to chart.</p>;
  }
  return (
    <div className="mt-4 h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -12 }}>
          <CartesianGrid stroke="var(--rule)" strokeWidth={1} vertical={false} />
          <XAxis
            dataKey="date"
            tick={{ fill: "var(--ink-muted)", fontSize: 12, fontFamily: "var(--font-mono)" }}
            tickLine={false}
            axisLine={{ stroke: "var(--rule)" }}
            minTickGap={48}
          />
          <YAxis
            yAxisId="economy"
            tick={{ fill: "var(--ink-muted)", fontSize: 12, fontFamily: "var(--font-mono)" }}
            tickLine={false}
            axisLine={false}
            width={44}
          />
          <YAxis
            yAxisId="price"
            orientation="right"
            tick={{ fill: "var(--ink-muted)", fontSize: 12, fontFamily: "var(--font-mono)" }}
            tickLine={false}
            axisLine={false}
            width={44}
          />
          <Tooltip
            contentStyle={{
              background: "var(--paper-raised)",
              border: "1px solid var(--rule)",
              borderRadius: 2,
              fontSize: 13,
              fontFamily: "var(--font-mono)",
              color: "var(--ink)",
            }}
            labelStyle={{ color: "var(--ink-muted)" }}
            formatter={(value: unknown, name: unknown) => {
              const n = typeof value === "number" ? value : Number(value);
              return name === "economy" ? [`${n.toFixed(1)} ${unit}/gal`, "economy"] : [`$${n.toFixed(3)}`, "price"];
            }}
          />
          <Line
            yAxisId="economy"
            type="linear"
            dataKey="economy"
            stroke="var(--signal)"
            strokeWidth={1.5}
            dot={false}
            connectNulls
            isAnimationActive={false}
          />
          <Scatter yAxisId="economy" dataKey="economy" fill="var(--signal)" shape="circle" r={2} isAnimationActive={false} />
          <Line
            yAxisId="price"
            type="linear"
            dataKey="pricePerUnit"
            stroke="var(--ink-muted)"
            strokeWidth={1}
            strokeDasharray="3 3"
            dot={false}
            connectNulls
            isAnimationActive={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
