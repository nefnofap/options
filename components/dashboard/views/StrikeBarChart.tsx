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
  /** Brush window resets when this changes (e.g. `${symbol}|${exp}|${metric}`). */
  resetKey?: string;
}

const POS = "#5fd39a";
const NEG = "#f06a7a";
const WINDOW = 41; // strikes shown by default, centred on spot

function defaultWindow(data: StrikeDatum[], spot?: number) {
  const n = data.length;
  if (n === 0) return { startIndex: 0, endIndex: 0 };
  const size = Math.min(n, WINDOW);
  let center = Math.floor(n / 2);
  if (typeof spot === "number") {
    let best = Infinity;
    data.forEach((d, i) => {
      const dist = Math.abs(d.strike - spot);
      if (dist < best) {
        best = dist;
        center = i;
      }
    });
  }
  let start = Math.max(0, center - Math.floor(size / 2));
  const end = Math.min(n - 1, start + size - 1);
  start = Math.max(0, end - size + 1);
  return { startIndex: start, endIndex: end };
}

export default function StrikeBarChart({
  data,
  spot,
  markers = [],
  tooltipLabel,
  valueFormatter = (v) => `$${fmtCompact(v)}`,
  height = 440,
  resetKey,
}: Props) {
  const [range, setRange] = useState(() => defaultWindow(data, spot));

  // Reset the brush window only when the underlying series changes
  // (new symbol / expiration / metric) — NOT on every auto-refresh.
  useEffect(() => {
    setRange(defaultWindow(data, spot));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetKey]);

  // Clamp in case a refresh returned a shorter series.
  const end = Math.min(range.endIndex, Math.max(0, data.length - 1));
  const start = Math.min(range.startIndex, end);

  // Symmetric domain over the VISIBLE window: 0.0 stays dead-centre while
  // zooming, and bars stay readable instead of being dwarfed by the ATM peak.
  const max = useMemo(() => {
    const slice = data.slice(start, end + 1);
    const m = slice.reduce((acc, d) => Math.max(acc, Math.abs(d.value)), 0);
    return m > 0 ? m : 1;
  }, [data, start, end]);

  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 12, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid stroke="rgba(255,255,255,0.05)" vertical={false} />
          <XAxis
            dataKey="strike"
            stroke="#5a5a66"
            tickLine={false}
            fontSize={10}
            tickFormatter={(v) => fmtNumber(v, 0)}
          />
          <YAxis
            domain={[-max, max]}
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
              const { x, y, width, height, value } = props;
              const fill = (value as number) >= 0 ? POS : NEG;
              return <rect x={x} y={y} width={width} height={height} fill={fill} opacity={0.85} />;
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
