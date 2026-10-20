import { chromium } from '@playwright/test';
import { writeFile, mkdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { randomUUID } from 'node:crypto';
import { mergeProcessCovs } from '@bcoe/v8-coverage';
if (process.env.NODE_V8_COVERAGE) {
  const sources = new Map(await Promise.all(['app.js', 'stringer-media.js', '_site/relay-reader.js']
    .map(async path => [resolve(path), await readFile(path, 'utf8')])));
  const launch = chromium.launch.bind(chromium);
  chromium.launch = async (options) => {
    const browser = await launch(options),
      newPage = browser.newPage.bind(browser),
      closeBrowser = browser.close.bind(browser);
    const pending = new Map();
    browser.newPage = async (options) => {
      const page = await newPage(options),
        closePage = page.close.bind(page);
      await page.coverage.startJSCoverage({ resetOnNavigation: false });
      const flush = async () => {
        if (!pending.delete(page)) return;
        const entries = await page.coverage.stopJSCoverage();
        const result = entries
          .filter((entry) => /\/(app|relay-reader|stringer-media)\.js(?:\?|$)/.test(entry.url))
          .flatMap((entry) => {
            const name = new URL(entry.url).pathname.split('/').at(-1);
            const path = resolve(name === 'relay-reader.js' ? '_site/' + name : name);
            // UI contract tests replace the relay module with a fixture. Only
            // coverage from the actual production source belongs in the report.
            if (entry.source !== sources.get(path)) return [];
            return [{
              ...entry,
              url: pathToFileURL(path).href,
            }];
          });
        await mkdir(process.env.NODE_V8_COVERAGE, { recursive: true });
        await writeFile(
          resolve(
            process.env.NODE_V8_COVERAGE,
            `coverage-browser-${process.pid}-${randomUUID()}.json`,
          ),
          JSON.stringify(mergeProcessCovs(result.map((entry) => ({ result: [entry] })))),
        );
      };
      pending.set(page, flush);
      page.close = async (options) => {
        await flush();
        return closePage(options);
      };
      return page;
    };
    browser.close = async (options) => {
      for (const flush of pending.values()) await flush();
      return closeBrowser(options);
    };
    return browser;
  };
}
