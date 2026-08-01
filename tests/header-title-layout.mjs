import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

const root = new URL('../', import.meta.url).pathname.replace(/^\/(.:)/, '$1');
const port = 4176;
const debugPort = 9361;
const edge = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const profile = mkdtempSync(join(tmpdir(), 'yople-title-edge-'));
const server = spawn('python', ['-m', 'http.server', String(port), '--bind', '127.0.0.1'], { cwd: dirname(root), stdio: 'ignore' });
const browser = spawn(edge, ['--headless=new', '--disable-gpu', `--remote-debugging-port=${debugPort}`, `--user-data-dir=${profile}`, 'about:blank'], { stdio: 'ignore' });
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

async function main() {
  let targets;
  for(let i=0;i<60;i++){try{targets=await(await fetch(`http://127.0.0.1:${debugPort}/json`)).json();break}catch{await delay(200)}}
  if(!targets) throw new Error('Edge CDP unavailable');
  const ws=new WebSocket(targets.find(item=>item.type==='page').webSocketDebuggerUrl);
  await new Promise((resolve,reject)=>{ws.onopen=resolve;ws.onerror=reject});
  let id=1;const pending=new Map();
  ws.onmessage=event=>{const msg=JSON.parse(event.data);if(!pending.has(msg.id))return;const p=pending.get(msg.id);pending.delete(msg.id);msg.error?p.reject(new Error(msg.error.message)):p.resolve(msg.result)};
  const send=(method,params={})=>new Promise((resolve,reject)=>{const callId=id++;pending.set(callId,{resolve,reject});ws.send(JSON.stringify({id:callId,method,params}))});
  const evaluate=async expression=>{const r=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw new Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value};
  await send('Page.enable');await send('Runtime.enable');
  await send('Page.navigate',{url:`http://127.0.0.1:${port}/yople/?yopleTestMode=1`});
  for(let i=0;i<100;i++){await delay(200);if(await evaluate(`deckLoadReady&&!isBooting`))break}

  const cases=[
    ['행정법','행정법'],
    ['행정법__01 (행정과 행정법)','01 (행정과 행정법)'],
    ['행정법__01 (행정과 행정법)__01 (기소인)','01 (행정과 행정법) > 01 (기소인)'],
    ['행정법__01 (행정과 행정법)__01 (기소인)__01 (기)','01 (행정과 행정법) > 01 (기)'],
    ['행정법__02 (행정입법)__03 (법규명령)__02 (위임명령)','02 (행정입법) > 02 (위임명령)'],
    ['행정법__매우 긴 두 번째 계층 덱 이름__중간 덱__매우 긴 최하위 선택 덱 이름','매우 긴 두 번째 계층 덱 이름 > 매우 긴 최하위 선택 덱 이름']
  ];
  const ruleResults=await evaluate(`(${JSON.stringify(cases)}).map(([path,expected])=>{const actual=getHeaderDeckTitle(path).display;return{path,expected,actual,ok:actual===expected}})`);
  if(ruleResults.some(item=>!item.ok))throw new Error(`Title rule failed ${JSON.stringify(ruleResults)}`);
  const separatorResults=await evaluate(`['행정법::A::B','행정법 > A > B','행정법/A/B'].map(path=>({path,parts:getDeckPathParts(path),title:getHeaderDeckTitle(path).display}))`);
  if(separatorResults.some(item=>item.title!=='A > B'))throw new Error(`Separator compatibility failed ${JSON.stringify(separatorResults)}`);

  const widths=[320,375,390,430,768,1366];
  const matrix=[];
  for(const width of widths){
    await send('Emulation.setDeviceMetricsOverride',{width,height:800,deviceScaleFactor:1,mobile:width<768});
    await delay(120);
    const measurements=[];
    for(const [path,expected] of cases){
      const result=await evaluate(`(async()=>{
        const title=setHeaderDeckTitle(${JSON.stringify(path)},'deck'); await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
        const text=document.getElementById('deck-title-text'),wrap=document.getElementById('deck-title-text-wrap'),left=document.querySelector('.header-left'),right=document.querySelector('.header-controls');
        const tr=text.getBoundingClientRect(),wr=wrap.getBoundingClientRect(),lr=left.getBoundingClientRect(),rr=right.getBoundingClientRect(),cs=getComputedStyle(text);
        return{display:text.textContent,expected:${JSON.stringify(expected)},full:document.getElementById('deck-title').title,font:parseFloat(cs.fontSize),scale:Number(text.dataset.fitScale||1),textLeft:tr.left,textRight:tr.right,wrapLeft:wr.left,wrapRight:wr.right,leftRight:lr.right,rightLeft:rr.left,oneLine:tr.height<=parseFloat(cs.lineHeight)+1,noEllipsis:cs.textOverflow!=='ellipsis',noPageScroll:document.documentElement.scrollWidth<=document.documentElement.clientWidth,observerCount:headerTitleResizeObserver?1:0};
      })()`);
      const epsilon=1.5;
      result.fits=result.textLeft>=result.wrapLeft-epsilon&&result.textRight<=result.wrapRight+epsilon;
      result.noButtonOverlap=result.textLeft>=result.leftRight-epsilon&&result.textRight<=result.rightLeft+epsilon;
      if(result.display!==expected||!result.fits||!result.noButtonOverlap||!result.oneLine||!result.noEllipsis||!result.noPageScroll||result.font>17.61||result.font<9.99||result.observerCount!==1)throw new Error(`Layout failed width=${width} ${JSON.stringify(result)}`);
      measurements.push(result);
    }
    matrix.push({width,minFont:Math.min(...measurements.map(x=>x.font)),maxFont:Math.max(...measurements.map(x=>x.font)),minScale:Math.min(...measurements.map(x=>x.scale)),allFit:measurements.every(x=>x.fits&&x.noButtonOverlap),noScroll:measurements.every(x=>x.noPageScroll)});
  }
  await send('Emulation.setDeviceMetricsOverride',{width:320,height:800,deviceScaleFactor:1,mobile:true});await delay(100);
  await evaluate(`setHeaderDeckTitle('행정법__매우 긴 두 번째 계층 덱 이름__중간__매우 긴 최하위 선택 덱 이름')`);await delay(100);
  const smallFont=await evaluate(`Number(document.getElementById('deck-title-text').dataset.fitFontSize)`);
  await send('Emulation.setDeviceMetricsOverride',{width:1366,height:800,deviceScaleFactor:1,mobile:false});await delay(150);
  const largeFont=await evaluate(`Number(document.getElementById('deck-title-text').dataset.fitFontSize)`);
  if(!(largeFont>smallFont))throw new Error(`Font did not grow after resize ${smallFont} -> ${largeFont}`);
  console.log(JSON.stringify({ruleResults,separatorResults,matrix,resizeGrowth:{smallFont,largeFont}},null,2));
  ws.close();
}

try{await main()}finally{browser.kill();server.kill()}
