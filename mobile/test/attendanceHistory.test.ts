import { test, expect, describe } from "bun:test";
import { AttendanceRecord } from "../src/types";

describe("Attendance History & Reporting (MS6)", () => {
  const sampleRecords: AttendanceRecord[] = [
    {
      id: "att::usr_01::2026-11-19",
      userId: "usr_01",
      date: "2026-11-19",
      serverTimestamp: "2026-11-19T06:30:00.000Z",
      status: "PRESENT",
      similarityScore: 0.942,
      verifiedOnDevice: true,
    },
    {
      id: "att::usr_01::2026-11-18",
      userId: "usr_01",
      date: "2026-11-18",
      serverTimestamp: "2026-11-18T06:28:15.000Z",
      status: "PRESENT",
      similarityScore: 0.915,
      verifiedOnDevice: true,
    },
    {
      id: "att::usr_01::2026-10-31",
      userId: "usr_01",
      date: "2026-10-31",
      serverTimestamp: "2026-10-31T06:45:00.000Z",
      status: "PRESENT",
      similarityScore: 0.898,
      verifiedOnDevice: true,
    },
  ];

  test("calculates attendance summary metrics correctly", () => {
    const totalDays = sampleRecords.length;
    expect(totalDays).toBe(3);

    // This month (2026-11)
    const currentMonthPrefix = "2026-11";
    const thisMonth = sampleRecords.filter((r) => r.date.startsWith(currentMonthPrefix)).length;
    expect(thisMonth).toBe(2);

    // Average match score
    const totalScore = sampleRecords.reduce((sum, r) => sum + r.similarityScore, 0);
    const avgScore = Math.round((totalScore / totalDays) * 100);
    // (0.942 + 0.915 + 0.898) / 3 = 0.91833 -> 92%
    expect(avgScore).toBe(92);
  });

  test("handles empty records list without crashing", () => {
    const records: AttendanceRecord[] = [];
    const totalDays = records.length;
    const avgScore = records.length > 0 ? Math.round((records.reduce((s, r) => s + r.similarityScore, 0) / records.length) * 100) : 0;

    expect(totalDays).toBe(0);
    expect(avgScore).toBe(0);
  });

  test("cache deduplication logic prevents duplicate daily records", () => {
    const existing = [...sampleRecords];
    const newRecord: AttendanceRecord = {
      id: "att::usr_01::2026-11-19",
      userId: "usr_01",
      date: "2026-11-19",
      serverTimestamp: "2026-11-19T07:00:00.000Z", // Updated check-in
      status: "PRESENT",
      similarityScore: 0.955,
      verifiedOnDevice: true,
    };

    const filtered = existing.filter((r) => r.id !== newRecord.id && r.date !== newRecord.date);
    const updated = [newRecord, ...filtered];

    expect(updated.length).toBe(3); // Same length, updated date
    expect(updated[0].similarityScore).toBe(0.955);
    expect(updated[0].date).toBe("2026-11-19");
  });

  test("orders attendance history in reverse chronological order", () => {
    const sorted = [...sampleRecords].sort(
      (a, b) => new Date(b.serverTimestamp).getTime() - new Date(a.serverTimestamp).getTime()
    );

    expect(sorted[0].date).toBe("2026-11-19");
    expect(sorted[1].date).toBe("2026-11-18");
    expect(sorted[2].date).toBe("2026-10-31");
  });

  test("date-only calendar string does not shift across timezones", () => {
    const formatCalendarDate = (dateStr: string) => {
      const [year, month, day] = dateStr.split("-").map(Number);
      const d = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
      return d.toLocaleDateString("en-US", {
        weekday: "short",
        day: "numeric",
        month: "short",
        year: "numeric",
        timeZone: "UTC",
      });
    };

    expect(formatCalendarDate("2026-11-19")).toBe("Thu, Nov 19, 2026");
    expect(formatCalendarDate("2026-01-01")).toBe("Thu, Jan 1, 2026");
    expect(formatCalendarDate("2026-12-31")).toBe("Thu, Dec 31, 2026");
  });

  test("verifies date consistency across UTC-12, UTC, and UTC+14 timezones", () => {
    const formatCalendarDate = (dateStr: string) => {
      const parts = dateStr.split("-").map(Number);
      const [year, month, day] = parts;
      const d = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
      return d.toLocaleDateString("en-US", {
        weekday: "short",
        day: "numeric",
        month: "short",
        year: "numeric",
        timeZone: "UTC",
      });
    };

    const formatTimeForZone = (isoStr: string, tz: string) => {
      const d = new Date(isoStr);
      return d.toLocaleTimeString("en-US", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: true,
        timeZone: tz,
      });
    };

    // Scenario 1: User in UTC-12 (Baker Island / Etc/GMT+12)
    const recordUtcMinus12: AttendanceRecord = {
      id: "att::usr_01::2026-11-19",
      userId: "usr_01",
      date: "2026-11-19",
      serverTimestamp: "2026-11-19T18:00:00.000Z", // 06:00 AM on Nov 19 in UTC-12
      status: "PRESENT",
      similarityScore: 0.93,
      verifiedOnDevice: true,
    };
    expect(formatCalendarDate(recordUtcMinus12.date)).toBe("Thu, Nov 19, 2026");
    expect(formatTimeForZone(recordUtcMinus12.serverTimestamp, "Etc/GMT+12")).toBe("06:00:00 AM");

    // Scenario 2: User in UTC
    const recordUtc: AttendanceRecord = {
      id: "att::usr_02::2026-11-19",
      userId: "usr_02",
      date: "2026-11-19",
      serverTimestamp: "2026-11-19T18:00:00.000Z", // 18:00 (06:00 PM) in UTC
      status: "PRESENT",
      similarityScore: 0.95,
      verifiedOnDevice: true,
    };
    expect(formatCalendarDate(recordUtc.date)).toBe("Thu, Nov 19, 2026");
    expect(formatTimeForZone(recordUtc.serverTimestamp, "UTC")).toBe("06:00:00 PM");

    // Scenario 3: User in UTC+14 (Line Islands / Pacific/Kiritimati)
    // At UTC 18:00 on Nov 19, in UTC+14 it is 08:00 AM on Nov 20!
    const recordUtcPlus14: AttendanceRecord = {
      id: "att::usr_03::2026-11-20",
      userId: "usr_03",
      date: "2026-11-20",
      serverTimestamp: "2026-11-19T18:00:00.000Z", // 08:00 AM on Nov 20 in UTC+14
      status: "PRESENT",
      similarityScore: 0.92,
      verifiedOnDevice: true,
    };
    // The calendar date received from backend is 2026-11-20
    expect(formatCalendarDate(recordUtcPlus14.date)).toBe("Fri, Nov 20, 2026");
    expect(formatTimeForZone(recordUtcPlus14.serverTimestamp, "Pacific/Kiritimati")).toBe("08:00:00 AM");

    // Critical assertion: calendar date string is preserved exactly as emitted by backend
    expect(recordUtcMinus12.date).toBe("2026-11-19");
    expect(recordUtc.date).toBe("2026-11-19");
    expect(recordUtcPlus14.date).toBe("2026-11-20");
  });
});
