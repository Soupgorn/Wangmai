import { Temporal } from "@js-temporal/polyfill";
import { z } from "zod";

export function scheduleDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error("Choose a valid date.");
  try {
    const date = Temporal.PlainDate.from(value);
    if (date.year < 1 || date.year > 9999) throw new Error();
    return date;
  } catch { throw new Error("Choose a valid date."); }
}
export function scheduleMinutes(value: string) {
  if (value === "24:00") return 1440;
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) throw new Error("Choose a valid time.");
  return Number(value.slice(0, 2)) * 60 + Number(value.slice(3));
}
export function scheduleTimezone(value: string) {
  try {
    if (/^[+-]/.test(value)) throw new Error();
    Temporal.Instant.fromEpochMilliseconds(0).toZonedDateTimeISO(value);
  } catch { throw new Error("Choose a supported timezone."); }
}
export function scheduleInstant(date: string, time: string, timezone: string) {
  scheduleMinutes(time); scheduleTimezone(timezone);
  try {
    const day = scheduleDate(date);
    return (time === "24:00" ? day.add({ days: 1 }).toPlainDateTime("00:00") : day.toPlainDateTime(time))
      .toZonedDateTime(timezone, { disambiguation: "reject" }).epochMilliseconds;
  } catch { throw new Error("This time is skipped or repeated by daylight saving. Choose another time."); }
}
export const dateSchema = z.string().refine((value) => { try { scheduleDate(value); return true; } catch { return false; } }, "Choose a valid date.");
export const timezoneSchema = z.string().min(1).max(80).refine((value) => { try { scheduleTimezone(value); return true; } catch { return false; } }, "Choose a supported timezone.");
const timeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const endSchema = z.union([timeSchema, z.literal("24:00")]);
export const blockTimingSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("weekly"), weekday: z.number().int().min(1).max(7) }).strict(),
  z.object({ type: z.literal("date"), date: dateSchema }).strict(),
]);
const blockFieldsSchema = z.object({
  title: z.string().trim().min(1).max(80), kind: z.enum(["available", "busy"]),
  start: timeSchema, end: endSchema, timing: blockTimingSchema,
}).strict();
export const blockDraftSchema = blockFieldsSchema.refine((value) => scheduleMinutes(value.end) > scheduleMinutes(value.start), "End time must be after start time on the same day.");
export const updateBlockSchema = blockFieldsSchema.partial().refine((value) => Object.keys(value).length > 0, "Supply a schedule change.");
export type BlockDraft = z.infer<typeof blockDraftSchema>;
export function validateScheduleBlock(draft: BlockDraft, timezone: string) {
  const result = blockDraftSchema.safeParse(draft);
  if (!result.success) throw new Error(result.error.issues[0]?.message ?? "Invalid schedule block.");
  scheduleTimezone(timezone);
  if (draft.timing.type === "date") {
    const start = scheduleInstant(draft.timing.date, draft.start, timezone);
    const end = scheduleInstant(draft.timing.date, draft.end, timezone);
    if (end <= start) throw new Error("End time must be after start time on the same day.");
  }
}
export const scheduleBlockSchema = blockDraftSchema.safeExtend({
  id: z.string().uuid(), ownerId: z.string(),
  createdAt: z.string(), updatedAt: z.string(),
  excludedDates: z.array(dateSchema).optional(),
  exceptionFor: z.object({ id: z.string().uuid(), date: dateSchema }).optional(),
});
export const scheduleResponseSchema = z.object({
  timezone: timezoneSchema, revision: z.number().int().min(0),
  blocks: z.array(scheduleBlockSchema),
});
export type ScheduleResponse = z.infer<typeof scheduleResponseSchema>;
export const createBlockSchema = z.object({ entry: blockDraftSchema, mutationId: z.string().uuid() }).strict();
export const weeklyScheduleSchema = z.object({ entries: z.array(blockDraftSchema).max(200) }).strict()
  .refine((value) => value.entries.every((entry) => entry.timing.type === "weekly" && entry.kind === "available"), "Weekly availability accepts only weekly available blocks.");
export const exceptionSchema = z.object({ replacement: blockDraftSchema.nullable() }).strict();
