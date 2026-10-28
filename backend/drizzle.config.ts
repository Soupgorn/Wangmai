import { defineConfig } from "drizzle-kit";

// Generation is offline. Apply migrations through the guarded db:migrate script.
export default defineConfig({ schema: "./src/db/schema.ts", out: "./drizzle", dialect: "postgresql", strict: true });
