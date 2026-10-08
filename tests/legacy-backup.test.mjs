import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),ts=require('typescript');
function load(file){const module={exports:{}};new Function('require','module','exports',ts.transpileModule(readFileSync(new URL('../src/'+file,import.meta.url),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText)(name=>name==='./core'?load('core.ts'):require(name),module,module.exports);return module.exports;}
const core=load('core.ts'),{readLegacyBackups}=load('legacy-backup.ts');
test('legacy rescue opens readonly and returns only detached ledgers from the selected origin and handle',async()=>{
  let mode,closed=false;
  const rows=[['https://example.test','alice','a'],['https://example.test','bob','b'],['https://other.test','alice','c']].map(key=>({key,ledger:core.createLedger(key[2])}));
  globalThis.indexedDB={databases:async()=>[{name:'shiro-butterfly-shop-v1'}],open(name){assert.equal(name,'shiro-butterfly-shop-v1');const request={};queueMicrotask(()=>{request.result={objectStoreNames:{contains:s=>s==='ledgers'},close:()=>closed=true,transaction(store,access){mode=access;assert.equal(store,'ledgers');let at=0;const tx={objectStore(){return {openCursor(){const cursorRequest={};const step=()=>{cursorRequest.result=at<rows.length?{value:rows[at++],continue:()=>queueMicrotask(step)}:null;cursorRequest.onsuccess();if(cursorRequest.result===null)queueMicrotask(()=>tx.oncomplete());};queueMicrotask(step);return cursorRequest;}}}};return tx;}};request.onsuccess();});return request;}};
  const result=await readLegacyBackups('https://example.test','alice');assert.equal(mode,'readonly');assert.equal(closed,true);assert.equal(result.length,1);assert.equal(result[0].accountId,'a');result[0].label='changed';assert.notEqual(rows[0].ledger.label,'changed');
});
test('absent legacy database does not create a new wallet or touch native business data',async()=>{
  let opened=false;globalThis.indexedDB={databases:async()=>[],open(){opened=true;throw new Error('unreachable');}};
  assert.deepEqual(await readLegacyBackups('https://example.test','alice'),[]);assert.equal(opened,false);
});
