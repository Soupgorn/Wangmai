import type { ScheduleBlock } from "./types";
import { minutes } from "./time";

/** Connected overlapping blocks share lanes so a busy exception stays visible. */
export function layoutBlocks(blocks: readonly ScheduleBlock[]) {
  const sorted = [...blocks].sort((a, b) => minutes(a.start) - minutes(b.start) || minutes(b.end) - minutes(a.end));
  const result: { block: ScheduleBlock; lane: number; lanes: number }[] = [];
  let group: { block: ScheduleBlock; lane: number }[] = [];
  let laneEnds: number[] = [];
  let groupEnd = -1;
  function flush() {
    result.push(...group.map((value) => ({ ...value, lanes: laneEnds.length })));
    group = []; laneEnds = []; groupEnd = -1;
  }
  for (const block of sorted) {
    if (minutes(block.start) >= groupEnd) flush();
    let lane = laneEnds.findIndex((end) => end <= minutes(block.start));
    if (lane === -1) lane = laneEnds.length;
    laneEnds[lane] = minutes(block.end);
    group.push({ block, lane });
    groupEnd = Math.max(groupEnd, minutes(block.end));
  }
  flush();
  return result;
}
