import type { Metadata } from "next";
import { AvailabilityPage } from "@/features/core/availability-page";

export const metadata: Metadata = { title: "Who’s free?" };
export default function Page() { return <AvailabilityPage />; }
