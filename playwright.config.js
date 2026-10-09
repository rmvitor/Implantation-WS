import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests",
  fullyParallel: false,
  workers: 1,
  reporter: "list",
  outputDir: ".local/test-results",
  use: {
    baseURL: "http://127.0.0.1:5173",
    browserName: "chromium",
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE
      ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE }
      : {},
    viewport: { width: 1440, height: 1080 },
  },
  webServer: [
    {
      command: "npm run dev -- --port 5173",
      url: "http://127.0.0.1:5173",
      reuseExistingServer: !process.env.CI,
    },
    {
      command: "npm run test:pwa:serve",
      url: "http://127.0.0.1:5176/Implantation-WS/",
      reuseExistingServer: !process.env.CI,
      timeout: 120000,
    },
  ],
});
