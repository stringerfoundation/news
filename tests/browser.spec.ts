import { readerSource } from './reader-source.ts';
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import type { Browser, Page, Locator } from '@playwright/test';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { Snapshot, SourceState } from '../relay/types.ts';
import type { SourceId } from '../news-model.ts';
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { launchBrowser } from '../scripts/browser.ts';
import { SOURCES, worldStories } from '../news-model.ts';
import { collect, snapshotUrl } from '../scripts/collect.ts';
type FixtureSnapshot = Snapshot & { sources: Record<SourceId, SourceState> };
let server: Server, browser: Browser, base: string, snapshot: FixtureSnapshot;
const thumbnail = await readFile(new URL('../assets/favicon-192.png', import.meta.url));
async function mockStoryImages(page: Page) {
  await page.route('**/*', route => route.request().resourceType() === 'image' && !route.request().url().startsWith(base)
    ? route.fulfill({body:thumbnail,contentType:'image/png'}) : route.continue());
}
const testPermissions = Object.fromEntries(SOURCES.map(s=>[s.id,{text:true,summaries:true,images:true}]));
const errors: string[] = [];
before(async()=>{
  const fixtures=Object.fromEntries(await Promise.all(SOURCES.map(async s=>[s.id,await readFile(new URL(`./fixtures/${s.id==='stringer'?'stringer.html':s.id+'.xml'}`,import.meta.url),'utf8')])));
  snapshot=await collect({permissions:testPermissions,pagesUrl:'https://example.org/',log:()=>{},request:async url=>{if(url===snapshotUrl('https://example.org/'))throw new Error('First run');const source = SOURCES.find(s=>s.url===url); assert.ok(source); const fixture = fixtures[source.id]; assert.ok(fixture); return fixture}}) as FixtureSnapshot;
  server=createServer(async(req,res)=>{
    const pathname=new URL(req.url ?? '/','http://localhost').pathname.replace(/^\/stringer-news(?=\/)/,'');
    const file=pathname==='/'?'index.html':pathname.slice(1);
    if(!['index.html','app.js','relay-config.js','news-model.js','response.js', 'publications.js', 'stringer-media.js','style.css','assets/stringer-logo.png','assets/favicon-16.png','assets/favicon-32.png','assets/favicon-192.png','assets/favicon-180.png','data/news.json'].includes(file) && !/^assets\/stringer-thumbnails\/[a-zA-Z0-9-]+\.png$/.test(file)){res.writeHead(404);res.end();return;}
    try {
      let body;
      if (file === 'data/news.json') body = JSON.stringify(snapshot);
      // Static-reader fixtures disable relays and grant fictional publisher reuse permissions.
      else if (file === 'relay-config.js') body = 'export default {enabled:false};';
      else if (file.endsWith('.js')) body = await readerSource(file, source => file === 'news-model.js'
        ? source.replace("text: true, summaries: source.id === 'stringer', images: source.id === 'stringer'", 'text: true, summaries: true, images: true')
        : source);
      else body = await readFile(new URL('../'+file, import.meta.url));
      res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':file.endsWith('.json')?'application/json':file.endsWith('.png')?'image/png':'text/html');
      res.end(body);
    } catch { res.writeHead(404); res.end(); }
  });
  await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));base=`http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  browser=await launchBrowser();
  await mkdir('.test-output',{recursive:true});
});
after(async()=>{await browser?.close();if(server)await new Promise<void>(resolve=>{server.close(() => resolve());server.closeAllConnections();});});
async function pageAt(path='/',width=1280){const page=await browser.newPage({viewport:{width,height:1000}});page.on('pageerror',error=>errors.push(error.message));await mockStoryImages(page);await page.clock.install();await page.goto(base+path);await page.waitForSelector('#stringer-news article');return page;}
async function poll(page: Page) {
  const response = page.waitForResponse('**/data/news.json');
  await page.clock.fastForward(300_000);
  await response;
  await page.waitForFunction(()=>document.querySelector<HTMLElement>('#world-news')!.getAttribute('aria-busy')==='false');
}
async function assertDesktopBalance(page: Page) {
  await page.waitForFunction(() => {
    const cards = [...document.querySelectorAll<HTMLElement>('#world-news article')];
    const visible = cards.filter(card => !(card as HTMLElement).hidden);
    const last = visible.at(-1);
    if (!last) return false;
    const bottom = document.querySelector<HTMLElement>('#stringer-news')!.getBoundingClientRect().bottom;
    const rect = last.getBoundingClientRect();
    return rect.bottom <= bottom + rect.height + 1 && (visible.length === cards.length || rect.bottom >= bottom - 1);
  });
  const counts = await page.locator('#world-news article').evaluateAll(cards => ({
    total: cards.length, visible: cards.filter(card => !(card as HTMLElement).hidden).length,
    tailOnly: cards.every((card, index) => !(card as HTMLElement).hidden || cards.slice(index).every(next => (next as HTMLElement).hidden)),
  }));
  assert.ok(counts.visible > 0);
  assert.equal(counts.tailOnly, true);
  return counts;
}
test('all sources remain enabled without a source selector after polling and reload', async () => {
  for (const width of [375, 1280]) {
    const page = await pageAt('/', width);
    const stringer = await page.locator('#stringer-news').innerHTML();
    assert.equal(await page.locator('#source-picker').count(), 0);
    const sources = () => page.locator('#global-newswire article .source').allTextContents();
    assert.deepEqual(new Set(await sources()), new Set(SOURCES.filter(s => s.id !== 'stringer').map(s => s.name)));
    await poll(page);
    assert.deepEqual(new Set(await sources()), new Set(SOURCES.filter(s => s.id !== 'stringer').map(s => s.name)));
    assert.equal(await page.locator('#stringer-news').innerHTML(), stringer);
    await page.reload(); await page.waitForSelector('#stringer-news article');
    assert.equal(await page.locator('#source-picker').count(), 0);
    assert.deepEqual(new Set(await sources()), new Set(SOURCES.filter(s => s.id !== 'stringer').map(s => s.name)));
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.close();
  }
});
test('mobile headings stay bold and readable without downloaded fonts', async () => {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await mockStoryImages(page);
  await page.route('https://fonts.googleapis.com/**', route => route.abort());
  await page.route('https://fonts.gstatic.com/**', route => route.abort());
  await page.goto(base);
  await page.waitForSelector('#stringer-news article');
  for (const selector of ['h1', '#world-title', '#world-news h3', '#stringer-news h3']) {
    const style = await page.locator(selector).first().evaluate(element => {
      const css = getComputedStyle(element);
      return { family: css.fontFamily, weight: css.fontWeight };
    });
    assert.doesNotMatch(style.family, /Montserrat|Barlow/);
    assert.equal(style.weight, '700');
  }
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await page.close();
});
test('old source preferences and unavailable storage cannot hide publishers', async () => {
  for (const saved of ['{bad', '{}', '[null]', '["retired-source"]', '["bbc","nyt","aljazeera","dw","cna"]', 'blocked']) {
    const page = await browser.newPage(); await mockStoryImages(page);
    await page.addInitScript(value => {
      if (value === 'blocked') {
        Storage.prototype.getItem = Storage.prototype.setItem = () => { throw new Error('Storage unavailable'); };
      } else localStorage.setItem('stringer-disabled-sources-v1', value);
    }, saved);
    await page.goto(base); await page.waitForSelector('#stringer-news article');
    assert.equal(await page.locator('#source-picker').count(), 0);
    assert.deepEqual(new Set(await page.locator('#global-newswire article .source').allTextContents()), new Set(SOURCES.filter(s => s.id !== 'stringer').map(s => s.name)));
    await page.close();
  }
});
test('legacy static collections still show CNA unavailable without a source selector', async () => {
  const page = await browser.newPage(); await mockStoryImages(page);
  const legacy = structuredClone(snapshot); Reflect.deleteProperty(legacy.sources, 'cna');
  await page.route('**/data/news.json', route => route.fulfill({json:legacy}));
  await page.goto(base); await page.waitForSelector('#stringer-news article');
  assert.match((await page.locator('#world-status').textContent())!, /CNA: refresh unavailable/);
  assert.equal(await page.locator('#source-picker').count(), 0);
  await page.close();
});
test('news timestamps use the browser time zone and visibly label it', async () => {
  for (const timezoneId of ['America/New_York', 'Asia/Tokyo']) {
    const page = await browser.newPage({ locale: 'en-US', timezoneId });
    await mockStoryImages(page);
    await page.route('**/news-model.js', async route=>route.fulfill({contentType:'text/javascript',body:await readerSource('news-model.js')}));
    await page.goto(base);
    const time = page.locator('#world-news time').first();
    await time.waitFor();
    const timestamp = await time.getAttribute('datetime');
    const expected = new Intl.DateTimeFormat('en-US', { timeZone: timezoneId, year:'numeric', month:'short', day:'numeric', hour:'2-digit', minute:'2-digit', hour12:true, timeZoneName:'short' }).format(new Date(timestamp!));
    assert.equal(await time.textContent(), expected);
    assert.equal(await time.getAttribute('title'), `Local time (${timezoneId})`);
    await page.close();
  }
});
test('Stringer lead image has the same thumbnail size as other stories', async () => {
  for (const width of [1280, 768]) {
    const page = await pageAt('/', width);
    assert.equal(await page.locator('.feed-status:visible').count(), 0);
    const maisStory = page.locator('#stringer-news article').filter({hasText:'Mais Katt'});
    assert.equal(await maisStory.locator('.story-placeholder').count(), 0);
    assert.match((await maisStory.locator('img').getAttribute('src'))!, /syria-3talawjYJe7gOOcj\.png$/);
    const images = page.locator('#stringer-news .story-media img');
    const first = await images.first().boundingBox();
    assert.ok(first);
    for (const image of await images.all()) {
      const box = await image.boundingBox();
      assert.ok(box);
      assert.equal(first.width, box.width);
      assert.equal(first.height, box.height);
    }
    assert.ok(first.width <= 112);
    await page.close();
  }
});
test('desktop, 768px, and mobile layouts render two populated columns without overflow',async()=>{
  for(const width of [1280,768,375]){
    const page=await pageAt('/',width);assert.equal(await page.locator('#courageous-stories article').count(),24);assert.equal(await page.locator('#global-newswire article').count(),worldStories(snapshot).length);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    const left=await page.locator('#global-newswire').boundingBox();const right=await page.locator('#courageous-stories').boundingBox();assert.ok(left);assert.ok(right);
    if(width>=768){assert.equal(left.y,right.y);assert.ok(right.x>left.x)}else{assert.ok(right.y>left.y+left.height-1);assert.equal(await page.locator('.section-jump').isVisible(),true)}
    assert.equal(await page.locator('.social-links a').count(),5);
    await page.screenshot({path:`.test-output/news-${width}.png`,fullPage:false});await page.locator('footer').screenshot({path:`.test-output/footer-${width}.png`});await page.close();
  }
  assert.deepEqual(errors,[]);
});
test('relative assets and JSON work at /stringer-news/ and a domain root',async()=>{
  for(const path of ['/','/stringer-news/']){const page=await pageAt(path);assert.equal(await page.locator('#world-news article').count(),worldStories(snapshot).length);assert.equal(await page.locator('.main-nav [aria-current]').getAttribute('href'),'./');await page.close();}
});
test('mobile previews five stories per section and preserves independent choices through refresh and resizing', async () => {
  const page = await pageAt('/', 375);
  const more = page.locator('#world-more');
  assert.equal(await page.getByRole('button', { name: 'Show more headlines', exact: true }).count(), 1);
  const courageous = page.locator('#stringer-more');
  const visibleCount = (id: string) => page.locator(`#${id} article:visible`).count();
  const urls = (id: string) => page.locator(`#${id} .story-body > a`).evaluateAll(links => links.map(link => (link as HTMLAnchorElement).href));
  assert.equal(await visibleCount('world-news'), 5);
  assert.equal(await visibleCount('stringer-news'), 5);
  assert.deepEqual((await urls('world-news')).slice(0, 5), worldStories(snapshot).slice(0, 5).map(story => story.url));
  assert.equal(await more.getAttribute('aria-controls'), 'world-news');
  assert.equal(await courageous.getAttribute('aria-controls'), 'stringer-news');
  const original = await urls('world-news');
  const originalStringer = await urls('stringer-news');
  const positions = await page.locator('#world-news article').evaluateAll(cards => cards.slice(0, 5).map(card => (card as HTMLElement).offsetTop));
  for (const height of [812, 600, 667, 1000]) {
    await page.setViewportSize({ width: 375, height });
    await page.evaluate(() => window.scrollTo(0, 300));
    assert.equal(await visibleCount('world-news'), 5);
    assert.equal(await visibleCount('stringer-news'), 5);
    assert.deepEqual(await page.locator('#world-news article').evaluateAll(cards => cards.slice(0, 5).map(card => (card as HTMLElement).offsetTop)), positions);
    assert.deepEqual(await urls('world-news'), original);
  }
  await more.focus(); await page.keyboard.press('Enter');
  assert.equal(await more.getAttribute('aria-expanded'), 'true');
  assert.equal(await visibleCount('world-news'), original.length);
  assert.equal(await visibleCount('stringer-news'), 5);
  await courageous.focus(); await page.keyboard.press('Space');
  assert.equal(await visibleCount('stringer-news'), 24);
  await poll(page);
  assert.equal(await more.getAttribute('aria-expanded'), 'true');
  assert.equal(await courageous.getAttribute('aria-expanded'), 'true');
  assert.deepEqual(await urls('world-news'), original);
  assert.deepEqual(await urls('stringer-news'), originalStringer);
  await more.click();
  assert.equal(await visibleCount('world-news'), 5);
  assert.equal(await visibleCount('stringer-news'), 24);
  await page.setViewportSize({ width: 768, height: 1000 });
  await page.waitForFunction(() => document.querySelector<HTMLElement>('#world-more')!.hidden);
  await assertDesktopBalance(page);
  assert.equal(await visibleCount('stringer-news'), 24);
  assert.equal(await courageous.isVisible(), false);
  await page.setViewportSize({ width: 375, height: 667 });
  await page.waitForFunction(() => !document.querySelector<HTMLElement>('#world-more')!.hidden);
  assert.equal(await visibleCount('world-news'), 5);
  assert.equal(await visibleCount('stringer-news'), 24);
  await courageous.click();
  assert.equal(await visibleCount('stringer-news'), 5);
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await page.locator('#global-newswire').scrollIntoViewIfNeeded();
  await page.screenshot({ path: '.test-output/mobile-reader.png' });
  await page.close();
});

