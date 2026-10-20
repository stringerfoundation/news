import { chromium } from '@playwright/test';
import { writeFile, mkdir, readFile } from 'node:fs/promises';
import { resolve, dirname, isAbsolute } from 'node:path';
import { pathToFileURL } from 'node:url';
import { randomUUID, createHash } from 'node:crypto';
import { mergeProcessCovs } from '@bcoe/v8-coverage';
import { PUBLIC_MODULES } from '../../public-assets.ts';
import { readerSource } from '../reader-source.ts';

if (process.env.NODE_V8_COVERAGE) {
  const names = [...PUBLIC_MODULES, 'relay-reader'];
  const sources = new Map(await Promise.all(names.map(async name => {
    const built = await readFile(`_site/${name}.js`, 'utf8');
    return [name + '.js', new Set([built, await readerSource(name + '.js')])];
  })));
  const directory = resolve('.test-output/coverage/browser-sources');
  await mkdir(directory, {recursive: true});
  const launch = chromium.launch.bind(chromium);
  chromium.launch = async options => {
    const browser = await launch(options), newPage = browser.newPage.bind(browser), closeBrowser = browser.close.bind(browser);
    const pending = new Map();
    browser.newPage = async options => {
      const page = await newPage(options), closePage = page.close.bind(page);
      await page.coverage.startJSCoverage({resetOnNavigation: false});
      const flush = async () => {
        if (!pending.delete(page)) return;
        const entries = await page.coverage.stopJSCoverage(), result = [];
        for (const entry of entries) {
          if (!/^https?:/.test(entry.url)) continue;
          const name = new URL(entry.url).pathname.split('/').at(-1);
          // UI fixture modules and edited permission grants cannot count as
          // production execution. Save accepted compiled text with its own map.
          if (!sources.get(name)?.has(entry.source)) continue;
          const source = entry.source.replace(/sourceMappingURL=data:application\/json;base64,([^\s]+)/, (_match, data) => {
            const map = JSON.parse(Buffer.from(data, 'base64').toString());
            map.sources = map.sources.map(path => isAbsolute(path) ? path : resolve(dirname(resolve('_site', name)), path));
            return 'sourceMappingURL=data:application/json;base64,' + Buffer.from(JSON.stringify(map)).toString('base64');
          });
          const hash = createHash('sha256').update(source).digest('hex');
          const path = resolve(directory, `${hash}-${name}`);
          await writeFile(path, source);
          result.push({...entry, url: pathToFileURL(path).href});
        }
        await mkdir(process.env.NODE_V8_COVERAGE, {recursive: true});
        await writeFile(resolve(process.env.NODE_V8_COVERAGE, `coverage-browser-${process.pid}-${randomUUID()}.json`), JSON.stringify(mergeProcessCovs(result.map(entry => ({result: [entry]})))));
      };
      pending.set(page, flush);
      page.close = async options => {await flush(); return closePage(options);};
      return page;
    };
    browser.close = async options => {for (const flush of pending.values()) await flush(); return closeBrowser(options);};
    return browser;
  };
}
