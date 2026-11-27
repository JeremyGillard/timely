import { describe, expect, it } from "vite-plus/test";
import {
  createSyncVault,
  newRecoveryKey,
  openRecord,
  sealRecord,
  unlockWithRecovery,
} from "./vault";

describe("sync vault (recovery key only)", () => {
  it("recovery key unlocks the same data key", async () => {
    const { meta, key, recoveryKey } = await createSyncVault(null);
    expect(recoveryKey).toMatch(/^([A-Z2-7]{4}-){12}[A-Z2-7]{4}$/);
    const sealed = await sealRecord(key, "window:a", { id: "a", start: 1 });
    // case and separators don't matter when typing it back
    const again = await unlockWithRecovery(meta, recoveryKey.toLowerCase().replaceAll("-", " "));
    expect(await openRecord(again, "window:a", sealed)).toEqual({ id: "a", start: 1 });
  });

  it("rejects a wrong recovery key", async () => {
    const { meta } = await createSyncVault(null);
    await expect(unlockWithRecovery(meta, newRecoveryKey())).rejects.toThrow("Wrong recovery key");
    await expect(unlockWithRecovery(meta, "nope")).rejects.toThrow("doesn't look right");
  });

  it("binds records to their kind + id", async () => {
    const { key } = await createSyncVault(null);
    const sealed = await sealRecord(key, "window:a", { x: 1 });
    await expect(openRecord(key, "window:b", sealed)).rejects.toThrow();
  });
});
