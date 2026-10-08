import { createButterflyTemplate, type ChatSheets, type DatabaseSheet } from './database';
import type { buildMemory } from './memory';
import { validateLedger, type Ledger } from './core';

/** Portable native snapshot. AI injection is owned by the bounded shop prompt only. */
export function createMemoryTableExport(pack:ReturnType<typeof buildMemory>,accountId:string):ChatSheets {
  const base=createButterflyTemplate();
  const out:ChatSheets={mate:JSON.parse(JSON.stringify(base.mate))};
  const baseSheet=base.sheet_shiro_overview as DatabaseSheet;
  pack.tables.forEach((table,index)=>{
    const uid=`sheet_shiro_memory_${index+1}`;
    const sheet=JSON.parse(JSON.stringify(baseSheet)) as DatabaseSheet;
    sheet.uid=uid;sheet.name=`蝴蝶·${table.title}`;sheet.orderNo=index;
    const columns=['记录ID','本源账户',...table.columns];
    sheet.content=[['row_id',...columns],...table.rows.map((row,rowIndex)=>[String(rowIndex+1),`shiro-memory:${accountId}:${index}:${rowIndex}`,accountId,...row])];
    sheet.sourceData={note:'白·蝴蝶四表记忆快照。完整历史保存在商店本源账本。本表只读展示，不是余额真源。请勿另行打开世界书注入，以免与插件预算摘要重复。',initNode:'由商店导入快照。',insertNode:'禁止AI改账或编造事实。',updateNode:'重新导出快照刷新；不要自动填表。',deleteNode:'不删除本源历史。',ddl:`CREATE TABLE shiro_memory_${index+1} (\n row_id INTEGER PRIMARY KEY, -- 行号\n${columns.map((name,i)=>` c${i} TEXT${i===0?' NOT NULL UNIQUE':''}${i<columns.length-1?',':''} -- ${name}`).join('\n')}\n);`};
    sheet.exportConfig={...(sheet.exportConfig as Record<string,unknown>),enabled:false,injectIntoWorldbook:false,entryName:sheet.name};
    // Native worldbook flags do not control the fill scheduler: zero explicitly opts out.
    sheet.updateConfig={...(sheet.updateConfig as Record<string,unknown>),updateFrequency:0};
    out[uid]=sheet;
  });
  return out;
}

export type MemoryTableKey='impressions'|'accounts'|'inventory'|'ripples';
export interface MemoryPageOptions {query?:string;offsets?:Partial<Record<MemoryTableKey,number>>;limit?:number}
const completeTableDefinitions=()=>[
    {key:'impressions',title:'一、重要印象',columns:['对象 / 世界','最新印象'],rows:[] as string[][]},
    {key:'accounts',title:'二、点数账目',columns:['项目','明细','点数'],rows:[] as string[][]},
    {key:'inventory',title:'三、消费与所得',columns:['所得','实际状态','已消费点数'],rows:[] as string[][]},
    {key:'ripples',title:'四、连锁反应与任务',columns:['类型 / 标识','现况与下一步'],rows:[] as string[][]},
];
type CompleteRecord={table:number;id:string;row:()=>string[];display:()=>string[]};
function* completeRecords(ledger:Ledger):Generator<CompleteRecord>{
  const make=(table:number,kind:string,id:string,row:()=>string[],display=row):CompleteRecord=>({table,id:`shiro-full:v1:${encodeURIComponent(ledger.accountId)}:${kind}:${encodeURIComponent(id)}`,row,display});
  for(const item of ledger.impressions??[])yield make(0,'impression',item.id,()=>[`${item.subject} / ${item.world}`,JSON.stringify(item)],()=>[`${item.subject} / ${item.world}`,`${item.summary}\n依据：${item.evidence}\n${item.source==='user'?'手动确认':'故事证据'}${item.pinned?' · 优先保留':''} · ${item.createdAt}`]);
  yield make(1,'aggregate','balance',()=>['可用余额','精确值',ledger.balance]);
  yield make(1,'aggregate','income',()=>['累计收入','精确值',ledger.income]);
  yield make(1,'aggregate','spend',()=>['累计消费','精确值',ledger.spend]);
  for(const event of ledger.events)yield make(1,'event',event.id,()=>[`已计功 · ${event.id}`,JSON.stringify(event),event.amount],()=>[`计功 · ${event.world}`,`${event.source} → ${event.outcome}\n证据：${event.evidence}\n参照：${event.standardId} · ${event.at}`,`+${event.amount}`]);
  for(const standard of ledger.standards)yield make(1,'standard',standard.id,()=>[`固定计功参照 · ${standard.id}`,JSON.stringify(standard),standard.reward],()=>['固定计功参照',`${standard.spec}\n${standard.createdAt}`,standard.reward]);
  const purchases=new Map(ledger.transactions.filter(tx=>tx.kind==='purchase').map(tx=>[tx.id,tx]));
  const specLabels:Record<string,string>={content:'所得',strength:'强度',quantity:'数量规格',range:'范围',duration:'持续',uses:'次数',conditions:'承接',crossWorld:'跨界'};
  for(const item of ledger.inventory)yield make(2,'inventory',item.id,()=>[item.name,JSON.stringify(item),purchases.get(item.purchaseId)!.amount],()=>[item.name,`取得 ${item.acquired} · 持有 ${item.remaining} · 已用 ${item.consumed} · 已转 ${item.transferred}\n${Object.entries(item.spec).map(([key,value])=>`${specLabels[key]}：${value}`).join('\n')}\n${item.world} · ${item.at}`,purchases.get(item.purchaseId)!.amount]);
  for(const tx of ledger.transactions)if(tx.kind!=='credit')yield make(2,'transaction',tx.id,()=>[`${tx.kind} · ${tx.referenceId}`,JSON.stringify(tx),tx.amount],()=>[`${({purchase:'购买',use:'实际消耗',transfer:'移交'})[tx.kind as 'purchase'|'use'|'transfer']} · ${tx.referenceId}`,`数量 ${tx.quantity??0}${tx.recipient?` · 接收者 ${tx.recipient}`:''}\n余额 ${tx.balanceBefore} → ${tx.balanceAfter}\n${tx.world} · ${tx.at}`,tx.amount]);
  for(const item of ledger.ripples)yield make(3,'ripple',item.id,()=>[`当前余波 · ${item.id}`,JSON.stringify(item)],()=>[`当前余波 · ${item.status==='active'?'追踪中':'已结束'}`,`${item.world}：${item.source}\n已结算：${item.settled}\n后续：${item.tracking}\n${item.updatedAt}`]);
  // History is append-only; its original ordinal gives a stable identity even for same-time versions.
  for(const [index,item] of (ledger.rippleHistory??[]).entries())yield make(3,'ripple-history',String(index),()=>[`历史余波 · ${item.id}`,JSON.stringify(item)],()=>['历史余波',`${item.world}：${item.source}\n当时已结算：${item.settled}\n当时追踪：${item.tracking}\n${item.updatedAt}`]);
  for(const item of ledger.quests??[])yield make(3,'quest',item.id,()=>[`委托 · ${item.id}`,JSON.stringify(item)],()=>[`委托 · ${({offered:'待接取',active:'进行中',completed:'已完成',dismissed:'已搁置'})[item.status]}`,`${item.title} / ${item.world}\n目标：${item.objective}\n缘由：${item.reason}${item.sourceRippleId?`\n关联余波：${item.sourceRippleId}`:''}${item.completionEventId?`\n已结算结果：${item.completionEventId}`:''}\n${item.updatedAt}`]);
}

