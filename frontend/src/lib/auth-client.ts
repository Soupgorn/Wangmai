"use client";

import { createAuthClient } from "better-auth/react";

// Browser calls remain on the public origin through Next rewrites or Caddy.
export const authClient = createAuthClient({ basePath: "/api/auth" });
