import { test as base, expect } from "@playwright/test";
import { createDemo } from "./workspace.js";
// Artificial data is injected only by regression tests, never by the application.
export const test = base.extend({
  page: async ({ page }, use) => {
    await page.addInitScript((value) => {
      if (!localStorage.getItem("implanta.workspace.v1"))
        localStorage.setItem("implanta.workspace.v1", JSON.stringify(value));
    }, createDemo());
    await use(page);
  },
});
export { expect };
