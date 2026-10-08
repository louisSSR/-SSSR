import { validateLedger, type Ledger } from './core';

/** Explicit, read-only rescue of v1 data. Never used by the current business repository. */
export async function readLegacyBackups(origin:string,handle:string):Promise<Ledger[]> {
  const factory=globalThis.indexedDB;
  if(!factory)throw new Error('当前浏览器没有旧版备份存储');
  if(typeof factory.databases==='function'&&!(await factory.databases()).some(db=>db.name==='shiro-butterfly-shop-v1'))return [];
  const db=await new Promise<IDBDatabase|null>((resolve,reject)=>{
    const request=factory.open('shiro-butterfly-shop-v1');let missing=false;
    request.onupgradeneeded=()=>{missing=true;request.transaction?.abort();};
    request.onsuccess=()=>resolve(request.result);
    request.onerror=()=>missing?resolve(null):reject(request.error);
    request.onblocked=()=>reject(new Error('旧版页面占用备份，请关闭旧标签页后重试'));
  });
  if(!db)return [];
  try{
    if(!db.objectStoreNames.contains('ledgers'))return [];
    return await new Promise<Ledger[]>((resolve,reject)=>{
      const tx=db.transaction('ledgers','readonly'),request=tx.objectStore('ledgers').openCursor(),rows:Ledger[]=[];let error:unknown;
      request.onsuccess=()=>{
        const cursor=request.result;if(!cursor)return;
        const record=cursor.value;
        if(Array.isArray(record?.key)&&record.key[0]===origin&&record.key[1]===handle){
          try{validateLedger(record.ledger);if(record.key[2]!==record.ledger.accountId)throw new Error('旧备份身份不一致');rows.push(JSON.parse(JSON.stringify(record.ledger)));}
          catch(e){error=e;tx.abort();return;}
        }
        cursor.continue();
      };
      tx.oncomplete=()=>resolve(rows);
      tx.onerror=tx.onabort=()=>reject(error??tx.error??new Error('旧备份读取失败'));
    });
  }finally{db.close();}
}