/** Full business projection for native tables. Never use this unbounded archive as an AI prompt. */
export function createCompleteMemoryTableExport(ledger:Ledger):ChatSheets {
  validateLedger(ledger);
  const tables=completeTableDefinitions(),ids:string[][]=[[],[],[],[]];
  for(const record of completeRecords(ledger)){ids[record.table].push(record.id);tables[record.table].rows.push(record.row());}
  const output=createMemoryTableExport({tables,text:'',usedBytes:0,budget:0,omitted:0},ledger.accountId);
  tables.forEach((_table,index)=>{
    const sheet=output[`sheet_shiro_memory_${index+1}`] as DatabaseSheet;
    sheet.content.slice(1).forEach((row,rowIndex)=>{row[1]=ids[index][rowIndex];});
    sheet.sourceData={...(sheet.sourceData as Record<string,unknown>),note:'白·蝴蝶完整四表业务记录 v1。完整历史保存在商店本源账本。本文件含全部印象、精确账目与计功参照、消费与所得、当前及历史余波、委托；不是本轮 AI 摘要，也不是可恢复账本备份。记录ID由原始业务ID派生；原生编辑不会改写商店账本。',updateNode:'从商店重新导出完整四表刷新；不要自动填表。'};
  });
  return output;
}

/** Only selected page rows are materialized; notifications carry no archive contents. */
export function readCompleteMemoryPages(ledger:Ledger,options:MemoryPageOptions={}){
  validateLedger(ledger);
  if(!options||typeof options!=='object'||Array.isArray(options))throw new TypeError('四表分页参数无效');
  const limit=options.limit??50;
  if(!Number.isSafeInteger(limit)||limit<1||limit>100)throw new RangeError('每表每页须为 1–100 行');
  if(options.query!==undefined&&(typeof options.query!=='string'||options.query.length>200))throw new RangeError('搜索关键词最多 200 字符');
  const query=(options.query??'').normalize('NFC').toLocaleLowerCase().trim();
  const pages=completeTableDefinitions().map(table=>{
    const key=table.key as MemoryTableKey,offset=options.offsets?.[key]??0;
    if(!Number.isSafeInteger(offset)||offset<0)throw new RangeError('分页起点须为非负安全整数');
    return {...table,key,total:0,offset,limit,recordIds:[] as string[]};
  });
  for(const record of completeRecords(ledger)){
    const page=pages[record.table];let row:string[]|undefined;
    if(query){row=record.display();if(!`${record.id} ${row.join(' ')}`.normalize('NFC').toLocaleLowerCase().includes(query))continue;}
    const index=page.total++;
    if(index>=page.offset&&page.rows.length<limit){page.recordIds.push(record.id);page.rows.push(row??record.display());}
  }
  return pages;
}
