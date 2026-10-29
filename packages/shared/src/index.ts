import { z } from "zod";
export * from "./schedule.js";
export * from "./availability.js";

export const healthResponseSchema = z.object({
  status: z.literal("ok"),
  service: z.literal("wangmai-api"),
});

export type HealthResponse = z.infer<typeof healthResponseSchema>;

export const meResponseSchema = z.object({
  user: z.object({
    id: z.string(), name: z.string(), email: z.string(),
    emailVerified: z.boolean(), image: z.string().nullable(),
  }),
});
export type MeResponse = z.infer<typeof meResponseSchema>;
