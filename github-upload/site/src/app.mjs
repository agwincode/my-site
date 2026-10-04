import { CONFIG, clamp, createBalloons, resetBalloons, applyGust, stepMotion, positionBalloons, applyAscent, applyGather, arrivalOpacity } from './motion.mjs';

const PALETTE = [[250,249,246], [244,244,242]];
const CELL = 362; // Preserve native detail as the camera passes larger foreground balloons.
const canvas = document.querySelector('#sky');
const ctx = canvas.getContext('2d');
const pauseButton = document.querySelector('#pause');
const status = document.querySelector('#status');
const reduced = matchMedia('(prefers-reduced-motion: reduce)');
const coarse = matchMedia('(pointer: coarse)');
const balloons = createBalloons();
const atlases = [];
let width = 0, height = 0, letterScale = 1, ready = false;
let paused = reduced.matches, ambient = !reduced.matches;
let frame = null, last = 0, time = 0, accumulator = 0, resizeTimer;
let pointer = null, pending = null, activeTouch = null;
let lift = 0, liftTarget = 0;
let arrivalTime = reduced.matches ? CONFIG.arrivalDuration : 0;

function surface(w, h) {
  const el = document.createElement('canvas'); el.width = w; el.height = h; return el;
}

function prepareArtwork(image) {
  const source = surface(CELL * 4, CELL * 3), paint = source.getContext('2d', { willReadFrequently: true });
  paint.drawImage(image, 0, 0, source.width, source.height);
  const original = paint.getImageData(0, 0, source.width, source.height);
  // Clear only edge-connected matte pixels; retain enclosed ivory fabric panels.
  for(let row=0;row<3;row++)for(let col=0;col<4;col++){
    const seen=new Uint8Array(CELL*CELL), queue=new Uint32Array(CELL*CELL);
    let head=0,tail=0;
    function visit(x,y){
      if(x<0||y<0||x>=CELL||y>=CELL)return;
      const local=y*CELL+x;if(seen[local])return;seen[local]=1;
      const at=((row*CELL+y)*source.width+col*CELL+x)*4;
      const r=original.data[at],g=original.data[at+1],b=original.data[at+2];
      if(original.data[at+3]<16 || (Math.min(r,g,b)>232 && Math.max(r,g,b)-Math.min(r,g,b)<16)){
        original.data[at+3]=0;queue[tail++]=local;
      }
    }
    for(let i=0;i<CELL;i++){visit(i,0);visit(i,CELL-1);visit(0,i);visit(CELL-1,i);}
    while(head<tail){const at=queue[head++],x=at%CELL,y=Math.floor(at/CELL);visit(x-1,y);visit(x+1,y);visit(x,y-1);visit(x,y+1);}
  }
  for (let variant = 0; variant < PALETTE.length; variant++) {
    const atlas = surface(source.width, source.height), out = atlas.getContext('2d');
    const pixels = out.createImageData(source.width, source.height); pixels.data.set(original.data);
    for (let i = 0; i < pixels.data.length; i += 4) {
      if (!pixels.data[i + 3]) continue;
      const localY = Math.floor(i / 4 / source.width) % CELL;
      if (localY > CELL * 282 / 362) {
        // Lift the wicker and basket outlines, preserving their texture and alpha.
        const wicker = [220, 209, 190];
        for (let c=0; c<3; c++) pixels.data[i+c] = original.data[i+c]*.65 + wicker[c]*.35;
        continue;
      }
      const r = original.data[i], g = original.data[i+1], b = original.data[i+2];
      const light = (.2126*r + .7152*g + .0722*b) / 255;
      const target = PALETTE[variant];
      // Recolor all fabric, including low-saturation blue and beige formerly skipped.
      // Preserve charcoal linework rather than retaining its original hue.
      const ink = clamp((light - .18) / .34, 0, 1);
      const fabric = variant < 2 ? .92 + light*.08 : .65 + light*.35;
      for (let c=0; c<3; c++) pixels.data[i+c] = 48*(1-ink) + target[c]*fabric*ink;
    }
    out.putImageData(pixels, 0, 0); atlases.push(atlas);
  }
}

