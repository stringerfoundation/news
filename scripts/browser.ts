import { chromium } from '@playwright/test';
import type { Browser, LaunchOptions } from '@playwright/test';

// All browser tests and rendering scripts use the same executable selection.
// In the managed macOS sandbox, launch restrictions require tool escalation;
// extra Chrome flags cannot grant the missing filesystem permissions.
export function launchBrowser(options: LaunchOptions = {}): Promise<Browser> {
  return chromium.launch({
    ...options,
    headless: true,
    ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}),
  });
}
