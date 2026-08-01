import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

const root = new URL('../', import.meta.url).pathname.replace(/^\/(.:)/, '$1');
const port = 4177;
const debugPort = 9353;
const edge = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const profile = mkdtempSync(join(tmpdir(), 'yople-original-order-edge-'));
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
  await send('Page.navigate',{url:`http://127.0.0.1:${port}/yople/?yopleTestMode=1`});
  for(let i=0;i<100;i++){await delay(200);if(await evaluate(`deckLoadReady&&!isBooting`))break}

  const initial=await evaluate(`(()=>{
    const cards=Object.values(library).flat();
    const example=cards.find(card=>String(card.q).includes('paste-626b38568ac910269ead468122e2ebc36cf1acdf.jpg'));
    const values=['02-002','01-010','01-002','', '02-001','01-001'];
    const sorted=values.map((originalOrder,index)=>({originalOrder,index,a:'legacy '+index})).sort(compareByNumberOrder).map(card=>card.originalOrder||'없음');
    const legacy=[{a:'문항 20'},{a:'문항 3'},{a:'문항 11'}].sort(compareByNumberOrder).map(card=>extractNumber(card));
    const sample='행정법::01 (행정과 행정법)::01 (기소인)::01 (기)\\t"<img src=""paste-q.jpg"">"\\t"<img src=""paste-a.jpg"">"\\t"<img src=""extra.png"">"\\t01-002';
    const fields=parseAnkiRawData(sample)[0]; const parsed=parseYokiRow(fields,'행정법');
    return {version:APP_VERSION,cardCount:cards.length,uniqueUuidCount:new Set(cards.map(card=>String(card.id))).size,statsCount:Object.keys(getStatsStore()).length,originalOrderCount:cards.filter(card=>parseOriginalOrder(card?.originalOrder).valid).length,exampleOrder:example?.originalOrder,exampleQuestion:example?.q,exampleAnswer:example?.a,fields,parsed,sorted,legacy};
  })()`);
  if(initial.cardCount!==4552||initial.uniqueUuidCount!==4552||initial.originalOrderCount!==4552)throw new Error(`Actual TXT count/order failure ${JSON.stringify(initial)}`);
  if(initial.exampleOrder!=='01-002'||!initial.exampleQuestion.includes('paste-626')||!initial.exampleAnswer.includes('paste-205')||!initial.exampleAnswer.includes('01-e864')||!initial.exampleAnswer.includes('01-002'))throw new Error(`Quoted image parsing failure ${JSON.stringify(initial)}`);
  if(initial.sorted.join('|')!=='01-001|01-002|01-010|02-001|02-002|없음')throw new Error(`Original order sort failure ${JSON.stringify(initial.sorted)}`);
  if(initial.legacy.join('|')!=='3|11|20')throw new Error(`Legacy fallback failure ${JSON.stringify(initial.legacy)}`);

  const saved=await evaluate(`(async()=>{const cards=Object.values(library).flat();const stats={};stats[cards[0].id]={correct:1,total:2,history:[{score:1,time:Date.now()}]};stats[cards[1].id]={correct:0,total:1,history:[{score:0,time:Date.now()}]};setStorageItem(STORAGE_KEY_STATS,JSON.stringify(stats));setSortMode('number');await waitForPendingStatsWrites();return {ids:cards.slice(0,2).map(card=>card.id),statsCount:Object.keys(getStatsStore()).length,historyCount:Object.values(getStatsStore()).reduce((n,s)=>n+(s.history?.length||0),0)}})()`);
  await evaluate(`location.reload()`); await delay(3000);
  const reloaded=await evaluate(`({sort:currentSortMode,statsCount:Object.keys(getStatsStore()).length,historyCount:Object.values(getStatsStore()).reduce((n,s)=>n+(s.history?.length||0),0),matched:${JSON.stringify(saved.ids)}.map(id=>!!getStatsStore()[id]),cardCount:Object.values(library).flat().length,orders:Object.values(library).flat().slice(0,4).map(card=>card.originalOrder)})`);
  if(reloaded.sort!=='number'||reloaded.statsCount!==saved.statsCount||reloaded.historyCount!==saved.historyCount||reloaded.matched.some(value=>!value)||reloaded.cardCount!==initial.cardCount)throw new Error(`Reload/Stats regression ${JSON.stringify({saved,reloaded})}`);

  for(const width of [390,1366]){await send('Emulation.setDeviceMetricsOverride',{width,height:800,deviceScaleFactor:1,mobile:width<500});const ok=await evaluate(`typeof compareByNumberOrder==='function'&&document.body.scrollWidth<=document.documentElement.clientWidth`);if(!ok)throw new Error(`Viewport regression ${width}`)}
  console.log(JSON.stringify({initial,saved,reloaded,viewports:[390,1366]},null,2));
  ws.close();
}

try{await main()}finally{browser.kill();server.kill()}
