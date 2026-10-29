"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { CoreProvider } from "./core-provider";
import { CoreWorkspace } from "./workspace";

export function AuthenticatedWorkspace({ children }: { children: ReactNode }) {
  const mode = usePathname() === "/availability" ? "preview" : "persistent";
  return <CoreProvider key={mode} mode={mode}><CoreWorkspace>{children}</CoreWorkspace></CoreProvider>;
}
