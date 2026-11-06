"use client";

import { useParams } from "next/navigation";
import FlareDetail from "@/components/FlareDetail";

export default function DetailFromParams() {
  const { id } = useParams<{ id: string }>();
  return <FlareDetail id={decodeURIComponent(id)} />;
}
