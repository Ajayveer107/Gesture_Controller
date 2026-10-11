#!/usr/bin/env node
// Gesture Controller - single file. Run: node gesture.js   (Node 18+)
// First run downloads MediaPipe runtime + hand model into ./vendor; after that it works offline.
const fs = require('fs'), path = require('path'), http = require('http');
const V = path.join(__dirname, 'vendor');
const CDN = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/';
const FILES = {
  'vision_bundle.mjs': CDN + 'vision_bundle.mjs',
  'wasm/vision_wasm_internal.js': CDN + 'wasm/vision_wasm_internal.js',
  'wasm/vision_wasm_internal.wasm': CDN + 'wasm/vision_wasm_internal.wasm',
  'wasm/vision_wasm_nosimd_internal.js': CDN + 'wasm/vision_wasm_nosimd_internal.js',
  'wasm/vision_wasm_nosimd_internal.wasm': CDN + 'wasm/vision_wasm_nosimd_internal.wasm',
  'hand_landmarker.task': 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task',
};
const HTML = (() => { const s = fs.readFileSync(__filename, 'utf8'); const a = s.indexOf('/*HTML' + '_START') + 12, b = s.lastIndexOf('HTML' + '_END*/'); return s.slice(a, b); })();
const TYPES = { '.mjs': 'text/javascript', '.js': 'text/javascript', '.wasm': 'application/wasm' };