test('mobile controls disappear for short or empty collections and failures retain expanded stories', async () => {
  const page = await pageAt('/', 375);
  await page.locator('#world-more').click();
  await page.route('**/data/news.json', route => route.fulfill({ status: 503, body: 'Unavailable' }));
  await poll(page);
  assert.equal(await page.locator('#world-news article:visible').count(), worldStories(snapshot).length);
  assert.equal(await page.locator('#world-more').getAttribute('aria-expanded'), 'true');
  for (const count of [5, 3, 0]) {
    const data = structuredClone(snapshot);
    for (const source of SOURCES) data.sources[source.id].stories = source.id === 'bbc' || source.id === 'stringer' ? data.sources[source.id].stories.slice(0, count) : [];
    if (!count) Object.assign(data.sources.stringer, { status: 'failure', lastSuccessAt: null, error: 'Unavailable' });
    await page.route('**/data/news.json', route => route.fulfill({ json: data }));
    await poll(page);
    assert.equal(await page.locator('#world-more').isVisible(), false);
    assert.equal(await page.locator('#stringer-more').isVisible(), false);
    assert.equal(await page.locator('#world-news article:visible').count(), count);
    assert.equal(await page.locator('#stringer-news article:visible').count(), count);
    if (!count) assert.match(await page.locator('#world-news').innerText(), /No headlines available/);
  }
  await page.close();
});

