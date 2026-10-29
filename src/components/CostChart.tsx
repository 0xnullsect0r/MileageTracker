"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { YearCosts } from "@/lib/costs";

export const COST_SERIES = [
  { key: "fuel", label: "Fuel", color: "var(--cat-gas)", pattern: null },
  { key: "service", label: "Service", color: "var(--cat-service)", pattern: "hatch" },
  { key: "fees", label: "Fees", color: "var(--cat-business)", pattern: "dots" },
  { key: "other", label: "Other", color: "var(--cat-info)", pattern: null },
] as const;

/**
 * What the vehicle cost each year, stacked by kind. Service and fees carry a
 * fill pattern as well as a hue, so the stack still reads in greyscale.
 */
export function CostChart({ data }: { data: YearCosts[] }) {
  if (data.length === 0) return null;
  return (
    <div>
      <div className="mt-4 h-56 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }} barCategoryGap="28%">
            <defs>
              <pattern id="cost-hatch" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                <rect width="5" height="5" fill="var(--paper)" />
                <line x1="0" y1="0" x2="0" y2="5" stroke="var(--cat-service)" strokeWidth="3" />
              </pattern>
              <pattern id="cost-dots" width="4" height="4" patternUnits="userSpaceOnUse">
                <rect width="4" height="4" fill="var(--cat-business)" />
                <circle cx="2" cy="2" r="0.9" fill="var(--paper)" />
              </pattern>
            </defs>
            <CartesianGrid stroke="var(--rule)" vertical={false} />
            <XAxis
              dataKey="year"
              tick={{ fill: "var(--ink-muted)", fontSize: "0.75rem", fontFamily: "var(--font-mono)" }}
              tickLine={false}
              axisLine={{ stroke: "var(--rule)" }}
            />
            <YAxis
              tick={{ fill: "var(--ink-muted)", fontSize: "0.75rem", fontFamily: "var(--font-mono)" }}
              tickLine={false}
              axisLine={false}
              width={52}
              tickFormatter={(v: number) => `$${v >= 1000 ? `${(v / 1000).toFixed(v >= 10000 ? 0 : 1)}k` : v}`}
            />
            <Tooltip
              cursor={{ fill: "color-mix(in srgb, var(--rule) 35%, transparent)" }}
              contentStyle={{
                background: "var(--paper-raised)",
                border: "1px solid var(--rule)",
                borderRadius: 2,
                fontSize: "0.8125rem",
                fontFamily: "var(--font-mono)",
                color: "var(--ink)",
              }}
              formatter={(value: unknown, name: unknown) => [`$${Number(value).toFixed(2)}`, String(name)]}
            />
            {COST_SERIES.map((s) => (
              <Bar
                key={s.key}
                dataKey={s.key}
                name={s.label}
                stackId="cost"
                fill={s.pattern ? `url(#cost-${s.pattern})` : s.color}
                stroke={s.color}
                strokeWidth={s.pattern ? 1 : 0}
                isAnimationActive={false}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
      <ul className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-[0.8125rem] text-ink-muted">
        {COST_SERIES.map((s) => (
          <li key={s.key} className="flex items-center gap-1.5">
            <svg width="12" height="12" aria-hidden>
              <rect width="12" height="12" fill={s.pattern ? `url(#cost-${s.pattern})` : s.color} stroke={s.color} />
            </svg>
            {s.label}
          </li>
        ))}
      </ul>
    </div>
  );
}
