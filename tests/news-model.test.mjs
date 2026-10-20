import test from 'node:test';
import assert from 'node:assert/strict';
import * as model from '../news-model.js';
const time = '2026-01-01T00:00:00.000Z';
const story = () => ({title:'Headline',url:'https://example.org/a',summary:'Reporting',publishedAt:time,image:null});
const snapshot = () => ({schemaVersion:2,generatedAt:time,sources:Object.fromEntries(model.SOURCES.map(({id}) => [id,{stories:[],attemptedAt:time,lastSuccessAt:null,status:'paused',error:null}]))});
function populated(id='bbc') {const s=snapshot(); s.sources[id]={stories:[{...story(),...(id==='stringer'?{credits:'Reporter'}:{})}],attemptedAt:time,lastSuccessAt:time,status:'success',error:null}; return s;}
test('URLs reject credentials and non-web protocols; image URLs require HTTPS',()=>{
  for(const value of [null,42,'bad','javascript:alert(1)','ftp://example.org','https://u@example.org','https://:p@example.org']) assert.equal(model.safeUrl(value),null);
  assert.equal(model.safeUrl('http://example.org'),'http://example.org/');
  assert.equal(model.safeImageUrl('http://example.org'),null);
  assert.equal(model.safeImageUrl('https://example.org'),'https://example.org/');
  assert.equal(model.safeImageUrl(null),null);
  assert.equal(model.urlIdentity('https://example.org/a#b'),'https://example.org/a');
  assert.equal(model.uniqueStories([story(),{...story(),url:story().url+'#part'}]).length,1);
  assert.equal(model.newestFirst({publishedAt:null},{publishedAt:null}),0);
  assert.ok(model.newestFirst({publishedAt:null},story())>0);
  assert.ok(model.newestFirst(story(),{publishedAt:null})<0);
});
test('permissions strip unlicensed content and preserve Stringer attribution without mutation',()=>{
  const s=populated('stringer'); const original=structuredClone(s);
  assert.deepEqual(model.permittedStories('unknown',[story()]),[]);
  const result=model.applyContentPermissions(s,{});
  assert.equal(result.sources.stringer.status,'paused'); assert.deepEqual(result.sources.stringer.stories,[]);
  assert.deepEqual(s,original);
  const full={bbc:{text:true,summaries:true,images:true}};
  assert.equal(model.permittedStories('bbc',[story()],full)[0].headlineOnly,false);
  assert.equal(model.permittedStories('bbc',[{...story(),image:{url:'https://example.org/photo'}}],full)[0].image.url,'https://example.org/photo');
  const resultStory=model.permittedStories('stringer',[{...story(),image:undefined,publicationDate:'2026-01-01',publicationSource:story().url}])[0];
  assert.equal(resultStory.image,null); assert.equal(resultStory.publicationDate,'2026-01-01');
});
test('source normalization only fills the documented legacy CNA gap',()=>{
  for(const sources of [null,[],1,{}, {...snapshot().sources,extra:{}}]) assert.throws(()=>model.normalizeSourceSet(sources,time),/source set/);
  const s=snapshot(); assert.equal(model.normalizeSourceSet(s.sources,time),s.sources);
  delete s.sources.cna; assert.deepEqual(model.normalizeSourceSet(s.sources,time,true).cna.ids,[]);
});
test('snapshot validation rejects malformed metadata and chronology',()=>{
  for(const value of [null,{}, {schemaVersion:9}, {...snapshot(),generatedAt:42}, {...snapshot(),generatedAt:'garbage'}, {...snapshot(),sources:null}]) assert.throws(()=>model.validateSnapshot(value));
  const cases=[
    s=>s.sources.bbc=null, s=>s.sources.bbc.stories={}, s=>s.sources.bbc.attemptedAt='bad',s=>s.sources.bbc.status='unknown',s=>s.sources.bbc.lastSuccessAt='bad',
    s=>s.sources.bbc.attemptedAt='2027-01-01T00:00:00Z',s=>s.sources.bbc.lastSuccessAt='2027-01-01T00:00:00Z',
    s=>{s.sources.bbc.status='paused';},s=>{s.sources.bbc.stories=[];s.sources.bbc.status='paused';},
    s=>{s.sources.bbc.stories=[];s.sources.bbc.status='paused';s.sources.bbc.lastSuccessAt=null;s.sources.bbc.error='bad';},
    s=>s.sources.bbc.lastSuccessAt=null,s=>s.sources.bbc.error='bad',s=>{s.sources.bbc.status='failure';s.sources.bbc.error='';},
    s=>{s.sources.bbc.status='failure';s.sources.bbc.error='failure';s.sources.bbc.lastSuccessAt=null;},
    s=>s.sources.bbc.stories=Array.from({length:31},story), s=>{s.schemaVersion=1;s.sources.bbc.stories=Array.from({length:6},story);},
  ];
  for(const mutate of cases){const s=populated();mutate(s);assert.throws(()=>model.validateSnapshot(s));}
  const empty=populated('stringer');empty.sources.stringer.stories=[];assert.throws(()=>model.validateSnapshot(empty),/Empty Stringer/);
  const legacy=populated();legacy.schemaVersion=1;assert.equal(model.validateSnapshot(legacy),legacy);
  const failure=snapshot();failure.sources.bbc.status='failure';failure.sources.bbc.error='Offline';assert.equal(model.validateSnapshot(failure),failure);
});
test('story validation rejects unsafe data, invalid calendar dates and absent reporting',()=>{
  for(const change of [null,{title:4},{title:' '},{url:'javascript:bad'},{summary:null},{publishedAt:'bad'},{publicationDate:'2026-02-30'},{publicationDate:'2026-99-99'},{publicationDate:'bad'},{publicationSource:'https://other.org'},{image:{url:'http://example.org',alt:'',credit:''}},{image:{url:'https://example.org',alt:1,credit:''}},{image:{url:'https://example.org',alt:'',credit:1}}]){
    const s=populated();s.sources.bbc.stories=[change===null?null:{...story(),...change}];assert.throws(()=>model.validateSnapshot(s));
  }
  for(const change of [{credits:''},{summary:''}]){const s=populated('stringer');Object.assign(s.sources.stringer.stories[0],change);assert.throws(()=>model.validateSnapshot(s),/Stringer story/);}
  const valid=populated();Object.assign(valid.sources.bbc.stories[0],{publishedAt:null,publicationDate:'2024-02-29',publicationSource:story().url,image:{url:'https://example.org/i',alt:'Photo',credit:'Reporter'}});assert.equal(model.validateSnapshot(valid),valid);
});
test('groups order tied notes deterministically and prefer open publisher links',()=>{
  const s=populated();s.sources.bbc.stories=[{...story(),noteId:'b',clusterId:'cluster'},{...story(),url:'https://example.org/c',noteId:'c'}];
  s.sources.nyt={...s.sources.bbc,stories:[{...story(),url:'https://example.org/nyt',noteId:'a',clusterId:'cluster'}]};
  const groups=model.worldGroups(s);assert.equal(groups[0].source,'BBC World');assert.equal(groups[0].articles.length,2);assert.equal(groups[0].sortId,'a');
  s.sources.bbc.stories=[{...story(),url:'https://example.org/b'},{...story(),url:'https://example.org/a'}];s.sources.nyt.stories=[];
  assert.equal(model.worldGroups(s)[0].url,'https://example.org/a');
});
test('status and date formatting communicate unavailable and empty collections',()=>{
  const source=model.SOURCES[0];const entry=snapshot().sources.bbc;
  assert.match(model.sourceMessage(source,entry),/No collection available.*No published stories/);
  assert.match(model.sourceMessage(source,{...entry,status:'failure'}),/refresh unavailable/);
  assert.match(model.sourceMessage(source,populated().sources.bbc),/last collected/);
  assert.equal(model.formatLocalDateTime('bad'),'Date unavailable');assert.match(model.formatLocalDateTime(time),/2026/);
  for(const value of [null,'bad','2026-99-01','2026-02-30']) assert.equal(model.formatPublicationDate(value),'Date unavailable');
  assert.equal(model.formatPublicationDate('2024-02-29'),'Feb 29, 2024');
});
test('group sorting handles mixed note identifiers and URL-only stories in a cluster',()=>{
  const s=populated();s.sources.bbc.stories=[{...story(),clusterId:'same'},{...story(),url:'https://example.org/b',noteId:'note',clusterId:'same'}];
  assert.equal(model.worldGroups(s)[0].articles.length,2);
  s.sources.bbc.stories.reverse();assert.equal(model.worldGroups(s)[0].articles.length,2);
});
