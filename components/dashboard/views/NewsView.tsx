"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import EmptyState from "../EmptyState";
import QuoteHeader from "../QuoteHeader";
import type { NewsItem } from "@/lib/types";

export default function NewsView() {
  const sp = useSearchParams();
  const symbol = sp.get("symbol") || "SPY";
  const [items, setItems] = useState<NewsItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setErr(null);
    fetch(`/api/news?symbol=${encodeURIComponent(symbol)}`)
      .then(async (r) => {
        if (!r.ok) throw new Error(`${r.status}`);
        return r.json();
      })
      .then((j) => {
        if (cancelled) return;
        setItems(j.items || []);
        setLoading(false);
      })
      .catch((e) => {
        if (cancelled) return;
        setErr(e.message);
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [symbol]);

  return (
    <div className="space-y-6">
      <QuoteHeader />
      <section className="panel p-5">
        <div className="flex items-baseline justify-between mb-4">
          <h3 className="display-italic text-2xl text-white">Headlines</h3>
          <span className="label-mono">via Yahoo</span>
        </div>
        {loading && <div className="label-mono py-16 text-center">loading</div>}
        {err && <EmptyState title="Couldn't load news" body={err} />}
        {!loading && !err && items.length === 0 && (
          <EmptyState title="No headlines" body="Check another symbol." />
        )}
        <ul className="divide-y divide-white/5">
          {items.map((n) => (
            <li key={n.id} className="py-4">
              <a
                href={n.url}
                target="_blank"
                rel="noreferrer"
                className="group block"
              >
                <div className="flex items-baseline justify-between gap-4">
                  <h4 className="text-white text-base group-hover:underline underline-offset-4 leading-snug">
                    {n.title}
                  </h4>
                  <span className="font-mono text-[10px] tracking-wider text-ink-400 whitespace-nowrap">
                    {new Date(n.publishedAt).toLocaleString("en-US", {
                      month: "short",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                </div>
                <div className="mt-1 flex items-center gap-3 text-xs text-ink-400">
                  <span className="font-mono uppercase tracking-wider">{n.source}</span>
                  {n.summary && <span className="line-clamp-1">{n.summary}</span>}
                </div>
              </a>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
