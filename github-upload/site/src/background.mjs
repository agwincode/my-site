
(() => {
  const root = document.getElementById('pigment-background');
  const canvas = root.querySelector('canvas');
  const ctx = canvas.getContext('2d');
  const w = 1000, h = 625;
  canvas.width = w; canvas.height = h;
  const colors = [[155,175,196],[170,203,203],[223,210,160],[220,192,160],[213,170,162]];
  const hash = (x,y) => { const n = Math.sin(x*127.1+y*311.7)*43758.5453; return n-Math.floor(n); };
  const smooth = t => t*t*(3-2*t);
  function noise(x,y) {
    const ix=Math.floor(x), iy=Math.floor(y), fx=smooth(x-ix), fy=smooth(y-iy);
    return (hash(ix,iy)*(1-fx)+hash(ix+1,iy)*fx)*(1-fy)+(hash(ix,iy+1)*(1-fx)+hash(ix+1,iy+1)*fx)*fy;
  }
  function fbm(x,y) { return noise(x,y)*.58+noise(x*2.1+12,y*2.1)*.27+noise(x*4.3,y*4.3+8)*.15; }
  const fields = [
    [.12,.08,.57,4], [.85,.12,.58,3], [.48,.30,.43,2],
    [.02,.55,.36,4], [.98,.53,.37,3], [.28,.91,.43,0], [.80,.92,.43,1]
  ];
  const pixels=ctx.createImageData(w,h);
  for(let y=0;y<h;y++) for(let x=0;x<w;x++) {
    const u=x/w,v=y/h;
    const warpX=(fbm(u*4,v*4)-.5)*.28;
    const warpY=(fbm(u*4+20,v*4+10)-.5)*.28;
    const grain=hash(x+811,y+29)-.5;
    let sum=0, r=0,g=0,b=0;
    for(const [cx,cy,radius,index] of fields) {
      const dx=u+warpX-cx,dy=v+warpY-cy;
      const weight=Math.exp(-(dx*dx+dy*dy)/(radius*radius)*5.5 + grain*.55*(index%2?1:-1));
      sum+=weight;r+=colors[index][0]*weight;g+=colors[index][1]*weight;b+=colors[index][2]*weight;
    }
    // Quiet the lettering area without introducing a visible panel or halo.
    const quiet=Math.exp(-((u-.5)**2/.18+(v-.59)**2/.08));
    const pigment=((fbm(u*12+40,v*12)-.5)*15+grain*13)*(1-quiet*.78);
    const i=(y*w+x)*4;
    pixels.data[i]=r/sum+pigment;pixels.data[i+1]=g/sum+pigment;pixels.data[i+2]=b/sum+pigment;pixels.data[i+3]=255;
  }
  ctx.putImageData(pixels,0,0);
  const veil=root.querySelectorAll("canvas")[1];
  veil.width=w;veil.height=h;
  veil.getContext("2d").putImageData(pixels,0,0);
})();
