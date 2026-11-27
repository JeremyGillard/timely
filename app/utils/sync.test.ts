import { describe, expect, it } from "vite-plus/test";
import {
  applyById,
  closeExtraRunning,
  emptyLedger,
  markPushed,
  mergeRemote,
  track,
  type Item,
} from "./sync";

const win = (id: string, start: number, end: number | null = start + 10): Item => ({
  id,
  kind: "window",
  value: { id, start, end },
});

describe("track", () => {
  it("stamps new records and marks them dirty", () => {
    const l = track(emptyLedger(), [win("a", 1)], ["window", "tag"], 100);
    expect(l.entries.a).toMatchObject({ kind: "window", at: 100 });
    expect(l.dirty).toEqual(["a"]);
  });

  it("returns the same ledger when nothing changed", () => {
    const l = track(emptyLedger(), [win("a", 1)], ["window"], 100);
    expect(track(l, [win("a", 1)], ["window"], 200)).toBe(l);
  });

  it("restamps changed records", () => {
    const l = markPushed(
      track(emptyLedger(), [win("a", 1)], ["window"], 100),
      new Map([["a", 100]]),
    );
    expect(l.dirty).toEqual([]);
    const l2 = track(l, [win("a", 1, 50)], ["window"], 200);
    expect(l2.entries.a!.at).toBe(200);
    expect(l2.dirty).toEqual(["a"]);
  });

  it("tombstones missing records of the tracked kinds only", () => {
    let l = track(emptyLedger(), [win("a", 1)], ["window"], 100);
    l = track(l, [{ id: "s", kind: "settings", value: { x: 1 } }], ["settings"], 100);
    l = track(l, [], ["window"], 200);
    expect(l.entries.a).toMatchObject({ deleted: true, at: 200 });
    expect(l.entries.s!.deleted).toBeUndefined();
  });

  it("always moves time forward, even with a clock behind", () => {
    const l = track(emptyLedger(), [win("a", 1)], ["window"], 500);
    expect(track(l, [win("a", 2)], ["window"], 100).entries.a!.at).toBe(501);
  });
});

describe("mergeRemote", () => {
  const base = track(emptyLedger(), [win("a", 1)], ["window"], 100);

  it("applies newer remote records and clears them from dirty", () => {
    const r = mergeRemote(base, [
      { id: "a", kind: "window", at: 150, deleted: false, value: { id: "a", start: 5, end: 9 } },
      { id: "b", kind: "window", at: 50, deleted: false, value: { id: "b", start: 1, end: 2 } },
    ]);
    expect(r.upserts.map((u) => u.id)).toEqual(["a", "b"]);
    expect(r.ledger.dirty).toEqual([]);
    // applied values hash equal → tracking them again changes nothing
    expect(track(r.ledger, r.upserts, ["window"], 300)).toBe(r.ledger);
  });

  it("keeps the local record when it's newer or tied", () => {
    const r = mergeRemote(base, [{ id: "a", kind: "window", at: 100, deleted: true }]);
    expect(r.deletes).toEqual([]);
    expect(r.ledger.dirty).toEqual(["a"]);
  });

  it("applies remote deletes", () => {
    const r = mergeRemote(base, [{ id: "a", kind: "window", at: 200, deleted: true }]);
    expect(r.deletes).toEqual([{ id: "a", kind: "window" }]);
    expect(track(r.ledger, [], ["window"], 300)).toBe(r.ledger);
  });
});

describe("markPushed", () => {
  it("keeps ids that changed again during the push", () => {
    const l = track(emptyLedger(), [win("a", 1), win("b", 1)], ["window"], 100);
    const pushed = new Map([
      ["a", 100],
      ["b", 100],
    ]);
    const changed = track(l, [win("a", 1), win("b", 2)], ["window"], 200);
    expect(markPushed(changed, pushed).dirty).toEqual(["b"]);
  });
});

describe("applyById", () => {
  it("upserts and deletes", () => {
    const out = applyById(
      [
        { id: "a", v: 1 },
        { id: "b", v: 1 },
      ],
      [
        { id: "a", v: 2 },
        { id: "c", v: 1 },
      ],
      new Set(["b"]),
    );
    expect(out).toEqual([
      { id: "a", v: 2 },
      { id: "c", v: 1 },
    ]);
  });
});

describe("closeExtraRunning", () => {
  it("closes all but the latest running window", () => {
    const out = closeExtraRunning([
      { start: 1, end: null },
      { start: 5, end: 8 },
      { start: 10, end: null },
    ]);
    expect(out).toEqual([
      { start: 1, end: 5 },
      { start: 5, end: 8 },
      { start: 10, end: null },
    ]);
  });
});
