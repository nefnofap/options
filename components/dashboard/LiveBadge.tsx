"use client";

interface Props {
  updatedAt: number | null;
  refreshing: boolean;
  stale?: boolean; // last refresh errored but we're showing cached data
}

function clock(ts: number): string {
  return new Date(ts).toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

export default function LiveBadge({ updatedAt, refreshing, stale }: Props) {
  const color = stale ? "#f0c36a" : refreshing ? "#a8a8b3" : "#5fd39a";
  return (
    <span className="label-mono inline-flex items-center gap-1.5">
      <span
        className="inline-block h-1.5 w-1.5 rounded-full"
        style={{
          background: color,
          boxShadow: `0 0 0 0 ${color}`,
          animation: refreshing ? "none" : "livepulse 2s ease-out infinite",
        }}
      />
      {stale
        ? "stale"
        : refreshing
        ? "updating…"
        : updatedAt
        ? `live · ${clock(updatedAt)}`
        : "live"}
      <style>{`
        @keyframes livepulse {
          0%   { box-shadow: 0 0 0 0 rgba(95,211,154,0.5); }
          70%  { box-shadow: 0 0 0 6px rgba(95,211,154,0); }
          100% { box-shadow: 0 0 0 0 rgba(95,211,154,0); }
        }
      `}</style>
    </span>
  );
}
