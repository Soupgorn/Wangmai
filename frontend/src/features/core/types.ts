import type { BlockDraft } from "@wangmai/shared";
export type { BlockDraft } from "@wangmai/shared";
export type BlockKind = BlockDraft["kind"];
export type BlockTiming = BlockDraft["timing"];

export type ScheduleBlock = BlockDraft & { id: string; ownerId: string; excludedDates?: string[] | undefined; exceptionFor?: { id: string; date: string } | undefined };
export type PublicPerson = {
  id: string;
  displayName: string;
  image?: string | null | undefined;
};
export type Person = PublicPerson & {
  timezone: string;
  shareAvailability: boolean;
};
export type Profile = Person & { email: string };
export type CoreSnapshot = {
  today: string;
  profile: Profile;
  people: Person[];
  blocks: ScheduleBlock[];
};
export type AvailabilityQuery = { date: string; start: string; end: string; timezone: string };
export type AvailabilityState = "available" | "busy" | "unknown";
export type AvailabilityResult = { person: PublicPerson; state: AvailabilityState; explanation: string };

/** Replace this adapter with Hono requests; views never import mock fixtures. */
export interface CoreRepository {
  getSnapshot(): Promise<CoreSnapshot>;
  saveBlock(draft: BlockDraft, id?: string): Promise<CoreSnapshot>;
  deleteBlock(id: string): Promise<CoreSnapshot>;
  updateProfile(patch: Pick<Profile, "displayName" | "timezone" | "shareAvailability">): Promise<CoreSnapshot>;
  saveOccurrence?(id: string, date: string, replacement: BlockDraft | null): Promise<CoreSnapshot>;
  restoreOccurrence?(id: string, date: string): Promise<CoreSnapshot>;
}
