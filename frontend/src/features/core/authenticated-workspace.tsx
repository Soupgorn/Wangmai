"use client";

import type { ReactNode } from "react";
import { CoreProvider } from "./core-provider";
import { CoreWorkspace } from "./workspace";

export function AuthenticatedWorkspace({ children }: { children: ReactNode }) {
  const mode = "persistent";
  return <CoreProvider key={mode} mode={mode}><CoreWorkspace>{children}</CoreWorkspace></CoreProvider>;
}
