import { describe, expect, it } from "vite-plus/test";
import { exportFilename, exportRows, foldLine, toCsv, toIcs } from "./export";

const at = (d: number, h: number, m = 0) => new Date(2026, 10, d, h, m).getTime();
const TAGS = [
  { id: "a", name: "Meeting" },
  { id: "b", name: "Security" },
];
const row = (over: Partial<ReturnType<typeof exportRows>[number]> = {}) => ({
  id: "w1",
  start: at(18, 9),
  end: at(18, 10, 15),
  tags: [] as string[],
  note: "",
  ...over,
});

describe("exportRows", () => {
  it("keeps finished windows starting in range, oldest first, with tag names", () => {
    const rows = exportRows(
      [
        { id: "late", start: at(18, 14), end: at(18, 15), tags: ["b", "zz"] },
        { id: "early", start: at(18, 9), end: at(18, 10), tags: ["a"], note: "Standup" },
        { id: "before", start: at(15, 23), end: at(16, 1) }, // starts before the range
        { id: "after", start: at(23, 0), end: at(23, 1) }, // `to` is exclusive
        { id: "running", start: at(19, 8), end: null },
      ],
      TAGS,
      at(16, 0),
      at(23, 0),
    );
    expect(rows.map((r) => r.id)).toEqual(["early", "late"]);
    expect(rows[0]).toMatchObject({ tags: ["Meeting"], note: "Standup" });
    expect(rows[1]!.tags).toEqual(["Security", "Deleted tag"]);
  });
});

describe("toCsv", () => {
  it("writes a BOM, header and CRLF rows with decimal and h:mm durations", () => {
    const csv = toCsv([row({ tags: ["Meeting", "Security"] })]);
    expect(csv.startsWith("﻿")).toBe(true);
    expect(csv.slice(1).split("\r\n")).toEqual([
      "Date,Start,End,Duration (h),Duration,Tags,Note",
      "2026-11-18,09:00,10:15,1.25,1:15,Meeting; Security,",
      "",
    ]);
  });

  it("quotes fields with commas, quotes or newlines", () => {
    const csv = toCsv([row({ note: 'Call with "Ann", then\nreview' })]);
    expect(csv).toContain(`,"Call with ""Ann"", then\nreview"\r\n`);
  });

  it("dates a window crossing midnight by its start", () => {
    const line = toCsv([row({ start: at(18, 23, 30), end: at(19, 0, 30) })]).split("\r\n")[1];
    expect(line).toBe("2026-11-18,23:30,00:30,1.00,1:00,,");
  });
});

describe("toIcs", () => {
  const NOW = Date.UTC(2026, 10, 23, 12);

  it("emits one event per window with UTC times and a stable UID", () => {
    const ics = toIcs([row({ tags: ["Meeting"], note: "Standup; daily, quick\nok" })], NOW);
    const lines = ics.split("\r\n");
    expect(lines[0]).toBe("BEGIN:VCALENDAR");
    expect(lines.at(-2)).toBe("END:VCALENDAR");
    expect(ics.endsWith("\r\n")).toBe(true);
    expect(lines).toContain("UID:w1@timely");
    expect(lines).toContain(
      `DTSTART:${new Date(at(18, 9)).toISOString().replace(/[-:]/g, "").slice(0, 15)}Z`,
    );
    expect(lines).toContain("DTSTAMP:20261123T120000Z");
    expect(lines).toContain("SUMMARY:Meeting");
    expect(lines).toContain("DESCRIPTION:Standup\\; daily\\, quick\\nok");
    expect(lines).toContain("CATEGORIES:Meeting");
  });

  it("falls back to the note's first line, then a generic summary", () => {
    expect(toIcs([row({ note: "Fix bug\nmore" })], NOW)).toContain("SUMMARY:Fix bug\r\n");
    const bare = toIcs([row()], NOW);
    expect(bare).toContain("SUMMARY:Time tracked\r\n");
    expect(bare).not.toContain("DESCRIPTION");
    expect(bare).not.toContain("CATEGORIES");
  });
});

describe("foldLine", () => {
  it("folds at 75 octets without splitting multi-byte characters", () => {
    const enc = new TextEncoder();
    const folded = foldLine("DESCRIPTION:" + "é".repeat(80));
    const parts = folded.split("\r\n");
    expect(parts.length).toBeGreaterThan(1);
    for (const p of parts) expect(enc.encode(p).length).toBeLessThanOrEqual(75);
    expect(parts.slice(1).every((p) => p.startsWith(" "))).toBe(true);
    expect(parts.map((p, i) => (i ? p.slice(1) : p)).join("")).toBe(
      "DESCRIPTION:" + "é".repeat(80),
    );
  });

  it("leaves short lines alone", () => {
    expect(foldLine("SUMMARY:Hi")).toBe("SUMMARY:Hi");
  });
});

describe("exportFilename", () => {
  it("names the inclusive date range", () => {
    expect(exportFilename(at(16, 0), at(23, 0), "csv")).toBe("timely_2026-11-16_2026-11-22.csv");
  });
});
