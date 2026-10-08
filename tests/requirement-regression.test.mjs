import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { nativeControllerHarness } from './native-controller-fixture.mjs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
const require = createRequire(import.meta.url), ts = require('typescript');
const root = new URL('../', import.meta.url);
const moduleCache = new Map();
function load(file, dependencies = {}) {
  if (!Object.keys(dependencies).length && moduleCache.has(file)) return moduleCache.get(file);
  const source = readFileSync(new URL(`src/${file}`, root), 'utf8');
  const output = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
  const module = { exports: {} };
  new Function('require', 'module', 'exports', output)(name => {
    if (name in dependencies) return dependencies[name];
    if (name === '../docs/蝴蝶效应原文.txt') return { default: readFileSync(new URL('docs/蝴蝶效应原文.txt', root), 'utf8') };
    if (name.startsWith('./')) return load(name.slice(2).replace(/\.js$/, '').replace(/\.ts$/, '') + '.ts');
    return require(name);
  }, module, module.exports);
  if (!Object.keys(dependencies).length) moduleCache.set(file, module.exports);
  return module.exports;
}
const core = load('core.ts'), protocol = load('protocol.ts'), journal = load('journal.ts'), memory = load('memory.ts'), budget = load('prompt-budget.ts'), memoryDatabase = load('memory-database.ts');
const pause = () => new Promise(resolve => setImmediate(resolve));
function deferred() { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; }
const effect = (id = 'result-a') => ({ resultId: id, source: '玩家救起落水者', outcome: '落水者已脱离危险', evidence: '落水者已经安全获救', amount: '1', standardSpec: '一位普通人被实际救起并脱险', established: true, independent: true, kind: 'initial', world: '世界A' });
const response = (effects = []) => JSON.stringify({ world: { name: '世界A', systems: ['普通生命'], evidence: '故事中确认的世界' }, quotes: [], effects, ripples: [] });
const income = (id = 'r1') => ({ requestId: `earn:${id}`, resultId: id, world: '世界A', source: '实际行为', outcome: '明确成立的独立改变', evidence: '可查证的故事内容', amount: '10', standardSpec: '固定影响十点规格', established: true });
const harness = (saved = {}, options = {}) => nativeControllerHarness({ load, core, protocol, income, response }, saved, options);

test('one evaluation shows every committed effect and retries show zero new income instead of the previous transaction', async () => {
  const h=harness();
  try {
    await h.controller.start();
    const evidence='落水者已经安全获救。孩子已经平安抵达岸边。';h.setStory(evidence);
    const first=effect('first'),second={...effect('second'),source:'玩家救起孩子',outcome:'孩子已经平安抵达岸边',evidence:'孩子已经平安抵达岸边',amount:'2',standardSpec:'孩子脱离实际生命危险'};
    h.setGeneration(async()=>response([first,second]));
    const oldReceipt=h.records.get('wallet').transactions[0].receipt;
    await h.controller.settle();assert.equal(h.controller.state.error,'');
    const receipt=h.controller.state.receipt;
    assert.match(receipt,/10 → 13/);assert.match(receipt,/落水者已脱离危险/);assert.match(receipt,/孩子已经平安抵达岸边/);
    assert.match(h.controller.state.receiptLabel,/本次核对/);
    await h.controller.refresh();assert.equal(h.controller.state.receipt,receipt,'a normal refresh must not replace the aggregate with the last individual transaction');
    assert.equal(h.records.get('wallet').transactions[0].receipt,oldReceipt);
    const committed=JSON.stringify(h.records.get('wallet'));
    await h.controller.settle();assert.equal(h.controller.state.error,'');
    assert.match(h.controller.state.receipt,/13 → 13/);assert.match(h.controller.state.receipt,/无新增计功或消费/);
    assert.doesNotMatch(h.controller.state.receipt,/新增因果点 \+2/);
    assert.equal(JSON.stringify(h.records.get('wallet')),committed,'the display receipt must not change immutable ledger history');
  } finally {await h.controller.dispose();}
});

