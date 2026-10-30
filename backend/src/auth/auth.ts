import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { verifyGoogleIdToken, type GoogleProfile } from "better-auth/social-providers";
import type { Environment } from "../config/env.js";
import type { Database } from "../db/client.js";
import * as schema from "../db/schema.js";

export function createAuth(env: Environment, db: Database) {
  return betterAuth({
    appName: "Wangmai",
    baseURL: env.BETTER_AUTH_URL,
    basePath: "/api/auth",
    secret: env.BETTER_AUTH_SECRET,
    database: drizzleAdapter(db, { provider: "pg", schema }),
    trustedOrigins: [env.BETTER_AUTH_URL],
    disabledPaths: ["/link-social", "/unlink-account", "/get-access-token", "/refresh-token"],
    socialProviders: env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET ? {
      google: {
        clientId: env.GOOGLE_CLIENT_ID,
        clientSecret: env.GOOGLE_CLIENT_SECRET,
        scope: ["openid", "email", "profile"],
        disableDefaultScope: true,
        disableIdTokenSignIn: true,
        includeGrantedScopes: false,
        accessType: "online",
        // The installed provider decodes redirect-flow ID tokens by default.
        // Verify before any claims reach account linking or database persistence.
        async getUserInfo(tokens) {
          if (!tokens.idToken) return null;
          const profile = await verifyGoogleIdToken({ token: tokens.idToken, audience: env.GOOGLE_CLIENT_ID! });
          if (!profile || typeof profile.sub !== "string" || typeof profile.email !== "string" ||
            typeof profile.name !== "string" || typeof profile.email_verified !== "boolean") return null;
          return { user: { name: profile.name, email: profile.email, emailVerified: profile.email_verified,
            ...(typeof profile.picture === "string" ? { image: profile.picture } : {}) }, data: profile as unknown as GoogleProfile };
        },
      },
    } : {},
    session: {
      expiresIn: 60 * 60 * 24 * 7,
      updateAge: 60 * 60 * 24,
      cookieCache: { enabled: false },
    },
    account: {
      encryptOAuthTokens: true,
      storeStateStrategy: "database",
      accountLinking: { enabled: true, trustedProviders: ["google"] },
    },
    advanced: {
      trustedProxyHeaders: false,
      ...(env.AUTH_CLIENT_IP_HEADER ? { ipAddress: { ipAddressHeaders: [env.AUTH_CLIENT_IP_HEADER] } } : {}),
      disableOriginCheck: false,
      disableCSRFCheck: false,
      useSecureCookies: env.NODE_ENV === "production",
      defaultCookieAttributes: { httpOnly: true, sameSite: "lax", path: "/" },
      // The fixed public baseURL is authoritative; never trust arbitrary forwarded hosts.
    },
    rateLimit: { enabled: true },
    logger: { disabled: true },
    onAPIError: { errorURL: `${env.BETTER_AUTH_URL}/login?error=authentication_failed` },
  });
}
export type Auth = ReturnType<typeof createAuth>;
