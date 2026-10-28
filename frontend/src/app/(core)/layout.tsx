import type { ReactNode } from "react";
import { CoreProvider } from "@/features/core/core-provider";
import { CoreWorkspace } from "@/features/core/workspace";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { AuthBoundary } from "@/features/auth/auth-boundary";

export default async function CoreLayout({ children }: { children: ReactNode }) {
  if (!await getCurrentUser()) redirect("/login");
  return <AuthBoundary><CoreProvider><CoreWorkspace>{children}</CoreWorkspace></CoreProvider></AuthBoundary>;
}
