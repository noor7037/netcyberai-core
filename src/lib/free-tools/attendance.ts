// Attendance arithmetic for the free Attendance Calculator. Exact integer
// answers: "days needed" is the smallest whole number of consecutive
// present days that reaches the target; "can miss" is the largest whole
// number of absences that still keeps the student at or above it.

export interface AttendanceInput {
  attended: number;
  total: number;
  targetPercent: number;
}

export type AttendanceResult =
  | { ok: true; currentPercent: number; meetsTarget: boolean; daysNeeded: number; canMiss: number }
  | { ok: false; error: string };

export function calculateAttendance({ attended, total, targetPercent }: AttendanceInput): AttendanceResult {
  if (![attended, total, targetPercent].every(Number.isFinite)) return { ok: false, error: 'Please enter numbers only.' };
  if (!Number.isInteger(attended) || !Number.isInteger(total)) return { ok: false, error: 'Days must be whole numbers.' };
  if (total <= 0) return { ok: false, error: 'Working days so far must be more than zero.' };
  if (attended < 0 || attended > total) return { ok: false, error: 'Days attended must be between zero and the working days so far.' };
  if (targetPercent <= 0 || targetPercent >= 100) return { ok: false, error: 'The target must be more than 0 and less than 100.' };

  const p = targetPercent / 100;
  const currentPercent = Math.round((attended / total) * 1000) / 10;
  // Work in integer hundredths of a percent so a target of 75 on 100
  // working days needs exactly 75 days, with no floating-point near-misses.
  const pBasis = Math.round(targetPercent * 100);
  const meets = attended * 10000 >= pBasis * total;
  // (attended + x) / (total + x) >= p  =>  x >= (p*total - attended) / (1 - p)
  let daysNeeded = 0;
  if (!meets) {
    daysNeeded = Math.ceil((p * total - attended) / (1 - p) - 1e-9);
    while ((attended + daysNeeded) * 10000 < pBasis * (total + daysNeeded)) daysNeeded++;
  }
  // attended / (total + y) >= p  =>  y <= attended / p - total
  let canMiss = 0;
  if (meets) {
    canMiss = Math.max(0, Math.floor(attended / p - total + 1e-9));
    while (canMiss > 0 && attended * 10000 < pBasis * (total + canMiss)) canMiss--;
  }
  return { ok: true, currentPercent, meetsTarget: meets, daysNeeded, canMiss };
}
