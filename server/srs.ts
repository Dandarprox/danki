// SM-2 simplified for Danki. Grades: 1=Again 3=Hard 4=Good 5=Easy
export type Grade = 1 | 3 | 4 | 5;

export interface CardState {
  ease: number;
  interval_days: number;
  reps: number;
  lapses: number;
}

export interface ReviewResult extends CardState {
  nextIntervalDays: number;
  dueInSec: number; // seconds from now (600 for Again re-learn)
}

export function gradeCard(prev: CardState, grade: Grade): ReviewResult {
  let { ease, interval_days, reps, lapses } = prev;

  if (grade === 1) {
    // Again: short re-learn, ease penalty
    return {
      ease: Math.max(1.3, round2(ease - 0.2)),
      interval_days: 0,
      reps: 0,
      lapses: lapses + 1,
      nextIntervalDays: 0,
      dueInSec: 600,
    };
  }
  if (grade === 3) {
    const next = reps === 0 ? 1 : Math.max(1, Math.floor(interval_days * 1.2));
    return {
      ease: Math.max(1.3, round2(ease - 0.15)),
      interval_days: next,
      reps: reps + 1,
      lapses,
      nextIntervalDays: next,
      dueInSec: next * 86400,
    };
  }
  if (grade === 4) {
    const next =
      reps === 0 ? 1 : reps === 1 ? 6 : Math.round(interval_days * ease);
    return {
      ease,
      interval_days: Math.max(1, next),
      reps: reps + 1,
      lapses,
      nextIntervalDays: Math.max(1, next),
      dueInSec: Math.max(1, next) * 86400,
    };
  }
  // Easy
  const base =
    reps === 0 ? 4 : Math.round(Math.max(4, interval_days * ease * 1.3));
  return {
    ease: round2(Math.min(3.0, ease + 0.15)),
    interval_days: base,
    reps: reps + 1,
    lapses,
    nextIntervalDays: base,
    dueInSec: base * 86400,
  };
}

/** Preview labels like "10m", "1d", "6d" for the 4 buttons. */
export function previewIntervals(prev: CardState): Record<Grade, string> {
  const fmt = (days: number, secs: number) =>
    secs < 86400 && days === 0
      ? `${Math.round(secs / 60)}m`
      : days < 30
        ? `${Math.max(1, days)}d`
        : `${Math.round((days / 30) * 10) / 10}mo`;
  const g = (grade: Grade) => {
    const r = gradeCard(prev, grade);
    return fmt(r.nextIntervalDays, r.dueInSec);
  };
  return { 1: g(1), 3: g(3), 4: g(4), 5: g(5) };
}

const round2 = (n: number) => Math.round(n * 100) / 100;
