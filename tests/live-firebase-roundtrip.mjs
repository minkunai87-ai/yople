import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

if(process.env.YOPLE_LIVE_FIREBASE_TEST !== '1') {
  console.error('Refusing live Firebase work: set YOPLE_LIVE_FIREBASE_TEST=1 explicitly.');
  process.exit(2);
}

const root = new URL('../', import.meta.url).pathname.replace(/^\/(.:)/, '$1');
const port = 4174;
const edgePath = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const server = spawn('python', ['-m', 'http.server', String(port), '--bind', '127.0.0.1'], { cwd: dirname(root), stdio: 'ignore' });
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

async function openProfile(debugPort) {
  const profile = mkdtempSync(join(tmpdir(), 'yople-live-edge-'));
  const browser = spawn(edgePath, ['--headless=new', '--disable-gpu', `--remote-debugging-port=${debugPort}`, `--user-data-dir=${profile}`, 'about:blank'], { stdio: 'ignore' });
  let targets;
  for(let i = 0; i < 60; i++) {
    try { targets = await (await fetch(`http://127.0.0.1:${debugPort}/json`)).json(); break; } catch { await delay(200); }
  }
  if(!targets) throw new Error('Edge CDP did not start');
  const target = targets.find(item => item.type === 'page');
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
  let nextId = 1;
  const pending = new Map();
  ws.onmessage = event => {
    const message = JSON.parse(event.data);
    if(!message.id || !pending.has(message.id)) return;
    const task = pending.get(message.id); pending.delete(message.id);
    message.error ? task.reject(new Error(message.error.message)) : task.resolve(message.result);
  };
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = nextId++; pending.set(id, { resolve, reject }); ws.send(JSON.stringify({ id, method, params }));
  });
  const evaluate = async expression => {
    const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if(result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
    return result.result.value;
  };
  await send('Page.enable'); await send('Runtime.enable');
  await send('Page.navigate', { url: `http://127.0.0.1:${port}/yople/` });
  for(let i = 0; i < 100; i++) {
    await delay(200);
    if(await evaluate(`typeof deckLoadReady!=='undefined' && deckLoadReady && !isBooting`)) break;
  }
  return { browser, ws, evaluate, close: () => { ws.close(); browser.kill(); } };
}

const testName = `codex-yople-live-${Date.now()}`;
let timestamp = null;
let testRecordDeleted = false;
const counts = { yople: { read: 0, write: 0, delete: 0 }, yoki: { read: 0, write: 0, delete: 0 } };

try {
  const first = await openProfile(9341);
  try {
    const created = await first.evaluate(`(async()=>{
      restoreInProgress=true; revealAnswer(); grade(2); await new Promise(r=>setTimeout(r,700)); restoreInProgress=false;
      isDataChanged=true;
      const ok=await performFirebaseBackup(false,{testName:${JSON.stringify(testName)},skipCleanup:true});
      return {ok,result:window.__YOPLE_LAST_BACKUP_RESULT__,statsCount:Object.keys(getStatsStore()).length,audit:window.__YOPLE_FIREBASE_AUDIT__};
    })()`);
    if(!created.ok || created.statsCount !== 1 || !created.result?.timestamp) throw new Error(`Live backup creation failed: ${JSON.stringify(created)}`);
    timestamp = created.result.timestamp;
    const restored = await first.evaluate(`(async()=>{
      inMemoryStatsStore={}; await saveStatsToIndexedDBFallback({});
      const before=Object.keys(getStatsStore()).length;
      const ok=await restoreFromFirebase(${JSON.stringify(timestamp)},false,FIREBASE_BACKUP_PATH,{allowSmaller:true});
      return {before,ok,after:Object.keys(getStatsStore()).length,stat:Object.values(getStatsStore())[0],restoreError:window.__YOPLE_LAST_RESTORE_ERROR__||'',audit:window.__YOPLE_FIREBASE_AUDIT__};
    })()`);
    if(!restored.ok || restored.before !== 0 || restored.after !== 1 || !restored.stat?.fsrs || restored.stat.history?.length !== 1) throw new Error(`First-profile restore failed: ${JSON.stringify(restored)}`);
    counts.yople.read += restored.audit.reads; counts.yople.write += restored.audit.writes - restored.audit.deletes; counts.yople.delete += restored.audit.deletes;
  } finally { first.close(); }

  const second = await openProfile(9342);
  try {
    const crossDevice = await second.evaluate(`(async()=>{
      const initial=Object.keys(getStatsStore()).length;
      const ok=await restoreFromFirebase(${JSON.stringify(timestamp)},false,FIREBASE_BACKUP_PATH,{allowSmaller:true});
      const restored=Object.keys(getStatsStore()).length;
      const stat=Object.values(getStatsStore())[0];
      return {initial,ok,restored,stat,audit:window.__YOPLE_FIREBASE_AUDIT__};
    })()`);
    if(crossDevice.initial !== 0 || !crossDevice.ok || crossDevice.restored !== 1 || !crossDevice.stat?.fsrs || crossDevice.stat.history?.length !== 1) throw new Error(`Second-profile restore failed: ${JSON.stringify(crossDevice)}`);
    await second.evaluate(`location.reload()`);
    await delay(3000);
    const afterReload = await second.evaluate(`({statsCount:Object.keys(getStatsStore()).length,stat:Object.values(getStatsStore())[0]})`);
    if(afterReload.statsCount !== 1 || !afterReload.stat?.fsrs || afterReload.stat.history?.length !== 1) throw new Error(`Reload persistence failed: ${JSON.stringify(afterReload)}`);
    const cleanup = await second.evaluate(`(async()=>{
      const deleted=await deleteFirebaseBackup(${JSON.stringify(timestamp)},FIREBASE_BACKUP_PATH,{skipConfirm:true,silent:true});
      const backupCheck=await firebaseRequest(FIREBASE_BACKUP_PATH+'/'+${JSON.stringify(timestamp)});
      const indexCheck=await firebaseRequest(FIREBASE_BACKUP_INDEX_PATH+'/'+${JSON.stringify(timestamp)});
      return {deleted,backupAfter:await backupCheck.json(),indexAfter:await indexCheck.json(),audit:window.__YOPLE_FIREBASE_AUDIT__};
    })()`);
    if(!cleanup.deleted || cleanup.backupAfter !== null || cleanup.indexAfter !== null) throw new Error(`Test cleanup failed: ${JSON.stringify(cleanup)}`);
    testRecordDeleted = true;
    counts.yople.read += crossDevice.audit.reads + cleanup.audit.reads;
    counts.yople.write += (crossDevice.audit.writes - crossDevice.audit.deletes) + (cleanup.audit.writes - cleanup.audit.deletes);
    counts.yople.delete += crossDevice.audit.deletes + cleanup.audit.deletes;
    console.log(JSON.stringify({ testName, timestamp, created: true, firstProfileRestore: true, secondProfileRestore: true, reloadPersistence: true, deleted: true, counts, crossDevice, afterReload, cleanup }, null, 2));
  } finally { second.close(); }
} finally {
  if(timestamp && !testRecordDeleted) {
    const base='https://yokiapp-afcca-default-rtdb.firebaseio.com/apps/yople';
    console.log('EMERGENCY_TEST_CLEANUP', { timestamp });
    await Promise.all([
      fetch(`${base}/backups/${timestamp}.json`, { method: 'DELETE' }),
      fetch(`${base}/backupIndex/${timestamp}.json`, { method: 'DELETE' })
    ]).catch(error => console.error('EMERGENCY_TEST_CLEANUP_FAILED', error));
  }
  server.kill();
}
