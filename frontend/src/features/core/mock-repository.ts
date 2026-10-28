import type { BlockDraft, CoreRepository, CoreSnapshot, Profile } from "./types";
import { createMockSnapshot } from "./mock-data";
import { todayIn, validateBlock, validateTimezone } from "./time";

/** In-memory preview only. A page refresh resets changes. Never writes to the backend. */
export class MockCoreRepository implements CoreRepository {
  private snapshot: CoreSnapshot;
  private nextId = 1;

  constructor(seed?: CoreSnapshot) { this.snapshot = structuredClone(seed ?? createMockSnapshot()); }
  async getSnapshot() { return structuredClone(this.snapshot); }

  async saveBlock(draft: BlockDraft, id?: string) {
    validateBlock(draft, this.snapshot.profile.timezone);
    const block = { ...structuredClone(draft), title: draft.title.trim(), ownerId: this.snapshot.profile.id, id: id ?? `mock-${this.nextId++}` };
    if (id) {
      const index = this.snapshot.blocks.findIndex((item) => item.id === id && item.ownerId === this.snapshot.profile.id);
      if (index === -1) throw new Error("This block no longer exists.");
      this.snapshot.blocks[index] = block;
    } else this.snapshot.blocks.push(block);
    return this.getSnapshot();
  }

  async deleteBlock(id: string) {
    const index = this.snapshot.blocks.findIndex((item) => item.id === id && item.ownerId === this.snapshot.profile.id);
    if (index === -1) throw new Error("This block no longer exists.");
    this.snapshot.blocks.splice(index, 1);
    return this.getSnapshot();
  }

  async updateProfile(patch: Pick<Profile, "displayName" | "timezone" | "shareAvailability">) {
    if (!patch.displayName.trim() || patch.displayName.trim().length > 60) throw new Error("Enter a display name between 1 and 60 characters.");
    validateTimezone(patch.timezone);
    if (typeof patch.shareAvailability !== "boolean") throw new Error("Choose whether to share your availability.");
    this.snapshot.profile = { ...this.snapshot.profile, ...patch, displayName: patch.displayName.trim() };
    this.snapshot.today = todayIn(patch.timezone);
    return this.getSnapshot();
  }
}
