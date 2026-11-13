// Every page a learner or a member of the public can open in this course.
// serve.ts builds each one from the real program. The audit visits them at 1280 px and 375 px.
export type Route = { name: string; path: string };

export const routes: Route[] = [
  { name: "renderer waiting for a question", path: "/renderer-waiting" },
  { name: "renderer drawing an answer", path: "/renderer-answer" },
  { name: "renderer with an unknown component", path: "/renderer-unknown" },
  { name: "approval form", path: "/approval-form" },
  { name: "desk answer", path: "/desk-answer" },
  { name: "desk refusal", path: "/desk-refusal" },
];

// Button verbs this course uses beyond the shared list, in lower case.
export const extraButtonVerbs: string[] = ["ask", "approve", "reject"];
