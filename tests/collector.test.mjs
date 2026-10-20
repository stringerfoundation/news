import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as collector from '../scripts/collect.mjs';
import {VERIFIED_PUBLICATIONS} from '../scripts/verified-publications.mjs';
import {SOURCES} from '../news-model.js';
const rss=items=>`<rss><channel>${items}</channel></rss>`;
const item=(extra='',link='https://www.bbc.com/a')=>`<item><title>Headline</title><link>${link}</link>${extra}</item>`;
const story=(url='https://www.bbc.com/a')=>({url,title:'Headline',summary:'',publishedAt:null,image:null});
const html=(body='<p>Reporter</p><p><a href="https://example.org/a">Report</a> Reporting<br/>text</p>',extra='')=>`<section><div class="text-box"><h1>COURAGEOUS STORIES</h1></div>${extra}<div class="text-box">${body}</div></section>`;
test('RSS and RDF parsing handles missing dates, text cleanup, image formats and malformed items',()=>{
  for(const value of ['<rss>','<html/>'])assert.throws(()=>collector.parseFeed(value));
  assert.deepEqual(collector.parseFeed('<rss><channel><title>Empty feed</title></channel></rss>'),[]);
  assert.deepEqual(collector.parseFeed('<rdf:RDF><title>Empty feed</title></rdf:RDF>'),[]);
  for(const xml of ['<item><title/></item>', '<item><title>A</title><link><bad/></link></item>'])assert.throws(()=>collector.parseFeed(rss(xml)),/Incomplete/);
  const parsed=collector.parseFeed(rss(item('<description><![CDATA[<script>bad</script><style>bad</style>Safe<br>text]]></description><pubDate>invalid</pubDate>')))[0];
  assert.equal(parsed.summary,'Safe text');assert.equal(parsed.publishedAt,null);
  assert.equal(collector.parseFeed(`<rdf:RDF>${item('<dc:date>2026-01-01</dc:date>')}</rdf:RDF>`)[0].publishedAt,'2026-01-01T00:00:00.000Z');
  const formats=[
    '<media:content medium="image" url="https://example.org/i"><media:description>Alt</media:description><media:credit>Credit</media:credit></media:content>',
    '<media:content type="image/png" url="https://example.org/i"/>',
    '<media:thumbnail url="http://example.org/unsafe"/><media:thumbnail url="https://example.org/i"/>',
    '<enclosure type="audio/mp3" url="https://example.org/audio"/><enclosure type="image/png" url="https://example.org/i"/>',
    '<media:group><media:content url="https://example.org/notimage"/><media:thumbnail url="https://example.org/i"/><media:description>Group</media:description><media:credit>Group credit</media:credit></media:group>',
  ];
  for(const format of formats)assert.equal(collector.parseFeed(rss(item(format)))[0].image.url,'https://example.org/i');
  assert.equal(collector.parseFeed(rss(item('<media:thumbnail url="javascript:bad"/>')))[0].image,null);
});
test('Open Graph uses secure images, relative paths, and ignores malformed URLs',()=>{
  assert.deepEqual(collector.parseOgImage('<meta property="og:image:secure_url" content="https://[bad"><meta property="og:image" content="/image"><meta property="og:image:alt" content="Photo">','https://example.org/a'),{url:'https://example.org/image',alt:'Photo',credit:''});
  assert.equal(collector.parseOgImage('<meta property="og:image" content="http://example.org/i">','https://example.org'),null);
  assert.equal(collector.parseOgImage('<meta property="og:image" content="/i">','https://example.org').alt,'');
});
test('image enrichment only requests configured hosts and retains headlines on failure',async()=>{
  const stories=[story(),{...story('https://www.bbc.com/has'),image:{url:'https://example.org/i'}},story('https://evil.example/a'),story('https://www.bbc.com/fail')];
  assert.equal(await collector.enrichFeedImages('unknown',stories,()=>assert.fail()),stories);
  const calls=[];const result=await collector.enrichFeedImages('bbc',stories,async(url,options)=>{calls.push(url);assert.deepEqual(options.allowedHosts,['www.bbc.com','www.bbc.co.uk']);if(url.endsWith('fail'))throw Error('offline');return '<meta property="og:image" content="/photo">';});
  assert.equal(result[0].image.url,'https://www.bbc.com/photo');assert.equal(result[3].image,null);assert.equal(stories[0].image,null);assert.equal(calls.length,2);
});
test('Stringer extraction fails closed when editorial structure changes',()=>{
  for(const value of ['', '<h1>COURAGEOUS STORIES</h1>',html()+'<h1>COURAGEOUS STORIES</h1>',html(undefined,'<p>Outside box</p>'),html('<p>Reporter only</p>'),html('<p><a href="https://example.org">Reporter</a></p><p>Description</p>'),html('<p>Reporter</p><p>No link</p>'),html('<p> </p><p><a href="https://example.org">Title</a> Description</p>'),html('<p>Reporter</p><p><a href="javascript:bad">Title</a> Description</p>'),html('<p>Reporter</p><p><a href="https://example.org">Title</a></p>'),html('')])assert.throws(()=>collector.parseStringer(value));
  const parsed=collector.parseStringer(html(undefined,'<a href="https://example.org/a/"><img src="https://example.org/photo" alt="Photo"></a><a href="https://example.org/a"><img src="https://example.org/other"></a><a href="javascript:bad"><img src="https://example.org/photo"></a><a href="https://example.org/no"><img src="http://example.org/unsafe"></a>'))[0];
  assert.equal(parsed.summary,'Reporting text');assert.equal(parsed.image.url,'https://example.org/photo');assert.equal(parsed.image.alt,'Photo');
  assert.equal(collector.parseStringer(html(undefined,'<a href="https://example.org/a"><img src="https://example.org/photo"></a>'))[0].image.alt,'');
  assert.equal(collector.parseStringer(html())[0].image,null);
  assert.equal(collector.parseStringer(html().replace('https://example.org/a','https://example.org/'))[0].url,'https://example.org/');
});
test('publication metadata distinguishes confirmed instants from calendar dates',()=>{
  const meta=value=>`<meta property="article:published_time" content="${value}">`;
  for(const value of ['bad','2026-02-30','2026-99-01','2026-01-01 rubbish','2026-01-01T99:99:99Z'])assert.deepEqual(collector.parsePublication(meta(value)),{publishedAt:null,publicationDate:null});
  assert.deepEqual(collector.parsePublication(meta('2026-01-01')),{publishedAt:null,publicationDate:'2026-01-01'});
  assert.deepEqual(collector.parsePublication(meta('2026-01-01T12:00:00+02:00')),{publishedAt:'2026-01-01T10:00:00.000Z',publicationDate:null});
  assert.equal(collector.parsePublication(meta('2026-01-01T12:00:00')).publicationDate,'2026-01-01');
  const json=value=>`<script type="application/ld+json">${JSON.stringify(value)}</script>`;
  assert.equal(collector.parsePublication(json({'@graph':[null,5,{'@type':['VideoObject'],uploadDate:'2026-01-02'}]})).publicationDate,'2026-01-02');
  assert.equal(collector.parsePublication(json({mainEntity:{'@type':'Article',datePublished:'2026-01-03'}})).publicationDate,'2026-01-03');
  assert.equal(collector.parsePublication(json([{'@type':'Article'},{'@type':'Book',datePublished:'2026-01-01'}])).publicationDate,null);
  assert.equal(collector.parsePublication(json({'@type':'Article'})).publishedAt,null);
  assert.equal(collector.parsePublication('<script type="application/ld+json">bad</script>').publishedAt,null);
});
test('publication enrichment prefers verified dates and retains matching confirmed instants',async()=>{
  const [url,verified]=[...VERIFIED_PUBLICATIONS].find(([,v])=>v.publicationDate);
  const same={...story(url),publishedAt:verified.publicationDate+'T12:00:00Z',publicationSource:url};
  const result=await collector.enrichPublications([story(url),story('https://example.org/old'),story('https://example.org/new'),story('https://example.org/fresh')],[same,{...story('https://example.org/old'),publicationDate:'2026-01-01',publicationSource:'https://example.org/old'}],async target=>{if(target.endsWith('fresh'))return '<meta itemprop="datePublished" content="2026-01-05">';throw Error('offline');});
  assert.equal(result[0].publishedAt,same.publishedAt);assert.equal(result[1].publicationDate,'2026-01-01');assert.equal(result[2].publicationSource,null);assert.equal(result[3].publicationDate,'2026-01-05');
  const conflict=await collector.enrichPublications([story(url)],[{...same,publishedAt:'2000-01-01T00:00:00Z'}],async()=> '');assert.equal(conflict[0].publicationDate,verified.publicationDate);
  assert.deepEqual(await collector.enrichPublications([]),[]);
});
test('baseline permits reviewed resets but blocks unexpected losses',()=>{
  const stories=[story()];assert.equal(collector.checkBaseline(stories),stories);assert.equal(collector.checkBaseline(stories,[story()]),stories);
  assert.throws(()=>collector.checkBaseline(stories,[story(),story()]),/25%/);assert.equal(collector.checkBaseline(stories,[story(),story()],true),stories);
});
test('fetch retries failures with exponential backoff and validates response limits',async()=>{
  const waits=[];let attempts=0;
  assert.equal(await collector.fetchText('https://example.org',{fetchImpl:async()=>{if(attempts++<2)throw Error('offline');return new Response('feed');},sleep:async ms=>waits.push(ms)}),'feed');assert.deepEqual(waits,[500,1000]);
  await assert.rejects(collector.fetchText('https://example.org',{attempts:1,fetchImpl:async()=>new Response('',{status:503})}),/HTTP 503/);
  await assert.rejects(collector.fetchText('https://example.org',{attempts:1,fetchImpl:async()=>new Response('x'.repeat(5_000_001))}),/too large/);
});
test('restricted article fetches enforce HTTPS, host allowlists and redirect bounds',async()=>{
  const options={attempts:1,allowedHosts:['example.org']};
  for(const url of ['http://example.org','https://other.org'])await assert.rejects(collector.fetchText(url,{...options,fetchImpl:()=>assert.fail()}),/host not configured/);
  const visited=[];assert.equal(await collector.fetchText('https://example.org/a',{...options,fetchImpl:async(url,init)=>{visited.push(url);assert.equal(init.redirect,'manual');return visited.length===1?new Response(null,{status:302,headers:{location:'/b'}}):new Response('ok');}}),'ok');assert.equal(visited[1],'https://example.org/b');
  for(const headers of [{},{location:'/loop'}])await assert.rejects(collector.fetchText('https://example.org',{...options,fetchImpl:async()=>new Response(null,{status:301,headers})}),/redirect blocked/);
  await assert.rejects(collector.fetchText('https://example.org',{...options,fetchImpl:async()=>new Response(null,{status:307,headers:{location:'https://other.org/'}})}),/host not configured/);
});
test('snapshot URLs preserve project paths but discard query and fragment',()=>{
  assert.equal(collector.snapshotUrl('https://example.org/project?x=1#top'),'https://example.org/project/data/news.json');
  assert.equal(collector.snapshotUrl('https://example.org/'),'https://example.org/data/news.json');assert.throws(()=>collector.snapshotUrl('javascript:bad'),/PAGES_URL/);
});
test('collection handles first runs, recovery, grants and daily Stringer scheduling',async()=>{
  const time='2026-01-01T00:00:00.000Z';const fixtures=Object.fromEntries(SOURCES.map(s=>[s.url,readFileSync(new URL(`./fixtures/${s.id==='stringer'?'stringer.html':s.id+'.xml'}`,import.meta.url),'utf8')]));
  const request=async url=>fixtures[url]||'<meta property="article:published_time" content="2025-01-01">';
  const first=await collector.collect({previousSnapshot:null,now:()=>time,request});assert.equal(first.sources.stringer.status,'success');
  const messages=[];await assert.rejects(collector.collect({pagesUrl:'https://example.org',request:async()=>{throw Error('offline');},log:m=>messages.push(m)}),/Publication blocked/);assert.ok(messages[0].includes('Previous snapshot unavailable'));
  const recovered=await collector.collect({pagesUrl:'https://example.org/',now:()=>time,request:async url=>url.endsWith('news.json')?JSON.stringify(first):request(url)});assert.deepEqual(recovered.sources.stringer,first.sources.stringer);
  const permissions=Object.fromEntries(SOURCES.map(s=>[s.id,{text:s.id==='bbc',images:true,summaries:true}]));
  const limited=await collector.collect({previousSnapshot:first,now:()=>time,request,permissions});assert.equal(limited.sources.stringer.status,'paused');
  const reset=await collector.collect({previousSnapshot:first,now:()=>time,request,resetStringerBaseline:true});assert.equal(reset.sources.stringer.status,'success');
  const failed=await collector.collect({previousSnapshot:first,now:()=> '2026-01-03T00:00:00.000Z',request:async()=>{throw Error('offline');},log:()=>{}});assert.equal(failed.sources.stringer.status,'failure');assert.equal(failed.sources.stringer.lastSuccessAt,time);
});
test('enclosures without an image MIME type are ignored',()=>{
  assert.equal(collector.parseFeed(rss(item('<enclosure url="https://example.org/audio"/>')))[0].image,null);
});
test('default fetch implementation and retry timer recover from transient network failure',async t=>{
  let calls=0;t.mock.method(globalThis,'fetch',async()=>{if(!calls++)throw Error('transient');return new Response('recovered');});
  assert.equal(await collector.fetchText('https://example.org'),'recovered');assert.equal(calls,2);
});
