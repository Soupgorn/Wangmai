import type { Metadata } from "next";
import { SchedulePage } from "@/features/core/schedule-page";

export const metadata: Metadata = { title: { absolute: "Wangmai" } };
export default function Page() { return <SchedulePage />; }
