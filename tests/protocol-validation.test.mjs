import test from 'node:test';
import assert from 'node:assert/strict';
import {generateSecretKey,getPublicKey,finalizeEvent} from 'nostr-tools';
import {assemble,readManifest,readAssignment,checkedEvent,MANIFEST_KIND,MANIFEST_KEY,GROUP_MARKER} from '../relay/protocol.ts';
import {publicBatch} from './relay/fixture.ts';
import {SOURCES} from '../news-model.js';
const key=generateSecretKey(),pubkey=getPublicKey(key),time='2026-01-01T00:00:00.000Z';
const sign=(data={})=>finalizeEvent({kind:1,created_at:1767225600,tags:[],content:'',...data},key);
function fixture(){const s={schemaVersion:2,generatedAt:time,sources:Object.fromEntries(SOURCES.map(({id})=>[id,{stories:[],attemptedAt:time,lastSuccessAt:null,status:'paused',error:null}]))};s.sources.bbc={stories:[{title:'Test headline',url:'https://example.org/a',summary:'',publishedAt:time,image:null}],attemptedAt:time,lastSuccessAt:time,status:'success',error:null};return publicBatch(s,key).batch;}
function manifest(value,tags=[['d',MANIFEST_KEY]]){return sign({kind:MANIFEST_KIND,tags,content:JSON.stringify(value)});}
test('relay events enforce size, kind, author, signature and time',()=>{
  assert.throws(()=>checkedEvent(sign({content:'x'.repeat(500001)}),pubkey,1));
  assert.throws(()=>checkedEvent(sign({kind:2}),pubkey,1));
  checkedEvent(sign(),pubkey,1);
});
test('manifest tags and metadata must identify a valid collection',()=>{
  const value=JSON.parse(fixture().manifest.content);
  for(const tags of [[],[['d','wrong']],[['d',MANIFEST_KEY],['d',MANIFEST_KEY]]])assert.throws(()=>readManifest(manifest(value,tags),pubkey),/manifest tag/);
  for(const changes of [{version:2},{generatedAt:42},{generatedAt:'bad'},{generatedAt:'2099-01-01T00:00:00Z'},{sources:null}])assert.throws(()=>readManifest(manifest({...value,...changes}),pubkey),/Invalid manifest/);
  assert.throws(()=>readManifest(sign({kind:MANIFEST_KIND,tags:[['d',MANIFEST_KEY]],content:'bad'}),pubkey));
});
test('story references and pending counts reject malformed values and bounds',()=>{
  for(const entry of [null,{ids:null},{ids:Array(31).fill('a'.repeat(64))},{ids:['a'.repeat(64),'a'.repeat(64)]},{ids:[42]},{ids:['bad']},{ids:[],pending:-1},{ids:[],pending:201},{ids:[],pending:1.5}]){const value=JSON.parse(fixture().manifest.content);value.sources.bbc=entry;assert.throws(()=>readManifest(manifest(value),pubkey));}
  const value=JSON.parse(fixture().manifest.content);value.sources.stringer.ids=Array.from({length:201},(_,i)=>i.toString(16).padStart(64,'0'));assert.throws(()=>readManifest(manifest(value),pubkey),/references/);
  value.sources.stringer.ids=[];value.sources.bbc.pending=0;assert.equal(readManifest(manifest(value),pubkey).sources.bbc.pending,0);
});
test('optional grouping filters unreferenced notes and malformed mappings',()=>{
  for(const field of ['groups','assignments'])for(const invalid of [null,[],42,'bad']){const value=JSON.parse(fixture().manifest.content);value[field]=invalid;assert.deepEqual(readManifest(manifest(value),pubkey)[field],{});}
  for(const field of ['groups','assignments'])for(const cluster of [42,'bad','a'.repeat(64)]){const value=JSON.parse(fixture().manifest.content),id=value.sources.bbc.ids[0];value[field]={[id]:cluster,['f'.repeat(64)]:'a'.repeat(64)};assert.deepEqual(readManifest(manifest(value),pubkey)[field],typeof cluster==='string'&&cluster.length===64?{[id]:cluster}:{});}
});
const cluster='a'.repeat(64),note='b'.repeat(64);
const tags=()=>[[GROUP_MARKER,cluster],['e',note,'','root'],['t',`stringer-event-${cluster.slice(0,16)}`]];
test('group assignments require one marker, one matching root and topic',()=>{
  assert.equal(readAssignment(sign({tags:tags()}),pubkey,note),cluster);
  for(const change of [t=>t.splice(0,1),t=>t.push(t[0]),t=>t[0]=[GROUP_MARKER],t=>t[0][1]='bad',t=>t.splice(1,1),t=>t.push(t[1]),t=>t[1][1]='c'.repeat(64),t=>t[1][3]='reply',t=>t.splice(2,1)]){const value=tags();change(value);assert.throws(()=>readAssignment(sign({tags:value}),pubkey,note),/assignment/);}
});
test('assembly rejects ambiguous story tags and mismatched outbound links',()=>{
  for(const mutate of [t=>t.splice(1,1),t=>t.push(t[1]),t=>t[1][1]='nyt',t=>t[1][2]='',t=>t[0][1]='https://other.org']){const f=fixture(),t=structuredClone(f.events[0].tags);mutate(t);const event=sign({...f.events[0],tags:t});const value=JSON.parse(f.manifest.content);value.sources.bbc.ids=[event.id];assert.throws(()=>assemble(manifest(value),[event],pubkey));}
});
test('verified group metadata overrides untrusted story fields with backward-compatible assignments',()=>{
  const f=fixture(),value=JSON.parse(f.manifest.content),id=f.events[0].id;
  value.groups={[id]:cluster};assert.equal(assemble(manifest(value),f.events,pubkey).sources.bbc.stories[0].clusterId,cluster);
  delete value.groups;
  const assignment=sign({tags:[[GROUP_MARKER,cluster],['e',id,'','root'],['t',`stringer-event-${cluster.slice(0,16)}`]]});value.assignments={[id]:assignment.id};
  assert.equal(assemble(manifest(value),[...f.events,assignment],pubkey).sources.bbc.stories[0].clusterId,cluster);
  const invalid=sign({tags:[]});value.assignments={[id]:invalid.id};assert.equal(assemble(manifest(value),[...f.events,invalid],pubkey).sources.bbc.stories[0].clusterId,undefined);
  assert.equal(assemble(manifest(value),f.events,pubkey).sources.bbc.stories[0].clusterId,undefined);
  value.sources.bbc.ids=[];value.sources.bbc.status='success';assert.deepEqual(assemble(manifest(value),[],pubkey,true).sources.bbc.stories,[]);
});
