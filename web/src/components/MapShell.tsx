"use client";

import dynamic from "next/dynamic";

const FlareMap = dynamic(() => import("./FlareMap"), {
  ssr: false,
  loading: () => <div className="h-full w-full bg-neutral-950" />,
});

export default function MapShell() {
  return <FlareMap />;
}
