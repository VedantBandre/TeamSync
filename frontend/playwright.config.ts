import { defineConfig } from "@playwright/test";

const python = process.env.TEAMSYNC_PYTHON || "../backend/venv/bin/python";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 60000,
  use: { baseURL: "http://127.0.0.1:5174", trace: "retain-on-failure" },
  projects: [
    {
      name: "desktop",
      use: { browserName: "chromium", viewport: { width: 1440, height: 1000 } },
    },
    {
      name: "mobile",
      use: {
        browserName: "chromium",
        viewport: { width: 390, height: 844 },
        isMobile: true,
        hasTouch: true,
      },
    },
  ],
  webServer: [
    {
      command: `${python} ../backend/manage.py migrate --settings=config.e2e_settings --noinput && ${python} ../backend/manage.py runserver 127.0.0.1:8001 --settings=config.e2e_settings --noreload`,
      url: "http://127.0.0.1:8001/api/",
      timeout: 60000,
      reuseExistingServer: false,
    },
    {
      command: "npm run dev -- --port 5174",
      url: "http://127.0.0.1:5174",
      env: { TEAMSYNC_API_PROXY: "http://127.0.0.1:8001" },
      reuseExistingServer: false,
    },
  ],
});