test('each page load shuffles the full Stringer list and polling preserves its order', async()=>{
  const page=await browser.newPage();
  await mockStoryImages(page);
  await page.clock.install();
  await page.addInitScript(()=>{
    const visits=Number(sessionStorage.getItem('shuffle-test-visits') || 0);
    sessionStorage.setItem('shuffle-test-visits', String(visits+1));
    let seed=visits+1;
    Math.random=()=>((seed=(seed*16807)%2147483647)/2147483647);
  });
  const urls=()=>page.locator('#stringer-news article a').evaluateAll(links=>links.map(a=>(a as HTMLAnchorElement).href));
  const expected=snapshot.sources.stringer.stories.map(story=>story.url).sort();
  await page.goto(base); await page.waitForSelector('#stringer-news article');
  const first=await urls();
  assert.deepEqual([...first].sort(), expected);
  await poll(page); assert.deepEqual(await urls(), first);
  await page.reload(); await page.waitForSelector('#stringer-news article');
  const second=await urls();
  assert.deepEqual([...second].sort(), expected);
  assert.notDeepEqual(second, first);
  await page.close();
});
test('automatic refresh of the same snapshot stays quiet and preserves publication timestamps',async()=>{
  const page=await pageAt();const status=await page.locator('#world-news time').allTextContents();await poll(page);assert.equal(await page.locator('#refresh-status').textContent(),'');
  assert.deepEqual(await page.locator('#world-news time').allTextContents(),status);assert.equal(await page.locator('#world-status').textContent(),'');await page.close();
});
test('failed browser refresh retains displayed stories; first-load failure is visible',async()=>{
  const page=await pageAt();await page.route('**/data/news.json',route=>route.fulfill({status:503,body:'Unavailable'}));await poll(page);await page.waitForFunction(()=>document.querySelector<HTMLElement>('#refresh-status')!.textContent.includes('Could not check'));
  assert.equal(await page.locator('#stringer-news article').count(),24);assert.equal(await page.locator('#world-news').getAttribute('aria-busy'),'false');
  await page.reload();await page.waitForFunction(()=>document.querySelector<HTMLElement>('#world-status')!.textContent==='Headlines unavailable.');assert.equal(await page.locator('#world-news article').count(),0);await page.close();
});
test('partial relay refresh preserves displayed stories and keeps source failures visible', async () => {
  const cached = structuredClone(snapshot);
  const partial = structuredClone(snapshot);
  partial.generatedAt = new Date(Date.parse(snapshot.generatedAt) + 60_000).toISOString();
  partial.sources.bbc.stories = partial.sources.bbc.stories.slice(0, 1);
  partial.sources.bbc.unavailable = 2;
  partial.sources.bbc.attemptedAt = partial.generatedAt;
  partial.sources.bbc.lastSuccessAt = partial.generatedAt;
  partial.sources.stringer.stories = [];
  partial.sources.stringer.status = 'failure';
  partial.sources.stringer.lastSuccessAt = null;
  partial.sources.stringer.error = 'Published stories temporarily unavailable from relays';
  partial.sources.stringer.unavailable = cached.sources.stringer.stories.length;
  const page = await browser.newPage();
  await page.clock.install();
  await mockStoryImages(page);
  await page.route('**/relay-config.js*', route => route.fulfill({
    contentType: 'text/javascript',
    body: `export default { enabled: true, pubkey: "${'a'.repeat(64)}", relays: ["wss://relay.example"] };`,
  }));
  await page.route('**/relay-reader.js*', route => route.fulfill({
    contentType: 'text/javascript',
    body: `export function cachedRelaySnapshot() { return ${JSON.stringify(cached)}; }\n` +
      `let calls = 0; export async function readRelaySnapshot(_config, _report, onSnapshot) { if (calls++) return ${JSON.stringify({ ...cached, generatedAt: partial.generatedAt, sources: { ...cached.sources, bbc: { ...partial.sources.bbc, unavailable: 0 } } })}; const partial = ${JSON.stringify(partial)}; Object.freeze(partial.sources); for (const source of Object.values(partial.sources)) Object.freeze(source); onSnapshot(partial); throw new Error('relay timeout'); }`,
  }));
  await page.goto(base);
  await page.waitForFunction(() => document.querySelector<HTMLElement>('#world-news')!.getAttribute('aria-busy') === 'false');
  assert.equal(await page.locator('#world-news article').count(), worldStories(cached).length);
  assert.equal(await page.locator('#stringer-news article').count(), cached.sources.stringer.stories.length);
  assert.match((await page.locator('#relay-status-details').textContent())!, /BBC World · 2 unavailable/);
  assert.match(await page.locator('#stringer-status').innerText(), /Stringer: refresh unavailable\. Showing previously collected stories/);
  const retainedDate = await page.evaluate(async value => {
    const entry = '/news-model.js';
    const { formatLocalDateTime } = await import(entry);
    return formatLocalDateTime(value);
  }, cached.sources.bbc.lastSuccessAt!);
  const details = await page.locator('#relay-status-details').textContent();
  assert.ok(details!.includes(`BBC World · Showing ${cached.sources.bbc.stories.length} previously collected stories from ${retainedDate}.`), details!);
  await page.clock.fastForward(300_000);
  await page.waitForFunction(() => document.querySelector('#refresh-status')!.textContent === '');
  assert.doesNotMatch(await page.locator('#relay-status-details').innerText(), /previously collected stories/);
  assert.equal(await page.locator('#world-news article').count(), worldStories({ ...cached, sources: { ...cached.sources, bbc: partial.sources.bbc } }).length);
  await page.close();
});
test('failures and empty news remain visible without collection timestamps',async()=>{
  const page=await browser.newPage();await mockStoryImages(page);await page.clock.install({time:new Date(Date.parse(snapshot.generatedAt)+3*60*60*1000)});let changed=structuredClone(snapshot);
  for(const s of SOURCES){changed.sources[s.id].status='failure';changed.sources[s.id].error='Unavailable';}
  await page.route('**/data/news.json',route=>route.fulfill({json:changed}));await page.goto(base);await page.waitForSelector('#stringer-news article');assert.match(await page.locator('#world-status').innerText(),/refresh unavailable.*Showing previously collected stories/);
  changed=structuredClone(snapshot);for(const s of SOURCES.filter(s=>s.id!=='stringer'))changed.sources[s.id].stories=[];
  await poll(page);await page.waitForSelector('#world-news .empty');assert.equal(await page.locator('#world-status').textContent(),'');
  await page.clock.fastForward(30_000);assert.equal(await page.locator('#stringer-status').textContent(),'');assert.doesNotMatch(await page.locator('body').innerText(),/last collected|over two hours old/);await page.close();
});
test('oversized snapshot responses preserve the last displayed collection', async () => {
  const page = await pageAt();
  const previous = await page.locator('#world-news h3').allTextContents();
  await page.route('**/data/news.json', route => route.fulfill({
    contentType: 'application/json', body: JSON.stringify({ ...snapshot, padding: 'x'.repeat(5_000_001) }),
  }));
  await poll(page);
  assert.match(await page.locator('#refresh-status').innerText(), /Could not check for updates/);
  assert.deepEqual(await page.locator('#world-news h3').allTextContents(), previous);
  await page.close();
});
test('malicious snapshot is rejected and remote markup is rendered as text',async()=>{
  const page=await pageAt();const bad=structuredClone(snapshot);bad.sources.stringer.stories[0]!.url='javascript:alert(1)';await page.route('**/data/news.json',route=>route.fulfill({json:bad}));await poll(page);await page.waitForFunction(()=>document.querySelector<HTMLElement>('#refresh-status')!.textContent.includes('Could not check'));assert.equal(await page.locator('#stringer-news article').count(),24);
  bad.sources.stringer.stories[0]!.url='https://example.org/story';bad.sources.stringer.stories[0]!.publicationSource='https://example.org/story';bad.sources.stringer.stories[0]!.title='<img src=x onerror=alert(1)>';await poll(page);await page.waitForFunction(()=>[...document.querySelectorAll<HTMLElement>('#stringer-news h3')].some(el=>el.textContent.startsWith('<img')));
  assert.equal(await page.locator('#stringer-news img[src="x"]').count(),0);await page.close();
});
test('visible polling, hidden-page pause, visibility catch-up, and overlap prevention',async()=>{
  const page=await browser.newPage();await mockStoryImages(page);await page.clock.install();let requests=0;let release: (() => void) | null | undefined;
  await page.route('**/data/news.json',async route=>{requests++;if(release!==undefined)await new Promise<void>(resolve=>release=resolve);await route.fulfill({json:snapshot});});
  await page.goto(base);await page.waitForSelector('#world-news article');assert.equal(requests,1);
  await page.clock.fastForward(300_000);await page.waitForFunction(()=>document.querySelector<HTMLElement>('#world-news')!.getAttribute('aria-busy')==='false');assert.equal(requests,2);
  await page.evaluate(()=>Object.defineProperty(document,'hidden',{configurable:true,get() { return true; }}));await page.clock.fastForward(600_000);assert.equal(requests,2);
  await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,get() { return false; }});document.dispatchEvent(new Event('visibilitychange'))});await page.waitForFunction(()=>document.querySelector<HTMLElement>('#world-news')!.getAttribute('aria-busy')==='false');assert.equal(requests,3);
  release=null;await page.clock.fastForward(300_000);await page.waitForTimeout(25);assert.equal(requests,4);await page.evaluate(()=>{document.dispatchEvent(new Event('visibilitychange'));document.dispatchEvent(new Event('visibilitychange'))});await page.clock.fastForward(1000);assert.equal(requests,4);assert.equal(await page.locator('#world-news').getAttribute('aria-busy'),'true');const completeRequest = release as (() => void) | null;assert.ok(completeRequest);completeRequest();await page.waitForFunction(()=>document.querySelector<HTMLElement>('#world-news')!.getAttribute('aria-busy')==='false');await page.close();
});
test('keyboard navigation and requested removals',async()=>{
  const page=await pageAt();await page.keyboard.press('Tab');assert.equal(await page.locator('.skip-link').evaluate(el=>el===document.activeElement),true);await page.keyboard.press('Enter');await page.waitForURL(/#main$/);assert.match(page.url(),/#main$/);
  assert.equal(await page.locator('#reporter-filter,.topics,#reporter-directory,#refresh,.refresh-control').count(),0);assert.doesNotMatch(await page.locator('body').innerText(),/Nostr|Mastodon|About Nostr|All sources/);
  assert.equal(await page.locator('#world-news article a').first().getAttribute('rel'),'noopener noreferrer');await page.close();
});

interface Branding { source: string; colors: Record<'ink' | 'accent' | 'navHover' | 'white', string>; desktop: { logoWidth: number; logoHeight: number; headerMaxWidth: number; logoLeftInset: number; buttonRightInset: number; navFontSize: string; navFontWeight: string; iconSize: number; buttonFontSize: string; buttonRadius: string; buttonPadding: string }; mobile: { breakpoint: number; headerHeight: number; logoLeftInset: number; logoWidth: number; logoHeight: number } }
const branding: Branding = JSON.parse(await readFile(new URL('./fixtures/branding.json', import.meta.url), 'utf8'));
const cssValue = (locator: Locator, property: keyof CSSStyleDeclaration) => locator.evaluate((el, prop) => String(getComputedStyle(el)[prop]), property);
test('Stringer logo is visible, loaded, correctly sized, and linked on desktop and mobile', async () => {
  for (const [width, expected] of [[1440, branding.desktop], [375, branding.mobile]] as const) {
    const page = await pageAt('/', width);
    const logo = page.locator('header .brand img');
    assert.equal(await logo.isVisible(), true);
    assert.equal(await logo.evaluate(el => (el as HTMLImageElement).complete && (el as HTMLImageElement).naturalWidth > 0), true);
    const box = await logo.boundingBox();
    assert.ok(box);
    assert.equal(box.width, expected.logoWidth); assert.equal(box.height, expected.logoHeight);
    assert.equal(await page.locator('header .brand').getAttribute('href'), branding.source);
    assert.equal(await page.locator('footer img').evaluate(el => (el as HTMLImageElement).complete && (el as HTMLImageElement).naturalWidth > 0), true);
    await page.close();
  }
});
test('favicons load as correctly sized images at the domain root and project path', async () => {
  for (const path of ['/', '/stringer-news/']) {
    const page = await pageAt(path);
    for (const size of [16, 32, 192, 180]) {
      const selector = size === 180 ? 'link[rel="apple-touch-icon"]' : `link[rel="icon"][sizes="${size}x${size}"]`;
      const url = await page.locator(selector).evaluate(el => (el as HTMLAnchorElement).href);
      assert.equal(new URL(url).pathname, `${path}assets/favicon-${size}.png`);
      const response = await page.request.get(url);
      assert.equal(response.status(), 200);
      const image = await response.body();
      assert.equal(image.readUInt32BE(16), size); assert.equal(image.readUInt32BE(20), size);
    }
    await page.close();
  }
});
test('header and footer use main-site type sizes, colours, and hover treatments', async () => {
  const page = await pageAt('/', 1440);
  const nav = page.locator('.main-nav a').filter({ hasText: /^Mission$/ });
  assert.match(await cssValue(nav, 'fontFamily'), /Barlow/);
  assert.equal(await cssValue(nav, 'fontSize'), branding.desktop.navFontSize);
  assert.equal(await cssValue(nav, 'fontWeight'), branding.desktop.navFontWeight);
  assert.equal(await cssValue(nav, 'color'), branding.colors.ink);
  await nav.hover(); assert.equal(await cssValue(nav, 'color'), branding.colors.navHover);
  const icon = page.locator('.social-links a').first();
  assert.equal(await cssValue(icon, 'color'), branding.colors.ink);
  assert.equal((await icon.locator('svg').boundingBox())!.width, branding.desktop.iconSize);
  await icon.hover(); assert.equal(await cssValue(icon, 'color'), branding.colors.accent);
  for (const location of ['header', 'footer']) {
    const button = page.locator(`${location} .donate`);
    assert.equal(await cssValue(button, 'backgroundColor'), branding.colors.ink);
    assert.equal(await cssValue(button, 'color'), branding.colors.white);
    assert.match(await cssValue(button, 'fontFamily'), /Montserrat/);
    assert.equal(await cssValue(button, 'fontSize'), branding.desktop.buttonFontSize);
    assert.equal(await cssValue(button, 'borderRadius'), branding.desktop.buttonRadius);
    assert.equal(await cssValue(button, 'padding'), branding.desktop.buttonPadding);
    await button.hover(); assert.equal(await cssValue(button, 'backgroundColor'), branding.colors.accent);
    assert.equal(await cssValue(button, 'color'), branding.colors.white);
  }
  assert.equal(await cssValue(page.locator('.footer-appeal'), 'fontSize'), '16px');
  assert.equal(await cssValue(page.locator('.nonprofit'), 'fontSize'), '15px');
  await page.close();
});

test('header positions match the main site and the mobile menu preserves navigation', async () => {
  for (const width of [1440, 1280, 1024, 375]) {
    const page = await pageAt('/', width);
    const logo = await page.locator('.brand').boundingBox();
    assert.ok(logo);
    if (width > branding.mobile.breakpoint) {
      const inset = Math.max(0, (width - branding.desktop.headerMaxWidth) / 2);
      assert.equal(logo.x, inset + branding.desktop.logoLeftInset);
      const button = await page.locator('header .donate').boundingBox();
      assert.ok(button);
      assert.equal(button.x + button.width, width - inset - branding.desktop.buttonRightInset);
      assert.equal(button.y, 65);
    } else {
      assert.equal(logo.x, branding.mobile.logoLeftInset);
      assert.equal((await page.locator('header').boundingBox())!.height, branding.mobile.headerHeight);
      assert.equal(await page.locator('.main-nav').isVisible(), false);
      const toggle = page.getByRole('button', {name: 'Open menu', exact: true});
      await toggle.click();
      assert.equal(await page.locator('.main-nav').isVisible(), true);
      assert.equal(await page.locator('.header-menu-toggle').getAttribute('aria-expanded'), 'true');
      assert.equal(await cssValue(page.locator('.main-nav a').first(), 'fontSize'), '16px');
      await page.keyboard.press('Escape');
      assert.equal(await page.locator('.main-nav').isVisible(), false);
      assert.equal(await page.locator('.header-menu-toggle').evaluate(el => el === document.activeElement), true);
    }
    const links = await page.locator('.social-links a').evaluateAll(els => els.map(el => el.getAttribute('aria-label')));
    assert.deepEqual(links, ['Stringer on Nostr via Primal', 'Stringer on Instagram', 'Stringer on LinkedIn', 'Stringer on X', 'Stringer on YouTube']);
    await page.close();
  }
});

test('desktop balances individual headlines without grouping or subscription labels', async () => {
  const page = await pageAt('/', 1280);
  const data = structuredClone(snapshot);
  for (const source of SOURCES.filter(source => source.id !== 'stringer'))
    for (const story of data.sources[source.id].stories) story.clusterId = 'shared-event';
  await page.route('**/news-model.js', async route => route.fulfill({ contentType: 'text/javascript', body: await readerSource('news-model.js', source => source.replace('headlineOnly: sourceId', 'clusterId: story.clusterId, headlineOnly: sourceId')) }));
  await page.route('**/data/news.json', route => route.fulfill({ json: data }));
  await page.reload();
  await page.waitForSelector('#world-news article');
  for (const width of [1280, 768, 375, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.waitForFunction(mobile => document.querySelector<HTMLElement>('#world-more')!.hidden === !mobile, width < 768);
    const cards = page.locator('#world-news article:visible');
    if (width < 768) assert.equal(await cards.count(), 5);
    else await assertDesktopBalance(page);
    assert.equal(await page.locator('.group-articles,.subscription-warning').count(), 0);
    assert.doesNotMatch(await page.locator('body').innerText(), /May require subscription|View \d+ articles/);
    const links = await cards.locator('.story-body > a').evaluateAll(els => els.map(el => (el as HTMLAnchorElement).href));
    assert.equal(new Set(links).size, links.length);
  }
  await page.close();
});
test('desktop newswire tracks the reporting column through resize, content changes and refresh', async () => {
  const page = await pageAt('/', 1280);
  const data = structuredClone(snapshot);
  for (const source of SOURCES.filter(source => source.id !== 'stringer')) {
    const story = data.sources[source.id].stories[0]!;
    data.sources[source.id].stories = Array.from({ length: 30 }, (_, index) => ({
      ...story, title: `Synthetic ${source.id} fixture ${index}`, summary: '', image: null,
      url: `https://example.test/${source.id}/${index}`,
    }));
  }
  data.sources.stringer.stories = data.sources.stringer.stories.slice(0, 3);
  await page.route('**/data/news.json', route => route.fulfill({ json: data }));
  await page.reload();
  await page.waitForSelector('#stringer-news article');
  for (const width of [1280, 768, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    const counts = await assertDesktopBalance(page);
    assert.equal(counts.total, 150);
    assert.ok(counts.visible < counts.total);
    assert.equal(await page.locator('#world-more').isVisible(), false);
  }
  const before = await page.locator('#world-news article:visible').count();
  await page.locator('#stringer-news .summary').first().evaluate(node => { node.textContent += ' Synthetic longer reporting fixture.'.repeat(100); });
  await page.waitForFunction(count => document.querySelectorAll<HTMLElement>('#world-news article:not([hidden])').length > count, before);
  await assertDesktopBalance(page);
  await poll(page);
  await assertDesktopBalance(page);
  await page.setViewportSize({ width: 375, height: 800 });
  await page.waitForFunction(() => !document.querySelector<HTMLElement>('#world-more')!.hidden);
  assert.equal(await page.locator('#world-news article:visible').count(), 5);
  await page.locator('#world-more').click();
  assert.equal(await page.locator('#world-news article:visible').count(), 150);
  await page.close();
});

test('story images load lazily, preserve attribution, and fall back to a circle on failure', async () => {
  const page = await pageAt('/');
  assert.equal(await page.locator('#stringer-news .story-media img').count(), 24);
  assert.equal(await page.locator('#stringer-news .story-media img').nth(1).getAttribute('loading'), 'lazy');
  const first = page.locator('#stringer-news article').first();
  const firstUrl = await first.locator('a').getAttribute('href');
  const firstStory = snapshot.sources.stringer.stories.find(story => story.url === firstUrl);
  assert.ok(firstStory);
  await first.locator('img').evaluate(el=>el.dispatchEvent(new Event('error')));
  assert.match((await first.locator('img').getAttribute('src'))!, /^\.\/assets\/stringer-thumbnails\/.+\.png$/);
  await first.locator('img').evaluate(el=>el.dispatchEvent(new Event('error')));
  assert.equal(await first.locator('img').count(), 0);assert.equal(await first.locator('.story-placeholder').count(), 1);
  assert.equal(await first.locator('h3').textContent(), firstStory.title);
  assert.equal(await first.locator('.credits').textContent(), firstStory.credits);
  assert.equal(await first.evaluate(el=>el.classList.contains('with-image')), true);
  await page.close();
});

test('reader hides publisher thumbnails and preserves Stringer photos', async () => {
  const page = await browser.newPage();
  await mockStoryImages(page);
  const imageRequests: string[] = [];
  page.on('request', request=> { if(request.resourceType()==='image') imageRequests.push(request.url()); });
  await page.route('**/news-model.js', async route=>route.fulfill({contentType:'text/javascript',body:await readerSource('news-model.js')}));
  await page.goto(base + '/');
  await page.waitForSelector('#stringer-news article');
  assert.ok(await page.locator('#world-news article').count() > 0);
  assert.equal(await page.locator('#world-news .summary').count(),0);
  assert.ok(await page.locator('#world-news time').count() > 0);
  assert.equal(await page.locator('#stringer-news time').count(),24);
  assert.ok(await page.locator('#world-news .source').count() > 0);
  assert.equal(await page.locator('#world-news article a').first().getAttribute('rel'),'noopener noreferrer');
  assert.equal(await page.locator('#world-news img').count(), 0);
  assert.equal(await page.locator('#stringer-news img').count(),24);
  assert.equal(await page.locator('#stringer-news article').count(),24);
  const sourceImages = new Set(Object.values(snapshot.sources).flatMap(source=>source.stories.flatMap(story=>story.image ? [story.image.url] : [])));
  assert.ok(imageRequests.every(url=>url.startsWith(base) || sourceImages.has(url)), 'Only configured source photos are requested');
  for (const width of [1280,375]) {
    await page.setViewportSize({width,height:1000});
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  }
  await page.close();
});

test('Stringer dates preserve precision, use local zones for instants, and show unavailable dates honestly', async()=>{
  for (const timezoneId of ['America/New_York','Asia/Tokyo']) {
    const page=await browser.newPage({locale:'en-US',timezoneId}); await mockStoryImages(page);
    const data=structuredClone(snapshot);
    data.sources.stringer.stories[0]!.publishedAt='2025-11-05T23:30:00.000Z';
    data.sources.stringer.stories[0]!.publicationSource=data.sources.stringer.stories[0]!.url;
    data.sources.stringer.stories[1]!.publicationDate='2025-11-05';
    data.sources.stringer.stories[1]!.publicationSource=data.sources.stringer.stories[1]!.url;
    const gazaStory=data.sources.stringer.stories.find(story=>story.title==='Gaza Under Bombardment');
    assert.ok(gazaStory);
    gazaStory.publicationDate=null;
    gazaStory.publishedAt=null;
    gazaStory.publicationSource=null;
    await page.route('**/data/news.json',route=>route.fulfill({json:data}));
    await page.goto(base); await page.waitForSelector('#stringer-news article');
    const cards=data.sources.stringer.stories.map(story=>page.locator('#stringer-news article').filter({has:page.locator('h3', {hasText:story.title})}));
    const gazaCard=page.locator('#stringer-news article').filter({has:page.locator('h3', {hasText:'Gaza Under Bombardment'})});
    assert.equal(await gazaCard.locator('time').getAttribute('datetime'),'2025-07-29');
    const expected=new Intl.DateTimeFormat('en-US',{timeZone:timezoneId,year:'numeric',month:'short',day:'numeric',hour:'2-digit',minute:'2-digit',hour12:true,timeZoneName:'short'}).format(new Date(data.sources.stringer.stories[0]!.publishedAt));
    assert.equal(await cards[0]!.locator('time').textContent(),expected);
    assert.equal(await cards[1]!.locator('time').textContent(),'Nov 5, 2025');
    assert.equal(await cards[1]!.locator('time').getAttribute('datetime'),'2025-11-05');
    assert.equal(await cards[2]!.locator('time').count(),1);
    await page.close();
  }
});

test('publisher photos stay hidden for all query parameters after polling', async () => {
  for (const path of ['/', '/?images', '/?other=images', '/?Images', '/stringer-news/', '/stringer-news/?other=1&images']) {
    const page = await browser.newPage({ viewport: { width: 375, height: 812 } });
    await mockStoryImages(page);
    await page.clock.install();
    const publisherUrls = new Set(SOURCES.filter(source => source.id !== 'stringer')
      .flatMap(source => snapshot.sources[source.id].stories.flatMap(story => story.image ? [story.image.url] : [])));
    const requested: string[] = [];
    page.on('request', request => { if (publisherUrls.has(request.url())) requested.push(request.url()); });
    await page.goto(base + path);
    await page.waitForSelector('#stringer-news article');
    assert.equal(await page.locator('#global-newswire img').count(), 0);
    assert.equal(await page.locator('#stringer-news img').count(), 24);
    await poll(page);
    assert.equal(await page.locator('#global-newswire img').count(), 0);
    assert.deepEqual(requested, []);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.close();
  }
});
