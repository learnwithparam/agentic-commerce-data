// Result match: the way every golden question is judged. Rows are compared, never SQL text.
// Numbers are rounded to 2 places, text is trimmed, column names and column order are ignored, and extra columns
// in the agent's rows are allowed as long as some choice of columns matches the reference exactly.

const NUMERIC = /^-?\d+(\.\d+)?$/;

export function cell(v: unknown): string {
  if (v === null || v === undefined) return "null";
  if (typeof v === "number" || typeof v === "bigint")
    return `n:${(Math.round(Number(v) * 100) / 100).toFixed(2)}`;
  if (typeof v === "boolean") return `n:${v ? "1.00" : "0.00"}`;
  const s = String(v).trim();
  if (NUMERIC.test(s)) return `n:${(Math.round(Number(s) * 100) / 100).toFixed(2)}`;
  return `s:${s.normalize("NFC")}`;
}

const rowKey = (r: unknown[]) => r.map(cell).sort().join("\u0001");

function combos(n: number, k: number): number[][] {
  const out: number[][] = [];
  const go = (start: number, acc: number[]) => {
    if (acc.length === k) return void out.push([...acc]);
    for (let i = start; i < n; i++) go(i + 1, [...acc, i]);
  };
  go(0, []);
  return out;
}

function sameRows(agent: unknown[][], ref: unknown[][], orderMatters: boolean): boolean {
  if (agent.length !== ref.length) return false;
  const a = agent.map(rowKey);
  const b = ref.map(rowKey);
  if (orderMatters) return a.every((x, i) => x === b[i]);
  a.sort();
  b.sort();
  return a.every((x, i) => x === b[i]);
}

export function rowsMatch(agent: unknown[][], ref: unknown[][], orderMatters = false): boolean {
  if (agent.length !== ref.length) return false;
  if (ref.length === 0) return true;
  const k = ref[0].length;
  const width = agent[0]?.length ?? 0;
  if (width < k) return false;
  if (width === k) return sameRows(agent, ref, orderMatters);
  if (width > 8) return false;
  return combos(width, k).some((cols) =>
    sameRows(
      agent.map((r) => cols.map((c) => r[c])),
      ref,
      orderMatters,
    ),
  );
}
