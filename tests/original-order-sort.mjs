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
    const example=cards.find(card=>card.uuid==='w>yC6!FS2*');
    const values=['02-002','01-010','01-002','', '02-001','01-001'];
    const sorted=values.map((originalOrder,index)=>({originalOrder,index,a:'legacy '+index})).sort(compareByNumberOrder).map(card=>card.originalOrder||'없음');
    const legacy=[{a:'문항 20'},{a:'문항 3'},{a:'문항 11'}].sort(compareByNumberOrder).map(card=>extractNumber(card));
    const sample='w>yC6!FS2*\\t행정법::01 (행정과 행정법)::01 (기소인)::01 (기)\\t"<img src=""paste-q.jpg"" title=""한글 OCR ( 10 경행 )""/>"\\t"<img src=""paste-a.jpg"" title/>"\\t"<img src=""extra.png"" title/>"\\t01-001';
    const fields=parseAnkiRawData(sample)[0]; const parsed=parseYokiRow(fields,'행정법');
    return {version:APP_VERSION,cardCount:cards.length,uniqueUuidCount:new Set(cards.map(card=>String(card.id))).size,explicitUuidCount:cards.filter(card=>card.uuid&&card.id===card.uuid).length,statsCount:Object.keys(getStatsStore()).length,originalOrderCount:cards.filter(card=>parseOriginalOrder(card?.originalOrder).valid).length,exampleUuid:example?.uuid,exampleDeckPath:example?.deckPath,exampleOrder:example?.originalOrder,exampleQuestion:example?.q,exampleAnswer:example?.a,fields,parsed,sorted,legacy};
  })()`);
  if(initial.cardCount!==4550||initial.uniqueUuidCount!==4550||initial.explicitUuidCount!==4550||initial.originalOrderCount!==4550)throw new Error(`Actual TXT count/order failure ${JSON.stringify(initial)}`);
  if(initial.exampleUuid!=='w>yC6!FS2*'||initial.exampleOrder!=='01-001'||!initial.exampleQuestion.includes('paste-8a33')||!initial.exampleQuestion.includes('기이대통령령의제정')||!initial.exampleAnswer.includes('paste-be8a')||!initial.exampleAnswer.includes('01-e864')||!initial.exampleAnswer.includes('01-001'))throw new Error(`Quoted image/UUID parsing failure ${JSON.stringify(initial)}`);
  if(initial.sorted.join('|')!=='01-001|01-002|01-010|02-001|02-002|없음')throw new Error(`Original order sort failure ${JSON.stringify(initial.sorted)}`);
  if(initial.legacy.join('|')!=='3|11|20')throw new Error(`Legacy fallback failure ${JSON.stringify(initial.legacy)}`);

  const uuidMatching=await evaluate(`(()=>{const savedLibrary=library;const uuid='w>yC6!FS2*';const stats={[uuid]:{correct:3,total:4,history:[{score:2,time:1}],fsrs:{D:4,S:8,reps:1},fav:true,hidden:true,completed:true}};const make=(id,deck,front,title,order)=>[id,deck,'<img src="'+front+'" title="'+title+'"/>','<img src="back.jpg" title/>','<img src="extra.jpg" title/>',order].map(escapeTsvCell).join('\\t');const changed=make(uuid,'행정법::변경된 덱','changed-front.jpg','변경된 OCR', '09-099');library={};const report=createYokiIdMigrationReport();const result=processAnkiText(changed,'행정법.txt',stats,report);const card=Object.values(library).flat()[0];const sameStat=findStatsForCard(card,stats);library={};processAnkiText(changed,'행정법.txt',stats,createYokiIdMigrationReport());const reloadCount=Object.values(library).flat().length;library={};const duplicateResult=processAnkiText(changed+'\\n'+changed,'행정법.txt',stats,createYokiIdMigrationReport());const duplicateCount=Object.values(library).flat().length;library={};const other=make('other>UUID!*','행정법::변경된 덱','changed-front.jpg','변경된 OCR','09-099');processAnkiText(other,'행정법.txt',stats,createYokiIdMigrationReport());const otherCard=Object.values(library).flat()[0];const otherHasStats=!!findStatsForCard(otherCard,stats);library=savedLibrary;return{uuid:card.uuid,id:card.id,deckPath:card.deckPath,order:card.originalOrder,statsCount:Object.keys(stats).length,historyCount:sameStat.history.length,fsrsCount:sameStat.fsrs?1:0,reloadCount,duplicateCount,duplicateUuidCount:duplicateResult.duplicateUuidCount,duplicateUuids:duplicateResult.duplicateUuids,otherHasStats}})()`);
  if(uuidMatching.uuid!=='w>yC6!FS2*'||uuidMatching.id!==uuidMatching.uuid||uuidMatching.statsCount!==1||uuidMatching.historyCount!==1||uuidMatching.fsrsCount!==1||uuidMatching.reloadCount!==1||uuidMatching.duplicateCount!==1||uuidMatching.duplicateUuidCount!==1||uuidMatching.otherHasStats)throw new Error(`UUID matching/duplicate safety failed ${JSON.stringify(uuidMatching)}`);

  const saved=await evaluate(`(async()=>{const cards=Object.values(library).flat();const stats={};stats[cards[0].id]={correct:1,total:2,history:[{score:1,time:Date.now()}]};stats[cards[1].id]={correct:0,total:1,history:[{score:0,time:Date.now()}]};setStorageItem(STORAGE_KEY_STATS,JSON.stringify(stats));setSortMode('number');await waitForPendingStatsWrites();return {ids:cards.slice(0,2).map(card=>card.id),statsCount:Object.keys(getStatsStore()).length,historyCount:Object.values(getStatsStore()).reduce((n,s)=>n+(s.history?.length||0),0)}})()`);
  await evaluate(`location.reload()`); await delay(3000);
  const reloaded=await evaluate(`({sort:currentSortMode,statsCount:Object.keys(getStatsStore()).length,historyCount:Object.values(getStatsStore()).reduce((n,s)=>n+(s.history?.length||0),0),matched:${JSON.stringify(saved.ids)}.map(id=>!!getStatsStore()[id]),cardCount:Object.values(library).flat().length,orders:Object.values(library).flat().slice(0,4).map(card=>card.originalOrder)})`);
  if(reloaded.sort!=='number'||reloaded.statsCount!==saved.statsCount||reloaded.historyCount!==saved.historyCount||reloaded.matched.some(value=>!value)||reloaded.cardCount!==initial.cardCount)throw new Error(`Reload/Stats regression ${JSON.stringify({saved,reloaded})}`);

  for(const width of [390,1366]){await send('Emulation.setDeviceMetricsOverride',{width,height:800,deviceScaleFactor:1,mobile:width<500});const ok=await evaluate(`typeof compareByNumberOrder==='function'&&document.body.scrollWidth<=document.documentElement.clientWidth`);if(!ok)throw new Error(`Viewport regression ${width}`)}
  console.log(JSON.stringify({initial,uuidMatching,saved,reloaded,viewports:[390,1366]},null,2));
  ws.close();
}

try{await main()}finally{browser.kill();server.kill()}
