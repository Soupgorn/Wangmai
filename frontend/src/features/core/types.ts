export type BlockKind = "available" | "busy";
export type BlockTiming = { type: "weekly"; weekday: number } | { type: "date"; date: string };

export type BlockDraft = {
  title: string;
  kind: BlockKind;
  start: string;
  end: string;
  timing: BlockTiming;
};

export type ScheduleBlock = BlockDraft & { id: string; ownerId: string };
export type Person = {
  id: string;
  displayName: string;
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
export type AvailabilityResult = { person: Person; state: AvailabilityState; explanation: string };

/** Replace this adapter with Hono requests; views never import mock fixtures. */
export interface CoreRepository {
  getSnapshot(): Promise<CoreSnapshot>;
  saveBlock(draft: BlockDraft, id?: string): Promise<CoreSnapshot>;
  deleteBlock(id: string): Promise<CoreSnapshot>;
  updateProfile(patch: Pick<Profile, "displayName" | "timezone" | "shareAvailability">): Promise<CoreSnapshot>;
}
