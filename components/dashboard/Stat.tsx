interface StatProps {
  label: string;
  value: string;
  hint?: string;
  tone?: "default" | "bull" | "bear";
}

export default function Stat({ label, value, hint, tone = "default" }: StatProps) {
  const toneCls =
    tone === "bull" ? "text-bull" : tone === "bear" ? "text-bear" : "text-white";
  return (
    <div className="panel p-4">
      <div className="label-mono">{label}</div>
      <div className={`mt-2 num text-2xl ${toneCls}`}>{value}</div>
      {hint && <div className="mt-1 text-xs text-ink-400">{hint}</div>}
    </div>
  );
}
