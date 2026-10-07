export const MODULE_ID='shiro-butterfly-shop';
export const context=():any=>{const c=(globalThis as any).SillyTavern?.getContext?.();if(!c)throw new Error('需要在 SillyTavern 1.18.0 中打开商店');return c;};
export function chatIdentity():string {const c=context();return JSON.stringify([c.groupId??null,c.characterId??null,c.getCurrentChatId?.()??c.chatId??null]);}
export function hasChat():boolean {const c=context();return c.characterId!==undefined&&c.characterId!==null||!!c.groupId;}
export async function verifiedHandle():Promise<string>{
  // This public authenticated route is verified against ST 1.18.0. No display-name fallback.
  const response=await fetch('/api/users/me',{headers:context().getRequestHeaders(),cache:'no-store'});
  if(!response.ok)throw new Error('暂时无法核实酒馆登录账户，交易已暂停');
  const user=await response.json();
  if(typeof user?.handle!=='string'||!user.handle)throw new Error('酒馆未返回有效账户标识，交易已暂停');
  return user.handle;
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
