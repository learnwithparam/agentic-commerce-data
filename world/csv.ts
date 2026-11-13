// A small RFC 4180 CSV reader: quoted fields, doubled quotes, commas and line breaks
// inside quotes, CRLF line endings, and a byte order mark at the start.
// The Olist review comments hold all of these, so a naive split on commas and lines breaks them.

const BYTE_ORDER_MARK = 0xfeff;

// The reader walks the text one character at a time and remembers where it is.
type Reader = {
  text: string;
  position: number;
  field: string;
  row: string[];
  insideQuotes: boolean;
};

// Inside quotes everything is part of the field, except a closing quote.
// Two quotes in a row stand for one quote character.
function readQuotedCharacter(reader: Reader, character: string): void {
  if (character !== '"') {
    reader.field += character;
    reader.position += 1;
    return;
  }
  if (reader.text[reader.position + 1] === '"') {
    reader.field += '"';
    reader.position += 2;
    return;
  }
  reader.insideQuotes = false;
  reader.position += 1;
}

// Outside quotes, read one character. Returns a finished row at the end of a line.
function readPlainCharacter(reader: Reader, character: string): string[] | null {
  const nextCharacter = reader.text[reader.position + 1];
  reader.position += 1;
  if (character === '"' && reader.field === "") {
    reader.insideQuotes = true;
  } else if (character === ",") {
    reader.row.push(reader.field);
    reader.field = "";
  } else if (character === "\r" && nextCharacter === "\n") {
    // Skip the \r of a CRLF ending; the \n that follows ends the row.
  } else if (character === "\n") {
    const finishedRow = [...reader.row, reader.field];
    reader.row = [];
    reader.field = "";
    return finishedRow;
  } else {
    reader.field += character;
  }
  return null;
}

export function* parseCsv(text: string): Generator<string[]> {
  const withoutMark = text.charCodeAt(0) === BYTE_ORDER_MARK ? text.slice(1) : text;
  const reader: Reader = {
    text: withoutMark,
    position: 0,
    field: "",
    row: [],
    insideQuotes: false,
  };
  while (reader.position < reader.text.length) {
    const character = reader.text[reader.position];
    if (reader.insideQuotes) {
      readQuotedCharacter(reader, character);
      continue;
    }
    const finishedRow = readPlainCharacter(reader, character);
    if (finishedRow) yield finishedRow;
  }
  // The last line may have no line break after it.
  if (reader.field !== "" || reader.row.length) {
    yield [...reader.row, reader.field];
  }
}

export type ColumnType = "INTEGER" | "REAL" | "TEXT";

const WHOLE_NUMBER = /^-?(0|[1-9]\d*)$/;
const DECIMAL_NUMBER = /^-?\d+(\.\d+)?$/;
const LEADING_ZERO = /^0\d/;

// Widen the type a column can have, given one more value from it.
// Starting from INTEGER, a value can only make the type wider: INTEGER, then REAL, then TEXT.
function widenType(type: ColumnType, value: string): ColumnType {
  let widened = type;
  if (widened === "INTEGER" && !WHOLE_NUMBER.test(value)) widened = "REAL";
  if (widened === "REAL" && !DECIMAL_NUMBER.test(value)) return "TEXT";
  if (LEADING_ZERO.test(value)) return "TEXT";
  return widened;
}

function columnType(rows: string[][], column: number): ColumnType {
  let type: ColumnType = "INTEGER";
  let foundAnyValue = false;
  for (const row of rows) {
    const value = row[column];
    if (value === undefined || value === "") continue;
    foundAnyValue = true;
    type = widenType(type, value);
    if (type === "TEXT") return "TEXT";
  }
  return foundAnyValue ? type : "TEXT";
}

// Pick a SQLite type per column.
// A value with a leading zero (a zip prefix like 01037) keeps the column TEXT.
export function inferTypes(header: string[], rows: string[][]): ColumnType[] {
  return header.map((_, column) => columnType(rows, column));
}