async function setup() {
  for (const [name, url] of Object.entries(FILES)) {
    const f = path.join(V, name); if (fs.existsSync(f)) continue;
    console.log('Downloading', name, '...');
    const r = await fetch(url); if (!r.ok) throw new Error(name + ' failed: HTTP ' + r.status);
    fs.mkdirSync(path.dirname(f), { recursive: true });
    fs.writeFileSync(f, Buffer.from(await r.arrayBuffer()));
  }
}
setup().then(() => {
  const server = http.createServer((q, s) => {
    const p = decodeURIComponent(q.url.split('?')[0]);
    if (p === '/') { s.writeHead(200, { 'Content-Type': 'text/html' }); return s.end(HTML); }
    const f = path.join(__dirname, path.normalize(p));
    if (!f.startsWith(V) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { s.writeHead(404); return s.end('Not found'); }
    s.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' });
    fs.createReadStream(f).pipe(s);
  });
  let port = 3000;
  server.on('error', e => {
    if (e.code === 'EADDRINUSE' && port < 3020) { server.listen(++port); }
    else { console.error('Server error:', e.message); process.exit(1); }
  });
  server.on('listening', () => {
    const url = 'http://localhost:' + port;
    console.log('Ready -> ' + url + '   (keep this window open; Ctrl+C to stop)');
    const cmd = process.platform === 'win32' ? 'start ""' : process.platform === 'darwin' ? 'open' : 'xdg-open';
    require('child_process').exec(cmd + ' ' + url, () => {});
  });
  server.listen(port);
}).catch(e => { console.error(e.message, '\nCheck your internet connection for the first run.'); process.exit(1); });

/*HTML_START
<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Gesture Controller</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
:root{--bg:#0b0e14;--fg:#e8ecf4;--ac:#5ef2c0;--ac2:#7c5cff}
*{box-sizing:border-box}html,body{margin:0;height:100%;overflow:hidden;background:var(--bg);color:var(--fg);font:15px system-ui,sans-serif;cursor:none}
video{position:fixed;inset:0;width:100%;height:100%;object-fit:cover;transform:scaleX(-1);opacity:.28;filter:grayscale(.4)}
canvas{position:fixed;inset:0}
#hud{position:fixed;top:14px;left:18px;right:18px;display:flex;justify-content:space-between;font-weight:600;letter-spacing:.04em;pointer-events:none}
#hud span b{color:var(--ac)}
#panel{position:fixed;inset:0;display:grid;place-content:center;text-align:center;gap:14px;background:rgba(11,14,20,.72);backdrop-filter:blur(6px)}
#panel h1{margin:0;font-size:44px}#panel p{margin:0;opacity:.75;max-width:420px}
button{cursor:none;font:inherit;font-weight:700;padding:16px 34px;border-radius:14px;border:2px solid var(--ac);background:transparent;color:var(--ac);font-size:20px;transition:.15s}
button.hover{background:var(--ac);color:#062;transform:scale(1.06)}
#cur{position:fixed;left:0;top:0;width:44px;height:44px;margin:-22px 0 0 -22px;border-radius:50%;border:3px solid var(--ac);pointer-events:none;transition:width .1s,height .1s,margin .1s,background .1s;z-index:9;box-shadow:0 0 18px var(--ac)}
#cur.down{width:26px;height:26px;margin:-13px 0 0 -13px;background:var(--ac2);border-color:var(--ac2);box-shadow:0 0 22px var(--ac2)}
#st{position:fixed;bottom:14px;left:18px;opacity:.7;font-size:13px}
</style></head><body>
<video id="v" playsinline muted></video><canvas id="c"></canvas>
<div id="hud"><span>SCORE <b id="sc">0</b></span><span>COMBO <b id="cb">x1</b></span><span>LIVES <b id="lv">♥♥♥</b></span><span>BEST <b id="bs">0</b></span></div>
<div id="panel"><h1>Gesture Controller</h1>
<p id="msg">Move your <b>index finger</b> to steer the cursor. <b>Pinch</b> thumb + index to click. Mouse works as a fallback.</p>
<button id="go" disabled>Loading…</button></div>
<div id="cur"></div><div id="st">starting…</div>
<script type="module">
import {HandLandmarker,FilesetResolver} from './vendor/vision_bundle.mjs';
const $=id=>document.getElementById(id),c=$('c'),g=c.getContext('2d'),cur=$('cur'),v=$('v');
let W,H;const rs=()=>{W=c.width=innerWidth;H=c.height=innerHeight};rs();addEventListener('resize',rs);
const P={x:innerWidth/2,y:innerHeight/2},raw={x:P.x,y:P.y};let pinch=false,hand=null,useHand=false;
const dist=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
// game
let mode='menu',score=0,combo=1,lives=3,best=0,T=[],parts=[],last=0,spawnAt=0,t0=0,hover=null;
try{best=+localStorage.getItem('gc-best')||0}catch{}$('bs').textContent=best;
const hud=()=>{$('sc').textContent=score;$('cb').textContent='x'+combo;$('lv').textContent='♥'.repeat(Math.max(lives,0));$('bs').textContent=best};
function start(){mode='play';score=0;combo=1;lives=3;T=[];parts=[];t0=performance.now();spawnAt=0;$('panel').style.display='none';hud()}
function over(){mode='over';if(score>best){best=score;try{localStorage.setItem('gc-best',best)}catch{}}hud();
 $('panel').style.display='grid';$('panel').querySelector('h1').textContent='Game over · '+score;$('msg').textContent='Personal best: '+best;$('go').textContent='Play again'}
function burst(x,y,col){for(let i=0;i<18;i++){const a=Math.random()*6.28,s=2+Math.random()*5;parts.push({x,y,vx:Math.cos(a)*s,vy:Math.sin(a)*s,l:1,col})}}
function click(x,y){
 if(mode!=='play'){const el=document.elementFromPoint(x,y)?.closest('button');if(el&&!el.disabled)el.click();return}
 for(let i=T.length-1;i>=0;i--){const t=T[i];if(Math.hypot(t.x-x,t.y-y)<=t.r+10){T.splice(i,1);score+=10*combo;combo=Math.min(combo+1,10);burst(t.x,t.y,t.c);hud();return}}
 combo=1;hud();burst(x,y,'#ff5c7c')}
$('go').onclick=start;
addEventListener('mousemove',e=>{if(!useHand){P.x=e.clientX;P.y=e.clientY}});
addEventListener('mousedown',e=>{if(!useHand)click(e.clientX,e.clientY)});
// hand tracking
let hl;const st=$('st');
try{
 const fs=await FilesetResolver.forVisionTasks('./vendor/wasm');
 const opt=d=>({baseOptions:{modelAssetPath:'./vendor/hand_landmarker.task',delegate:d},runningMode:'VIDEO',numHands:1,minHandDetectionConfidence:.6,minTrackingConfidence:.6});
 try{hl=await HandLandmarker.createFromOptions(fs,opt('GPU'))}catch{hl=await HandLandmarker.createFromOptions(fs,opt('CPU'))}
 v.srcObject=await navigator.mediaDevices.getUserMedia({video:{width:640,height:480,facingMode:'user'}});await v.play();
 st.textContent='hand tracking ready';
}catch(e){st.textContent='No camera/model ('+e.message+') – using mouse';console.warn(e)}
$('go').disabled=false;$('go').textContent='Start';
let lastT=-1;const M=.15;
function track(){
 if(!hl||v.readyState<2||v.currentTime===lastT){return}lastT=v.currentTime;
 const r=hl.detectForVideo(v,performance.now());hand=r.landmarks[0]||null;
 if(!hand){useHand=false;pinch=false;cur.classList.remove('down');return}
 useHand=true;const tip=hand[8],size=dist(hand[0],hand[9])||1,d=dist(hand[4],hand[8])/size;
 // freeze cursor while fingers close in so the pinch doesn't drag it
 if(d>.4){raw.x=(1-(tip.x-M)/(1-2*M))*W;raw.y=((tip.y-M)/(1-2*M))*H;raw.x=Math.min(W,Math.max(0,raw.x));raw.y=Math.min(H,Math.max(0,raw.y))}
 // adaptive smoothing: steady when slow, responsive when fast
 const sp=Math.hypot(raw.x-P.x,raw.y-P.y),a=Math.min(.9,.12+sp/250);P.x+=(raw.x-P.x)*a;P.y+=(raw.y-P.y)*a;
 if(!pinch&&d<.28){pinch=true;click(P.x,P.y)}else if(pinch&&d>.45)pinch=false;
 cur.classList.toggle('down',pinch)}
function skeleton(){
 if(!hand)return;const L=[[0,1,2,3,4],[0,5,6,7,8],[0,9,10,11,12],[0,13,14,15,16],[0,17,18,19,20]];
 const p=i=>[(1-(hand[i].x-M)/(1-2*M))*W,((hand[i].y-M)/(1-2*M))*H];
 g.strokeStyle='rgba(94,242,192,.35)';g.lineWidth=2;
 for(const l of L){g.beginPath();l.forEach((i,k)=>{const[x,y]=p(i);k?g.lineTo(x,y):g.moveTo(x,y)});g.stroke()}
 g.fillStyle='rgba(124,92,255,.8)';for(let i=0;i<21;i++){const[x,y]=p(i);g.beginPath();g.arc(x,y,3,0,7);g.fill()}}
function frame(now){
 requestAnimationFrame(frame);track();g.clearRect(0,0,W,H);skeleton();
 const dt=Math.min(50,now-last);last=now;
 if(mode==='play'){
  const lvl=(now-t0)/1000,gap=Math.max(450,1100-lvl*15);
  if(now>spawnAt){spawnAt=now+gap;const r=34+Math.random()*26;
   T.push({x:r+80+Math.random()*(W-2*r-160),y:r+70+Math.random()*(H-2*r-140),r,born:now,life:Math.max(1300,2600-lvl*25),c:`hsl(${Math.random()*360|0} 90% 62%)`})}
  for(let i=T.length-1;i>=0;i--){const t=T[i],k=(now-t.born)/t.life;
   if(k>=1){T.splice(i,1);lives--;combo=1;hud();burst(t.x,t.y,'#ff5c7c');if(lives<=0)over();continue}
   g.fillStyle=t.c;g.globalAlpha=.85;g.beginPath();g.arc(t.x,t.y,t.r,0,7);g.fill();g.globalAlpha=1;
   g.strokeStyle='#fff';g.lineWidth=4;g.beginPath();g.arc(t.x,t.y,t.r+8,-1.57,-1.57+6.28*(1-k));g.stroke()}}
 for(let i=parts.length-1;i>=0;i--){const q=parts[i];q.x+=q.vx;q.y+=q.vy;q.l-=dt/500;if(q.l<=0){parts.splice(i,1);continue}
  g.globalAlpha=q.l;g.fillStyle=q.col;g.fillRect(q.x,q.y,5,5)}g.globalAlpha=1;
 cur.style.transform=`translate(${P.x}px,${P.y}px)`;
 const b=document.elementFromPoint(P.x,P.y)?.closest('button');if(hover!==b){hover?.classList.remove('hover');b?.classList.add('hover');hover=b}}
requestAnimationFrame(frame);
</script></body></html>

HTML_END*/
