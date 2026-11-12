import { expect, test } from "bun:test";
import { rowsMatch } from "../checks/lib/compare";

test("column names, column order and rounding past 2 places are ignored", () => {
  expect(rowsMatch([[704.0001]], [[704]])).toBe(true);
  expect(rowsMatch([["SP", 10], ["RJ", 5]], [[5, "RJ"], [10, "SP"]])).toBe(true);
});
test("extra columns pass when some choice of columns matches", () => {
  expect(rowsMatch([["a", "sao paulo", 3]], [["a", 3]])).toBe(true);
});
test("different values, row counts or order (when it matters) fail", () => {
  expect(rowsMatch([[694]], [[704]])).toBe(false);
  expect(rowsMatch([[1], [2]], [[1]])).toBe(false);
  expect(rowsMatch([["a"], ["b"]], [["b"], ["a"]], true)).toBe(false);
});
