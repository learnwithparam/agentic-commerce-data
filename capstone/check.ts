// bun capstone/check.ts <folder>: judges your own capstone folder, never the course data.
// It fails on capstone/template and passes on capstone/sample.
import { runCapstoneCheck } from "../checks/capstone";
import { rules } from "./rules";

runCapstoneCheck(rules);
