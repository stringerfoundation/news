import { chromium } from '@playwright/test';

// All browser tests and rendering scripts use the same executable selection.
// In the managed macOS sandbox, launch restrictions require tool escalation;
// extra Chrome flags cannot grant the missing filesystem permissions.
/** @param {import('@playwright/test').LaunchOptions} [options] */
export function launchBrowser(options = {}) {
  return chromium.launch({
    ...options,
    headless: true,
    ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}),
  });
}
