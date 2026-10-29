import type { Metadata } from "next";
import { SettingsPage } from "@/features/core/settings-page";

export const metadata: Metadata = { title: { absolute: "Wangmai" } };
export default function Page() { return <SettingsPage />; }
