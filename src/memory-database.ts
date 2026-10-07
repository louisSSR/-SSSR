import { createButterflyTemplate, type ChatSheets, type DatabaseSheet } from './database';
import type { buildMemory } from './memory';

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
