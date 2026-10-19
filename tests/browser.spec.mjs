import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { launchBrowser } from '../scripts/browser.mjs';
import { SOURCES, worldStories } from '../news-model.js';
import { collect, snapshotUrl } from '../scripts/collect.mjs';
let server, browser, base, snapshot;
const thumbnail = await readFile(new URL('../assets/favicon-192.png', import.meta.url));
async function mockStoryImages(page) {
  await page.route('**/*', route => route.request().resourceType() === 'image' && !route.request().url().startsWith(base)
    ? route.fulfill({body:thumbnail,contentType:'image/png'}) : route.continue());
}
const testPermissions = Object.fromEntries(SOURCES.map(s=>[s.id,{text:true,summaries:true,images:true}]));
const errors = [];
before(async()=>{
  const fixtures=Object.fromEntries(await Promise.all(SOURCES.map(async s=>[s.id,await readFile(new URL(`./fixtures/${s.id==='stringer'?'stringer.html':s.id+'.xml'}`,import.meta.url),'utf8')])));
  snapshot=await collect({permissions:testPermissions,pagesUrl:'https://example.org/',log:()=>{},request:async url=>{if(url===snapshotUrl('https://example.org/'))throw new Error('First run');return fixtures[SOURCES.find(s=>s.url===url).id]}});
  server=createServer(async(req,res)=>{
    const pathname=new URL(req.url,'http://localhost').pathname.replace(/^\/stringer-news(?=\/)/,'');
    const file=pathname==='/'?'index.html':pathname.slice(1);
    if(!['index.html','app.js','reader-locales.js','portuguese-sources.js','relay-config.js','news-model.js','stringer-media.js','style.css','assets/stringer-logo.png','assets/favicon-16.png','assets/favicon-32.png','assets/favicon-192.png','assets/favicon-180.png','data/news.json'].includes(file) && !/^assets\/stringer-thumbnails\/[a-zA-Z0-9-]+\.png$/.test(file)){res.writeHead(404);res.end();return;}
    try{let body=file==='data/news.json'?JSON.stringify(snapshot):await readFile(new URL('../'+file,import.meta.url));
    // These regression tests exercise the legacy static reader; relay coverage lives in public.browser.ts.
    if(file==='relay-config.js') body='export default {enabled:false};';
    // Explicit fictional grants keep enabled-feed regression coverage independent of production policy.
    if(file==='news-model.js') body=body.toString().replace("text: true, summaries: source.id === 'stringer', images: source.id === 'stringer'", 'text: true, summaries: true, images: true');res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':file.endsWith('.json')?'application/json':file.endsWith('.png')?'image/png':'text/html');res.end(body)}catch{res.writeHead(404);res.end()}
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));base=`http://127.0.0.1:${server.address().port}`;
  browser=await launchBrowser();
  await mkdir('.test-output',{recursive:true});
});
after(async()=>{await browser?.close();if(server)await new Promise(resolve=>{server.close(resolve);server.closeAllConnections();});});
async function pageAt(path='/',width=1280){const page=await browser.newPage({viewport:{width,height:1000}});page.on('pageerror',error=>errors.push(error.message));await mockStoryImages(page);await page.clock.install();await page.goto(base+path);await page.waitForSelector('#stringer-news article');return page;}
async function poll(page) {
  const response = page.waitForResponse('**/data/news.json');
  await page.clock.fastForward(300_000);
  await response;
  await page.waitForFunction(()=>document.querySelector('#world-news').getAttribute('aria-busy')==='false');
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
  const legacy = structuredClone(snapshot); delete legacy.sources.cna;
  await page.route('**/data/news.json', route => route.fulfill({json:legacy}));
  await page.goto(base); await page.waitForSelector('#stringer-news article');
  assert.match(await page.locator('#world-status').textContent(), /CNA: refresh unavailable/);
  assert.equal(await page.locator('#source-picker').count(), 0);
  await page.close();
});
test('news timestamps use the browser time zone and visibly label it', async () => {
  for (const timezoneId of ['America/New_York', 'Asia/Tokyo']) {
    const page = await browser.newPage({ locale: 'en-US', timezoneId });
    await mockStoryImages(page);
    await page.route('**/news-model.js', async route=>route.fulfill({contentType:'text/javascript',body:await readFile(new URL('../news-model.js',import.meta.url),'utf8')}));
    await page.goto(base);
    const time = page.locator('#world-news time').first();
    await time.waitFor();
    const timestamp = await time.getAttribute('datetime');
    const expected = new Intl.DateTimeFormat('en-US', { timeZone: timezoneId, year:'numeric', month:'short', day:'numeric', hour:'2-digit', minute:'2-digit', hour12:true, timeZoneName:'short' }).format(new Date(timestamp));
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
    assert.match(await maisStory.locator('img').getAttribute('src'), /syria-3talawjYJe7gOOcj\.png$/);
    const images = page.locator('#stringer-news .story-media img');
    const first = await images.first().boundingBox();
    for (const image of await images.all()) {
      const box = await image.boundingBox();
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
    const left=await page.locator('#global-newswire').boundingBox();const right=await page.locator('#courageous-stories').boundingBox();
    if(width>=768){assert.equal(left.y,right.y);assert.ok(right.x>left.x)}else{assert.ok(right.y>left.y+left.height-1);assert.equal(await page.locator('.section-jump').isVisible(),true)}
    assert.equal(await page.locator('.social-links a').count(),5);
    await page.screenshot({path:`.test-output/news-${width}.png`,fullPage:false});await page.locator('footer').screenshot({path:`.test-output/footer-${width}.png`});await page.close();
  }
  assert.deepEqual(errors,[]);
});
test('relative assets and JSON work at /stringer-news/ and a domain root',async()=>{
  for(const path of ['/','/stringer-news/']){const page=await pageAt(path);assert.equal(await page.locator('#world-news article').count(),worldStories(snapshot).length);assert.equal(await page.locator('.main-nav [aria-current]').getAttribute('href'),'./');await page.close();}
});
test('mobile keeps courageous stories expanded, hides publisher images and preserves every headline when expanding or refreshing', async () => {
  const page = await pageAt('/', 375);
  const mobileData = structuredClone(snapshot);
  for (const source of Object.values(mobileData.sources))
    for (const story of source.stories)
      story.image = { url: 'https://images.example.org/mobile-fixture.png', alt: 'Fixture photo', credit: 'Kenny Holston/The New York Times' };
  await page.route('**/data/news.json', (route) => route.fulfill({ contentType: 'application/json', body: JSON.stringify(mobileData) }));
  await page.reload();
  await page.setViewportSize({ width: 375, height: 812 });
  await page.waitForFunction(() => document.querySelectorAll('#world-news article').length === 4);
  assert.equal(await page.locator('#stringer-news article:visible').count(), 24);
  assert.equal(await page.getByText(/More courageous stories/).count(), 0);
  assert.equal(await page.locator('#world-more-list article').count(), worldStories(snapshot).length - 4);
  assert.equal(await page.locator('#world-more').getAttribute('open'), null);
  assert.equal(await page.locator('#global-newswire img').count(), 0);
  assert.equal(await page.locator('#global-newswire h2:visible').count(), 1);
  assert.equal(await page.locator('.jump-links').count(), 0);
  const headlineColor = await page.locator('#world-title').evaluate((node) => getComputedStyle(node).color);
  const stringerColor = await page.locator('#stringer-title').evaluate((node) => getComputedStyle(node).color);
  assert.equal(headlineColor, 'rgb(161, 43, 24)');
  assert.equal(stringerColor, 'rgb(80, 44, 30)');
  const more = page.locator('#world-more summary');
  assert.equal(await more.evaluate((node) => getComputedStyle(node).color), headlineColor);
  const urls = () => page.locator('.desk .story-body > a').evaluateAll((links) => links.map((link) => link.href));
  const original = (await urls()).sort();
  assert.equal(new Set(original).size, original.length);
  await more.focus(); await page.keyboard.press('Enter');
  await page.waitForFunction(() => document.querySelector('#world-more summary').textContent === 'Show fewer headlines');
  assert.equal(await page.locator('#world-more-list article').first().isVisible(), true);
  await poll(page);
  assert.notEqual(await page.locator('#world-more').getAttribute('open'), null);
  assert.deepEqual((await urls()).sort(), original);
  await more.click();
  assert.equal(await page.locator('#stringer-news article:visible').count(), 24);
  await page.locator('#global-newswire').scrollIntoViewIfNeeded();
  await page.evaluate(() => document.activeElement.blur());
  await page.screenshot({ path: '.test-output/mobile-reader.png' });
  await page.setViewportSize({ width: 1280, height: 1000 });
  await page.waitForFunction(() => document.querySelectorAll('#world-more-list article').length === 0);
  assert.deepEqual((await urls()).sort(), original);
  await page.setViewportSize({ width: 375, height: 667 });
  await page.waitForFunction(() => document.querySelectorAll('#world-news article').length === 3);
  assert.equal(await page.locator('#stringer-news article:visible').count(), 24);
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  assert.equal(await page.locator('#global-newswire img').count(), 0);
  assert.equal(await page.locator('#world-news article').first().locator('h3').count(), 1);
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
  const urls=()=>page.locator('#stringer-news article a').evaluateAll(links=>links.map(a=>a.href));
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
  const page=await pageAt();await page.route('**/data/news.json',route=>route.fulfill({status:503,body:'Unavailable'}));await poll(page);await page.waitForFunction(()=>document.querySelector('#refresh-status').textContent.includes('Could not check'));
  assert.equal(await page.locator('#stringer-news article').count(),24);assert.equal(await page.locator('#world-news').getAttribute('aria-busy'),'false');
  await page.reload();await page.waitForFunction(()=>document.querySelector('#world-status').textContent==='Headlines unavailable.');assert.equal(await page.locator('#world-news article').count(),0);await page.close();
});
test('failures and empty news remain visible without collection timestamps',async()=>{
  const page=await browser.newPage();await mockStoryImages(page);await page.clock.install({time:new Date(Date.parse(snapshot.generatedAt)+3*60*60*1000)});let changed=structuredClone(snapshot);
  for(const s of SOURCES){changed.sources[s.id].status='failure';changed.sources[s.id].error='Unavailable';}
  await page.route('**/data/news.json',route=>route.fulfill({json:changed}));await page.goto(base);await page.waitForSelector('#stringer-news article');assert.match(await page.locator('#world-status').innerText(),/refresh unavailable.*Showing previously collected stories/);
  changed=structuredClone(snapshot);for(const s of SOURCES.filter(s=>s.id!=='stringer'))changed.sources[s.id].stories=[];
  await poll(page);await page.waitForSelector('#world-news .empty');assert.equal(await page.locator('#world-status').textContent(),'');
  await page.clock.fastForward(30_000);assert.equal(await page.locator('#stringer-status').textContent(),'');assert.doesNotMatch(await page.locator('body').innerText(),/last collected|over two hours old/);await page.close();
});
test('malicious snapshot is rejected and remote markup is rendered as text',async()=>{
  const page=await pageAt();const bad=structuredClone(snapshot);bad.sources.stringer.stories[0].url='javascript:alert(1)';await page.route('**/data/news.json',route=>route.fulfill({json:bad}));await poll(page);await page.waitForFunction(()=>document.querySelector('#refresh-status').textContent.includes('Could not check'));assert.equal(await page.locator('#stringer-news article').count(),24);
  bad.sources.stringer.stories[0].url='https://example.org/story';bad.sources.stringer.stories[0].title='<img src=x onerror=alert(1)>';await poll(page);await page.waitForFunction(()=>[...document.querySelectorAll('#stringer-news h3')].some(el=>el.textContent.startsWith('<img')));
  assert.equal(await page.locator('#stringer-news img[src="x"]').count(),0);await page.close();
});
test('visible polling, hidden-page pause, visibility catch-up, and overlap prevention',async()=>{
  const page=await browser.newPage();await mockStoryImages(page);await page.clock.install();let requests=0;let release;
  await page.route('**/data/news.json',async route=>{requests++;if(release!==undefined)await new Promise(resolve=>release=resolve);await route.fulfill({json:snapshot});});
  await page.goto(base);await page.waitForSelector('#world-news article');assert.equal(requests,1);
  await page.clock.fastForward(300_000);await page.waitForFunction(()=>document.querySelector('#world-news').getAttribute('aria-busy')==='false');assert.equal(requests,2);
  await page.evaluate(()=>Object.defineProperty(document,'hidden',{configurable:true,get:()=>true}));await page.clock.fastForward(600_000);assert.equal(requests,2);
  await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,get:()=>false});document.dispatchEvent(new Event('visibilitychange'))});await page.waitForFunction(()=>document.querySelector('#world-news').getAttribute('aria-busy')==='false');assert.equal(requests,3);
  release=null;await page.clock.fastForward(300_000);await page.waitForTimeout(25);assert.equal(requests,4);await page.evaluate(()=>{document.dispatchEvent(new Event('visibilitychange'));document.dispatchEvent(new Event('visibilitychange'))});await page.clock.fastForward(1000);assert.equal(requests,4);assert.equal(await page.locator('#world-news').getAttribute('aria-busy'),'true');release();await page.waitForFunction(()=>document.querySelector('#world-news').getAttribute('aria-busy')==='false');await page.close();
});
test('keyboard navigation and requested removals',async()=>{
  const page=await pageAt();await page.keyboard.press('Tab');assert.equal(await page.locator('.skip-link').evaluate(el=>el===document.activeElement),true);await page.keyboard.press('Enter');await page.waitForURL(/#main$/);assert.match(page.url(),/#main$/);
  assert.equal(await page.locator('#reporter-filter,.topics,#reporter-directory,#refresh,.refresh-control').count(),0);assert.doesNotMatch(await page.locator('body').innerText(),/Nostr|Mastodon|About Nostr|All sources/);
  assert.equal(await page.locator('#world-news article a').first().getAttribute('rel'),'noopener noreferrer');await page.close();
});

const branding = JSON.parse(await readFile(new URL('./fixtures/branding.json', import.meta.url), 'utf8'));
const cssValue = (locator, property) => locator.evaluate((el, prop) => getComputedStyle(el)[prop], property);
test('Stringer logo is visible, loaded, correctly sized, and linked on desktop and mobile', async () => {
  for (const [width, expected] of [[1440, branding.desktop], [375, branding.mobile]]) {
    const page = await pageAt('/', width);
    const logo = page.locator('header .brand img');
    assert.equal(await logo.isVisible(), true);
    assert.equal(await logo.evaluate(el => el.complete && el.naturalWidth > 0), true);
    const box = await logo.boundingBox();
    assert.equal(box.width, expected.logoWidth); assert.equal(box.height, expected.logoHeight);
    assert.equal(await page.locator('header .brand').getAttribute('href'), branding.source);
    assert.equal(await page.locator('footer img').evaluate(el => el.complete && el.naturalWidth > 0), true);
    await page.close();
  }
});
test('favicons load as correctly sized images at the domain root and project path', async () => {
  for (const path of ['/', '/stringer-news/']) {
    const page = await pageAt(path);
    for (const size of [16, 32, 192, 180]) {
      const selector = size === 180 ? 'link[rel="apple-touch-icon"]' : `link[rel="icon"][sizes="${size}x${size}"]`;
      const url = await page.locator(selector).evaluate(el => el.href);
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
  assert.equal((await icon.locator('svg').boundingBox()).width, branding.desktop.iconSize);
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
    if (width > branding.mobile.breakpoint) {
      const inset = Math.max(0, (width - branding.desktop.headerMaxWidth) / 2);
      assert.equal(logo.x, inset + branding.desktop.logoLeftInset);
      const button = await page.locator('header .donate').boundingBox();
      assert.equal(button.x + button.width, width - inset - branding.desktop.buttonRightInset);
      assert.equal(button.y, 65);
    } else {
      assert.equal(logo.x, branding.mobile.logoLeftInset);
      assert.equal((await page.locator('header').boundingBox()).height, branding.mobile.headerHeight);
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

test('desktop newswire reaches the Stringer stories with distinct real headlines, including after resize', async () => {
  const page = await pageAt('/', 1280);
  for (const width of [1280, 768, 375, 1440]) {
    await page.setViewportSize({ width, height:1000 });
    await page.waitForTimeout(50);
    const cards = page.locator('#world-news article:not([hidden])');
    const count = await cards.count();
    if (width >= 768) {
      const last = await cards.last().boundingBox();
      const right = await page.locator('#stringer-news article').last().boundingBox();
      assert.ok(last.y+last.height >= right.y+right.height-2);
      assert.ok(last.y < right.y+right.height+2, 'Use only enough headlines to reach the right column');
      assert.ok(count > 24, 'Longer collection should draw additional headlines');
    } else assert.equal(count, 4);
    const links = await cards.locator('.story-body > a').evaluateAll(els=>els.map(el=>el.href));
    assert.equal(new Set(links).size, links.length);
  }
  await page.close();
});
test('story images load lazily, preserve attribution, and fall back to a circle on failure', async () => {
  const page = await pageAt('/');
  assert.equal(await page.locator('#stringer-news .story-media img').count(), 24);
  assert.equal(await page.locator('#stringer-news .story-media img').nth(1).getAttribute('loading'), 'lazy');
  const first = page.locator('#stringer-news article').first();
  const firstUrl = await first.locator('a').getAttribute('href');
  const firstStory = snapshot.sources.stringer.stories.find(story => story.url === firstUrl);
  await first.locator('img').evaluate(el=>el.dispatchEvent(new Event('error')));
  assert.match(await first.locator('img').getAttribute('src'), /^\.\/assets\/stringer-thumbnails\/.+\.png$/);
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
  const imageRequests = [];
  page.on('request', request=> { if(request.resourceType()==='image') imageRequests.push(request.url()); });
  await page.route('**/news-model.js', async route=>route.fulfill({contentType:'text/javascript',body:await readFile(new URL('../news-model.js',import.meta.url),'utf8')}));
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
    data.sources.stringer.stories[0].publishedAt='2025-11-05T23:30:00.000Z';
    data.sources.stringer.stories[0].publicationSource=data.sources.stringer.stories[0].url;
    data.sources.stringer.stories[1].publicationDate='2025-11-05';
    data.sources.stringer.stories[1].publicationSource=data.sources.stringer.stories[1].url;
    const gazaStory=data.sources.stringer.stories.find(story=>story.title==='Gaza Under Bombardment');
    gazaStory.publicationDate=null;
    gazaStory.publishedAt=null;
    gazaStory.publicationSource=null;
    await page.route('**/data/news.json',route=>route.fulfill({json:data}));
    await page.goto(base); await page.waitForSelector('#stringer-news article');
    const cards=data.sources.stringer.stories.map(story=>page.locator('#stringer-news article').filter({has:page.locator('h3', {hasText:story.title})}));
    const gazaCard=page.locator('#stringer-news article').filter({has:page.locator('h3', {hasText:'Gaza Under Bombardment'})});
    assert.equal(await gazaCard.locator('time').getAttribute('datetime'),'2025-07-29');
    const expected=new Intl.DateTimeFormat('en-US',{timeZone:timezoneId,year:'numeric',month:'short',day:'numeric',hour:'2-digit',minute:'2-digit',hour12:true,timeZoneName:'short'}).format(new Date(data.sources.stringer.stories[0].publishedAt));
    assert.equal(await cards[0].locator('time').textContent(),expected);
    assert.equal(await cards[1].locator('time').textContent(),'Nov 5, 2025');
    assert.equal(await cards[1].locator('time').getAttribute('datetime'),'2025-11-05');
    assert.equal(await cards[2].locator('time').count(),1);
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
    const requested = [];
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
