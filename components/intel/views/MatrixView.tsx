"use client";

import { useState } from "react";
import { IMPACT_MATRIX } from "@/lib/intel/matrix";

export default function MatrixView() {
  const [activeKey, setActiveKey] = useState(IMPACT_MATRIX[0].key);
  const active = IMPACT_MATRIX.find((f) => f.key === activeKey)!;

  return (
    <div className="space-y-6">
      <div>
        <div className="label-mono">macro → asset transmission</div>
        <h1 className="display-italic text-3xl text-white mt-1">Impact Matrix</h1>
        <p className="text-sm text-ink-300 mt-2 max-w-2xl">
          Click a macro factor to see what it tends to push around. Directional, not deterministic —
          a map of typical second-order effects to frame the regime.
        </p>
      </div>

      {/* Factor selector */}
      <div className="flex flex-wrap gap-2">
        {IMPACT_MATRIX.map((f) => (
          <button
            key={f.key}
            onClick={() => setActiveKey(f.key)}
            className={`pill ${activeKey === f.key ? "pill-primary" : "pill-ghost"}`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Effects of the active factor */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {active.effects.map((e) => (
          <div key={e.asset} className="panel p-4">
            <div className="flex items-center justify-between">
              <span className="text-ink-100">{e.asset}</span>
              <span className={`num text-lg ${e.impact === "up" ? "text-bull" : "text-bear"}`}>
                {e.impact === "up" ? "↑" : "↓"}
              </span>
            </div>
            <p className="text-xs text-ink-400 mt-2 leading-relaxed">{e.note}</p>
          </div>
        ))}
      </div>

      {/* Full grid reference */}
      <div className="panel p-0 overflow-x-auto">
        <div className="px-5 py-3 label-mono border-b border-white/5">full reference</div>
        <table className="w-full text-sm min-w-[640px]">
          <tbody className="divide-y divide-white/5">
            {IMPACT_MATRIX.map((f) => (
              <tr key={f.key} className="align-top hover:bg-white/[0.02]">
                <td className="px-5 py-3 num text-ink-100 w-40 whitespace-nowrap">{f.label}</td>
                <td className="px-5 py-3">
                  <div className="flex flex-wrap gap-2">
                    {f.effects.map((e) => (
                      <span
                        key={e.asset}
                        className="text-xs px-2 py-1 rounded bg-white/5 text-ink-300"
                        title={e.note}
                      >
                        {e.asset}{" "}
                        <span className={e.impact === "up" ? "text-bull" : "text-bear"}>
                          {e.impact === "up" ? "↑" : "↓"}
                        </span>
                      </span>
                    ))}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
