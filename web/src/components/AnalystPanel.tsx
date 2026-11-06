"use client";

import { useLang, useT } from "@/i18n";

import { useState } from "react";

const SUGGESTED = [
  "Which 5 flares waste the most money, and how sure are we?",
  "Which sites flared more in recent months than earlier in the year?",
  "How many persistent sites are not in the World Bank list, and what could they be?",
  "Summarise Pakistan's flaring in three sentences for a minister.",
];

type QA = { q: string; a?: string; error?: string };

export default function AnalystPanel({ onClose, inline }: { onClose?: () => void; inline?: boolean }) {
  const [input, setInput] = useState("");
  const [log, setLog] = useState<QA[]>([]);
  const [busy, setBusy] = useState(false);
  const t = useT();
  const lang = useLang();

  async function ask(q: string) {
    if (!q.trim() || busy) return;
    setBusy(true);
    setInput("");
    setLog((l) => [...l, { q }]);
    try {
      const r = await fetch("/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: q, lang }),
      });
      const j = await r.json();
      setLog((l) => l.map((x, i) => (i === l.length - 1 ? { q, a: j.answer, error: j.error ? t(j.error) : undefined } : x)));
    } catch {
      setLog((l) => l.map((x, i) => (i === l.length - 1 ? { q, error: t("Could not reach the analyst.") } : x)));
    } finally {
      setBusy(false);
    }
  }

  return (
    <aside dir={lang === "ur" ? "rtl" : "ltr"} className={inline ? "flex h-full w-full max-w-3xl flex-col text-sm text-neutral-200" : "absolute bottom-4 right-4 top-16 flex w-[24rem] max-w-[calc(100%-2rem)] flex-col rounded-xl bg-neutral-950/90 p-4 text-sm text-neutral-200 shadow-xl backdrop-blur"}>
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-base font-semibold text-white">{t("AI analyst")}</h2>
          <p className="text-xs text-neutral-400">{t("Ask about the flare data in plain words. Answers use only the public data on this map.")}</p>
        </div>
        {onClose && <button onClick={onClose} className="rounded px-2 text-lg text-neutral-400 hover:text-white" aria-label="Close">×</button>}
      </div>
      <div className="mt-3 flex-1 space-y-3 overflow-y-auto">
        {log.length === 0 && (
          <div className="space-y-1.5">
            {SUGGESTED.map((s) => (
              <button key={s} onClick={() => ask(t(s))}
                className="block w-full rounded-lg bg-neutral-900 p-2 text-left text-xs text-neutral-300 ring-1 ring-neutral-800 hover:ring-orange-500/50">
                {t(s)}
              </button>
            ))}
          </div>
        )}
        {log.map((x, i) => (
          <div key={i}>
            <div className="ml-8 rounded-lg bg-orange-500/20 p-2 text-orange-100">{x.q}</div>
            <div className="mt-1.5 whitespace-pre-wrap rounded-lg bg-neutral-900 p-2 text-neutral-200">
              {x.error ? <span className="text-red-300">{x.error}</span> : x.a ?? <span className="text-neutral-500">{t("Thinking…")}</span>}
            </div>
          </div>
        ))}
      </div>
      <form className="mt-3 flex gap-2" onSubmit={(e) => { e.preventDefault(); ask(input); }}>
        <input value={input} onChange={(e) => setInput(e.target.value)} maxLength={500}
          placeholder={t("e.g. Which flares are near Karachi?")}
          className="flex-1 rounded bg-neutral-800 px-2 py-1.5 text-sm text-white" />
        <button disabled={busy} className="rounded bg-orange-500 px-3 py-1.5 font-medium text-black disabled:opacity-50">{t("Ask")}</button>
      </form>
      <p className="mt-1.5 text-[10px] text-neutral-500">{t("AI answers can be wrong. Check numbers on the map.")}</p>
    </aside>
  );
}
