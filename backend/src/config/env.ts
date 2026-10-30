import { z } from "zod";

const optionalCredential = z.preprocess(
  (value) => value === "" || (typeof value === "string" && value.startsWith("replace-with")) ? undefined : value,
  z.string().min(1).optional(),
);

export const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  HOST: z.string().min(1).default("127.0.0.1"),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  POSTGRES_DB: z.string().min(1).default("wangmai"),
  POSTGRES_PORT: z.coerce.number().int().min(1).max(65535).default(5432),
  DATABASE_URL: z.string().url(),
  AUTH_CLIENT_IP_HEADER: z.literal("x-wangmai-client-ip").optional(),
  DATABASE_RUNTIME_ROLE: z.string().regex(/^[a-z][a-z0-9_]{2,62}$/).optional(),
  BETTER_AUTH_SECRET: z.string().min(32).refine((value) => !/^(replace-with|change_me)/i.test(value), "Generate a random secret"),
  BETTER_AUTH_URL: z.string().url(),
  GOOGLE_CLIENT_ID: optionalCredential,
  GOOGLE_CLIENT_SECRET: optionalCredential,
}).superRefine((env, ctx) => {
  try { validateDatabaseTarget(env); }
  catch { ctx.addIssue({ code: "custom", path: ["DATABASE_URL"], message: "Invalid or unsafe database target" }); }
  const url = URL.parse(env.BETTER_AUTH_URL);
  if (!url || url.origin !== env.BETTER_AUTH_URL || !["http:", "https:"].includes(url.protocol) || url.username || url.password ||
    (env.NODE_ENV === "production" && (url.protocol !== "https:" || ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)))) {
    ctx.addIssue({ code: "custom", path: ["BETTER_AUTH_URL"], message: "Use the public origin without a trailing slash; production requires public HTTPS" });
  }
  if (Boolean(env.GOOGLE_CLIENT_ID) !== Boolean(env.GOOGLE_CLIENT_SECRET)) {
    ctx.addIssue({ code: "custom", path: ["GOOGLE_CLIENT_ID"], message: "Set both Google credentials or leave both empty" });
  }
  if (env.NODE_ENV === "production" && !env.GOOGLE_CLIENT_ID) {
    ctx.addIssue({ code: "custom", path: ["GOOGLE_CLIENT_ID"], message: "Google credentials are required in production" });
  }
  if (env.NODE_ENV === "production" && (env.GOOGLE_CLIENT_ID && !env.GOOGLE_CLIENT_ID.endsWith(".apps.googleusercontent.com") ||
    /^(change_me|replace-with)/i.test(env.GOOGLE_CLIENT_SECRET ?? ""))) {
    ctx.addIssue({ code: "custom", path: ["GOOGLE_CLIENT_ID"], message: "Configure a production Google Web client" });
  }
});

export type DatabaseTarget = { NODE_ENV: string; DATABASE_URL: string; POSTGRES_DB: string; POSTGRES_PORT: number; DATABASE_RUNTIME_ROLE?: string | undefined };
export function validateDatabaseTarget(env: DatabaseTarget) {
  const url = new URL(env.DATABASE_URL);
  if (!["postgresql:", "postgres:"].includes(url.protocol)) throw new Error("Invalid database target");
  if (env.NODE_ENV === "production" && (!env.DATABASE_RUNTIME_ROLE ||
    decodeURIComponent(url.username) !== env.DATABASE_RUNTIME_ROLE || decodeURIComponent(url.password).length < 24 ||
    /^(change_me|replace-with)/i.test(decodeURIComponent(url.password)) || url.search || url.hash)) {
    throw new Error("Invalid runtime database identity");
  }
  if (env.NODE_ENV !== "production" && (
    !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) ||
    decodeURIComponent(url.pathname.slice(1)) !== env.POSTGRES_DB ||
    Number(url.port || 5432) !== env.POSTGRES_PORT || url.search || url.hash
  )) throw new Error("Unsafe development database target");
}

export type Environment = z.infer<typeof envSchema>;
export function loadEnv(source: NodeJS.ProcessEnv = process.env): Environment {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    // Field names only: never include credential values in diagnostics.
    throw new Error(`Invalid backend configuration: ${[...new Set(result.error.issues.map((issue) => issue.path.join(".")))].join(", ")}`);
  }
  return result.data;
}
