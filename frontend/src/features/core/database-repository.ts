import { meResponseSchema, scheduleResponseSchema, type MeResponse, type ScheduleResponse } from "@wangmai/shared";
import type { BlockDraft, CoreRepository, CoreSnapshot, Profile } from "./types";
import { todayIn } from "./time";

export class ScheduleRequestError extends Error {
  constructor(message: string, public status: number) { super(message); }
}
const entryData = (draft: BlockDraft): BlockDraft => ({ title: draft.title.trim(), kind: draft.kind, start: draft.start, end: draft.end, timing: draft.timing });

/** Same-origin authenticated data only. Never imports or falls back to mock fixtures. */
export class DatabaseCoreRepository implements CoreRepository {
  private user: MeResponse["user"] | null = null;
  private schedule: ScheduleResponse | null = null;
  private createRequests = new Map<string, string>();

  private async request(path: string, method = "GET", body?: unknown) {
    let response: Response;
    try {
      response = await fetch(`/api/v1/me${path}`, {
        method, credentials: "same-origin", cache: "no-store", signal: AbortSignal.timeout(15_000),
        headers: { ...(method !== "GET" ? { "If-Match": `"${this.schedule?.revision ?? 0}"` } : {}), ...(body !== undefined ? { "Content-Type": "application/json" } : {}) },
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      });
    } catch { throw new ScheduleRequestError("Couldn’t confirm the request. Reload your schedule, or retry the same save.", 0); }
    if (!response.ok) {
      const data = await response.json().catch(() => null);
      throw new ScheduleRequestError(typeof data?.error?.message === "string" ? data.error.message : response.status === 401 ? "Your session ended. Sign in again." : "Your schedule is temporarily unavailable. Please try again.", response.status);
    }
    return response.json();
  }
  private apply(value: unknown): CoreSnapshot {
    this.schedule = scheduleResponseSchema.parse(value);
    if (!this.user) throw new Error("Load your account before editing your schedule.");
    return { today: todayIn(this.schedule.timezone), profile: { id: this.user.id, displayName: this.user.name, email: this.user.email, timezone: this.schedule.timezone, shareAvailability: false }, people: [], blocks: this.schedule.blocks };
  }
  async getSnapshot() {
    const [profile, schedule] = await Promise.all([this.request(""), this.request("/schedule")]);
    this.user = meResponseSchema.parse(profile).user;
    return this.apply(schedule);
  }
  async saveBlock(draft: BlockDraft, id?: string) {
    const data = entryData(draft);
    const existing = this.schedule?.blocks.find((block) => block.id === id);
    if (existing?.exceptionFor) return this.saveOccurrence(existing.exceptionFor.id, existing.exceptionFor.date, data);
    if (id) return this.apply(await this.request(`/schedule/entries/${encodeURIComponent(id)}`, "PATCH", data));
    const fingerprint = JSON.stringify(data);
    const mutationId = this.createRequests.get(fingerprint) ?? crypto.randomUUID();
    this.createRequests.set(fingerprint, mutationId);
    const result = this.apply(await this.request("/schedule/entries", "POST", { entry: data, mutationId }));
    this.createRequests.delete(fingerprint);
    return result;
  }
  async deleteBlock(id: string) {
    const existing = this.schedule?.blocks.find((block) => block.id === id);
    if (existing?.exceptionFor) return this.saveOccurrence(existing.exceptionFor.id, existing.exceptionFor.date, null);
    return this.apply(await this.request(`/schedule/entries/${encodeURIComponent(id)}`, "DELETE"));
  }
  async saveOccurrence(id: string, date: string, replacement: BlockDraft | null) {
    return this.apply(await this.request(`/schedule/entries/${encodeURIComponent(id)}/exceptions/${encodeURIComponent(date)}`, "PUT", { replacement: replacement ? entryData(replacement) : null }));
  }
  async restoreOccurrence(id: string, date: string) {
    return this.apply(await this.request(`/schedule/entries/${encodeURIComponent(id)}/exceptions/${encodeURIComponent(date)}`, "DELETE"));
  }
  async updateProfile(patch: Pick<Profile, "displayName" | "timezone" | "shareAvailability">) {
    return this.apply(await this.request("/schedule/preferences", "PATCH", { timezone: patch.timezone }));
  }
}
