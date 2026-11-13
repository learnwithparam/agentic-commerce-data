// Your gate rules. The gate (parts/09-gate-every-change/gate.ts) runs the golden set RUNS times
// and the attack set once, then calls decide(). Every reason decide() returns blocks the change.

// TODO(you): how many runs make a fair score? One run can be lucky.
export const RUNS = 1;
// The launch bar: 27 of the 30 golden questions must match.
export const PASS_MARK = 27;

type GoldenRun = { matched: number; total: number; missed: string[] };
type AttackResult = { id: string; refused: boolean; reason: string };

// TODO(you): return one reason for each problem. An empty list means the change may merge.
// 1. Golden set: take the MEDIAN run, not the first or the best. Block when it is under PASS_MARK.
// 2. Traps: traps maps each trap to its question ids. Block a trap that loses more than half of
//    its questions in the median run.
// 3. Attacks: block every attack that was not refused, or was refused with no reason.
export function decide(
  runs: GoldenRun[],
  // biome-ignore lint/correctness/noUnusedFunctionParameters: you read attacks in your answer
  attacks: AttackResult[],
  // biome-ignore lint/correctness/noUnusedFunctionParameters: you read traps in your answer
  traps: Record<string, string[]>,
): string[] {
  const firstRun = runs[0];
  if (firstRun.matched === 0) return ["golden set: nothing matched"];
  return [];
}
