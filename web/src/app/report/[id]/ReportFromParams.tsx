"use client";

import { useParams } from "next/navigation";
import AuditReport from "@/components/AuditReport";

export default function ReportFromParams() {
  const { id } = useParams<{ id: string }>();
  return <AuditReport id={decodeURIComponent(id)} />;
}
