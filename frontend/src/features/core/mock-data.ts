import type { CoreSnapshot, ScheduleBlock } from "./types";
import { addDays, dateValue, todayIn } from "./time";

/** Fictional fixtures. No real Google profiles or user data. */
export function createMockSnapshot(today = todayIn("Asia/Bangkok")): CoreSnapshot {
  dateValue(today);
  const blocks: ScheduleBlock[] = [];
  function weekly(ownerId: string, weekday: number, start: string, end: string, title: string, kind: "available" | "busy" = "available") {
    blocks.push({ id: `seed-${ownerId}-${blocks.length}`, ownerId, start, end, title, kind, timing: { type: "weekly", weekday } });
  }
  for (let day = 1; day <= 7; day++) {
    weekly("jamie", day, "09:00", "18:00", "Available");
    weekly("mint", day, "10:00", "12:00", "Available");
    weekly("mint", day, "13:00", "17:00", "Available");
    weekly("chris", day, "12:00", "17:00", "Available");
    weekly("beam", day, "09:00", "18:00", "Available");
    weekly("beam", day, "13:00", "15:00", "Busy", "busy");
    weekly("nina", day, "09:00", "18:00", "Available");
    weekly("nina", day, "13:00", "15:00", "Busy", "busy");
  }
  const personal = [
    [1, "09:00", "11:00", "Deep work", "busy"],
    [1, "12:00", "14:00", "Free for a catch-up", "available"],
    [2, "10:00", "12:00", "Morning class", "busy"],
    [2, "13:00", "16:00", "Let’s make plans", "available"],
    [3, "09:00", "11:30", "Design studio", "busy"],
    [3, "12:30", "15:30", "Free for a catch-up", "available"],
    [4, "10:00", "11:30", "Coffee & catch-up", "available"],
    [4, "13:00", "15:00", "Project time", "busy"],
    [5, "09:00", "11:00", "Morning class", "busy"],
    [5, "12:30", "16:00", "Friday, finally", "available"],
    [6, "10:30", "12:30", "A little me time", "busy"],
    [6, "14:00", "17:00", "Weekend plans?", "available"],
    [7, "11:00", "14:00", "Slow Sunday", "available"],
  ] as const;
  for (const [day, start, end, title, kind] of personal) weekly("me", day, start, end, title, kind);
  blocks.push({ id: "seed-jamie-exception", ownerId: "jamie", title: "Private appointment", kind: "busy", start: "13:00", end: "15:00", timing: { type: "date", date: addDays(today, 1) } });
  blocks.push({ id: "seed-mint-exception", ownerId: "mint", title: "Private appointment", kind: "busy", start: "14:00", end: "16:00", timing: { type: "date", date: addDays(today, 2) } });
  return {
    today,
    profile: { id: "me", displayName: "Alex Morgan", email: "alex@example.test", timezone: "Asia/Bangkok", shareAvailability: true },
    people: [
      { id: "jamie", displayName: "Jamie Chen", timezone: "Asia/Bangkok", shareAvailability: true },
      { id: "mint", displayName: "Mint Tan", timezone: "Asia/Bangkok", shareAvailability: true },
      { id: "chris", displayName: "Chris Park", timezone: "Asia/Bangkok", shareAvailability: true },
      { id: "beam", displayName: "Beam W.", timezone: "Asia/Bangkok", shareAvailability: true },
      { id: "nina", displayName: "Nina Lee", timezone: "Asia/Bangkok", shareAvailability: true },
      { id: "pim", displayName: "Pim", timezone: "Asia/Bangkok", shareAvailability: false },
    ],
    blocks,
  };
}
