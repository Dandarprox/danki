import { describe, expect, test } from "bun:test";
import { gradeCard, previewIntervals } from "./srs";

describe("SM-2", () => {
  test("new card Good → 1d, then 6d", () => {
    const first = gradeCard({ ease: 2.5, interval_days: 0, reps: 0, lapses: 0 }, 4);
    expect(first.nextIntervalDays).toBe(1);
    const second = gradeCard(
      { ease: 2.5, interval_days: 1, reps: 1, lapses: 0 },
      4
    );
    expect(second.nextIntervalDays).toBe(6);
  });
  test("Again resets + ease penalty", () => {
    const r = gradeCard({ ease: 2.5, interval_days: 10, reps: 3, lapses: 0 }, 1);
    expect(r.nextIntervalDays).toBe(0);
    expect(r.dueInSec).toBe(600);
    expect(r.ease).toBeLessThan(2.5);
    expect(r.lapses).toBe(1);
  });
  test("Easy boosts ease + longer interval", () => {
    const r = gradeCard({ ease: 2.5, interval_days: 6, reps: 2, lapses: 0 }, 5);
    expect(r.ease).toBeGreaterThan(2.5);
    expect(r.nextIntervalDays).toBeGreaterThan(6);
  });
  test("previews format", () => {
    const p = previewIntervals({ ease: 2.5, interval_days: 0, reps: 0, lapses: 0 });
    expect(p[1]).toBe("10m");
    expect(p[4]).toBe("1d");
  });
});
