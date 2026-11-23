import { dayParam } from "./time";

// Timesheet export: CSV (spreadsheets, timesheet/billing tools) and iCalendar (.ics, for a
// private calendar). Pure functions; the Stats page picks the range and saves the file.

interface Win {
  id: string;
  start: number;
  end: number | null;
  note?: string;
  tags?: string[];
}

export interface ExportRow {
  id: string;
  start: number;
  end: number;
  tags: string[];
  note: string;
}

/** Finished windows starting in [from, to), oldest first, tag ids resolved to names. */
export function exportRows(
  windows: readonly Win[],
  tags: readonly { id: string; name: string }[],
  from: number,
  to: number,
): ExportRow[] {
  const names = new Map(tags.map((t) => [t.id, t.name]));
  return windows
    .filter((w): w is Win & { end: number } => w.end !== null && w.start >= from && w.start < to)
    .toSorted((a, b) => a.start - b.start)
    .map((w) => ({
      id: w.id,
      start: w.start,
      end: w.end,
      tags: (w.tags ?? []).map((id) => names.get(id) ?? "Deleted tag"),
      note: w.note ?? "",
    }));
}

// ---------- CSV ----------

const pad = (n: number) => String(n).padStart(2, "0");
const hhmm = (ms: number) => {
  const d = new Date(ms);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
const csvField = (v: string) => (/[",\r\n]/.test(v) ? `"${v.replaceAll('"', '""')}"` : v);

/** RFC 4180 CSV with a UTF-8 BOM (so Excel reads accents right); one row per window. */
export function toCsv(rows: readonly ExportRow[]): string {
  const lines = [["Date", "Start", "End", "Duration (h)", "Duration", "Tags", "Note"]];
  for (const r of rows) {
    const mins = Math.round((r.end - r.start) / 60_000);
    lines.push([
      dayParam(r.start),
      hhmm(r.start),
      hhmm(r.end),
      (mins / 60).toFixed(2),
      `${Math.floor(mins / 60)}:${pad(mins % 60)}`,
      r.tags.join("; "),
      r.note,
    ]);
  }
  return "﻿" + lines.map((l) => l.map(csvField).join(",")).join("\r\n") + "\r\n";
}

// ---------- iCalendar ----------

/** UTC date-time, e.g. 20261118T143000Z. */
const icsTime = (ms: number) => new Date(ms).toISOString().replace(/[-:]/g, "").slice(0, 15) + "Z";
const icsText = (v: string) =>
  v.replaceAll("\\", "\\\\").replaceAll(";", "\\;").replaceAll(",", "\\,").replace(/\r?\n/g, "\\n");

/** Folds a content line at 75 octets (continuations start with a space), never inside a character. */
export function foldLine(line: string): string {
  const enc = new TextEncoder();
  const parts: string[] = [];
  let current = "";
  let bytes = 0;
  for (const ch of line) {
    const size = enc.encode(ch).length;
    const limit = parts.length ? 74 : 75; // continuation lines lose one octet to the space
    if (bytes + size > limit) {
      parts.push(current);
      current = "";
      bytes = 0;
    }
    current += ch;
    bytes += size;
  }
  parts.push(current);
  return parts.join("\r\n ");
}

/** RFC 5545 calendar, one event per window; stable UIDs so re-imports update, not duplicate. */
export function toIcs(rows: readonly ExportRow[], now: number): string {
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Timely//EN", "CALSCALE:GREGORIAN"];
  for (const r of rows) {
    const summary = r.tags.join(", ") || r.note.split(/\r?\n/)[0]!.trim() || "Time tracked";
    lines.push(
      "BEGIN:VEVENT",
      `UID:${r.id}@timely`,
      `DTSTAMP:${icsTime(now)}`,
      `DTSTART:${icsTime(r.start)}`,
      `DTEND:${icsTime(r.end)}`,
      `SUMMARY:${icsText(summary)}`,
    );
    if (r.note) lines.push(`DESCRIPTION:${icsText(r.note)}`);
    if (r.tags.length) lines.push(`CATEGORIES:${r.tags.map(icsText).join(",")}`);
    lines.push("END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  return lines.map(foldLine).join("\r\n") + "\r\n";
}

/** e.g. timely_2026-11-16_2026-11-22.csv — `to` is exclusive and may be "now + 1". */
export function exportFilename(from: number, to: number, ext: string): string {
  return `timely_${dayParam(from)}_${dayParam(to - 1)}.${ext}`;
}
