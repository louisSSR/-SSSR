import { reactive, toRaw } from 'vue';
import { NativeFourTableRepository } from './native-storage';
import { createNativeFourTableTemplate, createNativeFourTableExport } from './native-schema';
import { readLegacyBackups } from './legacy-backup';
import { credit, registerQuote, purchase, setWorld, upsertRipple, useInventory, transferInventory, BASELINE_QUOTE_ID, type Ledger, type Quote } from './core';
import { makeRequest, parseWorldReply, type RequestMode } from './protocol';
import { appendImpression, registerQuest, transitionQuest } from './journal';
import { buildMemory } from './memory';
import { countPrompt, clipUtf8 } from './prompt-budget';
import { createMemoryTableExport, readCompleteMemoryPages, type MemoryPageOptions } from './memory-database';
import { buildRoundReceipt } from './settlement-view';
import { discoverDatabaseApi, callDatabaseAI } from './database';
import { MODULE_ID, context, chatIdentity, hasChat, verifiedHandle, verifyNativeChatSaved, storyContext, setLedgerPrompt, download, serverBackup } from './host';

interface Settings {accountId:string;provider:'host'|'database';preset:string;autoWorld:boolean;autoSettle:boolean;worldNotes:string;syncChats:string[];memoryTokenBudget:number}
export type MemorySnapshotNotice=Readonly<{chat:string;account:string;revision:number}>|null;
const defaults:Settings={accountId:'',provider:'host',preset:'',autoWorld:true,autoSettle:true,worldNotes:'',syncChats:[],memoryTokenBudget:2048};
export function createController(){
  const state=reactive({open:false,tab:'home',ledger:null as Ledger|null,accounts:[] as Ledger[],legacyAccounts:[] as {accountId:string;label:string;balance:string}[],handle:'',busy:false,status:'正在连接酒馆…',error:'',notice:'',world:'尚未识别世界',systems:[] as string[],worldEvidence:'',activeIds:[] as string[],goal:'',search:'',category:'全部',affordable:false,settings:{...defaults},selectedQuote:null as Quote|null,quantity:1,accountLabel:'我的本源',importError:'',syncStatus:'当前聊天尚未启用',receipt:'',receiptLabel:'最近一笔交易回执',apiStatus:'待连接',ready:false,memory:null as ReturnType<typeof buildMemory>|null,memoryTokens:0,memoryMethod:'',memoryQuery:'',requestTokens:0,impressionSubject:'',impressionSummary:'',impressionPinned:true});
  let store:NativeFourTableRepository|undefined,epoch=0,alive=true,key='',timer:ReturnType<typeof setTimeout>|undefined;
  let nativePoll:ReturnType<typeof setInterval>|undefined,nativeApi:ReturnType<typeof discoverDatabaseApi>=null;
  let nativeCallback:((data:unknown,meta?:{persisted:boolean})=>void)|undefined;
  let queue=Promise.resolve();const unsub:(()=>void)[]=[];let channel:BroadcastChannel|undefined;
  const clean=<T>(x:T):T=>JSON.parse(JSON.stringify(x));
  const saveSettings=()=>{if(key)localStorage.setItem(key,JSON.stringify(state.settings));void inject();};
  function loadChatSettings(){
    key=`${MODULE_ID}:settings:v2:${state.handle}:${chatIdentity()}`;
    let saved:Partial<Settings>={};
    try{const value=JSON.parse(localStorage.getItem(key)??'{}');if(value&&typeof value==='object'&&!Array.isArray(value))saved=value;}catch{}
    state.settings={accountId:typeof saved.accountId==='string'?saved.accountId:'',provider:saved.provider==='database'?'database':'host',preset:typeof saved.preset==='string'?saved.preset.slice(0,256):'',autoWorld:saved.autoWorld===undefined?true:saved.autoWorld===true,autoSettle:saved.autoSettle===undefined?true:saved.autoSettle===true,worldNotes:typeof saved.worldNotes==='string'?saved.worldNotes.slice(0,20000):'',syncChats:[],memoryTokenBudget:[2048,4096,8192].includes(saved.memoryTokenBudget as number)?saved.memoryTokenBudget!:2048};
  }
  const mark=()=>({epoch,chat:chatIdentity(),account:state.settings.accountId,handle:state.handle});
  const current=(m:ReturnType<typeof mark>)=>alive&&m.epoch===epoch&&m.chat===chatIdentity()&&m.account===state.settings.accountId&&m.handle===state.handle;
  const notify=(message:string)=>{state.notice=message;state.error='';};
  const fail=(e:unknown)=>{state.error=e instanceof Error?e.message:String(e);state.status='需要处理';};
  const changed=()=>{channel?.postMessage({accountId:state.settings.accountId});};
  const snapshotListeners=new Set<(notice:MemorySnapshotNotice)=>void>();
  const publishSnapshot=()=>{
    const ledger=state.ledger;
    const notice=alive&&hasChat()&&ledger&&ledger.accountId===state.settings.accountId?Object.freeze({chat:chatIdentity(),account:ledger.accountId,revision:ledger.revision}):null;
    for(const listener of snapshotListeners)try{listener(notice);}catch{/* A consumer cannot interrupt ledger or prompt updates. */}
  };
  let receiptMark:{account:string;chat:string;revision:number}|undefined;
  let injectionTicket=0;
  function clearNativeConsumers(){
    injectionTicket++;state.ledger=null;state.memory=null;state.memoryTokens=0;state.accounts=[];state.settings.accountId='';state.selectedQuote=null;state.activeIds=[];state.world='原生四表待核验';state.systems=[];state.worldEvidence='';receiptMark=undefined;state.receipt='';
    setLedgerPrompt('');publishSnapshot();
  }
  const inject=async()=>{
    const ticket=++injectionTicket;
    if(!state.ledger||state.ledger.accountId!==state.settings.accountId||!hasChat()){setLedgerPrompt('');state.memory=null;state.memoryTokens=0;return;}
    const l=clean(toRaw(state.ledger)),m=mark(),limit=state.settings.memoryTokenBudget;
    const query=state.memoryQuery+' '+clipUtf8(storyContext().text.slice(-8000),10000);
    const fitsCurrent=()=>alive&&ticket===injectionTicket&&current(m)&&state.ledger?.revision===l.revision;
    let pack=buildMemory(l,{budget:limit,query});
    setLedgerPrompt(pack.text);state.memory=pack;state.memoryTokens=pack.usedBytes;state.memoryMethod='UTF-8 字节保守预算';
    const host=context();if(typeof host.getTokenCountAsync!=='function')return;
    let bytes=Math.min(24000,limit*3);
    for(let attempt=0;attempt<4;attempt++){
      pack=buildMemory(l,{budget:Math.max(1400,bytes),query});
      const counted=await countPrompt(pack.text,t=>host.getTokenCountAsync(t,0));
      if(!fitsCurrent())return;
      if(counted.count<=limit){state.memory=pack;state.memoryTokens=counted.count;state.memoryMethod=counted.method;setLedgerPrompt(pack.text);return;}
      bytes=Math.floor(bytes*limit/counted.count*.85);if(bytes<1400)break;
    }
  };
  async function refresh(m=mark()){
    if(!store||!hasChat())return;
    let accounts:Ledger[];
    try{await store.refresh();if(!current(m))return;accounts=await store.list();}catch(error){if(current(m))clearNativeConsumers();throw error;}
    if(!current(m))return;
    state.accounts=accounts;
    if(!accounts.some(account=>account.accountId===m.account)){
      state.settings.accountId=accounts.length===1?accounts[0]!.accountId:'';m=mark();saveSettings();
    }
    let l:Ledger|undefined;
    try{l=m.account?await store.read(m.account):undefined;}catch(error){if(current(m))clearNativeConsumers();throw error;}
    if(!current(m))return;
    state.ledger=l??null;
    state.ready=true;state.syncStatus=l?`原生四表 · 版本 ${l.revision}`:'原生四表已就绪，等待初始化本源';
    if(l){state.world=l.world;if(!state.activeIds.length)state.activeIds=[BASELINE_QUOTE_ID,...l.quotes.filter(q=>q.world===l.world).map(q=>q.id)];}
    if(current(m)){
      inject();
      publishSnapshot();
      if(!l||receiptMark?.account!==m.account||receiptMark.chat!==m.chat||receiptMark.revision!==l.revision){
        receiptMark=undefined;state.receipt=l?.transactions.at(-1)?.receipt??'';state.receiptLabel='最近一笔交易回执';
      }
    }
  }
  async function verify(m:ReturnType<typeof mark>){
    if(!current(m))throw new Error('聊天或本源已切换，本次操作已取消');
    const handle=await verifiedHandle();
    if(handle!==m.handle){epoch++;injectionTicket++;state.ledger=null;state.memory=null;state.memoryTokens=0;state.accounts=[];state.legacyAccounts=[];state.settings.accountId='';state.selectedQuote=null;state.ready=false;state.busy=false;setLedgerPrompt('');publishSnapshot();throw new Error('登录账户已变化，已清除本页旧账户资料，请刷新酒馆');}
    if(!current(m))throw new Error('登录账户或聊天已变化，本次操作已取消');
  }
  async function run(action:()=>Promise<void>,rethrow=false){try{state.error='';await action();}catch(e){if(alive)fail(e);if(rethrow)throw e;}}
  async function sync(m=mark(),force=false){
    if(!store||!current(m))return;
    await refresh(m);
  }
  async function refreshNativeRuntime(){
    if(!store||!hasChat())return;
    const owner=mark();state.busy=true;
    try{
      await verify(owner);
      if(document.getElementById(MODULE_ID)?.hasAttribute('data-native-database-open'))throw new Error('请先关闭原生数据库窗口，再重新载入四表。');
      const api=discoverDatabaseApi();
      if(typeof api?.refreshDataAndWorldbook!=='function')throw new Error('当前数据库缺少原生重载接口，请在原数据库完成重载后再核验。');
      // Explicit user refresh heals the official 1.2.5 B→A empty write-provider transition.
      // Background reads remain read-only, and no failed business operation is retried.
      const refreshed=await api.refreshDataAndWorldbook();
      if(!current(owner))return;
      if(discoverDatabaseApi()!==api||refreshed!==true)throw new Error('原生数据库重新载入未完成，四表尚未重新确认。');
      await sync(owner,true);
      if(alive&&owner.epoch===epoch&&owner.chat===chatIdentity()&&owner.handle===state.handle)notify('当前聊天的原生四表已重新载入，保存已核验。');
    }catch(error){if(current(owner))clearNativeConsumers();throw error;}
    finally{if(alive&&owner.epoch===epoch&&owner.chat===chatIdentity()&&owner.handle===state.handle)state.busy=false;}
  }
  async function boundWorldbook():Promise<string>{
    const c=context(),ch=c.characters?.[c.characterId],name=ch?.data?.extensions?.world;
    if(!name)return '';
    if(typeof c.loadWorldInfo!=='function')throw new Error('宿主无法读取绑定世界书');
    const world=await c.loadWorldInfo(name);return JSON.stringify({boundWorldbook:name,entries:world?.entries??{}});
  }
  async function generate(mode:RequestMode,m=mark()){
    if(!current(m)||!store||!m.account||!hasChat())return;
    if(document.getElementById(MODULE_ID)?.hasAttribute('data-native-database-open'))throw new Error('请先关闭原生数据库窗口，再识别世界、派发委托或核对因果。');
    await verify(m);
    const before=await store.read(m.account);if(!before||!current(m))return;
    const story=storyContext();if(mode==='settle'&&!story.evidence){notify('当前没有可结算的已完成故事');return;}
    state.busy=true;state.status=mode==='world'?'正在识别世界与匹配商品…':mode==='quests'?'白正在整理可选择的委托…':'正在核对本轮实际因果…';
    const notes=state.settings.worldNotes,preset=state.settings.preset,provider=state.settings.provider,goal=state.goal;
    try{
      const worldbook=provider==='database'?await boundWorldbook():'';
      if(!current(m))return;
      const sourceContext=`${story.text}\n${worldbook}\n使用者补充的世界资料（用于匹配，不是成立收益证据）：${notes}`;
      let prompt='',budgetPassed=false;const tokenHost=context();
      for(const bytes of [12000,8000,4000,2000]){
        const recentEvidence=clipUtf8(story.evidence,Math.floor(bytes*.3))+(story.evidence.length>1500?'\n故事末尾：'+clipUtf8(story.evidence.slice(-2500),Math.floor(bytes*.3)):'');
        const boundedContext=`最新已完成AI正文（仅这里的成立事实可计功）：\n${recentEvidence}\n其他世界/历史资料摘录（截短不代表不存在）：\n${clipUtf8(sourceContext,Math.floor(bytes*.4))}`;
        prompt=makeRequest(before,mode,boundedContext,clipUtf8(goal,1500),bytes);
        const counted=await countPrompt(prompt,typeof tokenHost.getTokenCountAsync==='function'?t=>tokenHost.getTokenCountAsync(t,0):undefined);
        if(!current(m))return;
        if(storyContext().stamp!==story.stamp)throw new Error('计数期间故事已变化，旧评估已取消；请重新核对。');
        state.requestTokens=counted.count;
        if(counted.count<=8000){budgetPassed=true;break;}
      }
      if(!budgetPassed)throw new Error('评估请求超过 8000 Token/保守字节预算，未调用模型；请检查酒馆分词器。完整档案仍在原生四表。');
      if(!current(m)||storyContext().stamp!==story.stamp)throw new Error('调用前聊天或故事已变化，旧评估已取消。');
      let raw:string;
      if(provider==='database'){
        const api=discoverDatabaseApi();if(!api)throw new Error('数据库 API 尚未就绪；可切换为酒馆当前连接');
        raw=await callDatabaseAI(api,[{role:'user',content:prompt}],{presetName:preset||undefined,maxTokens:5500});
      }else{
        const c=context();if(typeof c.generateQuietPrompt!=='function')throw new Error('宿主缺少 generateQuietPrompt 接口');
        if(c.onlineStatus==='no_connection')throw new Error('酒馆当前 API 尚未连接。请先在酒馆连接 API，再刷新商店；本源账本已保留');
        raw=await c.generateQuietPrompt({quietPrompt:prompt,quietToLoud:false,skipWIAN:false,responseLength:5500});
      }
      // Never apply a delayed answer to another chat, account, edited message or swipe.
      if(!current(m))return;
      if(storyContext().stamp!==story.stamp)throw new Error('生成期间故事已变化，本轮结果已丢弃；请重新刷新或结算');
      const reply=parseWorldReply(raw,mode,story.evidence);
      await verify(m);if(!current(m))return;
      const acceptedIds:string[]=[];let roundReceipt='',roundCredits=0;
      const result=await store.transact(m.account,l=>{
        if(!current(m)||storyContext().stamp!==story.stamp)throw new Error('提交前聊天或故事已变化，本轮结果已取消');
        let next=setWorld(l,reply.world.name).ledger;
        for(const q of reply.quotes){const r=registerQuote(next,q);next=r.ledger;acceptedIds.push(r.value.id);}
        const resultAliases=new Map<string,string>();
        for(const e of reply.effects){const credited=credit(next,{...e,...(e.parentResultId?{parentResultId:resultAliases.get(e.parentResultId)??e.parentResultId}:{}),requestId:`causal:${e.resultId}`});next=credited.ledger;resultAliases.set(e.resultId,credited.value.id);}
        for(const r of reply.ripples)next=upsertRipple(next,r).ledger;
        for(const impression of reply.impressions)next=appendImpression(next,impression).ledger;
        for(const quest of reply.quests){if(quest.world!==reply.world.name)throw new Error('任务须属于当前识别世界');next=registerQuest(next,quest).ledger;}
        for(const completed of reply.questCompletions){
          if(!reply.effects.some(e=>e.resultId===completed.resultId))throw new Error('任务完成必须引用本轮实际因果结果');
          next=transitionQuest(next,{questId:completed.questId,status:'completed',completionEventId:resultAliases.get(completed.resultId)??completed.resultId}).ledger;
        }
        if(mode==='settle'){roundReceipt=buildRoundReceipt(l,next);roundCredits=next.events.length-l.events.length;}
        return next;
      });
      if(!current(m))return;
      const worldChanged=state.world!==reply.world.name;
      state.world=reply.world.name;state.systems=reply.world.systems;state.worldEvidence=reply.world.evidence;
      if(mode==='world'||worldChanged){
        state.activeIds=[...new Set([BASELINE_QUOTE_ID,...acceptedIds,...(mode==='world'?[]:result.quotes.filter(q=>q.world===reply.world.name).map(q=>q.id))])];
        state.category='全部';state.selectedQuote=null;
      }else if(acceptedIds.length)state.activeIds=[...new Set([...state.activeIds,BASELINE_QUOTE_ID,...acceptedIds])];
      state.ledger=result;state.status='已连接';state.apiStatus='API 响应已验证';
      inject();changed();await refresh(m);if(!current(m))return;
      if(mode==='settle'){
        state.receipt=roundReceipt;state.receiptLabel='本次核对完整回执';
        receiptMark={account:m.account,chat:m.chat,revision:result.revision};
      }
      notify(mode==='world'?`已匹配 ${acceptedIds.length} 件世界商品，报价已保存`:mode==='quests'?`白已整理 ${reply.quests.length} 项委托，接取后才列入当前目标`:`本轮新增 ${roundCredits} 笔有效计功；印象与任务已核对`);
      await sync(m);
    }finally{if(current(m))state.busy=false;}
  }
  function enqueue(mode:RequestMode){
    const m=mark();queue=queue.catch(()=>{}).then(async()=>{if(!current(m))return;try{await generate(mode,m);}catch(e){if(current(m))fail(e);}});return queue;
  }
  function onChat(){
    epoch++;injectionTicket++;state.busy=false;state.ledger=null;state.memory=null;state.accounts=[];state.legacyAccounts=[];state.memoryTokens=0;state.activeIds=[];state.world=hasChat()?'等待读取当前聊天四表':'请先打开聊天';state.systems=[];state.worldEvidence='';state.selectedQuote=null;state.error='';receiptMark=undefined;state.receipt='';
    setLedgerPrompt('');clearTimeout(timer);loadChatSettings();publishSnapshot();state.syncStatus='等待原生四表载入';
    const owner=mark();
    void run(async()=>{
      await refresh(owner);
      if(!alive||owner.epoch!==epoch||owner.chat!==chatIdentity())return;
      if(state.settings.accountId&&state.settings.autoWorld&&hasChat()){
        if(state.settings.provider==='host'&&context().onlineStatus==='no_connection')state.status='等待酒馆 API 连接';
        else timer=setTimeout(()=>void enqueue('world'),600);
      }
    });
  }
  function attachNative(){
    const next=discoverDatabaseApi();if(next===nativeApi)return;
    if(nativeApi&&nativeCallback)nativeApi.unregisterTableUpdateCallback?.(nativeCallback);
    if(nativeApi)clearNativeConsumers();
    nativeApi=next;nativeCallback=undefined;
    if(next){
      nativeCallback=(_data,meta)=>{
        if(!alive||next!==nativeApi)return;
        if(meta?.persisted===false){state.syncStatus='原生四表有未保存更改，业务写入暂时暂停';return;}
        if(!state.busy)void run(()=>refresh());
      };
      next.registerTableUpdateCallback?.(nativeCallback);
      if(store&&hasChat())void run(()=>refresh());
    }
  }
  function subscribe(){
    const c=context();
    const bind=(name:string,fn:(...args:any[])=>void)=>{const type=c.eventTypes[name];if(type){c.eventSource.on(type,fn);unsub.push(()=>c.eventSource.removeListener(type,fn));}};
    bind('CHAT_CHANGED',onChat);
    bind('GENERATION_AFTER_COMMANDS',()=>inject());
    bind('ONLINE_STATUS_CHANGED',()=>{if(state.ready&&state.settings.provider==='host'&&state.settings.autoWorld&&state.settings.accountId&&hasChat()&&context().onlineStatus!=='no_connection'&&!state.busy&&state.activeIds.length===0)void enqueue('world');});
    const completed=()=>{if(state.ready&&state.settings.autoSettle&&state.settings.accountId)void enqueue('settle');};
    bind('MESSAGE_RECEIVED',completed);bind('MESSAGE_UPDATED',completed);
    bind('MESSAGE_SWIPED',()=>{epoch++;state.busy=false;state.selectedQuote=null;});
    bind('MESSAGE_DELETED',()=>{epoch++;state.busy=false;state.selectedQuote=null;});
  }
  async function start(){
    subscribe();
    try{
      const handle=await verifiedHandle();if(!alive)return;state.handle=handle;
      store=new NativeFourTableRepository({
        scope:()=>({origin:location.origin,handle:state.handle,chat:chatIdentity(),epoch}),getApi:()=>discoverDatabaseApi(),
        canWrite:()=>alive&&hasChat()&&!document.getElementById(MODULE_ID)?.hasAttribute('data-native-database-open'),
        verifyPersisted:async({stage,scope,tables,ledger})=>{
          if(scope.epoch!==epoch||scope.handle!==state.handle||scope.chat!==chatIdentity())throw new Error('原生四表保存期间聊天已切换');
          const verified=await verifyNativeChatSaved(scope.chat,tables,stage!=='preflight'||!!ledger);
          if(scope.epoch!==epoch||scope.handle!==state.handle||scope.chat!==chatIdentity())throw new Error('原生四表保存核验后聊天已切换');
          return verified;
        },
      });
      loadChatSettings();state.ready=true;state.status='已连接原生四表';state.apiStatus='使用酒馆或数据库中已配置的 API';
      if(typeof BroadcastChannel!=='undefined'){channel=new BroadcastChannel(`${MODULE_ID}:${handle}`);channel.onmessage=()=>{void run(()=>refresh());};}
      attachNative();nativePoll=setInterval(attachNative,1000);
      const foreground=()=>{if(alive&&!document.hidden)void run(()=>refresh());};document.addEventListener('visibilitychange',foreground);unsub.push(()=>document.removeEventListener('visibilitychange',foreground));
      onChat();
    }catch(e){fail(e);}
  }
  async function createAccount(){await run(async()=>{
    if(!store)throw new Error('账户存储尚未就绪');await verifiedHandle().then(h=>{if(h!==state.handle)throw new Error('登录账户已变化，请刷新');});
    const ledger=await store.create(crypto.randomUUID(),state.accountLabel.trim()||'我的本源');
    epoch++;injectionTicket++;setLedgerPrompt('');state.memory=null;state.ledger=ledger;state.settings.accountId=ledger.accountId;saveSettings();await refresh();notify('当前聊天的原生四表已初始化，余额从 0 点开始');
  });}
  async function selectAccount(id:string){epoch++;injectionTicket++;state.ledger=null;state.memory=null;state.memoryTokens=0;setLedgerPrompt('');state.settings.accountId=id;publishSnapshot();saveSettings();await run(()=>refresh());onChat();}
  async function buy(){await run(async()=>{
    if(!store||!state.selectedQuote)throw new Error('请先选择完整商品规格');
    const m=mark(),quoteId=state.selectedQuote.id,quantity=state.quantity,requestId=crypto.randomUUID();state.busy=true;
    try{await verify(m);const r=await store.transact(m.account,l=>{if(!current(m))throw new Error('提交前本源或聊天已变化，兑换已取消');return purchase(l,{requestId,quoteId,quantity});});changed();if(current(m)){state.selectedQuote=null;await refresh(m);notify('兑换已到账，完整所得和回执已保存');await sync(m);}}
    finally{if(current(m))state.busy=false;}
  });}
  async function inventoryAction(id:string,action:'use'|'transfer',quantity:number,recipient=''){await run(async()=>{
    if(!store)return;const m=mark();await verify(m);
    await store.transact(m.account,l=>{if(!current(m))throw new Error('提交前本源或聊天已变化，资产登记已取消');return action==='use'?useInventory(l,{requestId:crypto.randomUUID(),inventoryId:id,quantity}):transferInventory(l,{requestId:crypto.randomUUID(),inventoryId:id,quantity,recipient});});
    changed();await refresh(m);await sync(m);notify(action==='use'?'实际消耗已记录':'物品归属已更新');
  });}
  async function enableTables(){await run(async()=>{
    if(!hasChat())throw new Error('请先打开聊天');
    download('蝴蝶效应_原生四表_v2_空模板.json',JSON.stringify(createNativeFourTableTemplate(),null,2));
    notify('已下载原生四表空模板。请在数据库原生模板入口合并、保存，关闭编辑器后刷新；现有表不会被插件覆盖。');
  });}
  async function exportLedger(server=false){await run(async()=>{
    if(!store||!state.settings.accountId)throw new Error('请先选择本源');const m=mark();await verify(m);const backup=await store.export(m.account);await verify(m);const text=JSON.stringify(backup,null,2);
    const name=`shiro-butterfly-${m.account}-${Date.now()}.json`;
    if(server){const path=await serverBackup(text,name,m.handle);notify(`服务器备份已写入并复读核验：${path}`);}else{download(name,text);notify('已导出完整账本，请保存备份');}
  });}
  async function importLedger(file:File){await run(async()=>{
    if(!store)throw new Error('存储尚未就绪');if(file.size>30_000_000)throw new Error('备份超过30MB');
    const content=await file.text(),m=mark();await verify(m);
    const l=await store.import(content);if(!current(m))return;state.settings.accountId=l.accountId;saveSettings();await refresh();notify(`已将完整历史恢复到当前空四表“${l.label}”；原有数据不会合并或覆盖`);
  });}
  async function exportTables(){await run(async()=>{
    if(!store||!state.settings.accountId)throw new Error('请先选择本源');const m=mark();await verify(m);const l=await store.read(m.account);await verify(m);if(!l)throw new Error('本源不存在');
    download(`蝴蝶原生四表-${m.account}-${Date.now()}.json`,JSON.stringify(createNativeFourTableExport(l,{origin:location.origin,handle:m.handle,chat:m.chat}),null,2));notify('已导出原生四表完整业务数据，包含报价、交易与历史');
  });}
  async function exportMemory(){await run(async()=>{
    if(!store||!state.settings.accountId)throw new Error('请先选择本源');const m=mark();await verify(m);await inject();await verify(m);
    if(!state.memory)throw new Error('请先打开目标聊天');
    download(`蝴蝶四表-记忆快照-${m.account}-${Date.now()}.json`,JSON.stringify(createMemoryTableExport(state.memory,m.account),null,2));
    notify('已导出本次四表记忆快照。完整历史随账本备份保留；原生表默认不重复注入 AI。');
  });}
  async function readCommittedMemoryLedger(){
    if(!alive||!store||!state.ready||!state.settings.accountId||!hasChat())return null;
    const m=mark();await verify(m);const ledger=await store.read(m.account);await verify(m);
    if(!ledger)return null;
    if(state.ledger?.accountId===ledger.accountId&&state.ledger.revision>ledger.revision)throw new Error('读取期间账本已更新，请重新读取四表');
    return {mark:m,scope:{origin:location.origin,handle:m.handle,chat:m.chat,account:m.account},ledger};
  }
  async function readMemorySnapshot(options:MemoryPageOptions={}){
    const value=await readCommittedMemoryLedger();if(!value)return null;
    if(!current(value.mark))throw new Error('读取期间聊天或本源已切换，请重新读取四表');
    // A bounded detached page, never the ledger/store or the complete native export.
    return {version:1 as const,source:'native-four-tables' as const,scope:value.scope,revision:value.ledger.revision,updatedAt:value.ledger.updatedAt,tables:readCompleteMemoryPages(value.ledger,options)};
  }
  function subscribeMemorySnapshots(listener:(notice:MemorySnapshotNotice)=>void){
    if(typeof listener!=='function')throw new TypeError('四表订阅需要回调函数');
    if(!alive)return ()=>{};
    snapshotListeners.add(listener);
    return ()=>{snapshotListeners.delete(listener);};
  }
  async function exportCompleteMemory(){await run(async()=>{
    const value=await readCommittedMemoryLedger();if(!value)throw new Error('请先打开聊天并选择本源');
    if(!current(value.mark))throw new Error('导出前聊天或本源已切换，请重新导出四表');
    download(`蝴蝶四表-完整业务记录-${value.scope.account}-${Date.now()}.json`,JSON.stringify(createNativeFourTableExport(value.ledger,value.scope),null,2));
    notify('已导出完整原生四表，不受 AI 摘要预算裁剪。跨聊天恢复须显式导入到空四表。');
  },true);}
  async function taskAction(questId:string,status:'active'|'dismissed'){await run(async()=>{
    if(!store)return;const m=mark();await verify(m);
    await store.transact(m.account,l=>{if(!current(m))throw new Error('聊天或本源已切换');return transitionQuest(l,{questId,status});});
    changed();await refresh(m);notify(status==='active'?'委托已接取；实际目标成立后再核对因果。':'委托已搁置，已有点数与历史保留。');
  });}
  async function saveImpression(){await run(async()=>{
    if(!store)return;const m=mark();await verify(m);const subject=state.impressionSubject,summary=state.impressionSummary,pinned=state.impressionPinned;
    await store.transact(m.account,l=>{if(!current(m))throw new Error('聊天或本源已切换');return appendImpression(l,{id:crypto.randomUUID(),world:l.world,subject,summary,evidence:'使用者手动确认的记忆，不作为自动计功证据。',source:'user',pinned});});
    if(current(m)){state.impressionSubject='';state.impressionSummary='';changed();await refresh(m);notify('重要印象已永久保存；相同对象的旧记录保留在档案中。');}
  });}
  async function listLegacyBackups(){await run(async()=>{
    const m=mark();await verify(m);const rows=await readLegacyBackups(location.origin,m.handle);await verify(m);
    state.legacyAccounts=rows.map(({accountId,label,balance})=>({accountId,label,balance}));
    notify(rows.length?'仅找到旧版备份；请选择一份导出，不会自动导入或合并余额。':'此浏览器、源站和用户没有旧版本地备份。');
  });}
  async function exportLegacyBackup(accountId:string){await run(async()=>{
    const m=mark();await verify(m);const rows=await readLegacyBackups(location.origin,m.handle);await verify(m);
    const ledger=rows.find(row=>row.accountId===accountId);if(!ledger)throw new Error('未找到指定旧备份');
    download(`蝴蝶旧版备份-${accountId}-${Date.now()}.json`,JSON.stringify({format:'shiro-butterfly-ledger',version:1,exportedAt:new Date().toISOString(),scope:{origin:location.origin,handle:m.handle},ledger},null,2));
    notify('旧备份已导出，原件未改动。可在指定聊天的空四表显式恢复；已有原生本源不会被覆盖。');
  });}
  function openNativeDatabase(){void run(async()=>{
    const api=discoverDatabaseApi() as {openVisualizer?:()=>unknown}|null;
    if(typeof api?.openVisualizer!=='function')throw new Error('原生数据库未就绪，请先启用数据库扩展');
    state.open=false;state.selectedQuote=null;
    await api.openVisualizer();
  });}
  async function dispose(){alive=false;epoch++;publishSnapshot();snapshotListeners.clear();clearTimeout(timer);clearInterval(nativePoll);if(nativeApi&&nativeCallback)nativeApi.unregisterTableUpdateCallback?.(nativeCallback);nativeApi=null;nativeCallback=undefined;unsub.forEach(fn=>fn());channel?.close();try{setLedgerPrompt('');}catch{}await store?.close();}
  return {state,start,dispose,createAccount,selectAccount,buy,inventoryAction,enableTables,exportLedger,importLedger,exportTables,exportMemory,exportCompleteMemory,readMemorySnapshot,subscribeMemorySnapshots,taskAction,saveImpression,listLegacyBackups,exportLegacyBackup,openNativeDatabase,refreshMemory:()=>run(()=>inject()),saveSettings,refresh:()=>run(()=>refreshNativeRuntime()),generateWorld:()=>enqueue('world'),dispatchTasks:()=>enqueue('quests'),settle:()=>enqueue('settle'),sync:()=>run(()=>sync(mark(),true)),downloadReceipt:()=>download('WJWK-settle.txt',state.receipt,'text/plain'),open:()=>{state.open=true;void run(()=>refresh());},close:()=>{state.open=false;state.selectedQuote=null;}};
}
export type Controller=ReturnType<typeof createController>;
