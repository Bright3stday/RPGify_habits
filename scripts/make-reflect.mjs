import { chromium } from 'playwright-core';
import fs from 'node:fs';
const EXE='/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
// hunched figure looking down at a glowing phone — a "mid-scroll" cue
const SKIN='#e8b088',HAIR='#3a2a1a',TUNIC='#6ad46a',PANT='#3a2a1a',EYE='#1a1a2a',PH='#48c8ff',PHL='#bfeaff',GND='#2a2a55';
const cells=[];
const put=(x,y,c)=>cells.push([x,y,c]);
const rect=(x,y,w,h,c)=>{for(let i=0;i<w;i++)for(let j=0;j<h;j++)put(x+i,y+j,c);};
// ground
rect(3,15,10,1,GND);
// head lowered
rect(6,2,5,1,HAIR);
rect(6,3,5,2,SKIN);
put(7,4,EYE);put(9,4,EYE);
// hunched torso
rect(6,5,4,3,TUNIC);
// arms forward/down toward phone
put(5,6,SKIN);put(5,7,SKIN);put(6,8,SKIN);
put(10,6,SKIN);put(10,7,SKIN);put(9,8,SKIN);
// glowing phone held low in front
rect(7,8,3,3,PH);put(7,8,PHL);put(8,9,PHL);
// folded sitting legs
rect(5,11,6,1,PANT);
rect(5,12,1,2,PANT);rect(10,12,1,2,PANT);
rect(5,14,2,1,EYE);rect(9,14,2,1,EYE);
const rects=cells.map(([x,y,c])=>`<rect x="${x}" y="${y}" width="1" height="1" fill="${c}"/>`).join('');
const svg=`<svg viewBox="0 0 16 16" width="100%" height="100%" shape-rendering="crispEdges" xmlns="http://www.w3.org/2000/svg"><defs><filter id="g"><feGaussianBlur stdDeviation="0.6"/></filter></defs><circle cx="8.5" cy="9.5" r="3" fill="#48c8ff" opacity="0.35" filter="url(#g)"/>${rects}</svg>`;
const size=Number(process.env.SIZE||128);
const html=`<!doctype html><html><head><style>*{margin:0;padding:0}html,body{width:${size}px;height:${size}px;background:transparent}.w{width:${size}px;height:${size}px}</style></head><body><div class="w">${svg}</div></body></html>`;
const b=await chromium.launch({executablePath:EXE,args:['--no-sandbox']});
const p=await b.newPage();
await p.setViewportSize({width:size,height:size});
await p.setContent(html,{waitUntil:'load'});
fs.mkdirSync('android/app/src/main/res/drawable-nodpi',{recursive:true});
await p.screenshot({path:'android/app/src/main/res/drawable-nodpi/ic_reflect.png',omitBackground:true});
await p.screenshot({path:process.env.PREVIEW||'/tmp/reflect.png',omitBackground:false});
await b.close();console.log('ok');