function formName() {
  // Bound the text-mask work independently of screen density and large desktop displays.
  const ratio = Math.min(1, 1200 / width, 850 / height);
  const mask = surface(Math.max(1, Math.round(width*ratio)), Math.max(1, Math.round(height*ratio)));
  const pen = mask.getContext('2d', { willReadFrequently: true });
  const lines = ['Angela', 'Winegar'];
  let fontSize = Math.min(height*.255,width*.3) * ratio;
  const font = () => `600 ${fontSize}px 'Apple Chancery', 'Palatino Linotype', Georgia, serif`;
  // Replace only the opening capital with a custom calligraphic glyph.
  const textWidth = text => text.split(' ').reduce((sum,word,i)=>sum+pen.measureText(word).width+(i?pen.measureText(' ').width*.65:0),0);
  const drawText = (text,x,y) => {
    text.split(' ').forEach((word,i)=>{if(i)x+=pen.measureText(' ').width*.65;pen.fillText(word,x,y);pen.save();pen.lineWidth=fontSize*.008;pen.lineJoin='round';pen.strokeText(word,x,y);pen.restore();x+=pen.measureText(word).width;});
  };
  const lineWidth = line => line.startsWith('A')
    ? fontSize*.70 + textWidth(line.slice(1))
    : textWidth(line);
  pen.font = font();
  fontSize *= Math.min(1, mask.width*(width<=800?.84:.43) / Math.max(...lines.map(lineWidth)));
  pen.font = font(); pen.letterSpacing = `${-fontSize*.012}px`; pen.textAlign = 'left'; pen.textBaseline = 'middle';
  // Match the custom capital to the actual rendered font, including mobile fallbacks.
  const probe=surface(Math.ceil(fontSize*2),Math.ceil(fontSize*2));
  const sample=probe.getContext('2d',{willReadFrequently:true});
  sample.font=font();sample.textBaseline='alphabetic';
  const baseline=fontSize,ascent=sample.measureText('n').actualBoundingBoxAscent;
  sample.fillText('n',fontSize*.2,baseline);
  const ink=sample.getImageData(0,0,probe.width,probe.height).data,widths=[];
  for(let y=Math.ceil(baseline-ascent*.75);y<baseline-ascent*.2;y++){
    let run=0;
    for(let x=0;x<=probe.width;x++){
      if(x<probe.width&&ink[(y*probe.width+x)*4+3]>160){run++;continue;}
      if(run>fontSize*.015&&run<fontSize*.18)widths.push(run);
      run=0;
    }
  }
  widths.sort((a,b)=>a-b);
  const strokeWeight=clamp(widths[Math.floor(widths.length*.7)]||fontSize*.06,fontSize*.025,fontSize*.11);
  lines.forEach((line,i)=>{
    const y=mask.height*(width<=800?.72:.52)+(i-(lines.length-1)/2)*fontSize*1.2;
    const x=mask.width*(width<=800?.5:.70)-lineWidth(line)*.5;
    if(!line.startsWith('A')){drawText(line,x,y);return;}
    const metrics=pen.measureText('A');
    const capHeight=metrics.actualBoundingBoxAscent+metrics.actualBoundingBoxDescent;
    const glyphWidth=fontSize*.74,top=y-metrics.actualBoundingBoxAscent;
    const point=(u,v)=>[x+u*glyphWidth,top+v*capHeight];
    pen.save();pen.strokeStyle='#000';pen.lineCap='round';pen.lineJoin='round';
    // Broad oval entry, open counter, and a sloping stem with a soft exit into the n.
    pen.lineWidth=strokeWeight*.82;
    pen.beginPath();pen.moveTo(...point(.83,.035));
    pen.bezierCurveTo(...point(.48,-.035),...point(.18,.18),...point(.06,.58));
    pen.bezierCurveTo(...point(-.05,.96),...point(.21,1.06),...point(.45,.78));
    pen.bezierCurveTo(...point(.62,.58),...point(.77,.22),...point(.83,.035));
    pen.stroke();
    pen.lineWidth=strokeWeight;
    pen.beginPath();pen.moveTo(...point(.83,.035));
    pen.bezierCurveTo(...point(.73,.31),...point(.54,.64),...point(.49,.87));
    pen.bezierCurveTo(...point(.44,1.1),...point(.76,.99),...point(1,.78));
    pen.stroke();pen.restore();
    drawText(line.slice(1),x+fontSize*.70,y);
  });
  const pixels = pen.getImageData(0,0,mask.width,mask.height).data, xs = [], ys = [];
  for (let y=0; y<mask.height; y+=2) for (let x=0; x<mask.width; x+=2) {
    if (pixels[(y*mask.width+x)*4+3]>160) { xs.push(x/ratio); ys.push(y/ratio); }
  }
  if (!xs.length) throw new Error('Lettering could not be rendered.');
  const distances = new Float32Array(xs.length); distances.fill(Infinity);
  letterScale = Math.min(1, Math.max(.38, Math.sqrt(xs.length*4/(ratio*ratio)/700)*2.25/22));
  // Fill the largest uncovered patch next, stopping at the envelope-size coverage target.
  const reach=Math.max(3,18*letterScale*.92*.95*.24+1)*1.38;
  const pool=createBalloons(1050);
  balloons.length=0;
  let selected = Math.floor(xs.length*.5);
  for (const b of pool) {
    balloons.push(b);
    b.homeX = xs[selected]; b.homeY = ys[selected];
    let farthest = -1;
    for (let j=0; j<xs.length; j++) {
      const dx = xs[j]-b.homeX, dy = ys[j]-b.homeY;
      distances[j] = Math.min(distances[j], dx*dx+dy*dy);
      if (distances[j]>farthest) { farthest=distances[j]; selected=j; }
    }
    if(balloons.length>=CONFIG.count && farthest<=reach*reach)break;
  }
  // Keep the uniformly spread prefix of the coverage sampler: retain a lighter formation with a few more balloons.
  balloons.length=Math.round(balloons.length*.66);
  // Relax coverage into evenly spaced centers, then snap back onto the original ink.
  // Keeping anchors on the mask preserves the script's counters and flourishes.
  const groups=balloons.map(()=>({x:0,y:0,points:[]}));
  for(let j=0;j<xs.length;j++){
    let nearest=0,best=Infinity;
    for(let i=0;i<balloons.length;i++){
      const d=(xs[j]-balloons[i].homeX)**2+(ys[j]-balloons[i].homeY)**2;
      if(d<best){best=d;nearest=i;}
    }
    const group=groups[nearest];group.x+=xs[j];group.y+=ys[j];group.points.push(j);
  }
  groups.forEach((group,i)=>{
    if(!group.points.length)return;
    const x=group.x/group.points.length,y=group.y/group.points.length;
    let selected=group.points[0],best=Infinity;
    for(const j of group.points){
      const d=(xs[j]-x)**2+(ys[j]-y)**2;
      if(d<best){best=d;selected=j;}
    }
    balloons[i].homeX=xs[selected];balloons[i].homeY=ys[selected];
  });
  letterScale = Math.min(1, Math.max(.38, Math.sqrt(xs.length*4/(ratio*ratio)/700)*2.25/22));
  for(const b of balloons){const center=width*(width<=800?.5:.70);b.homeX=center+(b.homeX-center)*.96;}
  resetBalloons(balloons);
  for (const b of balloons) {
    b.drawSize=b.size*letterScale*.92*.95*1.3; b.sx=b.sprite%4*CELL; b.sy=Math.floor(b.sprite/4)*CELL;
    // Two subtle warm-white fabric tones.
    const accent=Math.abs((Math.sin(b.phase*127.1)*43758.5453)%1);
    b.colorway=accent<.65?0:1;
  }
}

