import type { BlockKind } from "./types";

export const blockLabels: Record<BlockKind, string> = {
  available: "Available",
  busy: "Unavailable",
};

export const defaultBlockTitles: Record<BlockKind, string> = {
  available: "Free time",
  busy: "Unavailable",
};
