import type { Metadata } from "next";
import { SchedulePage } from "@/features/core/schedule-page";

export const metadata: Metadata = { title: "My schedule" };
export default function Page() { return <SchedulePage />; }
