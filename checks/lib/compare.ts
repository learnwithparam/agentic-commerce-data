// Result match: the way every golden question is judged. Rows are compared, never SQL text.
// Numbers are rounded to 2 places, text is trimmed, column names and column order are ignored,
// and extra columns in the agent's rows are allowed as long as some choice of columns matches
// the reference exactly.

const LOOKS_LIKE_A_NUMBER = /^-?\d+(\.\d+)?$/;

// Beyond this many columns, trying every choice of columns would take too long.
const MOST_COLUMNS_TO_TRY = 8;

function roundedNumber(value: number): string {
  const rounded = Math.round(value * 100) / 100;
  return `n:${rounded.toFixed(2)}`;
}

// Turn one cell into a label that is equal for values a person would call equal:
// 3, 3.0 and "3.00" all become "n:3.00".
export function cell(value: unknown): string {
  if (value === null || value === undefined) return "null";
  if (typeof value === "number" || typeof value === "bigint") return roundedNumber(Number(value));
  if (typeof value === "boolean") return value ? "n:1.00" : "n:0.00";
  const text = String(value).trim();
  if (LOOKS_LIKE_A_NUMBER.test(text)) return roundedNumber(Number(text));
  return `s:${text.normalize("NFC")}`;
}

// Sorting the cells makes the key ignore column order.
function rowKey(row: unknown[]): string {
  const cells = row.map(cell);
  cells.sort();
  return cells.join("\u0001");
}

// Every way to choose `chosenCount` column positions out of `columnCount`, in order.
function columnChoices(columnCount: number, chosenCount: number): number[][] {
  const choices: number[][] = [];
  const extend = (nextColumn: number, chosenSoFar: number[]) => {
    if (chosenSoFar.length === chosenCount) {
      choices.push([...chosenSoFar]);
      return;
    }
    for (let column = nextColumn; column < columnCount; column++) {
      extend(column + 1, [...chosenSoFar, column]);
    }
  };
  extend(0, []);
  return choices;
}

function sameRows(agentRows: unknown[][], referenceRows: unknown[][], orderMatters: boolean) {
  if (agentRows.length !== referenceRows.length) return false;
  const agentKeys = agentRows.map(rowKey);
  const referenceKeys = referenceRows.map(rowKey);
  if (!orderMatters) {
    agentKeys.sort();
    referenceKeys.sort();
  }
  return agentKeys.every((key, i) => key === referenceKeys[i]);
}

function keepColumns(rows: unknown[][], columns: number[]): unknown[][] {
  return rows.map((row) => columns.map((column) => row[column]));
}

export function rowsMatch(
  agentRows: unknown[][],
  referenceRows: unknown[][],
  orderMatters = false,
): boolean {
  if (agentRows.length !== referenceRows.length) return false;
  if (referenceRows.length === 0) return true;
  const referenceWidth = referenceRows[0].length;
  const agentWidth = agentRows[0]?.length ?? 0;
  if (agentWidth < referenceWidth) return false;
  if (agentWidth === referenceWidth) return sameRows(agentRows, referenceRows, orderMatters);
  if (agentWidth > MOST_COLUMNS_TO_TRY) return false;
  const choices = columnChoices(agentWidth, referenceWidth);
  return choices.some((columns) =>
    sameRows(keepColumns(agentRows, columns), referenceRows, orderMatters),
  );
}
