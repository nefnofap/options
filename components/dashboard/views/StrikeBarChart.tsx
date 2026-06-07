"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  Brush,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { fmtCompact, fmtNumber } from "@/lib/format";

export interface StrikeDatum {
  strike: number;
  value: number;
}

export interface RefMarker {
  x: number;
  label: string;
  color: string;
  dash?: string;
}

interface Props {
  data: StrikeDatum[];
  spot?: number;
  markers?: RefMarker[];
  tooltipLabel: string;
  valueFormatter?: (v: number) => string;
  height?: number;
  /** Strikes to outline as absorption walls (high |gamma|). */
  absorption?: number[];
  /** Brush window resets when this changes (e.g. `${symbol}|${exp}|${metric}`). */
  resetKey?: string;
}

const POS = "#5fd39a";
const NEG = "#f06a7a";

// Default to showing the WHOLE series — every bar, positive and negative.
// The range slider then narrows it, and the bars auto-resize to fill the width.
function defaultWindow(data: StrikeDatum[]) {
  const n = data.length;
  if (n === 0) return { startIndex: 0, endIndex: 0 };
  return { startIndex: 0, endIndex: n - 1 };
}

export default function StrikeBarChart({
  data,
  spot,
  markers = [],
  tooltipLabel,
  valueFormatter = (v) => `$${fmtCompact(v)}`,
  height = 440,
  absorption = [],
  resetKey,
}: Props) {
  const [range, setRange] = useState(() => defaultWindow(data));

  // Reset the brush window only when the underlying series changes
  // (new symbol / expiration / metric) — NOT on every auto-refresh.
  useEffect(() => {
    setRange(defaultWindow(data));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetKey]);

  // Clamp in case a refresh returned a shorter series.
  const end = Math.min(range.endIndex, Math.max(0, data.length - 1));
  const start = Math.min(range.startIndex, end);

  // Auto-fit the Y domain to the VISIBLE window's actual min/max (with a little
  // padding). Zero is always included so the baseline shows, but it is NOT
  // forced to the centre — the axis tracks the real magnitudes of the bars.
  const domain = useMemo<[number, number]>(() => {
    const slice = data.slice(start, end + 1);
    let lo = 0;
    let hi = 0;
    for (const d of slice) {
      if (d.value < lo) lo = d.value;
      if (d.value > hi) hi = d.value;
    }
    if (lo === 0 && hi === 0) return [-1, 1];
    const pad = (hi - lo) * 0.06 || 1;
    return [lo - pad, hi + pad];
  }, [data, start, end]);

  const absSet = useMemo(() => new Set(absorption.map((a) => Math.round(a))), [absorption]);

  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={data}
          margin={{ top: 12, right: 8, bottom: 0, left: 0 }}
          barCategoryGap="6%"
        >
          <CartesianGrid stroke="rgba(255,255,255,0.05)" vertical={false} />
          <XAxis
            dataKey="strike"
            stroke="#5a5a66"
            tickLine={false}
            fontSize={10}
            tickFormatter={(v) => fmtNumber(v, 0)}
          />
          <YAxis
            domain={domain}
            stroke="#5a5a66"
            tickLine={false}
            fontSize={10}
            tickFormatter={(v) => fmtCompact(v, 1)}
          />
          <ReferenceLine y={0} stroke="rgba(255,255,255,0.28)" />
          <Tooltip
            cursor={{ fill: "rgba(255,255,255,0.04)" }}
            contentStyle={{
              background: "#0d0d10",
              border: "1px solid rgba(255,255,255,0.1)",
              borderRadius: 8,
              fontFamily: "var(--font-mono)",
              fontSize: 12,
            }}
            labelFormatter={(l) => `Strike ${fmtNumber(Number(l), 2)}`}
            formatter={(v: any) => [valueFormatter(Number(v)), tooltipLabel]}
          />
          {typeof spot === "number" && (
            <ReferenceLine
              x={Math.round(spot)}
              stroke="#e8e8ee"
              strokeDasharray="3 3"
              label={{ value: "spot", fill: "#e8e8ee", fontSize: 10, position: "top" }}
            />
          )}
          {markers.map((m) => (
            <ReferenceLine
              key={m.label}
              x={Math.round(m.x)}
              stroke={m.color}
              strokeDasharray={m.dash ?? "2 4"}
              label={{ value: m.label, fill: m.color, fontSize: 10, position: "top" }}
            />
          ))}
          <Bar
            dataKey="value"
            isAnimationActive={false}
            shape={(props: any) => {
              const { x, width, value } = props;
              // Recharts hands a NEGATIVE height for below-zero bars; an SVG
              // rect won't render that. Normalise so negatives draw correctly.
              let { y, height: h } = props;
              if (h < 0) {
                y = y + h;
                h = -h;
              }
              const fill = (value as number) >= 0 ? POS : NEG;
              // Small horizontal inset leaves a "border" between adjacent bars.
              const inset = Math.min(width * 0.12, 2);
              const isWall = absSet.has(Math.round(props.strike ?? props.payload?.strike));
              return (
                <rect
                  x={x + inset}
                  y={y}
                  width={Math.max(1, width - inset * 2)}
                  height={Math.max(0, h)}
                  rx={1}
                  fill={fill}
                  opacity={isWall ? 1 : 0.85}
                  stroke={isWall ? "#e8c15f" : "none"}
                  strokeWidth={isWall ? 1.4 : 0}
                />
              );
            }}
          />
          <Brush
            dataKey="strike"
            height={22}
            travellerWidth={8}
            stroke="rgba(255,255,255,0.25)"
            fill="rgba(13,13,16,0.65)"
            startIndex={start}
            endIndex={end}
            tickFormatter={(v) => fmtNumber(Number(v), 0)}
            onChange={(r: any) => {
              if (r && typeof r.startIndex === "number" && typeof r.endIndex === "number") {
                setRange({ startIndex: r.startIndex, endIndex: r.endIndex });
              }
            }}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
