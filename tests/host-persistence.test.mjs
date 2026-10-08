import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),ts=require('typescript');
const source=readFileSync(new URL('../src/host.ts',import.meta.url),'utf8');
const output=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
const module={exports:{}};new Function('module','exports',output)(module,module.exports);
const {verifyNativeChatSaved,chatIdentity}=module.exports;
const id='shiro-native:v2:wallet:commit:2%3A3';
const encoded=`CAST(X'${Buffer.from(id).toString('hex').toUpperCase()}' AS TEXT)`;
function fixture(options={}){
  let identity='A',requests=0;
  const frame={version:2,checkpoint:null,logEntries:[{seq:1,operations:[{sql:options.sql??encoded}]}]};
  const chat=[{is_user:false,mes:options.text??'故事',...(options.noFrame?{}:{TavernDB_ACU_IsolatedData:{'':{_acu_storage_version:2,storageFrame:frame}}})}];
  const c={chat,characterId:0,getCurrentChatId:()=>identity,characters:[{name:'Test',avatar:'Test.png'}],getRequestHeaders:()=>({'X-CSRF-Token':'synthetic'})};
  globalThis.SillyTavern={getContext:()=>c};
  const saved=[{},...structuredClone(chat)];
  globalThis.fetch=async(url,init)=>{requests++;assert.equal(url,'/api/chats/get');assert.equal(JSON.parse(init.body).file_name,'A');options.during?.(c,()=>identity='B');return {ok:options.ok!==false,status:options.ok===false?500:200,json:async()=>options.persisted??saved};};
  return {c,expected:JSON.stringify(['character','Test.png','A']),tables:{sheet_one:{content:[['row_id','记录ID'],['1',id]]}},requests:()=>requests};
}
test('character list reorder does not change persistent chat identity; another avatar does',()=>{
  const f=fixture();const identity=chatIdentity();f.c.characters.unshift({name:'Other',avatar:'Other.png'});f.c.characterId=1;
  assert.equal(chatIdentity(),identity);f.c.characterId=0;assert.notEqual(chatIdentity(),identity);
  f.c.groupId='group-one';const groupIdentity=chatIdentity();f.c.characterId=1;assert.equal(chatIdentity(),groupIdentity);
});
test('saved V2 incremental SQL with hex business IDs is verified through authenticated same-chat readback',async()=>{
  const f=fixture();assert.equal(await verifyNativeChatSaved(f.expected,f.tables),true);assert.equal(f.requests(),1);
});
test('full checkpoint commit IDs are supported but a story mentioning an audit does not count as a native frame',async()=>{
  let f=fixture({sql:id});assert.equal(await verifyNativeChatSaved(f.expected,f.tables),true);
  f=fixture({noFrame:true,text:id});await assert.rejects(verifyNativeChatSaved(f.expected,f.tables),/保存帧/);assert.equal(f.requests(),0);
});
test('runtime audit rows without a persisted frame are refused before a server read',async()=>{
  const f=fixture({sql:'unrelated'});await assert.rejects(verifyNativeChatSaved(f.expected,f.tables),/保存帧/);assert.equal(f.requests(),0);
});
test('explicit empty-source preflight still compares the complete backend chat before initialization',async()=>{
  let f=fixture({noFrame:true});const empty={sheet_one:{content:[['row_id','记录ID']]}};
  assert.equal(await verifyNativeChatSaved(f.expected,empty,false),true);
  f=fixture({noFrame:true,persisted:[{}, {mes:'另一标签的新故事'}]});await assert.rejects(verifyNativeChatSaved(f.expected,empty,false),/服务器聊天/);
});
test('a runtime that looks empty cannot initialize over previous native business frames',async()=>{
  const empty={sheet_one:{content:[['row_id','记录ID']]}};
  let f=fixture();await assert.rejects(verifyNativeChatSaved(f.expected,empty,false),/已有本源保存历史/);
  f=fixture({sql:id});await assert.rejects(verifyNativeChatSaved(f.expected,empty,false),/已有本源保存历史/);
});
test('HTTP failure and a missing backend frame cannot show a durable success',async()=>{
  let f=fixture({ok:false});await assert.rejects(verifyNativeChatSaved(f.expected,f.tables),/HTTP 500/);
  f=fixture({persisted:[{}, {is_user:false,mes:'故事'}]});await assert.rejects(verifyNativeChatSaved(f.expected,f.tables),/服务器聊天/);
});
test('only the official lazy default fill timestamp is ignored; changed fill modes remain strict',async()=>{
  const f=fixture();f.c.chat[0].TavernDB_ACU_ScopedConfig={otherSetting:'preserved',fillModeByIsolationKey:{'':{mode:'llm',recordedAt:123}}};
  globalThis.fetch=async()=>({ok:true,json:async()=>[{}, {...structuredClone(f.c.chat[0]),TavernDB_ACU_ScopedConfig:{otherSetting:'preserved'}}]});
  assert.equal(await verifyNativeChatSaved(f.expected,f.tables),true);
  f.c.chat[0].TavernDB_ACU_ScopedConfig.fillModeByIsolationKey[''].mode='sql';await assert.rejects(verifyNativeChatSaved(f.expected,f.tables),/服务器聊天/);
});
test('chat switch or an edit while the backend is read cancels confirmation',async()=>{
  let f=fixture({during:(_c,switchChat)=>switchChat()});await assert.rejects(verifyNativeChatSaved(f.expected,f.tables),/聊天或故事发生变化/);
  f=fixture({during:c=>{c.chat[0].mes='已改动';}});await assert.rejects(verifyNativeChatSaved(f.expected,f.tables),/聊天或故事发生变化/);
});