test('round receipt and credit count use the transaction baseline, excluding another committed update during evaluation',async()=>{
  const h=harness();
  try{
    await h.controller.start();h.setGeneration(async()=>response([effect('this-round')]));
    const held=h.holdTransaction(),settlement=h.controller.settle();await held.entered;
    h.records.set('wallet',core.credit(h.records.get('wallet'),{...income('another-tab'),amount:'7',standardSpec:'另一标签页真实七点结果',source:'另一标签页行动'}).ledger);
    held.release();await settlement;
    assert.equal(h.controller.state.error,'');assert.match(h.controller.state.receipt,/17 → 18/);
    assert.doesNotMatch(h.controller.state.receipt,/另一标签页行动/);assert.match(h.controller.state.notice,/本轮新增 1 笔/);
  }finally{await h.controller.dispose();}
});

function quote(id,world){return {id,name:id,category:`${world}体系`,world,kind:'permanent',price:'1',spec:{...core.BASELINE_SPEC,content:`${id}的完整独有能力`}};}
function reply(world,quotes=[]){return JSON.stringify({world:{name:world,systems:[`${world}体系`],evidence:'已完成故事确认世界'},quotes,effects:[],ripples:[]});}
function appSetup(controller){
  const {parse,compileScript}=require('vue/compiler-sfc');
  const descriptor=parse(readFileSync(new URL('src/App.vue',root),'utf8')).descriptor;
  const script=compileScript(descriptor,{id:'requirement-products',genDefaultAs:'component'});
  const output=ts.transpileModule(`${script.content}\nexport default component;`,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
  const module={exports:{}};
  new Function('require','module','exports',output)(name=>name.startsWith('./')?load(name.slice(2).replace(/\.(?:js|ts)$/,'')+'.ts'):require(name),module,module.exports);
  return module.exports.default.setup({controller,assetUrl:'https://example.test/assets/shiro.png',appearance:{state:{}}},{expose(){}});
}
test('settlement world changes replace stale product matches and new same-world quotes become visible', async()=>{
  const h=harness();
  try {
    await h.controller.start();const app=appSetup(h.controller);
    h.setGeneration(async()=>reply('世界A',[quote('A能力','世界A')]));await h.controller.generateWorld();
    assert.ok(app.products.value.some(q=>q.id==='A能力'));h.controller.state.category='世界A体系';
    h.setGeneration(async()=>reply('世界B',[quote('B能力','世界B')]));await h.controller.settle();assert.equal(h.controller.state.error,'');
    assert.equal(h.controller.state.category,'全部');
    assert.deepEqual(app.products.value.map(q=>q.id),[core.BASELINE_QUOTE_ID,'B能力']);
    h.setGeneration(async()=>reply('世界B',[quote('B新能力','世界B')]));await h.controller.settle();
    assert.deepEqual(app.products.value.map(q=>q.id),[core.BASELINE_QUOTE_ID,'B能力','B新能力']);
    h.setGeneration(async()=>reply('世界C'));await h.controller.settle();
    assert.deepEqual(app.products.value.map(q=>q.id),[core.BASELINE_QUOTE_ID]);
    assert.ok(h.records.get('wallet').quotes.some(q=>q.id==='A能力'),'changing the visible world must preserve permanent quote history');
  }finally{await h.controller.dispose();}
});

test('new offers record full fixed specifications without pretending to unlock possessions; unchanged active follow-ups stay visible',async()=>{
  const h=harness();
  try{
    await h.controller.start();
    const offer=quote('尚未购买的能力','世界A');
    h.setGeneration(async()=>JSON.stringify({world:{name:'世界A',systems:['世界A体系'],evidence:'故事已确认'},quotes:[offer],effects:[],ripples:[{id:'ongoing',world:'世界A',source:'此前真实行动',settled:'已有计功不重计',tracking:'持续等待同伴回信',status:'active'}]}));
    await h.controller.settle();assert.equal(h.controller.state.error,'');
    assert.match(h.controller.state.receipt,/新增可选报价（尚未购买）/);
    for(const value of Object.values(offer.spec))assert.ok(h.controller.state.receipt.includes(value));
    assert.match(h.controller.state.receipt,/新增解锁：无/);assert.match(h.controller.state.receipt,/持续等待同伴回信/);
    await h.controller.settle();assert.equal(h.controller.state.error,'');assert.match(h.controller.state.receipt,/持续等待同伴回信/);
    assert.match(h.controller.state.receipt,/新增解锁：无/);assert.equal(h.records.get('wallet').inventory.length,0);
  }finally{await h.controller.dispose();}
});

function completeLedger(){
  let ledger=core.setWorld(core.credit(core.createLedger('wallet'),income()).ledger,'世界A').ledger;
  for(let i=0;i<45;i++)ledger=journal.appendImpression(ledger,{id:`impression-${i}`,world:'世界A',subject:i<2?'同一人物':`人物${i}`,summary:`第${i}版完整重要印象 ${'不能裁掉的细节'.repeat(80)}`,evidence:'有据可查的完整原文',source:'story'}).ledger;
  ledger=core.purchase(ledger,{requestId:'buy',quoteId:core.BASELINE_QUOTE_ID,quantity:2}).ledger;
  const ripple={id:'ripple',world:'世界A',source:'最初真实行动',settled:'已经计功',tracking:'早期余波版本',status:'active'};
  ledger=core.upsertRipple(ledger,ripple).ledger;
  ledger=core.upsertRipple(ledger,{...ripple,tracking:'最新余波版本'}).ledger;
  ledger=journal.registerQuest(ledger,{id:'quest',world:'世界A',title:'寻找同伴',objective:'找到失踪者',reason:'连锁反应',sourceRippleId:'ripple'}).ledger;
  return journal.transitionQuest(ledger,{questId:'quest',status:'active'}).ledger;
}
test('legacy read-only full projection retains history rows while AI summary remains bounded',()=>{
  const ledger=completeLedger(),before=JSON.stringify(ledger),full=memoryDatabase.createCompleteMemoryTableExport(ledger);
  const sheets=Object.values(full).filter(v=>v?.uid);
  assert.equal(sheets.length,4);assert.equal(sheets[0].content.length,46);
  assert.equal(JSON.parse(sheets[0].content[1][4]).summary,ledger.impressions[0].summary);
  assert.equal(JSON.parse(sheets[0].content[2][4]).summary,ledger.impressions[1].summary,'superseded impressions remain available in the full export');
  const all=sheets.flatMap(s=>s.content.slice(1));assert.equal(new Set(all.map(row=>row[1])).size,all.length);
  assert.ok(all.every(row=>row[2]==='wallet'));
  assert.ok(sheets[2].content.slice(1).some(row=>row[1].includes(':transaction:')));
  assert.ok(sheets[3].content.slice(1).some(row=>row[1].includes(':ripple-history:')));
  const second=memoryDatabase.createCompleteMemoryTableExport(journal.appendImpression(ledger,{id:'new',world:'世界A',subject:'后来者',summary:'新的完整印象',evidence:'后来发生的真实证据',source:'story'}).ledger);
  assert.deepEqual(second.sheet_shiro_memory_1.content.slice(1,-1),full.sheet_shiro_memory_1.content.slice(1));
  const summary=memory.buildMemory(ledger,{budget:2048});assert.ok(summary.usedBytes<=2048);assert.ok(summary.omitted>0);
  for(const sheet of sheets){assert.equal(sheet.exportConfig.enabled,false);assert.equal(sheet.exportConfig.injectIntoWorldbook,false);assert.equal(sheet.updateConfig.updateFrequency,0);}
  assert.equal(JSON.stringify(ledger),before);
});
test('read-only snapshots verify scope, detach data, notify committed changes and disappear on account switch or disposal',async()=>{
  const h=harness({}, {ledger:completeLedger()}),notices=[];
  try{
    const unsubscribe=h.controller.subscribeMemorySnapshots(n=>notices.push(n));
    await h.controller.start();await pause();const snapshot=await h.controller.readMemorySnapshot();
    assert.equal(snapshot.scope.chat,'chat-A');assert.equal(snapshot.scope.account,'wallet');assert.equal(snapshot.scope.handle,'alice');
    const source=JSON.stringify(h.records.get('wallet'));snapshot.tables[0].rows[0][1]='consumer mutation';
    assert.equal(JSON.stringify(h.records.get('wallet')),source);
    h.controller.state.impressionSubject='新人物';h.controller.state.impressionSummary='已确认的新事实';await h.controller.saveImpression();
    assert.equal(notices.at(-1).revision,h.records.get('wallet').revision);
    await h.controller.exportCompleteMemory();assert.match(h.downloads.at(-1)[0],/完整业务记录/);
    assert.equal(JSON.parse(h.downloads.at(-1)[1]).sheet_shiro_memory_1.content.length,47);
    h.setHandle('bob');await assert.rejects(h.controller.readMemorySnapshot(),/登录账户已变化/);
    assert.equal(notices.at(-1),null);assert.equal(await h.controller.readMemorySnapshot(),null);
    unsubscribe();await h.controller.dispose();assert.equal(await h.controller.readMemorySnapshot(),null);
  }finally{await h.controller.dispose();}
});

test('paged snapshot defaults to at most 50 rows per table and searches all history with stable offsets',()=>{
  let ledger=completeLedger();
  for(let i=45;i<110;i++)ledger=journal.appendImpression(ledger,{id:`impression-${i}`,world:'世界A',subject:`人物${i}`,summary:`特殊条目${i}`,evidence:'真实而完整的依据',source:'story'}).ledger;
  const first=memoryDatabase.readCompleteMemoryPages(ledger);assert.equal(first[0].total,110);assert.equal(first[0].rows.length,50);assert.ok(first.every(table=>table.rows.length<=50));
  const second=memoryDatabase.readCompleteMemoryPages(ledger,{offsets:{impressions:50},limit:50});
  assert.equal(second[0].offset,50);assert.equal(second[0].rows.length,50);assert.ok(second[0].recordIds.every(id=>!first[0].recordIds.includes(id)));
  const last=memoryDatabase.readCompleteMemoryPages(ledger,{offsets:{impressions:100}});assert.equal(last[0].rows.length,10);
  const found=memoryDatabase.readCompleteMemoryPages(ledger,{query:'特殊条目109'});assert.equal(found[0].total,1);assert.match(found[0].rows[0][1],/特殊条目109/);
  assert.throws(()=>memoryDatabase.readCompleteMemoryPages(ledger,{limit:101}),/100/);
  assert.throws(()=>memoryDatabase.readCompleteMemoryPages(ledger,{offsets:{impressions:-1}}),/非负/);
});

test('a paged snapshot waiting on native storage cannot return the previous chat account after a chat change',async()=>{
  const h=harness();
  try{
    await h.controller.start();await pause();
    h.setChatLedger('chat-B',core.createLedger('other'));
    const notices=[];h.controller.subscribeMemorySnapshots(n=>notices.push(n));
    const held=h.holdRead(),pending=h.controller.readMemorySnapshot();await held.entered;
    h.changeChat('chat-B');held.release();await assert.rejects(pending,/切换/);await pause();await pause();
    assert.ok(notices.includes(null));assert.equal((await h.controller.readMemorySnapshot()).scope.account,'other');
    const heldChat=h.holdRead(),chatRead=h.controller.readMemorySnapshot();await heldChat.entered;
    h.changeChat('chat-A');heldChat.release();await assert.rejects(chatRead,/切换/);await pause();await pause();
    const current=await h.controller.readMemorySnapshot();assert.equal(current.scope.chat,'chat-A');assert.equal(current.scope.account,'wallet');
  }finally{await h.controller.dispose();}
});

test('purchase, use and transfer each publish the committed revision and appear in the full native export without model calls',async()=>{
  const ledger=core.registerQuote(core.credit(core.createLedger('wallet'),income()).ledger,{...quote('药剂','世界A'),kind:'consumable'}).ledger;
  const h=harness({}, {ledger}),notices=[];let modelCalls=0;
  try{
    h.setGeneration(()=>{modelCalls++;throw new Error('local inventory operation must not call a model');});
    await h.controller.start();await pause();h.controller.subscribeMemorySnapshots(n=>notices.push(n));
    h.controller.state.selectedQuote=h.records.get('wallet').quotes.find(q=>q.id==='药剂');h.controller.state.quantity=2;await h.controller.buy();
    assert.equal(h.controller.state.error,'');assert.equal(notices.at(-1).revision,h.records.get('wallet').revision);
    const bought=h.records.get('wallet').inventory[0];
    await h.controller.inventoryAction(bought.id,'use',1);assert.equal(h.controller.state.error,'');assert.equal(notices.at(-1).revision,h.records.get('wallet').revision);
    await h.controller.inventoryAction(bought.id,'transfer',1,'同伴');assert.equal(h.controller.state.error,'');assert.equal(notices.at(-1).revision,h.records.get('wallet').revision);
    assert.equal(new Set(notices.filter(n=>n&&n.revision>ledger.revision).map(n=>n.revision)).size,3);assert.equal(modelCalls,0);
    const page=(await h.controller.readMemorySnapshot()).tables.find(t=>t.key==='inventory');assert.equal(page.total,4);assert.match(page.rows[0][1],/持有 0 · 已用 1 · 已转 1/);
    await h.controller.exportCompleteMemory();const full=JSON.parse(h.downloads.at(-1)[1]);
    const native=load('native-schema.ts').readNativeSnapshot(full,{origin:location.origin,handle:'alice',chat:'chat-A'}).ledger;
    assert.equal(native.inventory[0].remaining,0);assert.equal(native.inventory[0].consumed,1);assert.equal(native.inventory[0].transferred,1);
    assert.deepEqual(native.transactions.filter(tx=>tx.kind!=='credit').map(tx=>tx.kind),['purchase','use','transfer']);assert.equal(native.transactions.at(-1).recipient,'同伴');
  }finally{await h.controller.dispose();}
});

test('complete export rejects an authenticated user lookup failure for the database view while shop clicks handle it without downloading or changing accounts',async()=>{
  let failLookup=false,requests=0;
  const nativeHost=load('host.ts'),previousFetch=globalThis.fetch,previousTavern=globalThis.SillyTavern;
  const h=harness({}, {verifyHandle:()=>failLookup?nativeHost.verifiedHandle():Promise.resolve('alice')});
  globalThis.SillyTavern={getContext:()=>({...h.hostContext,getRequestHeaders:()=>({'X-Fixture':'auth-failure'})})};
  globalThis.fetch=async(url,options)=>{
    assert.equal(url,'/api/users/me');assert.equal(options.cache,'no-store');requests++;
    return {ok:false,status:503};
  };
  try{
    await h.controller.start();await pause();
    const before=JSON.stringify([...h.records]),account=h.controller.state.settings.accountId;
    failLookup=true;
    await assert.rejects(h.controller.exportCompleteMemory(),/无法核实酒馆登录账户/);
    assert.match(h.controller.state.error,/无法核实酒馆登录账户/);
    const app=appSetup(h.controller);
    await assert.doesNotReject(app.exportCompleteMemory());
    assert.match(h.controller.state.error,/无法核实酒馆登录账户/);
    await assert.doesNotReject(h.controller.exportTables(),'unrelated run callers retain their existing error handling');
    assert.equal(requests,3);assert.equal(h.downloads.length,0);
    assert.equal(h.controller.state.settings.accountId,account);assert.equal(JSON.stringify([...h.records]),before);
    failLookup=false;await h.controller.exportCompleteMemory();assert.equal(h.downloads.length,1);
    assert.equal(JSON.stringify([...h.records]),before);
  }finally{
    await h.controller.dispose();globalThis.fetch=previousFetch;
    if(previousTavern===undefined)delete globalThis.SillyTavern;else globalThis.SillyTavern=previousTavern;
  }
});

