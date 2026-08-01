import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

const root = new URL('../', import.meta.url).pathname.replace(/^\/(.:)/, '$1');
const port = 4175;
const debugPort = 9351;
const edge = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const profile = mkdtempSync(join(tmpdir(), 'yople-fsrs-edge-'));
const server = spawn('python', ['-m', 'http.server', String(port), '--bind', '127.0.0.1'], { cwd: dirname(root), stdio: 'ignore' });
const browser = spawn(edge, ['--headless=new', '--disable-gpu', `--remote-debugging-port=${debugPort}`, `--user-data-dir=${profile}`, 'about:blank'], { stdio: 'ignore' });
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

async function main() {
  let targets;
  for(let i=0;i<60;i++){try{targets=await(await fetch(`http://127.0.0.1:${debugPort}/json`)).json();break}catch{await delay(200)}}
  if(!targets) throw new Error('Edge CDP unavailable');
  const ws = new WebSocket(targets.find(item=>item.type==='page').webSocketDebuggerUrl);
  await new Promise((resolve,reject)=>{ws.onopen=resolve;ws.onerror=reject});
  let id=1; const pending=new Map();
  ws.onmessage=event=>{const msg=JSON.parse(event.data);if(!pending.has(msg.id))return;const p=pending.get(msg.id);pending.delete(msg.id);msg.error?p.reject(new Error(msg.error.message)):p.resolve(msg.result)};
  const send=(method,params={})=>new Promise((resolve,reject)=>{const callId=id++;pending.set(callId,{resolve,reject});ws.send(JSON.stringify({id:callId,method,params}))});
  const evaluate=async expression=>{const r=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw new Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value};
  await send('Page.enable'); await send('Runtime.enable');
  const appUrl=`http://127.0.0.1:${port}/yople/?yopleTestMode=1`;
  await send('Page.navigate',{url:appUrl});
  for(let i=0;i<100;i++){await delay(200);if(await evaluate(`deckLoadReady&&!isBooting`))break}

  const seeded=await evaluate(`(async()=>{
    const ids=Object.values(library).flat().slice(0,8).map(card=>String(card.id));
    const t=Date.UTC(2025,0,1,12,0,0);
    const stats={};
    stats[ids[0]]={correct:1.5,total:2,firstDate:t,lastDate:t+86400000,history:[{id:'a',score:0,time:t},{id:'b',score:2,time:t+86400000}],fsrs:{D:4,S:9,reps:2},interval:9,dueDate:t+10*86400000};
    stats[ids[1]]={correct:2,total:3,history:[{id:'c',score:1,time:t+2000},{id:'d',score:2,time:t+3000}],wrongCount:1,completed:true};
    stats[ids[2]]={correct:0,total:0,fav:true,mem:true,cmp:true,num:true,date:true,pen:true,hidden:true};
    stats[ids[3]]={correct:0,total:0,history:[{id:'e',score:2,time:t+4000}],customState:'keep'};
    stats[ids[4]]={correct:4,total:7,firstDate:t,noHistoryState:'keep'};
    stats[ids[5]]={};
    stats[ids[6]]={correct:1,total:1,history:[{id:'bad',score:2,time:'not-a-date'}],fav:true};
    stats[ids[7]]={correct:1,total:1,history:[{id:'f',score:2,time:t+5000}],lastDate:t+5000};
    setStorageItem(STORAGE_KEY_NOTES,JSON.stringify({[ids[3]]:{note:'preserve me',updatedAt:t}}));
    inMemoryStatsStore=structuredClone(stats); await saveStatsToIndexedDBFallback(stats); targetRetention=.90; setStorageItem(STORAGE_KEY_TARGET_RETENTION,'0.90');
    return {ids,before:getStatsPreservationSnapshot(stats,getNotesByCardUuid()),raw:structuredClone(stats)};
  })()`);

  const sourceSync=await evaluate(`(async()=>{
    const ids=${JSON.stringify([])}.concat(Object.values(library).flat().slice(0,4).map(card=>String(card.id)));
    const base={}; base[ids[0]]={correct:1,total:2,history:[{score:1,time:Date.UTC(2025,0,1)}]}; base[ids[1]]={correct:0,total:0};
    const reset=async(memory,idb,memoryAt,idbAt)=>{await persistStatsToIndexedDB(structuredClone(idb));inMemoryStatsStore=structuredClone(memory);lastStatsMemoryChangedAt=memoryAt;lastStatsIndexedDbSavedAt=idbAt;statsIndexedDbReady=true;statsIndexedDbLoadFailed=false;};
    const results={}; const now=Date.now();

    await reset(base,base,now,now); results.identical=(await resolveStatsSourceForRecalculation()).resolution;

    await reset(base,base,now,now); const withPending=structuredClone(base);withPending[ids[2]]={correct:1,total:1};inMemoryStatsStore=withPending;lastStatsMemoryChangedAt=now+10;const pending=saveStatsToIndexedDBFallback(withPending);results.pendingButtonBefore=(()=>{document.querySelector('input[name="tr-mode"][value="recalc"]').checked=true;updateFullRecalcButtonState();return document.getElementById('tr-save-button').disabled})();results.pendingResolution=(await resolveStatsSourceForRecalculation()).resolution;await pending;

    await reset({},base,now,now+10);results.idbLatest=(await resolveStatsSourceForRecalculation()).resolution;

    const orderedMemory={};orderedMemory[ids[0]]={correct:1,total:2};const orderedIdb={};orderedIdb[ids[0]]={total:2,correct:1};await reset(orderedMemory,orderedIdb,now,now);results.keyOrder=(await resolveStatsSourceForRecalculation()).resolution;

    const emptyMemory={};emptyMemory[ids[0]]={correct:1,total:2,metadata:{}};const emptyIdb={};emptyIdb[ids[0]]={correct:1,total:2};await reset(emptyMemory,emptyIdb,now,now);results.emptyObject=(await resolveStatsSourceForRecalculation()).resolution;

    const memoryExtra=structuredClone(base);memoryExtra[ids[2]]={correct:0,total:0};await reset(memoryExtra,base,now+20,now);results.memoryOnly=(await resolveStatsSourceForRecalculation()).resolution;

    const idbExtra=structuredClone(base);idbExtra[ids[2]]={correct:0,total:0};await reset(base,idbExtra,now,now+20);results.idbOnly=(await resolveStatsSourceForRecalculation()).resolution;

    const conflictMemory=structuredClone(base),conflictIdb=structuredClone(base);conflictIdb[ids[0]].history=[{score:2,time:Date.UTC(2025,0,1)}];await reset(conflictMemory,conflictIdb,now,now);try{await resolveStatsSourceForRecalculation();results.historyConflict='missed'}catch(e){results.historyConflict=e.message;results.historyConflictDetails=e.diagnostics.contentMismatch.length}

    statsWritesInProgress=1;updateFullRecalcButtonState();results.writeButtonDisabled=document.getElementById('tr-save-button').disabled;statsWritesInProgress=0;
    const oldBoot=isBooting;isBooting=true;updateFullRecalcButtonState();results.bootButtonDisabled=document.getElementById('tr-save-button').disabled;results.bootResult=(await performSafeFullFsrsRecalculation(.9)).error;isBooting=oldBoot;updateFullRecalcButtonState();

    const seededStats=${JSON.stringify(seeded.raw)};await reset(seededStats,seededStats,now+30,now+30);results.syncThenRecalc=(await performSafeFullFsrsRecalculation(.9)).ok;
    return results;
  })()`);
  if(sourceSync.identical!=='already-equal'||!sourceSync.pendingButtonBefore||sourceSync.idbLatest!=='indexeddb-reloaded-to-memory')throw new Error(`Basic source sync failed ${JSON.stringify(sourceSync)}`);
  if(sourceSync.keyOrder!=='already-equal'||sourceSync.emptyObject!=='already-equal')throw new Error(`Normalization failed ${JSON.stringify(sourceSync)}`);
  if(sourceSync.memoryOnly!=='memory-flushed-to-indexeddb'||sourceSync.idbOnly!=='indexeddb-reloaded-to-memory')throw new Error(`Freshness selection failed ${JSON.stringify(sourceSync)}`);
  if(sourceSync.historyConflict!=='RECALC_SOURCE_MEMORY_IDB_MISMATCH'||sourceSync.historyConflictDetails!==1)throw new Error(`Ambiguous conflict was not blocked ${JSON.stringify(sourceSync)}`);
  if(!sourceSync.writeButtonDisabled||!sourceSync.bootButtonDisabled||sourceSync.bootResult!=='RECALC_STATS_SYNC_IN_PROGRESS'||!sourceSync.syncThenRecalc)throw new Error(`UI lock/recalculation failed ${JSON.stringify(sourceSync)}`);

  const first=await evaluate(`performSafeFullFsrsRecalculation(.85)`);
  if(!first.ok||first.summary.statsCount!==8||first.summary.failedCount!==1||first.summary.noHistoryCount!==3)throw new Error(`0.85 recalculation failed ${JSON.stringify(first)}`);
  const afterFirst=await evaluate(`({snapshot:getStatsPreservationSnapshot(getStatsStore(),getNotesByCardUuid()),stats:structuredClone(getStatsStore())})`);
  if(JSON.stringify(seeded.before)!==JSON.stringify(afterFirst.snapshot))throw new Error('Protected data changed after 0.85');

  const second=await evaluate(`performSafeFullFsrsRecalculation(.95)`);
  if(!second.ok||second.summary.failedCount!==1)throw new Error(`0.95 recalculation failed ${JSON.stringify(second)}`);
  const afterSecond=await evaluate(`({snapshot:getStatsPreservationSnapshot(getStatsStore(),getNotesByCardUuid()),stats:structuredClone(getStatsStore())})`);
  if(JSON.stringify(seeded.before)!==JSON.stringify(afterSecond.snapshot))throw new Error('Protected data changed after 0.95');
  if(JSON.stringify(afterFirst.stats)===JSON.stringify(afterSecond.stats))throw new Error('Schedule did not change with target retention');

  const finalBackup=await evaluate(`(async()=>{
    const oldFlush=flushBackupToFirebase; let calls=0;
    flushBackupToFirebase=async()=>{calls++;return true};
    const result=await performSafeFullFsrsRecalculation(.90);
    await new Promise(r=>setTimeout(r,BACKUP_DEBOUNCE_MS+500));
    flushBackupToFirebase=oldFlush;
    return {result,calls};
  })()`);
  if(!finalBackup.result.ok||finalBackup.calls!==1)throw new Error(`Expected exactly one final backup ${JSON.stringify(finalBackup)}`);

  const rollback=await evaluate(`(async()=>{
    const before=structuredClone(getStatsStore()); const oldSave=saveStatsToIndexedDBFallback;
    saveStatsToIndexedDBFallback=async()=>false;
    const result=await performSafeFullFsrsRecalculation(.90);
    saveStatsToIndexedDBFallback=oldSave;
    const idb=await readStatsFromIndexedDBForBackup();
    return {result,memorySame:stableStringify(before)===stableStringify(getStatsStore()),idbSame:stableStringify(before)===stableStringify(idb)};
  })()`);
  if(rollback.result.ok||!rollback.memorySame||!rollback.idbSame)throw new Error(`Forced rollback failed ${JSON.stringify(rollback)}`);

  await delay(3500);
  const firebaseBeforeReload=await evaluate(`window.__YOPLE_FIREBASE_AUDIT__`);
  if(firebaseBeforeReload.writes!==0)throw new Error('Firebase write occurred during recalculation');
  await evaluate(`location.reload()`); await delay(3000);
  const persisted=await evaluate(`({snapshot:getStatsPreservationSnapshot(getStatsStore(),getNotesByCardUuid()),count:Object.keys(getStatsStore()).length,retention:targetRetention,audit:window.__YOPLE_FIREBASE_AUDIT__})`);
  if(persisted.count!==8||JSON.stringify(persisted.snapshot)!==JSON.stringify(seeded.before))throw new Error('Reload persistence failed');
  console.log(JSON.stringify({sourceSync,seeded:seeded.before,first:first.summary,second:second.summary,finalBackup,rollback,persisted,firebaseBeforeReload},null,2));
  ws.close();
}

try{await main()}finally{browser.kill();server.kill()}
