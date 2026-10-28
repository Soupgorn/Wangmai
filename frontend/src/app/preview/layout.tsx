import type { ReactNode } from "react";
import { CoreProvider } from "@/features/core/core-provider";
import { CoreWorkspace } from "@/features/core/workspace";

export default function PreviewLayout({ children }: { children: ReactNode }) {
  return <CoreProvider><CoreWorkspace>{children}</CoreWorkspace></CoreProvider>;
}
