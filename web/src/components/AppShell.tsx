"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { LangContext, SetLangContext, useT, type Lang } from "@/i18n";
import { BuildingIcon, ChatIcon, CheckIcon, FlameIcon, GridIcon, ListIcon, MapIcon } from "./Icons";

const NAV = [
  { href: "/", label: "Overview", Icon: GridIcon },
  { href: "/map", label: "Live map", Icon: MapIcon },
  { href: "/flares", label: "All flares", Icon: ListIcon },
  { href: "/companies", label: "Companies", Icon: BuildingIcon },
  { href: "/check", label: "Check a report", Icon: CheckIcon },
  { href: "/ask", label: "Ask the AI", Icon: ChatIcon },
];

export default function AppShell({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Lang>("en");
  useEffect(() => {
    // Remember the language between pages and visits (a convenience only).
    try {
      // Read after hydration so the server and first client render match.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (localStorage.getItem("fw-lang") === "ur") setLangState("ur");
    } catch {}
  }, []);
  const setLang = (l: Lang) => {
    setLangState(l);
    try { localStorage.setItem("fw-lang", l); } catch {}
  };
  return (
    <LangContext.Provider value={lang}>
      <SetLangContext.Provider value={setLang}>
        <div dir={lang === "ur" ? "rtl" : "ltr"}
          className={`flex h-dvh flex-col bg-neutral-950 text-neutral-200 md:flex-row ${lang === "ur" ? "font-urdu" : ""}`}>
          <Sidebar lang={lang} setLang={setLang} />
          <main className="relative min-h-0 flex-1 overflow-y-auto" dir="ltr">
            <div dir={lang === "ur" ? "rtl" : "ltr"} className="h-full">{children}</div>
          </main>
        </div>
      </SetLangContext.Provider>
    </LangContext.Provider>
  );
}

function Sidebar({ lang, setLang }: { lang: Lang; setLang: (l: Lang) => void }) {
  const t = useT();
  return (
    <nav className="flex shrink-0 items-center gap-1 overflow-x-auto border-b border-neutral-800 bg-neutral-950 px-3 py-2
      md:w-56 md:flex-col md:items-stretch md:gap-1 md:overflow-visible md:border-b-0 md:border-e md:px-3 md:py-4">
      <Link href="/" className="me-2 flex shrink-0 items-center gap-2 px-2 md:mb-4 md:me-0">
        <FlameIcon className="h-6 w-6 text-orange-500" />
        <span className="text-base font-semibold text-white">FlareWatch</span>
      </Link>
      {/* usePathname is request-time data under cacheComponents, so the
          highlighted links stream in; the fallback shows them unhighlighted. */}
      <Suspense fallback={<NavLinks path="" />}><ActiveNavLinks /></Suspense>
      <div className="ms-auto md:ms-0 md:mt-auto">
        <button onClick={() => setLang(lang === "en" ? "ur" : "en")}
          className="w-full shrink-0 rounded-lg bg-neutral-900 px-3 py-2 text-sm text-neutral-200 hover:bg-neutral-800">
          {lang === "en" ? "اردو" : "English"}
        </button>
        <p className="mt-3 hidden px-1 text-[11px] leading-snug text-neutral-500 md:block">
          {t("Satellite audit of gas flaring in Pakistan. Data: NASA FIRMS, World Bank, OpenStreetMap.")}
        </p>
      </div>
    </nav>
  );
}

function ActiveNavLinks() {
  return <NavLinks path={usePathname()} />;
}

function NavLinks({ path }: { path: string }) {
  const t = useT();
  const active = (href: string) => (href === "/" ? path === "/" : path.startsWith(href));
  return (
    <>
      {NAV.map(({ href, label, Icon }) => (
        <Link key={href} href={href}
          className={`flex shrink-0 items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm ${active(href) ? "bg-orange-500/15 text-orange-200" : "text-neutral-300 hover:bg-neutral-900"}`}>
          <Icon className="h-[18px] w-[18px]" />
          <span className="whitespace-nowrap">{t(label)}</span>
        </Link>
      ))}
    </>
  );
}
