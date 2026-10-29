import type { ReactNode } from "react";
import { AuthenticatedWorkspace } from "@/features/core/authenticated-workspace";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { AuthBoundary } from "@/features/auth/auth-boundary";

export default async function CoreLayout({ children }: { children: ReactNode }) {
  if (!await getCurrentUser()) redirect("/login");
  return <AuthBoundary><AuthenticatedWorkspace>{children}</AuthenticatedWorkspace></AuthBoundary>;
}
