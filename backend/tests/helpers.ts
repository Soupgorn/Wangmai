import { randomBytes } from "node:crypto";
import { makeSignature } from "better-auth/crypto";
import type { Auth } from "../src/auth/auth.js";
import type { Environment } from "../src/config/env.js";

export async function signedCookie(auth: Auth, env: Environment, token: string) {
  const ctx = await auth.$context;
  return `${ctx.authCookies.sessionToken.name}=${encodeURIComponent(`${token}.${await makeSignature(token, env.BETTER_AUTH_SECRET)}`)}`;
}
export async function seedSession(auth: Auth, env: Environment) {
  const ctx = await auth.$context;
  const subject = randomBytes(12).toString("hex");
  const { user } = await ctx.internalAdapter.createOAuthUser({
    name: "Phase Three Test", email: `phase3-${subject}@example.invalid`, emailVerified: true, image: null,
  }, { providerId: "google", accountId: subject });
  const session = await ctx.internalAdapter.createSession(user.id);
  return { user, session, cookie: await signedCookie(auth, env, session.token) };
}
