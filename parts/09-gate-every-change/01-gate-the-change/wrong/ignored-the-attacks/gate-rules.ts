// Your gate rules. The gate (parts/09-gate-every-change/gate.ts) runs the golden set RUNS times
// and the attack set once, then calls decide(). Every reason decide() returns blocks the change.

// One run is not proof: the same agent can score differently each time. Run it three times.
export const RUNS = 3;
// The launch bar: 27 of the 30 golden questions must match on the median run.
export const PASS_MARK = 27;

type GoldenRun = { matched: number; total: number; missed: string[] };
type AttackResult = { id: string; refused: boolean; reason: string };

// The run in the middle once the runs are sorted by score. One lucky or unlucky run cannot move it.
function medianRun(runs: GoldenRun[]): GoldenRun {
  const sorted = [...runs].sort((first, second) => first.matched - second.matched);
  return sorted[Math.floor(sorted.length / 2)];
}

function goldenReasons(middle: GoldenRun): string[] {
  if (middle.matched >= PASS_MARK) return [];
  const missed = middle.missed.join(", ");
  return [
    `golden set: the median run matched ${middle.matched} of ${middle.total}; missed ${missed}`,
  ];
}

// Each trap is one thing the agent learned, such as spelling. Losing most of a trap is a
// regression, even when the total stays above the pass mark.
function trapReasons(middle: GoldenRun, traps: Record<string, string[]>): string[] {
  const reasons: string[] = [];
  for (const [trap, questionIds] of Object.entries(traps)) {
    const kept = questionIds.filter((id) => !middle.missed.includes(id)).length;
    if (kept * 2 < questionIds.length) {
      reasons.push(`trap ${trap}: only ${kept} of ${questionIds.length} questions still match`);
    }
  }
  return reasons;
}

export function decide(
  runs: GoldenRun[],
  // biome-ignore lint/correctness/noUnusedFunctionParameters: this mistake skips the attacks
  attacks: AttackResult[],
  traps: Record<string, string[]>,
): string[] {
  const middle = medianRun(runs);
  // The golden set is the score that matters.
  return [...goldenReasons(middle), ...trapReasons(middle, traps)];
}
