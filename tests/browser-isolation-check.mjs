import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

const root = new URL('../', import.meta.url).pathname.replace(/^\/(.:)/, '$1');
const port = 4173;
const debugPort = 9333;
const edge = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const profile = mkdtempSync(join(tmpdir(), 'yople-edge-'));
const server = spawn('python', ['-m', 'http.server', String(port), '--bind', '127.0.0.1'], { cwd: dirname(root), stdio: 'ignore' });
const browser = spawn(edge, ['--headless=new', '--disable-gpu', `--remote-debugging-port=${debugPort}`, `--user-data-dir=${profile}`, 'about:blank'], { stdio: 'ignore' });
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

async function json(url, options) {
  const response = await fetch(url, options);
  return response.json();
}

async function main() {
  let targets;
  for (let i = 0; i < 50; i++) {
    try { targets = await json(`http://127.0.0.1:${debugPort}/json`); break; } catch { await delay(200); }
  }
  if (!targets) throw new Error('Edge CDP did not start');
  let target = targets.find(item => item.type === 'page');
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
  let nextId = 1;
  const pending = new Map();
  ws.onmessage = event => {
    const message = JSON.parse(event.data);
    if (!message.id || !pending.has(message.id)) return;
    const { resolve, reject } = pending.get(message.id);
    pending.delete(message.id);
    message.error ? reject(new Error(message.error.message)) : resolve(message.result);
  };
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = nextId++;
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
  });
  const evaluate = async expression => {
    const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
    return result.result.value;
  };
  const navigate = async url => { await send('Page.navigate', { url }); await delay(800); };
  await send('Page.enable');
  await send('Runtime.enable');
  const appUrl = `http://127.0.0.1:${port}/yople/`;
  await navigate(appUrl);
  await evaluate(`(async()=>{
    localStorage.clear();
    localStorage.setItem('yoki_final_stats', JSON.stringify({sentinel:{total:99,correct:77}}));
    localStorage.setItem('yoki_final_last_deck','Yoki sentinel deck');
    await caches.open('yoki-cache-sentinel');
    await new Promise((resolve,reject)=>{
      const req=indexedDB.open('yoki_pwa_restore_store_v1',1);
      req.onupgradeneeded=()=>req.result.createObjectStore('kv');
      req.onsuccess=()=>{const db=req.result; const tx=db.transaction('kv','readwrite'); tx.objectStore('kv').put({sentinel:{total:99}},'stats'); tx.oncomplete=()=>{db.close();resolve()}; tx.onerror=()=>reject(tx.error)};
      req.onerror=()=>reject(req.error);
    });
  })()`);
  await navigate(`${appUrl}?yopleTestMode=1`);
  let ready = false;
  for (let i = 0; i < 100; i++) {
    ready = await evaluate(`typeof library==='object' && Object.values(library).reduce((n,c)=>n+c.length,0)>0 && document.getElementById('loading').style.display==='none'`);
    if (ready) break;
    await delay(200);
  }
  if (!ready) throw new Error('Yople deck did not become ready');
  const initial = await evaluate(`(async()=>({
    title:document.title,
    cardCount:Object.values(library).reduce((n,c)=>n+c.length,0),
    deckCount:Object.keys(library).length,
    statsCount:Object.keys(getStatsStore()).length,
    currentId:String(activeDeck[0]?.id||''),
    localKeys:Object.keys(localStorage).sort(),
    yokiStats:localStorage.getItem('yoki_final_stats'),
    cacheNames:await caches.keys(),
    dbNames:(await indexedDB.databases()).map(x=>x.name).sort(),
    source:deckSourceUrl,
    imageBase:imageBaseUrl
  }))()`);
  if (initial.statsCount !== 0) throw new Error(`Expected 0 initial Stats, got ${initial.statsCount}`);
  if (!initial.localKeys.includes('yoki_final_stats')) throw new Error('Yoki sentinel unexpectedly deleted');
  await evaluate(`revealAnswer(); grade(2); new Promise(r=>setTimeout(r,700))`);
  const afterGrade = await evaluate(`({count:Object.keys(getStatsStore()).length, stat:getStatsStore()[String(activeDeck[Math.max(0,currentIndex-1)]?.id||'')]||Object.values(getStatsStore())[0], yoki:localStorage.getItem('yoki_final_stats')})`);
  if (afterGrade.count !== 1 || !afterGrade.stat?.fsrs || afterGrade.stat?.history?.length !== 1) throw new Error('Grade did not persist Stats/FSRS/history');
  if (afterGrade.yoki !== initial.yokiStats) throw new Error('Yoki localStorage changed');
  await navigate(`${appUrl}?yopleTestMode=1`);
  for (let i = 0; i < 50; i++) {
    if (await evaluate(`Object.keys(getStatsStore()).length===1`)) break;
    await delay(200);
  }
  const final = await evaluate(`(async()=>{
    let blocked=''; try{await fetch('${'https://yokiapp-afcca-default-rtdb.firebaseio.com/apps/yoki/backups.json'}')}catch(e){blocked=String(e.message)}
    let testWriteBlocked=''; try{await fetch('${'https://yokiapp-afcca-default-rtdb.firebaseio.com/apps/yople/backups/test.json'}',{method:'PUT',body:'{}'})}catch(e){testWriteBlocked=String(e.message)}
    return {statsCount:Object.keys(getStatsStore()).length, yoki:localStorage.getItem('yoki_final_stats'), blocked, testWriteBlocked, audit:window.__YOPLE_FIREBASE_AUDIT__, caches:await caches.keys()};
  })()`);
  if (final.statsCount !== 1) throw new Error('Stats did not survive reload');
  if (!final.blocked.includes('BLOCKED_NON_YOPLE_FIREBASE_PATH')) throw new Error('Firebase path guard failed');
  if (!final.testWriteBlocked.includes('TEST_MODE_BLOCKED_FIREBASE_WRITE')) throw new Error('Test-mode Firebase write guard failed');
  if (!final.caches.includes('yoki-cache-sentinel')) throw new Error('Yoki cache was removed');
  console.log(JSON.stringify({ initial, afterGrade, final }, null, 2));
  ws.close();
}

try { await main(); } finally { browser.kill(); server.kill(); }