function resize(force = false) {
  const rect = canvas.getBoundingClientRect();
  const w = Math.round(rect.width), h = Math.round(rect.height);
  if (!w || !h || (!force && w===width && h===height)) return;
  width=w; height=h;
  const dpr = Math.min(devicePixelRatio||1, coarse.matches?1.5:2, Math.sqrt(3000000/(width*height)));
  canvas.width=Math.round(width*dpr); canvas.height=Math.round(height*dpr);
  ctx.setTransform(dpr,0,0,dpr,0,0); ctx.imageSmoothingEnabled=true;
  formName(); pointer=pending=null; syncScroll(); wake();
}

const heroCopy = document.querySelector('.hero-intro');
const skyBackground = document.getElementById('pigment-background');
const letter = document.querySelector('.home-letter');
function syncScroll(){
  liftTarget=clamp(window.scrollY/Math.max(1,height*1.15),0,1);
  document.body.classList.toggle('past-hero',window.scrollY>height*.12);
  wake();
}
addEventListener('scroll',syncScroll,{passive:true});

function render(now) {
  frame=null;
  const dt=last?Math.min((now-last)/1000,.05):0; last=now;
  if (pending) {
    applyGust(balloons,pending.from,pending.to,Math.min(220,width*.3)); pending=null;
  }
  accumulator+=dt;
  while (accumulator>=CONFIG.step) { stepMotion(balloons); accumulator-=CONFIG.step; }
  if (!paused) {time+=dt;arrivalTime=Math.min(CONFIG.arrivalDuration,arrivalTime+dt*1.5);}
  lift += (liftTarget-lift) * (reduced.matches ? 1 : 1-Math.exp(-dt*12));
  if (Math.abs(liftTarget-lift)<.0001) lift=liftTarget;
  positionBalloons(balloons,time,width,height,ambient);
  // Let the settled lettering breathe with shared drift and a small amount of individual buoyancy.
  const settled=clamp(arrivalTime/CONFIG.arrivalDuration,0,1);
  const cohesion=settled*settled*(3-2*settled);
  if(ambient)for(const b of balloons){
    const coherentX=Math.sin(time*.24+b.homeY*.0015)*3.8+Math.sin(time*.43+b.phase)*.45;
    const coherentY=Math.sin(time*.27+b.homeX*.001)*4.2+Math.sin(time*.48+b.phase)*.65;
    b.x+=(b.homeX+b.dx+coherentX-b.x)*cohesion*.95;
    b.y+=(b.homeY+b.dy+coherentY-b.y)*cohesion*.95;
  }
  applyGather(balloons,arrivalTime,width,height,1-lift);
  // Perspective projects each depth layer away from a shared vanishing point.
  const travel = reduced.matches ? 0 : lift;
  const fade = 1-clamp((lift-.64)/.36,0,1);
  const copyFade = 1-clamp(lift/.24,0,1);
  heroCopy.style.opacity=copyFade;
  heroCopy.style.visibility=copyFade>0?'visible':'hidden';
  skyBackground.style.opacity=1-clamp((lift-.42)/.58,0,1);
  skyBackground.style.transform=`scale(${1+travel*.24})`;
  const letterProgress=clamp((height-letter.getBoundingClientRect().top)/(height*.65),0,1);
  letter.style.opacity=reduced.matches?1:.35+.65*letterProgress;
  letter.style.transform=`scale(${reduced.matches?1:.94+.06*letterProgress})`;
  canvas.style.visibility=fade>0?'visible':'hidden';
  ctx.clearRect(0,0,width,height);
  ctx.save();
  const intro = heroCopy.getBoundingClientRect();
  // Reserve the copy's full bounds, with room for the envelope and its basket.
  const clear = {left:intro.left-28,right:intro.right+28,top:intro.top-24,bottom:intro.bottom+24};
  let moving=false;
  for (let i=0;i<balloons.length;i++) {
    const b=balloons[i];
    const depth=.7+.25*(.5+.5*Math.sin(b.phase));
    const zoom=1/Math.max(.08,1-travel*depth);
    const size=b.drawSize*zoom;
    let drawX=b.x,drawY=b.y;
    drawX=width*.5+(drawX-width*.5)*zoom;
    drawY=height*.5+(drawY-height*.5)*zoom;
    // A soft elliptical flow field leaves breathing room without snapping to edges.
    // Copy avoidance belongs only to the opening drift, never the settled name.
    // Match each balloon's gather timing so its final letter anchor stays untouched.
    const gatherProgress=clamp((arrivalTime-(3.175+b.phase/(Math.PI*2)*1.2))/6.4,0,1);
    const avoidanceEnd=clamp(gatherProgress/.65,0,1);
    const avoidance=1-avoidanceEnd*avoidanceEnd*(3-2*avoidanceEnd);
    if(copyFade>0 && avoidance>0 && clear.bottom>0){
      const cx=(clear.left+clear.right)*.5, cy=(clear.top+clear.bottom)*.5;
      const rx=(clear.right-clear.left)*.72+size*.4;
      const ry=(clear.bottom-clear.top)*.78+size*.4;
      const nx=(drawX-cx)/rx, ny=(drawY-cy)/ry;
      const radius=Math.hypot(nx,ny);
      const angle=radius>.001?Math.atan2(ny,nx):b.phase;
      // Individual clearance spreads the fleet across a band rather than an outline.
      const clearance=1.3+.22*Math.sin(b.phase*3.7);
      const outer=Math.sqrt(radius*radius+clearance*Math.exp(-radius*radius*.65));
      const push=(outer-radius)*copyFade*avoidance;
      drawX+=Math.cos(angle)*push*rx;
      drawY+=Math.sin(angle)*push*ry;
    }
    ctx.globalAlpha=arrivalOpacity(i,b.phase,arrivalTime)*fade;
    if(ctx.globalAlpha>0 && drawY+size>0 && drawY-size<height && drawX+size>0 && drawX-size<width) ctx.drawImage(atlases[b.colorway],b.sx,b.sy,CELL,CELL,drawX-size*.59,drawY-size*.37,size,size);
    moving ||= b.vx!==0 || b.vy!==0 || b.dx!==0 || b.dy!==0;
  }
  ctx.restore();
  ctx.globalAlpha=1;
  if (!paused || moving || lift!==liftTarget) wake(); else last=0;
}
function wake() { if (ready && !document.hidden && frame===null) frame=requestAnimationFrame(render); }
function stop() { if (frame!==null) cancelAnimationFrame(frame); frame=null; last=0; accumulator=0; }
function syncControls() {
  document.body.classList.toggle('drift-paused',paused);
  pauseButton.setAttribute('aria-label',paused?'Resume drifting':'Pause drifting');
  pauseButton.title=paused?'Resume drifting':'Pause drifting';
  pauseButton.setAttribute('aria-pressed',String(paused));
  pauseButton.innerHTML=paused?'<svg viewBox="0 0 24 24"><path d="m9 5 10 7-10 7Z"/></svg>':'<svg viewBox="0 0 24 24"><path d="M9 5v14M15 5v14"/></svg>';
}
function point(e) {
  const rect=canvas.getBoundingClientRect();return {x:e.clientX-rect.left,y:e.clientY-rect.top,time:e.timeStamp};
}
document.addEventListener('pointermove',e=>{
  if(window.scrollY>height*.12 || e.target.closest?.('nav,button,a'))return;
  if (!e.isPrimary || (e.pointerType==='touch' && e.pointerId!==activeTouch)) return;
  const next=point(e);
  if (pointer && next.time-pointer.time<160) {
    pending={from:pending?.from||pointer,to:next};

  }
  pointer=next; wake();
},{passive:true});
document.addEventListener('pointerdown',e=>{
  if(window.scrollY>height*.12 || e.target.closest?.('nav,button,a'))return;
  if (!e.isPrimary) return;
  pointer=point(e); pending=null;
  if (e.pointerType!=='mouse') activeTouch=e.pointerId;
},{passive:true});
function release() { pointer=pending=null; activeTouch=null; }
document.addEventListener('pointerup',e=>{if(e.pointerType!=='mouse')release();});
for(const event of ['pointerleave','pointercancel','lostpointercapture'])document.addEventListener(event,release);
canvas.addEventListener('keydown',e=>{
  const direction={ArrowLeft:[-18,0],ArrowRight:[18,0],ArrowUp:[0,-18],ArrowDown:[0,18]}[e.key];
  if(direction){e.preventDefault();for(const b of balloons){b.vx=direction[0]*3;b.vy=direction[1]*3;}wake();}

  if(e.key==='Home'){e.preventDefault();arrivalTime=CONFIG.arrivalDuration;scrollTo({top:0,behavior:"instant"});resetBalloons(balloons);wake();}
});
pauseButton.addEventListener('click',()=>{paused=!paused;if(!paused)ambient=true;syncControls();wake();});
reduced.addEventListener('change',()=>{paused=reduced.matches;ambient=!reduced.matches;if(reduced.matches)arrivalTime=CONFIG.arrivalDuration;syncControls();wake();});
coarse.addEventListener('change',()=>{syncControls();if(ready)resize(true);});
document.addEventListener('visibilitychange',()=>{if(document.hidden){stop();release();}else wake();});
const observer=new ResizeObserver(()=>{clearTimeout(resizeTimer);resizeTimer=setTimeout(()=>{if(ready)resize();},100);});
observer.observe(canvas);
syncControls();
async function init(){
 try {
  const image=new Image();
  await new Promise((resolve,reject)=>{image.onload=resolve;image.onerror=reject;image.src='assets/balloons-transparent.png';});
  await document.fonts.ready;
  prepareArtwork(image);resize(true);ready=true;status.remove();wake();
 }catch(error){status.textContent='The artwork could not load. Please reopen the standalone HTML file.';console.error(error);}
}
init();
