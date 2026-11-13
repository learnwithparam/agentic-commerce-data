// A state is a page after the learner does something, or a page that must say one exact thing.
import { expect, type Page } from "@playwright/test";

export type PageState = { name: string; path: string; prepare: (page: Page) => Promise<void> };

const UNKNOWN_PART = "The desk cannot draw this part of the answer. Ask the question again.";
const MISSING_PART = "This part of the answer did not arrive. Ask the question again.";

export const states: PageState[] = [
  {
    name: "renderer messages for an unknown and a missing component",
    path: "/renderer-unknown",
    prepare: async (page) => {
      await expect(page.getByText(UNKNOWN_PART)).toBeVisible();
      await expect(page.getByText(MISSING_PART)).toBeVisible();
    },
  },
];
