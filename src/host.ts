export const MODULE_ID='shiro-butterfly-shop';
export const context=():any=>{const c=(globalThis as any).SillyTavern?.getContext?.();if(!c)throw new Error('需要在 SillyTavern 1.18.0 中打开商店');return c;};
export function chatIdentity():string {
  const c=context(),chat=c.getCurrentChatId?.()??c.chatId??null;
  const group=c.groupId!==undefined&&c.groupId!==null&&c.groupId!=='';
  return JSON.stringify(group?['group',String(c.groupId),chat]:['character',c.characters?.[c.characterId]?.avatar??null,chat]);
}
export function hasChat():boolean {
  const c=context();if(!(c.getCurrentChatId?.()??c.chatId))return false;
  return c.groupId!==undefined&&c.groupId!==null&&c.groupId!==''||!!c.characters?.[c.characterId]?.avatar;
}
export async function verifiedHandle():Promise<string>{
  // This public authenticated route is verified against ST 1.18.0. No display-name fallback.
  const response=await fetch('/api/users/me',{headers:context().getRequestHeaders(),cache:'no-store'});
  if(!response.ok)throw new Error('暂时无法核实酒馆登录账户，交易已暂停');
  const user=await response.json();
  if(typeof user?.handle!=='string'||!user.handle)throw new Error('酒馆未返回有效账户标识，交易已暂停');
  return user.handle;
}
function savedChatComparable(messages:unknown[]):string {
  const copy=JSON.parse(JSON.stringify(messages));
  // Official 1.2.5 lazily adds a default LLM fill-mode timestamp after saving while notifying its UI.
  // Ignore only that exact UI default; story content, V2 frames and all other settings remain strict.
  for(const message of copy){
    const config=message?.TavernDB_ACU_ScopedConfig,modes=config?.fillModeByIsolationKey;
    if(!modes||typeof modes!=='object'||Array.isArray(modes))continue;
    for(const [key,value] of Object.entries(modes)){
      const entry=value as {mode?:unknown;recordedAt?:unknown};
      if(entry&&typeof entry==='object'&&entry.mode==='llm'&&typeof entry.recordedAt==='number'&&Number.isFinite(entry.recordedAt)&&Object.keys(entry).every(field=>field==='mode'||field==='recordedAt'))delete modes[key];
    }
    if(!Object.keys(modes).length)delete config.fillModeByIsolationKey;
    if(!Object.keys(config).length)delete message.TavernDB_ACU_ScopedConfig;
  }
  return JSON.stringify(copy);
}
/** Same authenticated read-back route as the audited host gateway; never writes a chat. */
export async function verifyNativeChatSaved(expectedChatId:string, expectedTables:unknown, requireAudit=true):Promise<boolean>{
  if(chatIdentity()!==expectedChatId)throw new Error('保存核验前聊天已切换，旧操作没有被确认');
  const c=context(),chat=c.chat;
  const chatId=c.getCurrentChatId?.()??c.chatId;
  const group=c.groupId!==undefined&&c.groupId!==null&&c.groupId!=='';
  const character=c.characters?.[c.characterId];
  if(!Array.isArray(chat)||!chatId||(!group&&!character?.avatar))throw new Error('当前聊天缺少可核验的保存身份');
  const expected=JSON.stringify(chat);
  // A runtime-only table can look correct while no frame has reached the chat.
  const auditIds:string[]=[];
  if(expectedTables&&typeof expectedTables==='object')for(const value of Object.values(expectedTables)){
    const sheet=value as {content?:unknown[][]};if(!Array.isArray(sheet?.content))continue;
    let latest:{id:string;revision:number}|undefined;
    for(const row of sheet.content.slice(1))if(Array.isArray(row))for(const cell of row){
      if(typeof cell!=='string'||!cell.startsWith('shiro-native:v2:')||!cell.includes(':commit:'))continue;
      let revision:number;try{revision=Number(decodeURIComponent(cell.split(':').at(-1)!).split(':').at(-1));}catch{continue;}
      if(Number.isSafeInteger(revision)&&(!latest||revision>latest.revision))latest={id:cell,revision};
    }
    if(latest)auditIds.push(latest.id);
  }
  const frames=chat.flatMap((message:any)=>{
    const isolated=message?.TavernDB_ACU_IsolatedData;
    if(!isolated||typeof isolated!=='object')return [];
    return Object.values(isolated).flatMap((value:any)=>value?._acu_storage_version===2&&value.storageFrame?.version===2?[JSON.stringify(value.storageFrame)]:[]);
  }).join('\n');
  // Incremental V2 frames retain SQL literals; business TEXT is hex-encoded to survive raw SQL normalization.
  const encoded=(id:string)=>`CAST(X'${Array.from(new TextEncoder().encode(id),b=>b.toString(16).padStart(2,'0').toUpperCase()).join('')}' AS TEXT)`;
  if(!requireAudit&&!auditIds.length&&(frames.includes('shiro-native:v2:')||frames.includes(encoded('shiro-native:v2:').replace(/' AS TEXT\)$/,''))))throw new Error('该聊天已有本源保存历史，但当前导出为空表。请重新载入数据库，不能初始化覆盖旧历史。');
  if((requireAudit&&!auditIds.length)||auditIds.some(id=>!frames.includes(id)&&!frames.includes(encoded(id))))throw new Error('原生四表仍未进入聊天保存帧，交易暂未确认');
  const response=await fetch(group?'/api/chats/group/get':'/api/chats/get',{
    method:'POST',cache:'no-store',headers:{...c.getRequestHeaders(),'Content-Type':'application/json'},
    body:JSON.stringify(group?{id:chatId}:{ch_name:character.name,file_name:chatId,avatar_url:character.avatar}),
  });
  if(!response.ok)throw new Error(`聊天保存回读失败（HTTP ${response.status}），请保留当前数据后重试核验`);
  const persisted=await response.json();
  if(chatIdentity()!==expectedChatId||context().chat!==chat||JSON.stringify(chat)!==expected)throw new Error('保存核验期间聊天或故事发生变化，旧操作没有被确认');
  const messages=Array.isArray(persisted)?(group?persisted:persisted.slice(1)):null;
  if(!messages||savedChatComparable(messages)!==savedChatComparable(chat))throw new Error('服务器聊天与当前保存帧不一致，交易暂未确认；不要重复兑换');
  return true;
}
export function storyContext():{text:string;evidence:string;stamp:string} {
  const c=context(),character=c.characters?.[c.characterId];
  const messages=(c.chat??[]).filter((m:any)=>!m.is_system&&!m.extra?.shiroButterflyReceipt);
  const tail=messages.slice(-12);
  const last=[...messages].reverse().find((m:any)=>!m.is_user);
  const evidence=typeof last?.mes==='string'?last.mes:'';
  return {text:JSON.stringify({character:character?{name:character.name,description:character.description,scenario:character.scenario,world:character.data?.extensions?.world}:null,chat:tail.map((m:any)=>({role:m.is_user?'user':'assistant',name:m.name,text:m.mes})),latestCompletedAssistant:evidence}),evidence,stamp:JSON.stringify([chatIdentity(),last?.send_date??'',evidence])};
}
export function setLedgerPrompt(text:string):void {context().setExtensionPrompt(MODULE_ID,text,1,0,false,0);}
export function download(name:string,text:string,type='application/json'):void {const u=URL.createObjectURL(new Blob([text],{type}));const a=document.createElement('a');a.href=u;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(u),1000);}
export async function serverBackup(ledgerText:string,name:string,handle:string):Promise<string>{
  if(await verifiedHandle()!==handle)throw new Error('账户已变化，备份已停止');
  const bytes=new TextEncoder().encode(ledgerText);let binary='';for(const b of bytes)binary+=String.fromCharCode(b);
  const response=await fetch('/api/files/upload',{method:'POST',headers:context().getRequestHeaders(),body:JSON.stringify({name,data:btoa(binary)})});
  if(!response.ok)throw new Error(`服务器备份失败（${response.status}）`);
  const {path}=await response.json();const url=new URL(path,location.origin);
  if(url.origin!==location.origin)throw new Error('服务器返回了非本地备份位置');
  const check=await fetch(url,{cache:'no-store'});
  if(!check.ok||await check.text()!==ledgerText||await verifiedHandle()!==handle)throw new Error('备份写后核验失败，请保留本地导出');
  return url.pathname;
}
