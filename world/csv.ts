// A small RFC 4180 CSV reader: quoted fields, doubled quotes, commas and line breaks inside quotes, CRLF, a BOM.
// The Olist review comments hold all of these, so a naive split on commas and lines breaks them.
export function* parseCsv(text: string): Generator<string[]> {
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  let field = "";
  let row: string[] = [];
  let quoted = false;
  let i = 0;
  const n = text.length;
  while (i < n) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i += 2; continue; }
        quoted = false; i++; continue;
      }
      field += c; i++; continue;
    }
    if (c === '"' && field === "") { quoted = true; i++; continue; }
    if (c === ",") { row.push(field); field = ""; i++; continue; }
    if (c === "\r" && text[i + 1] === "\n") { i++; continue; }
    if (c === "\n") { row.push(field); yield row; row = []; field = ""; i++; continue; }
    field += c; i++;
  }
  if (field !== "" || row.length) { row.push(field); yield row; }
}

export type ColumnType = "INTEGER" | "REAL" | "TEXT";

// Pick a SQLite type per column. A value with a leading zero (a zip prefix like 01037) keeps the column TEXT.
export function inferTypes(header: string[], rows: string[][]): ColumnType[] {
  return header.map((_, j) => {
    let type: ColumnType = "INTEGER";
    let seen = false;
    for (const r of rows) {
      const v = r[j];
      if (v === undefined || v === "") continue;
      seen = true;
      if (type === "INTEGER" && !/^-?(0|[1-9]\d*)$/.test(v)) type = "REAL";
      if (type === "REAL" && !/^-?\d+(\.\d+)?$/.test(v)) return "TEXT";
      if (/^0\d/.test(v)) return "TEXT";
    }
    return seen ? type : "TEXT";
  });
}
