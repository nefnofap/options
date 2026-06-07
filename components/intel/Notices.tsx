import type { ProviderNotice } from "@/lib/intel/types";

/** Renders non-fatal provider notices (missing keys, degraded sources). */
export default function Notices({ notices }: { notices?: ProviderNotice[] }) {
  if (!notices || notices.length === 0) return null;
  return (
    <div className="panel p-4 border-l-2 border-l-amber-400/40">
      <div className="label-mono">data notices</div>
      <ul className="mt-2 space-y-1 text-xs text-ink-300">
        {notices.map((n, i) => (
          <li key={i}>
            <span className="text-ink-100">{n.provider}:</span> {n.message}
          </li>
        ))}
      </ul>
    </div>
  );
}
