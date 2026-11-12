import { expect, test } from "bun:test";
import { inferTypes, parseCsv } from "../world/csv";

test("quoted fields keep commas, doubled quotes and line breaks", () => {
  const rows = [...parseCsv('﻿a,b\r\n1,"x, ""y""\r\nz"\r\n2,\n')];
  expect(rows).toEqual([["a", "b"], ["1", 'x, "y"\r\nz'], ["2", ""]]);
});

test("a zip prefix with a leading zero keeps its column as text", () => {
  expect(inferTypes(["zip", "n", "price"], [["01037", "3", "1.5"], ["13000", "4", "2"]])).toEqual(["TEXT", "INTEGER", "REAL"]);
});
