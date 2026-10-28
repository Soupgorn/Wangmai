import { z } from "zod";

// Future secrets are deliberately not required until their integrations exist.
const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  HOST: z.string().min(1).default("127.0.0.1"),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
});

const result = envSchema.safeParse(process.env);

if (!result.success) {
  // Report field names and validation messages without printing environment values.
  console.error("Invalid backend configuration:", z.flattenError(result.error).fieldErrors);
  process.exit(1);
}

export const env = result.data;
