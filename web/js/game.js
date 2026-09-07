import { t } from './i18n.js';
import { MAX_STAGE, MAX_MONSTERS, toImageStage, getLoopMultiplier, GUN_BASE_CAP, BULLET_BASE_CAP, PET_BASE_CAP } from './config.js';

// ── Cell states ──────────────────────────────────────────────
const EMPTY    = 0;
const CAPTURED = 1;
const LINE     = 2;

// ── Utilities ────────────────────────────────────────────────
const rnd  = (a, b) => a + Math.random() * (b - a);
const rndI = (a, b) => Math.floor(rnd(a, b));
const PI2  = Math.PI * 2;

// 스테이지에 비례해 체력이 가속 증가 (s^1.5 곡선). 300단계 이후 "이어서 플레이"를
// 선택하면 스테이지 번호는 계속 늘어나지만 아트워크는 1단계부터 순환하므로, 체력이
// 그대로 완만하게 이어지면 이전 루프 마지막 스테이지보다 오히려 쉬워 보일 수 있다.
// 그래서 루프(300단계)를 한 바퀴 돌 때마다 "직전 루프 마지막 스테이지 체력의 2배"에서
// 다시 같은 곡선으로 증가하도록, 루프 수만큼 (2×300단계 체력)을 거듭제곱해 곱한다.
function _stageHPBase(s) {
  if (s <= 10) return 1;
  if (s <= 100) return Math.max(1, Math.ceil(Math.pow(s / 10, 1.5)));
  // 100단계를 넘어서면 만렙 총(GUN_BASE_CAP, 데미지=강화 레벨)으로 한 발 맞혀도
  // 두 방엔 못 죽도록, 체력을 "총 최고 데미지의 2배 남짓"만큼 한 번에 끌어올린 뒤
  // 그 위에 기존 곡선을 그대로 얹는다 — 100단계를 넘어서는 순간 확 세지는
  // 긴장감을 주면서도, 이 상수(tensionFloor)가 항상 2배 마진을 보장한다.
  const tensionFloor = Math.ceil(GUN_BASE_CAP * 2.2);
  return tensionFloor + Math.ceil(Math.pow(s / 10, 1.5));
}
function getStageHP(stage) {
  const loop = Math.floor((stage - 1) / MAX_STAGE);
  const s = toImageStage(stage);
  if (loop === 0) return _stageHPBase(s);
  const loopMultiplier = Math.pow(2 * _stageHPBase(MAX_STAGE), loop);
  return _stageHPBase(s) * loopMultiplier;
}

// ── Star shape helper ─────────────────────────────────────────
function _drawStarShape(ctx, cx, cy, pts, outer, inner) {
  ctx.beginPath();
  for (let i = 0; i < pts * 2; i++) {
    const r = i % 2 === 0 ? outer : inner;
    const a = (i / (pts * 2)) * PI2 - Math.PI / 2;
    if (i === 0) ctx.moveTo(cx + Math.cos(a)*r, cy + Math.sin(a)*r);
    else         ctx.lineTo(cx + Math.cos(a)*r, cy + Math.sin(a)*r);
  }
  ctx.closePath(); ctx.fill();
}

// ── Item icon drawers ─────────────────────────────────────────
function _itemClock(ctx, px, py, r) {
  ctx.beginPath(); ctx.arc(px, py, r, 0, PI2);
  ctx.fillStyle = '#e6b800'; ctx.fill();
  ctx.beginPath(); ctx.arc(px, py, r*0.82, 0, PI2);
  ctx.fillStyle = '#fff'; ctx.fill();
  ctx.strokeStyle = '#333'; ctx.lineWidth = Math.max(1.5, r*0.12); ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px+Math.cos(-1.2)*r*0.46, py+Math.sin(-1.2)*r*0.46); ctx.stroke();
  ctx.lineWidth = Math.max(1, r*0.08);
  ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px+Math.cos(-1.8)*r*0.65, py+Math.sin(-1.8)*r*0.65); ctx.stroke();
  ctx.beginPath(); ctx.arc(px, py, r*0.09, 0, PI2); ctx.fillStyle = '#333'; ctx.fill();
}
function _itemBottle(ctx, px, py, r) {
  ctx.fillStyle = '#ee2222';
  ctx.beginPath();
  ctx.moveTo(px-r*0.5, py-r*0.15); ctx.lineTo(px-r*0.58, py+r*0.7);
  ctx.arcTo(px-r*0.58, py+r*0.82, px, py+r*0.82, r*0.2);
  ctx.arcTo(px+r*0.58, py+r*0.82, px+r*0.58, py-r*0.15, r*0.2);
  ctx.lineTo(px+r*0.5, py-r*0.15); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#cc1111';
  ctx.fillRect(px-r*0.22, py-r*0.7, r*0.44, r*0.58);
  ctx.fillStyle = '#881111';
  ctx.fillRect(px-r*0.28, py-r*0.78, r*0.56, r*0.12);
  ctx.fillStyle = 'rgba(255,255,255,0.22)';
  ctx.beginPath(); ctx.ellipse(px-r*0.22, py+r*0.15, r*0.13, r*0.38, 0, 0, PI2); ctx.fill();
}
function _itemHourglass(ctx, px, py, r) {
  ctx.fillStyle = '#c8a050';
  ctx.beginPath();
  ctx.moveTo(px-r*0.6, py-r*0.75); ctx.lineTo(px+r*0.6, py-r*0.75);
  ctx.lineTo(px+r*0.08, py); ctx.lineTo(px+r*0.6, py+r*0.75);
  ctx.lineTo(px-r*0.6, py+r*0.75); ctx.lineTo(px-r*0.08, py); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = '#664400'; ctx.lineWidth = r*0.12;
  ctx.beginPath(); ctx.moveTo(px-r*0.6, py-r*0.75); ctx.lineTo(px+r*0.6, py-r*0.75); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(px-r*0.6, py+r*0.75); ctx.lineTo(px+r*0.6, py+r*0.75); ctx.stroke();
  ctx.fillStyle = '#e8c070';
  ctx.beginPath(); ctx.moveTo(px, py+r*0.08); ctx.lineTo(px+r*0.55, py+r*0.7); ctx.lineTo(px-r*0.55, py+r*0.7); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = '#4488ff'; ctx.lineWidth = r*0.14; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.arc(px+r*0.82, py, r*0.28, 0.5, -1.5, true); ctx.stroke();
  ctx.fillStyle = '#4488ff';
  const ax = px+r*0.82+Math.cos(-1.5)*r*0.28, ay = py+Math.sin(-1.5)*r*0.28;
  ctx.beginPath(); ctx.moveTo(ax, ay-r*0.12); ctx.lineTo(ax+r*0.12, ay+r*0.1); ctx.lineTo(ax-r*0.1, ay+r*0.1); ctx.closePath(); ctx.fill();
}
function _itemBomb(ctx, px, py, r) {
  ctx.beginPath(); ctx.arc(px, py+r*0.08, r*0.78, 0, PI2);
  ctx.fillStyle = '#222'; ctx.fill();
  ctx.strokeStyle = '#444'; ctx.lineWidth = r*0.08; ctx.stroke();
  ctx.strokeStyle = '#886633'; ctx.lineWidth = r*0.1; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(px+r*0.22, py-r*0.65);
  ctx.bezierCurveTo(px+r*0.55, py-r*1.05, px+r*0.15, py-r*1.15, px+r*0.35, py-r*1.35); ctx.stroke();
  ctx.fillStyle = '#ffaa00'; ctx.beginPath(); ctx.arc(px+r*0.35, py-r*1.35, r*0.12, 0, PI2); ctx.fill();
  ctx.fillStyle = '#ffee00'; ctx.beginPath(); ctx.arc(px+r*0.35, py-r*1.35, r*0.07, 0, PI2); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.18)'; ctx.beginPath(); ctx.arc(px-r*0.25, py-r*0.15, r*0.22, 0, PI2); ctx.fill();
}
function _itemBubble(ctx, px, py, r) {
  ctx.beginPath(); ctx.arc(px, py, r, 0, PI2);
  ctx.fillStyle = 'rgba(120,200,255,0.35)'; ctx.fill();
  ctx.strokeStyle = 'rgba(180,230,255,0.75)'; ctx.lineWidth = r*0.1; ctx.stroke();
  ctx.strokeStyle = 'rgba(255,255,255,0.75)'; ctx.lineWidth = r*0.1; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.arc(px-r*0.3, py-r*0.3, r*0.38, Math.PI*1.15, Math.PI*1.7); ctx.stroke();
}
function _itemRareBubble(ctx, px, py, r) {
  // 황금빛 버블 — 레어 버블
  ctx.beginPath(); ctx.arc(px, py, r, 0, PI2);
  ctx.fillStyle = 'rgba(255,215,80,0.35)'; ctx.fill();
  ctx.strokeStyle = 'rgba(255,200,60,0.85)'; ctx.lineWidth = r*0.12; ctx.stroke();
  ctx.strokeStyle = 'rgba(255,255,180,0.8)'; ctx.lineWidth = r*0.1; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.arc(px-r*0.3, py-r*0.3, r*0.38, Math.PI*1.15, Math.PI*1.7); ctx.stroke();
  // 별 장식
  ctx.fillStyle = 'rgba(255,220,50,0.9)';
  ctx.font = `${r*0.7}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('★', px, py+r*0.05);
}
function _itemShield(ctx, px, py, r) {
  ctx.fillStyle = '#2255cc';
  ctx.beginPath();
  ctx.moveTo(px, py-r); ctx.lineTo(px+r*0.9, py-r*0.3);
  ctx.lineTo(px+r*0.55, py+r*0.8); ctx.lineTo(px-r*0.55, py+r*0.8);
  ctx.lineTo(px-r*0.9, py-r*0.3); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = '#aaccff'; ctx.lineWidth = r*0.1; ctx.stroke();
  ctx.fillStyle = '#ffffff'; _drawStarShape(ctx, px, py, 5, r*0.42, r*0.18);
}
function _itemLightning(ctx, px, py, r) {
  ctx.beginPath(); ctx.arc(px, py, r, 0, PI2); ctx.fillStyle = '#6622bb'; ctx.fill();
  ctx.fillStyle = '#ffe600';
  ctx.beginPath();
  ctx.moveTo(px+r*0.15, py-r*0.8); ctx.lineTo(px-r*0.25, py-r*0.05);
  ctx.lineTo(px+r*0.12, py-r*0.05); ctx.lineTo(px-r*0.15, py+r*0.8);
  ctx.lineTo(px+r*0.35, py+r*0.05); ctx.lineTo(px-r*0.02, py+r*0.05);
  ctx.closePath(); ctx.fill();
}
function _itemSpeed(ctx, px, py, r) {
  ctx.beginPath(); ctx.arc(px, py, r, 0, PI2); ctx.fillStyle = '#006688'; ctx.fill();
  ctx.strokeStyle = '#00ffee'; ctx.lineWidth = r*0.18; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  for (let i = 0; i < 3; i++) {
    const ox = (i-1)*r*0.3;
    ctx.beginPath(); ctx.moveTo(px+ox-r*0.15, py-r*0.38); ctx.lineTo(px+ox+r*0.2, py); ctx.lineTo(px+ox-r*0.15, py+r*0.38); ctx.stroke();
  }
}
function _itemSword(ctx, px, py, r) {
  ctx.beginPath(); ctx.arc(px, py, r, 0, PI2); ctx.fillStyle = '#3a2200'; ctx.fill();
  ctx.fillStyle = '#ccccdd'; ctx.fillRect(px-r*0.1, py-r*0.82, r*0.2, r*1.05);
  ctx.fillStyle = '#aa8800'; ctx.fillRect(px-r*0.55, py+r*0.18, r*1.1, r*0.18);
  ctx.fillStyle = '#884400'; ctx.fillRect(px-r*0.12, py+r*0.36, r*0.24, r*0.46);
  ctx.beginPath(); ctx.arc(px, py+r*0.82, r*0.16, 0, PI2); ctx.fillStyle = '#cc9900'; ctx.fill();
}
function _itemGun(ctx, px, py, r) {
  ctx.beginPath(); ctx.arc(px, py, r, 0, PI2); ctx.fillStyle = '#222233'; ctx.fill();
  ctx.fillStyle = '#888899'; ctx.fillRect(px-r*0.15, py-r*0.18, r*0.75, r*0.28);
  ctx.fillStyle = '#667788';
  ctx.beginPath();
  ctx.moveTo(px-r*0.15, py-r*0.18); ctx.lineTo(px-r*0.15, py+r*0.5);
  ctx.lineTo(px+r*0.28, py+r*0.5); ctx.lineTo(px+r*0.45, py+r*0.1);
  ctx.lineTo(px+r*0.6, py+r*0.1); ctx.lineTo(px+r*0.6, py-r*0.18); ctx.closePath(); ctx.fill();
}

function _itemTimeboost(ctx, px, py, r) {
  ctx.beginPath(); ctx.arc(px, py, r, 0, PI2); ctx.fillStyle = '#003355'; ctx.fill();
  // 시계 테두리
  ctx.beginPath(); ctx.arc(px, py, r*0.72, 0, PI2);
  ctx.strokeStyle = '#00ddff'; ctx.lineWidth = r*0.14; ctx.stroke();
  // + 기호
  ctx.strokeStyle = '#00ffcc'; ctx.lineWidth = r*0.18; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(px, py-r*0.38); ctx.lineTo(px, py+r*0.38); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(px-r*0.38, py); ctx.lineTo(px+r*0.38, py); ctx.stroke();
}

// ── Particle ─────────────────────────────────────────────────
class Particle {
  constructor(x, y, color, big = false) {
    this.x = x; this.y = y;
    const spd = rnd(big ? 80 : 40, big ? 220 : 120);
    const ang = rnd(0, PI2);
    this.vx = Math.cos(ang)*spd; this.vy = Math.sin(ang)*spd-(big?60:20);
    this.life = this.maxLife = rnd(0.4, big?1.0:0.7);
    this.r = rnd(big?3:1.5, big?7:4);
    this.color = color;
  }
  update(dt) { this.x+=this.vx*dt; this.y+=this.vy*dt; this.vy+=180*dt; this.life-=dt; }
  dead() { return this.life<=0; }
  draw(ctx) {
    const a = Math.max(0, this.life/this.maxLife);
    ctx.globalAlpha=a; ctx.beginPath(); ctx.arc(this.x,this.y,this.r*a,0,PI2);
    ctx.fillStyle=this.color; ctx.fill(); ctx.globalAlpha=1;
  }
}

// ── Enemy Bullet ─────────────────────────────────────────────
class Bullet {
  constructor(px, py, vx, vy, color='#ff8800') {
    this.px=px; this.py=py; this.vx=vx; this.vy=vy;
    this.color=color; this.life=4; this.r=5; this.dead=false;
  }
  _touchesCell(grid, cs, state) {
    const r=this.r, px=this.px, py=this.py;
    return grid.get(Math.floor(px/cs),      Math.floor(py/cs))      ===state ||
           grid.get(Math.floor((px+r)/cs),  Math.floor(py/cs))      ===state ||
           grid.get(Math.floor((px-r)/cs),  Math.floor(py/cs))      ===state ||
           grid.get(Math.floor(px/cs),      Math.floor((py+r)/cs))  ===state ||
           grid.get(Math.floor(px/cs),      Math.floor((py-r)/cs))  ===state;
  }
  update(dt, grid, cs, slow=1.0) {
    this.life-=dt;
    if (this.life<=0) { this.dead=true; return; }
    this.px+=this.vx*dt*slow; this.py+=this.vy*dt*slow;
    if (this._touchesCell(grid,cs,CAPTURED)) this.dead=true;
  }
  hitsLine(grid, cs) { return this._touchesCell(grid,cs,LINE); }
  hitsPlayer(plx, ply) { const dx=this.px-plx,dy=this.py-ply; return dx*dx+dy*dy<(this.r+10)**2; }
  draw(ctx) {
    const g=ctx.createRadialGradient(this.px,this.py,0,this.px,this.py,this.r*3);
    g.addColorStop(0,this.color); g.addColorStop(1,'transparent');
    ctx.beginPath(); ctx.arc(this.px,this.py,this.r*3,0,PI2); ctx.fillStyle=g; ctx.fill();
    ctx.beginPath(); ctx.arc(this.px,this.py,this.r,0,PI2); ctx.fillStyle='#fff'; ctx.fill();
  }
}

// ── Player Bullet ─────────────────────────────────────────────
class PlayerBullet {
  constructor(px, py, vx, vy, dmg=1, r=6) {
    this.px=px; this.py=py; this.vx=vx; this.vy=vy; this.dmg=dmg; this.r=r; this.dead=false;
  }
  _touchesWall(grid, cs) {
    // 맵 완전히 벗어났을 때만 소멸 — 플레이어 시작 위치(경계 행/열)에서도 발사 가능하도록 경계 셀 자체는 허용
    const x=Math.floor(this.px/cs), y=Math.floor(this.py/cs);
    return x<0||x>=grid.cols||y<0||y>=grid.rows;
  }
  update(dt, grid, cs) {
    this.px+=this.vx*dt; this.py+=this.vy*dt;
    if (this._touchesWall(grid,cs)) this.dead=true;
  }
  hitsMonster(m) { const dx=this.px-m.px,dy=this.py-m.py; return dx*dx+dy*dy<(this.r+m.r)**2; }
  draw(ctx) {
    const g=ctx.createRadialGradient(this.px,this.py,0,this.px,this.py,this.r*2.5);
    g.addColorStop(0,'#00ffff'); g.addColorStop(1,'transparent');
    ctx.beginPath(); ctx.arc(this.px,this.py,this.r*2.5,0,PI2); ctx.fillStyle=g; ctx.fill();
    ctx.beginPath(); ctx.arc(this.px,this.py,this.r,0,PI2); ctx.fillStyle='#fff'; ctx.fill();
  }
}

// ── Grid ─────────────────────────────────────────────────────
class Grid {
  constructor(cols, rows) {
    this.cols=cols; this.rows=rows;
    this.data=new Uint8Array(cols*rows);
    for (let x=0;x<cols;x++) { this._s(x,0,CAPTURED); this._s(x,rows-1,CAPTURED); }
    for (let y=0;y<rows;y++) { this._s(0,y,CAPTURED); this._s(cols-1,y,CAPTURED); }
  }
  _i(x,y) { return y*this.cols+x; }
  get(x,y) { if (x<0||x>=this.cols||y<0||y>=this.rows) return CAPTURED; return this.data[this._i(x,y)]; }
  _s(x,y,v) { if (x<0||x>=this.cols||y<0||y>=this.rows) return; this.data[this._i(x,y)]=v; }
  clearLine() { for (let i=0;i<this.data.length;i++) if (this.data[i]===LINE) this.data[i]=EMPTY; }
  _bfs(mpos) {
    const vis=new Uint8Array(this.cols*this.rows), q=[];
    for (const [mx,my] of mpos) { const i=this._i(mx,my); if (this.data[i]===EMPTY&&!vis[i]) { vis[i]=1; q.push(mx,my); } }
    let h=0;
    while (h<q.length) {
      const x=q[h++],y=q[h++];
      for (const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]) {
        const nx=x+dx,ny=y+dy;
        if (nx<0||nx>=this.cols||ny<0||ny>=this.rows) continue;
        const ni=this._i(nx,ny);
        if (!vis[ni]&&this.data[ni]===EMPTY) { vis[ni]=1; q.push(nx,ny); }
      }
    }
    return vis;
  }
  captureArea(mpos) {
    const reach=this._bfs(mpos), captured=[];
    for (let y=0;y<this.rows;y++) for (let x=0;x<this.cols;x++) {
      const i=this._i(x,y);
      if (this.data[i]===LINE) this.data[i]=CAPTURED;
      else if (this.data[i]===EMPTY&&!reach[i]) { this.data[i]=CAPTURED; if (x>0&&x<this.cols-1&&y>0&&y<this.rows-1) captured.push([x,y]); }
    }
    return captured;
  }
  getFillPct() {
    const total=(this.cols-2)*(this.rows-2); let n=0;
    for (let y=1;y<this.rows-1;y++) for (let x=1;x<this.cols-1;x++) if (this.data[this._i(x,y)]===CAPTURED) n++;
    return n/total;
  }
}

// ── Monster base ─────────────────────────────────────────────
class Monster {
  constructor(gx, gy, cs, speed, stage=1) {
    this.cs=cs;
    this.px=gx*cs+cs*0.5; this.py=gy*cs+cs*0.5;
    this.spd=speed*cs; this.vx=0; this.vy=0;
    this.r=cs*0.4; this._stage=stage;
    this.hp=getStageHP(stage); this.maxHp=this.hp;
    this.flashTimer=0;
    this.shootTimer=rnd(2,5); this.shootInterval=rnd(2.5,5); this.canShoot=false;
    this.color='#ff6b35'; this.glowColor='rgba(255,107,53,0.4)';
    this.wobble=rnd(0,PI2); this.wobbleSpd=rnd(3,7);
    this.pendingSpawns=[];
    this.pendingDebuff=null; // 상태이상 몹(GhostMonster/SlimeMonster)이 Game에 전달하는 디버프 요청
  }
  get gx() { return Math.floor(this.px/this.cs); }
  get gy() { return Math.floor(this.py/this.cs); }
  takeDamage(dmg) { this.hp=Math.max(0,this.hp-dmg); this.flashTimer=0.15; return this.hp<=0; }
  _bounce(dt, grid, slow=1.0) {
    const nx=this.px+this.vx*dt*slow, ny=this.py+this.vy*dt*slow;
    const cx=Math.floor(this.px/this.cs), cy=Math.floor(this.py/this.cs);
    if (grid.get(Math.floor(nx/this.cs),cy)===CAPTURED) this.vx=-this.vx;
    else this.px=Math.max(this.cs*0.55,Math.min(nx,(grid.cols-0.55)*this.cs));
    if (grid.get(cx,Math.floor(ny/this.cs))===CAPTURED) this.vy=-this.vy;
    else this.py=Math.max(this.cs*0.55,Math.min(ny,(grid.rows-0.55)*this.cs));
  }
  _tryShoot(dt, plx, ply, bullets) {
    if (!this.canShoot) return;
    this.shootTimer-=dt;
    if (this.shootTimer>0) return;
    this.shootTimer=this.shootInterval+rnd(-0.5,0.5);
    const dx=plx-this.px,dy=ply-this.py,d=Math.sqrt(dx*dx+dy*dy)||1;
    const sp=Math.min(100+this._stage*0.5,280);
    bullets.push(new Bullet(this.px,this.py,(dx/d)*sp,(dy/d)*sp,this.color));
  }
  hitLine(grid) { return grid.get(this.gx,this.gy)===LINE; }
  update(dt, grid, plx, ply, drawing, bullets, slow=1.0) {
    this.wobble+=this.wobbleSpd*dt;
    if (this.flashTimer>0) this.flashTimer-=dt;
    this._tryShoot(dt,plx,ply,bullets);
  }
  _drawHpBar(ctx) {
    if (this.maxHp<=1) return;
    const bw=this.r*2, bh=3, bx=this.px-this.r, by=this.py-this.r-7;
    ctx.fillStyle='rgba(0,0,0,0.6)'; ctx.fillRect(bx,by,bw,bh);
    const pct=this.hp/this.maxHp;
    ctx.fillStyle=pct>0.5?'#00e676':pct>0.25?'#ffee58':'#ff4060';
    ctx.fillRect(bx,by,bw*pct,bh);
  }
  draw(ctx) {
    const wo=Math.sin(this.wobble)*this.cs*0.06;
    const px=this.px, py=this.py+wo;
    ctx.beginPath(); ctx.arc(px,py,this.r*2.5,0,PI2); ctx.fillStyle=this.glowColor; ctx.fill();
    ctx.beginPath(); ctx.arc(px,py,this.r,0,PI2);
    ctx.fillStyle=this.flashTimer>0?'#ffffff':this.color; ctx.fill();
    ctx.strokeStyle='rgba(255,255,255,0.7)'; ctx.lineWidth=1.5; ctx.stroke();
    const ex=this.r*0.3,ey=this.r*0.2,er=this.r*0.18;
    ctx.fillStyle='#fff';
    ctx.beginPath(); ctx.arc(px-ex,py-ey,er*1.2,0,PI2); ctx.fill();
    ctx.beginPath(); ctx.arc(px+ex,py-ey,er*1.2,0,PI2); ctx.fill();
    ctx.fillStyle='#1a0a2e';
    ctx.beginPath(); ctx.arc(px-ex+1,py-ey,er*0.6,0,PI2); ctx.fill();
    ctx.beginPath(); ctx.arc(px+ex+1,py-ey,er*0.6,0,PI2); ctx.fill();
    ctx.strokeStyle='#1a0a2e'; ctx.lineWidth=1.5;
    ctx.beginPath(); ctx.arc(px,py+this.r*0.25,this.r*0.25,0.2,Math.PI-0.2); ctx.stroke();
    this._drawHpBar(ctx);
  }
}

// ── NormalMonster (노랑) ───────────────────────────────────────
class NormalMonster extends Monster {
  constructor(gx, gy, cs, speed, stage) {
    super(gx,gy,cs,speed,stage);
    this.color='#ffcc00'; this.glowColor='rgba(255,200,0,0.35)';
    const a=rnd(0,PI2); this.vx=Math.cos(a)*this.spd; this.vy=Math.sin(a)*this.spd;
  }
  update(dt, grid, plx, ply, drawing, bullets, slow=1.0) {
    super.update(dt,grid,plx,ply,drawing,bullets,slow);
    this._bounce(dt,grid,slow);
  }
}

// ── ShooterMonster (주황, 총쏘는 적) ─────────────────────────
class ShooterMonster extends Monster {
  constructor(gx, gy, cs, speed, stage) {
    super(gx,gy,cs,speed*0.8,stage);
    this.color='#ff7700'; this.glowColor='rgba(255,120,0,0.4)';
    this.rndTimer=0; this.canShoot=true;
    const lo=Math.max(1.2,4.5-stage*0.012), hi=Math.max(2.0,6.5-stage*0.015);
    this.shootInterval=rnd(lo,hi);
  }
  update(dt, grid, plx, ply, drawing, bullets, slow=1.0) {
    super.update(dt,grid,plx,ply,drawing,bullets,slow);
    if (drawing) {
      const dx=plx-this.px,dy=ply-this.py,d=Math.sqrt(dx*dx+dy*dy)||1;
      this.vx=(dx/d)*this.spd; this.vy=(dy/d)*this.spd;
    } else {
      this.rndTimer-=dt;
      if (this.rndTimer<=0) { const a=rnd(0,PI2); this.vx=Math.cos(a)*this.spd; this.vy=Math.sin(a)*this.spd; this.rndTimer=rnd(0.8,2.5); }
    }
    this._bounce(dt,grid,slow);
  }
}

// ── ZigzagMonster (하늘색, 지그재그 이동) ────────────────────
// 15단계부터 등장 — 일정 주기로 진행 방향을 90도씩 꺾어 직선 이동만 하는
// NormalMonster보다 예측하기 어렵게 움직인다.
class ZigzagMonster extends Monster {
  constructor(gx, gy, cs, speed, stage) {
    super(gx,gy,cs,speed,stage);
    this.color='#33ccff'; this.glowColor='rgba(51,204,255,0.4)';
    this.zigTimer=rnd(0.4,0.8);
    const a=rnd(0,PI2); this.vx=Math.cos(a)*this.spd; this.vy=Math.sin(a)*this.spd;
  }
  update(dt, grid, plx, ply, drawing, bullets, slow=1.0) {
    super.update(dt,grid,plx,ply,drawing,bullets,slow);
    this.zigTimer-=dt*slow;
    if (this.zigTimer<=0) {
      this.zigTimer=rnd(0.4,0.8);
      const turn=Math.random()<0.5?Math.PI/2:-Math.PI/2;
      const nvx=this.vx*Math.cos(turn)-this.vy*Math.sin(turn);
      const nvy=this.vx*Math.sin(turn)+this.vy*Math.cos(turn);
      this.vx=nvx; this.vy=nvy;
    }
    this._bounce(dt,grid,slow);
  }
}

// ── TrackerMonster (보라, 상시 추적) ─────────────────────────
// 30단계부터 등장 — ShooterMonster는 선을 긋는 중에만 추적하지만, 이 몹은
// 항상 플레이어를 추적한다. 대신 총은 쏘지 않고 이동 속도도 다소 느리다.
class TrackerMonster extends Monster {
  constructor(gx, gy, cs, speed, stage) {
    super(gx,gy,cs,speed*0.6,stage);
    this.color='#9b59ff'; this.glowColor='rgba(155,89,255,0.4)';
  }
  update(dt, grid, plx, ply, drawing, bullets, slow=1.0) {
    super.update(dt,grid,plx,ply,drawing,bullets,slow);
    const dx=plx-this.px,dy=ply-this.py,d=Math.sqrt(dx*dx+dy*dy)||1;
    this.vx=(dx/d)*this.spd; this.vy=(dy/d)*this.spd;
    this._bounce(dt,grid,slow);
  }
}

// ── SpreadShooterMonster (진한 주황, 산탄 발사) ──────────────
// 40단계부터 등장 — ShooterMonster의 이동 패턴은 그대로 물려받고, 총알 1발
// 대신 부채꼴 3방향으로 동시에 발사한다 (그만큼 발사 주기는 더 길게 잡음).
class SpreadShooterMonster extends ShooterMonster {
  constructor(gx, gy, cs, speed, stage) {
    super(gx,gy,cs,speed,stage);
    this.color='#ff3d00'; this.glowColor='rgba(255,61,0,0.45)';
    const lo=Math.max(1.8,5.5-stage*0.01), hi=Math.max(2.6,7.5-stage*0.012);
    this.shootInterval=rnd(lo,hi);
  }
  _tryShoot(dt, plx, ply, bullets) {
    if (!this.canShoot) return;
    this.shootTimer-=dt;
    if (this.shootTimer>0) return;
    this.shootTimer=this.shootInterval+rnd(-0.5,0.5);
    const dx=plx-this.px,dy=ply-this.py,d=Math.sqrt(dx*dx+dy*dy)||1;
    const baseAng=Math.atan2(dy,dx);
    const sp=Math.min(100+this._stage*0.5,280);
    for (const off of [-0.35,0,0.35]) {
      const a=baseAng+off;
      bullets.push(new Bullet(this.px,this.py,Math.cos(a)*sp,Math.sin(a)*sp,this.color));
    }
  }
}

// ── SniperMonster (자주색, 조준 저격) ────────────────────────
// 60단계부터 등장 — 거의 제자리에 머물다가 플레이어가 사정거리에 들어오면
// 0.8초간 조준선을 표시한 뒤 고속 직선탄을 한 발 쏜다. 미리 조준선이 보이므로
// 위협적이지만 그 사이 피할 여지는 있다.
class SniperMonster extends Monster {
  constructor(gx, gy, cs, speed, stage) {
    super(gx,gy,cs,speed*0.15,stage);
    this.color='#aa22aa'; this.glowColor='rgba(170,34,170,0.45)';
    this.canShoot=false; // 커스텀 조준 로직을 쓰므로 부모의 자동발사(_tryShoot)는 사용하지 않음
    this.aiming=false; this.aimTimer=0; this.aimDx=0; this.aimDy=1;
    this.cooldown=rnd(1.5,3);
    this.range=cs*9;
    const a=rnd(0,PI2); this.vx=Math.cos(a)*this.spd; this.vy=Math.sin(a)*this.spd;
  }
  update(dt, grid, plx, ply, drawing, bullets, slow=1.0) {
    super.update(dt,grid,plx,ply,drawing,bullets,slow);
    this._bounce(dt,grid,slow);
    if (this.aiming) {
      this.aimTimer-=dt*slow;
      if (this.aimTimer<=0) {
        this.aiming=false;
        const sp=420;
        bullets.push(new Bullet(this.px,this.py,this.aimDx*sp,this.aimDy*sp,'#ff44ff'));
        this.cooldown=rnd(2,3.5);
      }
      return;
    }
    this.cooldown-=dt*slow;
    const dx=plx-this.px,dy=ply-this.py,dist=Math.sqrt(dx*dx+dy*dy);
    if (this.cooldown<=0 && dist>0 && dist<this.range) {
      this.aiming=true; this.aimTimer=0.8;
      this.aimDx=dx/dist; this.aimDy=dy/dist;
    }
  }
  draw(ctx) {
    super.draw(ctx);
    if (this.aiming) {
      const a=0.5+0.3*Math.sin(this.wobble*3);
      ctx.save();
      ctx.strokeStyle=`rgba(255,60,255,${a})`;
      ctx.lineWidth=2; ctx.setLineDash([6,5]);
      ctx.beginPath();
      ctx.moveTo(this.px,this.py);
      ctx.lineTo(this.px+this.aimDx*3000,this.py+this.aimDy*3000);
      ctx.stroke();
      ctx.restore();
    }
  }
}

// ── GhostMonster (연보라 반투명, 혼란 유발) ──────────────────
// 50단계부터 등장 — 평소엔 배회만 하다가 플레이어와 가까워지면 3초간
// "혼란"(방향키 반전) 디버프를 건다. 재발동 쿨다운이 있어 근처에 계속
// 머물러도 디버프가 끊임없이 갱신되진 않는다.
class GhostMonster extends Monster {
  constructor(gx, gy, cs, speed, stage) {
    super(gx,gy,cs,speed*0.7,stage);
    this.color='#cfd8ff'; this.glowColor='rgba(200,210,255,0.35)';
    this._debuffCooldown=0;
    const a=rnd(0,PI2); this.vx=Math.cos(a)*this.spd; this.vy=Math.sin(a)*this.spd;
  }
  update(dt, grid, plx, ply, drawing, bullets, slow=1.0) {
    super.update(dt,grid,plx,ply,drawing,bullets,slow);
    this._bounce(dt,grid,slow);
    if (this._debuffCooldown>0) { this._debuffCooldown-=dt; return; }
    const dx=plx-this.px,dy=ply-this.py;
    if (dx*dx+dy*dy<(this.cs*3)**2) {
      this.pendingDebuff={ type:'confuse', duration:3 };
      this._debuffCooldown=6;
    }
  }
  draw(ctx) {
    ctx.save(); ctx.globalAlpha=0.6; super.draw(ctx); ctx.restore();
  }
}

// ── SlimeMonster (초록, 슬로우 유발) ─────────────────────────
// 70단계부터 등장 — 선을 긋는 몹은 아니고, 근접해 있는 동안 플레이어 이동
// 속도를 계속 늦춘다 (거리가 멀어지면 몇 초 뒤 자연히 풀린다).
class SlimeMonster extends Monster {
  constructor(gx, gy, cs, speed, stage) {
    super(gx,gy,cs,speed*0.5,stage);
    this.color='#33cc55'; this.glowColor='rgba(51,204,85,0.4)';
    const a=rnd(0,PI2); this.vx=Math.cos(a)*this.spd; this.vy=Math.sin(a)*this.spd;
  }
  update(dt, grid, plx, ply, drawing, bullets, slow=1.0) {
    super.update(dt,grid,plx,ply,drawing,bullets,slow);
    this._bounce(dt,grid,slow);
    const dx=plx-this.px,dy=ply-this.py;
    if (dx*dx+dy*dy<(this.cs*1.6)**2) {
      this.pendingDebuff={ type:'slow', duration:1.2 };
    }
  }
}

// ── MidBossMonster (빨강) ─────────────────────────────────────
class MidBossMonster extends Monster {
  constructor(gx, gy, cs, speed, stage) {
    super(gx,gy,cs,speed*0.7,stage);
    this.color='#e74c3c'; this.glowColor='rgba(231,76,60,0.45)';
    this.r=cs*0.5;
    this.hp=getStageHP(stage)*2; this.maxHp=this.hp;
    this._baseSpeed=speed;
    this.spawnTimer=30;
    const a=rnd(0,PI2); this.vx=Math.cos(a)*this.spd; this.vy=Math.sin(a)*this.spd;
  }
  update(dt, grid, plx, ply, drawing, bullets, slow=1.0) {
    super.update(dt,grid,plx,ply,drawing,bullets,slow);
    this._bounce(dt,grid,slow);
    this.spawnTimer-=dt;
    if (this.spawnTimer<=0) {
      this.spawnTimer=30;
      this.pendingSpawns.push({ gx:this.gx, gy:this.gy, speed:this._baseSpeed });
    }
  }
  draw(ctx) {
    super.draw(ctx);
    ctx.fillStyle='rgba(255,80,80,0.9)';
    ctx.font=`bold ${Math.max(6,Math.floor(this.r*0.55))}px sans-serif`;
    ctx.textAlign='center';
    ctx.fillText('MID', this.px, this.py+this.r+8);
    ctx.textAlign='left';
  }
}

// ── BossMonster (무지개 블랙홀) ───────────────────────────────
class BossMonster extends Monster {
  constructor(gx, gy, cs, speed, stage) {
    super(gx,gy,cs,speed*0.45,stage);
    // milestone stages: 5× normal (cs*2), regular bosses: 4× normal (cs*1.6)
    this.r=(stage===100||stage===200||stage===300)?cs*2:cs*1.6;
    this.hp=getStageHP(stage)*3; this.maxHp=this.hp;
    this._baseSpeed=speed;
    this._bossState='moving';
    this._radialTimer=rnd(10,20);
    this._spiralTimer=rnd(25,38);
    this._spawnTimer=20;
    this._chargeTimer=0;
    this._radialChargeDur=Math.max(0.7,2.0-stage*0.004);
    this._spiralBulletTimer=0; this._spiralCount=0; this._spiralAngle=0;
    const a=rnd(0,PI2); this.vx=Math.cos(a)*this.spd; this.vy=Math.sin(a)*this.spd;
    this.canShoot=false;
  }
  update(dt, grid, plx, ply, drawing, bullets, slow=1.0) {
    this.wobble+=this.wobbleSpd*dt;
    if (this.flashTimer>0) this.flashTimer-=dt;
    if (this._bossState==='moving') {
      this._bounce(dt,grid,slow);
      this._radialTimer-=dt; this._spiralTimer-=dt; this._spawnTimer-=dt;
      if (this._spawnTimer<=0) {
        this._spawnTimer=20;
        const cnt=this._spawnPerTick||rndI(1,3);
        for (let i=0;i<cnt;i++) {
          const ang=rnd(0,PI2), dist=3;
          const sgx=Math.max(1,Math.min(grid.cols-2,Math.round(this.px/this.cs)+Math.round(Math.cos(ang)*dist)));
          const sgy=Math.max(1,Math.min(grid.rows-2,Math.round(this.py/this.cs)+Math.round(Math.sin(ang)*dist)));
          this.pendingSpawns.push({gx:sgx,gy:sgy,speed:this._baseSpeed});
        }
      }
      if (this._radialTimer<=0) {
        this._bossState='radial_charging'; this._chargeTimer=0; this.vx=0; this.vy=0;
      } else if (this._spiralTimer<=0) {
        this._bossState='spiral_firing';
        this._spiralBulletTimer=0; this._spiralCount=0; this._spiralAngle=rnd(0,PI2);
        this.vx=0; this.vy=0;
      }
    } else if (this._bossState==='radial_charging') {
      this._chargeTimer+=dt;
      if (this._chargeTimer>=this._radialChargeDur) {
        const sp=Math.min(120+this._stage*0.5,320);
        for (let i=0;i<8;i++) { const a=(i/8)*PI2; bullets.push(new Bullet(this.px,this.py,Math.cos(a)*sp,Math.sin(a)*sp,'#ffd700')); }
        this._bossState='moving'; this._radialTimer=rnd(10,22);
        const a=rnd(0,PI2); this.vx=Math.cos(a)*this.spd; this.vy=Math.sin(a)*this.spd;
      }
    } else if (this._bossState==='spiral_firing') {
      this._spiralBulletTimer-=dt;
      if (this._spiralBulletTimer<=0) {
        this._spiralBulletTimer=0.18;
        const sp=Math.min(120+this._stage*0.5,320);
        bullets.push(new Bullet(this.px,this.py,Math.cos(this._spiralAngle)*sp,Math.sin(this._spiralAngle)*sp,'#ff44ff'));
        this._spiralAngle+=PI2/12; this._spiralCount++;
        if (this._spiralCount>=12) {
          this._bossState='moving'; this._spiralTimer=rnd(20,35);
          const a=rnd(0,PI2); this.vx=Math.cos(a)*this.spd; this.vy=Math.sin(a)*this.spd;
        }
      }
    }
  }
  draw(ctx) {
    const t=performance.now()/1000;
    const px=this.px, py=this.py, r=this.r;
    // Rainbow rotating rings
    for (let i=0;i<5;i++) {
      const angle=t*(2+i*0.4)+i*PI2/5;
      ctx.beginPath(); ctx.arc(px,py,r*(0.9+i*0.28),angle,angle+PI2*0.65);
      ctx.strokeStyle=`hsla(${(t*60+i*72)%360},100%,60%,${0.65-i*0.1})`;
      ctx.lineWidth=r*0.16; ctx.stroke();
    }
    // Black core
    const cg=ctx.createRadialGradient(px,py,0,px,py,r*0.82);
    cg.addColorStop(0,'#000'); cg.addColorStop(0.5,'#05000a'); cg.addColorStop(1,'#1a0030');
    ctx.beginPath(); ctx.arc(px,py,r*0.82,0,PI2); ctx.fillStyle=cg; ctx.fill();
    // Charge ring
    if (this._bossState==='radial_charging') {
      const pct=this._chargeTimer/this._radialChargeDur;
      ctx.beginPath(); ctx.arc(px,py,r*1.6,-Math.PI/2,-Math.PI/2+PI2*pct);
      ctx.strokeStyle=`rgba(255,255,100,${0.4+pct*0.6})`; ctx.lineWidth=4; ctx.stroke();
    }
    // Glowing eyes
    const eyX=r*0.25, eyR=r*0.12;
    ctx.fillStyle=`hsla(${(t*100)%360},100%,65%,0.95)`;
    ctx.beginPath(); ctx.arc(px-eyX,py,eyR,0,PI2); ctx.fill();
    ctx.beginPath(); ctx.arc(px+eyX,py,eyR,0,PI2); ctx.fill();
    // Flash
    if (this.flashTimer>0) { ctx.beginPath(); ctx.arc(px,py,r*0.82,0,PI2); ctx.fillStyle='rgba(255,255,255,0.35)'; ctx.fill(); }
    ctx.fillStyle='rgba(255,100,255,0.9)';
    ctx.font=`bold ${Math.max(7,Math.floor(r*0.28))}px sans-serif`;
    ctx.textAlign='center'; ctx.fillText('BOSS',px,py+r*1.75); ctx.textAlign='left';
    this._drawHpBar(ctx);
  }
}

// ── Item ─────────────────────────────────────────────────────
class Item {
  constructor(gx, gy, cs, type, large=false) {
    this.gx=gx; this.gy=gy; this.cs=cs;
    this.px=gx*cs+cs*0.5; this.py=gy*cs+cs*0.5;
    this.type=type; this.large=large; this.bob=Math.random()*PI2;
  }
  get isHeld() { return ['lightning','speed','sword','gun','timeboost'].includes(this.type); }
  update(dt) { this.bob+=dt*2.5; }
  draw(ctx) {
    const r=this.large?this.cs*0.44:this.cs*0.34;
    const px=this.px, py=this.py+Math.sin(this.bob)*this.cs*0.07;
    const pulse=Math.sin(this.bob)*0.3+0.7;
    ctx.beginPath(); ctx.arc(px,py,r*1.35,0,PI2);
    ctx.fillStyle=`rgba(255,255,255,${pulse*0.12})`; ctx.fill();
    switch(this.type) {
      case 'clock':     _itemClock(ctx,px,py,r); break;
      case 'bottle':    _itemBottle(ctx,px,py,r); break;
      case 'hourglass': _itemHourglass(ctx,px,py,r); break;
      case 'bomb':      _itemBomb(ctx,px,py,r); break;
      case 'bubble':     _itemBubble(ctx,px,py,r); break;
      case 'rareBubble': _itemRareBubble(ctx,px,py,r); break;
      case 'shield':    _itemShield(ctx,px,py,r); break;
      case 'lightning': _itemLightning(ctx,px,py,r); break;
      case 'speed':     _itemSpeed(ctx,px,py,r); break;
      case 'sword':     _itemSword(ctx,px,py,r); break;
      case 'gun':       _itemGun(ctx,px,py,r); break;
      case 'timeboost': _itemTimeboost(ctx,px,py,r); break;
      case 'split': {
        ctx.fillStyle='rgba(255,100,100,0.9)';
        ctx.beginPath(); ctx.arc(px-r*0.25,py,r*0.6,0,PI2); ctx.fill();
        ctx.fillStyle='rgba(100,100,255,0.9)';
        ctx.beginPath(); ctx.arc(px+r*0.25,py,r*0.6,0,PI2); ctx.fill();
        ctx.strokeStyle='#ffffff'; ctx.lineWidth=1;
        ctx.beginPath(); ctx.arc(px-r*0.25,py,r*0.6,0,PI2); ctx.stroke();
        ctx.beginPath(); ctx.arc(px+r*0.25,py,r*0.6,0,PI2); ctx.stroke();
        break;
      }
      case 'enemyUp': {
        // 빨간 위쪽 화살표 (적 강화)
        ctx.fillStyle='rgba(255,60,60,0.95)';
        ctx.beginPath();
        ctx.moveTo(px,py-r*0.95);
        ctx.lineTo(px+r*0.7,py+r*0.15);
        ctx.lineTo(px+r*0.22,py+r*0.15);
        ctx.lineTo(px+r*0.22,py+r*0.95);
        ctx.lineTo(px-r*0.22,py+r*0.95);
        ctx.lineTo(px-r*0.22,py+r*0.15);
        ctx.lineTo(px-r*0.7,py+r*0.15);
        ctx.closePath(); ctx.fill();
        ctx.strokeStyle='#ffffff'; ctx.lineWidth=1.2; ctx.stroke();
        break;
      }
    }
  }
}

// ── Player ───────────────────────────────────────────────────
class Player {
  constructor(gx, gy, cs, speed) {
    this.cs=cs; this.gx=gx; this.gy=gy;
    this.px=gx*cs+cs*0.5; this.py=gy*cs+cs*0.5;
    this.dx=0; this.dy=0; this.speed=speed; this.progress=0;
    this.isDrawing=false; this.path=[];
    this.invincible=false; this.invTimer=0; this.trail=[];
  }
  setDir(dx, dy) { this.dx=dx; this.dy=dy; }
  update(dt, grid, speedMult=1) {
    if (this.dx===0&&this.dy===0) return null;
    const ngx=this.gx+this.dx, ngy=this.gy+this.dy;
    if (ngx<0||ngx>=grid.cols||ngy<0||ngy>=grid.rows) { this.dx=0;this.dy=0;this.progress=0; return null; }
    if (grid.get(ngx,ngy)===LINE) { this.dx=0;this.dy=0;this.progress=0; return null; }
    this.progress+=this.speed*dt*speedMult;
    if (this.progress>=1) {
      this.progress=0; this.gx=ngx; this.gy=ngy;
      this.px=this.gx*this.cs+this.cs*0.5; this.py=this.gy*this.cs+this.cs*0.5;
      this.trail.unshift({x:this.px,y:this.py}); if (this.trail.length>8) this.trail.pop();
      const cell=grid.get(this.gx,this.gy);
      if (cell===EMPTY) { this.isDrawing=true; grid._s(this.gx,this.gy,LINE); this.path.push([this.gx,this.gy]); }
      else if (cell===CAPTURED&&this.isDrawing&&this.path.length>0) return 'LINE_COMPLETE';
    } else {
      this.px=(this.gx+this.dx*this.progress)*this.cs+this.cs*0.5;
      this.py=(this.gy+this.dy*this.progress)*this.cs+this.cs*0.5;
    }
    return null;
  }
}

// ── Kill score helper ─────────────────────────────────────────
function _killScore(m) {
  if (m instanceof BossMonster)     return 2000;
  if (m instanceof MidBossMonster)  return 1400;
  if (m instanceof SniperMonster)   return 700;
  // SpreadShooterMonster는 ShooterMonster의 하위 클래스라 아래 instanceof
  // ShooterMonster 체크에도 걸리므로, 더 구체적인 체크를 먼저 둔다.
  if (m instanceof SpreadShooterMonster) return 650;
  if (m instanceof ShooterMonster)  return 600;
  if (m instanceof TrackerMonster)  return 350;
  if (m instanceof GhostMonster)    return 300;
  if (m instanceof SlimeMonster)    return 300;
  if (m instanceof ZigzagMonster)   return 250;
  return 200;
}

// ── LaserBeam ─────────────────────────────────────────────────
// Moving projectile: travels in angle direction at high speed.
class LaserBeam {
  constructor(px, py, angle, thickness, lengthBlocks, cs, dmg, canvasW, canvasH) {
    this.px=px; this.py=py; this.angle=angle;
    this.thickness=thickness; this.length=lengthBlocks;
    this.cs=cs; this.dmg=dmg;
    this.canvasW=canvasW; this.canvasH=canvasH;
    const speed=480;
    this.vx=Math.cos(angle)*speed; this.vy=Math.sin(angle)*speed;
    this.dead=false;
  }
  update(dt) {
    this.px+=this.vx*dt; this.py+=this.vy*dt;
    const l=this.length*this.cs;
    const tailX=this.px-Math.cos(this.angle)*l, tailY=this.py-Math.sin(this.angle)*l;
    // Dead when both tip and tail are out of canvas
    if (this.px<-l&&tailX<-l) this.dead=true;
    if (this.px>this.canvasW+l&&tailX>this.canvasW+l) this.dead=true;
    if (this.py<-l&&tailY<-l) this.dead=true;
    if (this.py>this.canvasH+l&&tailY>this.canvasH+l) this.dead=true;
  }
  hitsMonster(m) {
    // Circle-vs-segment: check if monster center is within thickness/2 of the beam segment
    const r=this.thickness*this.cs*0.5+(m.r||this.cs*0.5);
    const l=this.length*this.cs;
    const cos=Math.cos(-this.angle), sin=Math.sin(-this.angle);
    const dx=m.px-this.px, dy=m.py-this.py;
    const lx=cos*dx-sin*dy, ly=sin*dx+cos*dy;
    return lx>=-this.cs && lx<=l+this.cs && Math.abs(ly)<=r;
  }
  draw(ctx) {
    const l=this.length*this.cs;
    const w=this.thickness*this.cs;
    ctx.save();
    ctx.translate(this.px,this.py); ctx.rotate(this.angle);
    const grd=ctx.createLinearGradient(-l,0,0,0);
    grd.addColorStop(0,'rgba(0,100,255,0)'); grd.addColorStop(1,'rgba(0,255,255,0.95)');
    ctx.fillStyle=grd; ctx.fillRect(-l,-w/2,l,w);
    ctx.fillStyle='rgba(255,255,255,0.95)'; ctx.fillRect(-l,-w/4,l,w/2);
    ctx.restore();
  }
}

// ── Sword attrs helper ────────────────────────────────────────
function _getSwordAttrs(level, cs) {
  if (level<=0) return {reach:2,arcHalf:0,bulletEvery:0,bulletDmg:0,bulletR:6,color:'#ffffff'};
  if (level>=100) {
    // 100단(무지개 최종 형태) 도달 후에도 사거리·데미지는 10단마다 조금씩 계속 성장한다.
    // 200단부터는 판정 각도가 75도(직선에 가까운 좁은 부채꼴)에서 90도(반원형)로 넓어진다.
    const extra = Math.floor((level - 100) / 10);
    const arcHalf = level >= 200 ? 90 : 75;
    return {reach:11+extra, arcHalf, bulletEvery:1, bulletDmg:10+extra, bulletR:cs*1.5, color:'rainbow'};
  }
  const group=Math.floor((level-1)/10), pos=((level-1)%10)+1;
  let reach, arcHalf=0, bulletEvery=0, bulletDmg=0, bulletR=6;
  if (pos<=5)      { reach=2+group+pos; arcHalf=0; }
  else if (pos<=9) { reach=2+group; arcHalf=(pos-5)*5; }
  else             { reach=2+group; arcHalf=0; bulletEvery=5; bulletDmg=group+2; bulletR=group===0?6:Math.max(6,group*cs*0.5); }
  const COLORS=['#ffffff','#ff2222','#ff8800','#ffee00','#00cc44','#2255ff','#2200aa','#9922ff','#888888','#00ffff'];
  return {reach, arcHalf, bulletEvery, bulletDmg, bulletR, color:COLORS[Math.min(Math.floor(level/10),9)]};
}

// ── Pet ──────────────────────────────────────────────────────
// 신화 등급 "펫" — 본체 주위를 도는 위성처럼 배치되며, 본캐가 칼/총을 쓸 때
// 같은 공격을 자기 위치에서도 그대로 재현한다(useSword/useGun 참고). 펫강화를
// 하면 이와 별개로 스스로 자동 발사도 시작한다(_getPetPattern/PetBullet 참고).
class Pet {
  constructor(index) {
    this.index = index;
    this.angle = index * Math.PI; // 두 마리면 서로 반대편에서 시작
    this.px = 0; this.py = 0;
    this.fireTimer = rnd(0.3, 0.8);
  }
}

// 펫 자동발사 총알 — 일반 PlayerBullet과 달리 homing이면 매 프레임 가장 가까운
// 몹 쪽으로 서서히 조향한다. 관통 없이 처음 맞힌 몹 하나에만 데미지를 주고 소멸.
class PetBullet {
  constructor(px, py, vx, vy, dmg, r, homing = false) {
    this.px = px; this.py = py; this.vx = vx; this.vy = vy;
    this.dmg = dmg; this.r = r; this.homing = homing;
    this.life = 5; this.dead = false;
  }
  update(dt, grid, cs, monsters) {
    this.life -= dt;
    if (this.life <= 0) { this.dead = true; return; }
    if (this.homing && monsters.length > 0) {
      let nearest = null, bestD = Infinity;
      for (const m of monsters) {
        const dx = m.px - this.px, dy = m.py - this.py, d = dx * dx + dy * dy;
        if (d < bestD) { bestD = d; nearest = m; }
      }
      if (nearest) {
        const dx = nearest.px - this.px, dy = nearest.py - this.py, d = Math.sqrt(dx * dx + dy * dy) || 1;
        const speed = Math.sqrt(this.vx * this.vx + this.vy * this.vy) || 260;
        const turn = Math.min(1, 6 * dt);
        this.vx += ((dx / d) * speed - this.vx) * turn;
        this.vy += ((dy / d) * speed - this.vy) * turn;
      }
    }
    this.px += this.vx * dt; this.py += this.vy * dt;
    const x = Math.floor(this.px / cs), y = Math.floor(this.py / cs);
    if (x < 0 || x >= grid.cols || y < 0 || y >= grid.rows) this.dead = true;
  }
  hitsMonster(m) { const dx = this.px - m.px, dy = this.py - m.py; return dx * dx + dy * dy < (this.r + m.r) ** 2; }
  draw(ctx) {
    const g = ctx.createRadialGradient(this.px, this.py, 0, this.px, this.py, this.r * 2.2);
    g.addColorStop(0, this.homing ? '#ff66ff' : '#66ffcc'); g.addColorStop(1, 'transparent');
    ctx.beginPath(); ctx.arc(this.px, this.py, this.r * 2.2, 0, PI2); ctx.fillStyle = g; ctx.fill();
    ctx.beginPath(); ctx.arc(this.px, this.py, this.r, 0, PI2); ctx.fillStyle = '#fff'; ctx.fill();
  }
}

// 펫강화 레벨에 따른 자동발사 패턴. 10/50/100/150/200단(고정값 — 펫업그레이드
// 상한이 스테이지 진행에 따라 200 이상으로 계속 풀려도 이 다섯 구간 자체는 그대로다):
//  - ~10단: 일직선 1발
//  - ~50단: 중앙+양쪽 30도 부채꼴(구간 전반엔 2발, 후반엔 3발)
//  - ~100단: 유도탄 1발
//  - ~150단: 유도탄 + 발사 속도 점점 빨라짐
//  - ~200단: 유도탄 + 최고 속도 + 총알 크기가 본캐 최대 총탄의 절반까지 커짐
//    (200단을 넘어서도 발사 패턴·속도·크기는 200단 값에서 유지)
// 데미지는 getStageHP()를 그대로 재사용해 "N강화 = N스테이지 몹 체력"이 되도록
// 맞춘다 — 200강화면 200스테이지 일반 몹을 정확히 한 방에 잡을 수 있다.
const PET_TIER1 = 10, PET_TIER2 = 50, PET_TIER3 = 100, PET_TIER4 = 150, PET_TIER5 = 200;
function _getPetPattern(lv, cs, maxHalfR) {
  if (lv <= 0) return null;
  let bullets, homing = false;
  if (lv <= PET_TIER1) {
    bullets = [{ angDeg: 0 }];
  } else if (lv <= PET_TIER2) {
    const mid = Math.ceil((PET_TIER1 + PET_TIER2) / 2);
    bullets = lv <= mid ? [{ angDeg: 30 }, { angDeg: -30 }] : [{ angDeg: 0 }, { angDeg: 30 }, { angDeg: -30 }];
  } else {
    bullets = [{ angDeg: 0 }];
    homing = true;
  }
  let interval = 1.0;
  if (lv > PET_TIER3) {
    const span = PET_TIER4 - PET_TIER3;
    interval = 1.0 - Math.min(1, (lv - PET_TIER3) / span) * 0.6; // 1.0s → 0.4s
  }
  let r = cs * 0.22;
  if (lv > PET_TIER4) {
    const span = PET_TIER5 - PET_TIER4;
    r = cs * 0.22 + (maxHalfR - cs * 0.22) * Math.min(1, (lv - PET_TIER4) / span);
  }
  const dmg = Math.max(1, getStageHP(lv));
  return { bullets, homing, interval, r, dmg };
}

// ── Game ─────────────────────────────────────────────────────
export class Game extends EventTarget {
  constructor(canvas, opts={}) {
    super();
    this.canvas=canvas; this.ctx=canvas.getContext('2d');
    const { cols=20,rows=26,playerSpeed=7,clearThreshold=0.75,serverUrl='' }=opts;
    this.COLS=cols; this.ROWS=rows; this.PLAYER_SPEED=playerSpeed;
    this.CLEAR_THRESHOLD=clearThreshold; this.serverUrl=serverUrl;
    this.fogCanvas=document.createElement('canvas');
    this.fogCtx=this.fogCanvas.getContext('2d');
    this.running=false; this._raf=null; this._lastTime=0; this.pendingDir=null;
    this.stage=1; this.rating='g'; this.lives=3; this.timeLeft=120; this.fillPct=0;
    this.cs=16; this.grid=null; this.player=null;
    this.monsters=[]; this.bullets=[]; this.particles=[]; this.playerBullets=[];
    this.items=[]; this.charImage=null; this._imageFetchToken=0;
    this.shakeTimer=0; this.shakeAmt=0; this.flashTimer=0;
    this.flashColor='rgba(255,255,100,0.6)'; this.dangerPulse=0;
    this._time=0; this.score=0;
    // Item & effect state
    this.slowTimer=0; this.shieldTimer=0; this.bubbleActive=false;
    // GhostMonster/SlimeMonster가 거는 상태이상: confuseTimer(조작 반전), playerSlowTimer(이동속도 감소)
    this.confuseTimer=0; this.playerSlowTimer=0;
    // 신화 등급 소모템(회피/동결 부적)이 스테이지 시작 시 거는 효과
    this.repelTimer=0; this.freezeTimer=0;
    this.speedActive=false; this.heldItems=[];
    this.swordActive=false; this.swordTimer=0; this.swordDx=1; this.swordDy=0; this.swordReach=2; this.swordArcHalf=0;
    this.lightningMode=false; this.activeWeapon=null;
    this._lastDx=0; this._lastDy=1;
    this._itemSchedule=[]; this._itemScheduleIdx=0; this._itemContinuousTimer=20;
    this._monsterSpeed=1;
    this.pets=[]; this.petBullets=[]; this._petLevel=0; this._petCap=PET_BASE_CAP;
    this.autoModeOwned=false; this.autoModeActive=false; this._autoFireTimer=0;
  }

  async init(stage, rating, _count, monsterSpeed, timeLimit, heldItems=[], resumeState=null, weaponLevels={}) {
    this.stage=stage; this.rating=rating; this._monsterSpeed=monsterSpeed;
    this.lives=resumeState?2:3;
    const timeboostBonus=(resumeState?resumeState.heldItems:heldItems)
      .filter(h=>h.type==='timeboost').reduce((s,h)=>s+(h.count||1)*20,0);
    this.timeLeft=resumeState?resumeState.timeLeft:timeLimit+timeboostBonus;
    this.fillPct=resumeState?resumeState.fillPct:0;
    this.score=resumeState?resumeState.score:0;
    this.shakeTimer=0; this.flashTimer=0; this._time=0; this._hudTimer=0;
    this.bullets=[]; this.particles=[]; this.playerBullets=[]; this.items=[];
    this.laserBeams=[];
    this.slowTimer=0; this.shieldTimer=0; this.bubbleActive=false;
    this.confuseTimer=0; this.playerSlowTimer=0;
    this.repelTimer=weaponLevels.repelSeconds||0; this.freezeTimer=weaponLevels.freezeSeconds||0;
    this.swordActive=false; this.swordTimer=0; this.lightningMode=false;
    this.heldItems=JSON.parse(JSON.stringify(resumeState?resumeState.heldItems:heldItems));
    this.speedActive=false;
    this._persistentSpeedLevel=0; // set by app.js after init
    this._rareLifeLost=false;
    this._swordSwingCount=0;
    this._gunLevel=weaponLevels.gunLevel||0;
    this._swordLevel=weaponLevels.swordLevel||0;
    this._bulletLevel=weaponLevels.bulletLevel||0;
    // 신화 등급 영구 아이템 "수호의 구슬" — 보유 시 _onLoseLife()에서 원위치 복귀 없이
    // 목숨만 깎고 계속 진행할 수 있다.
    this.guardianOrb=!!weaponLevels.guardianOrb;
    // 신화 등급 영구 아이템 "불사조의 심장" — 스테이지당 1회, 목숨이 0이 돼도 부활한다.
    this.phoenixHeart=!!weaponLevels.phoenixHeart; this._phoenixUsed=false;
    // 신화 등급 영구 아이템 "미다스의 손" — 스테이지 클리어 보너스 +30% (_onStageClear 참고).
    this.midasTouch=!!weaponLevels.midasTouch;
    // 신화 등급 영구 아이템 "펫" — 최대 2마리, 본체 주위를 돌며 칼/총 사용 시 같은
    // 공격을 자기 위치에서도 재현하고(useSword/useGun), 펫강화(petLevel)를 하면
    // 별도로 자동 발사도 한다(_getPetPattern/PetBullet 참고). 상한(petCap)은 기본
    // 200단, 스테이지가 300을 넘으면(정확히는 100의 배수를 넘을 때마다) 그 스테이지
    // 번호만큼으로 함께 풀려서, 계속 진행할수록 펫강화도 그만큼 더 할 수 있다.
    this._petCap=Math.max(PET_BASE_CAP,Math.floor(stage/100)*100);
    this._petLevel=Math.min(weaponLevels.petLevel||0,this._petCap);
    this.pets=[];
    for(let i=0;i<Math.min(2,weaponLevels.petCount||0);i++) this.pets.push(new Pet(i));
    this.petBullets=[];
    // 신화 등급 영구 아이템 "오토모드" — 게임 중 토글하면 선택된 무기(총/칼)를
    // 초당 4회 자동 발사한다 (toggleAutoMode/_update 참고).
    this.autoModeOwned=!!weaponLevels.autoModeOwned;
    this.autoModeActive=false; this._autoFireTimer=0;
    const sp=this.heldItems.find(h=>h.type==='speed');
    if (sp) { this.speedActive=true; }

    this.cs=Math.floor(Math.min(this.canvas.width/this.COLS,this.canvas.height/this.ROWS));
    this.canvas.width=this.COLS*this.cs; this.canvas.height=this.ROWS*this.cs;
    this.fogCanvas.width=this.canvas.width; this.fogCanvas.height=this.canvas.height;
    this.grid=new Grid(this.COLS,this.ROWS);
    if (resumeState&&resumeState.gridSnapshot) {
      this.grid.data.set(resumeState.gridSnapshot);
    }
    const sp2=this.heldItems.find(h=>h.type==='speed');
    const spd=this.speedActive?(sp2?.level===2?this.PLAYER_SPEED*3:this.PLAYER_SPEED*2):this.PLAYER_SPEED;
    this.player=new Player(Math.floor(this.COLS/2),0,this.cs,spd);
    // 신화 등급 영구 아이템 "방패" — 스테이지 시작 시 N초간 무적 (N=구매 횟수, 최대 5초).
    // 기존 'shield' 습득 아이템과 동일한 shieldTimer를 재사용해 이펙트도 그대로 공유한다.
    const startShield=weaponLevels.shieldSeconds||0;
    if(startShield>0){ this.shieldTimer=startShield; this.player.invincible=true; this.player.invTimer=startShield; }
    this._spawnMonsters(monsterSpeed);

    // Item spawn schedule
    this._itemSchedule=this._getItemSchedule(stage);
    this._itemScheduleIdx=0;
    this._itemInterval=Math.max(20 - Math.floor(stage / 5), 8);
    this._itemContinuousTimer=this._itemInterval;
    this._gunKillCount=0;
    this._swordKillCount=0;
    this._ammoRechargeTimer=0;
    this._soulSwordTimer=0;

    this.charImage=null;
    const fetchToken=++this._imageFetchToken;
    this._fetchCharImage(toImageStage(stage),rating,fetchToken);
  }

  setWeaponLevels(gunLevel, swordLevel, bulletLevel) {
    this._gunLevel  = gunLevel  || 0;
    this._swordLevel = swordLevel || 0;
    this._bulletLevel = bulletLevel || 0;
  }

  _getGunPattern(level) {
    if (level <= 0) {
      return { dmg:1, r:this.cs*0.25, bullets:[{angDeg:0,delay:0}] };
    }
    const lv = level;
    // 데미지 = 총 업그레이드 레벨
    const dmg = lv;
    // 총알 크기: 총탄 업그레이드 레벨로 결정 (1단=블록 절반). 상한은 총탄 강화
    // 상한과 마찬가지로 300단계를 한 바퀴 돌 때마다 2배씩 계속 풀린다.
    const bLv = Math.max(1, this._bulletLevel || 1);
    const bulletCap = BULLET_BASE_CAP * getLoopMultiplier(this.stage);
    const sz  = Math.min(bLv, bulletCap);
    const r   = this.cs * (0.25 + (sz - 1) / 99 * 1.75);

    let bullets;
    if (lv <= 10) {
      // 2발 순차 (2블럭 간격)
      bullets = [{angDeg:0,delay:0},{angDeg:0,delay:2}];
    } else if (lv <= 30) {
      // 3발 순차 (2블럭 간격)
      bullets = [{angDeg:0,delay:0},{angDeg:0,delay:2},{angDeg:0,delay:4}];
    } else if (lv <= 40) {
      // 중앙 + ±45도 3발
      bullets = [{angDeg:0,delay:0},{angDeg:45,delay:0},{angDeg:-45,delay:0}];
    } else if (lv <= 50) {
      // ±20도, ±40도 4발
      bullets = [{angDeg:20,delay:0},{angDeg:-20,delay:0},{angDeg:40,delay:0},{angDeg:-40,delay:0}];
    } else if (lv <= 60) {
      // 중앙 + ±30도 + ±60도 5발
      bullets = [{angDeg:0,delay:0},{angDeg:30,delay:0},{angDeg:-30,delay:0},{angDeg:60,delay:0},{angDeg:-60,delay:0}];
    } else if (lv <= 70) {
      // 중앙 + ±45도 3발
      bullets = [{angDeg:0,delay:0},{angDeg:45,delay:0},{angDeg:-45,delay:0}];
    } else if (lv <= 80) {
      // 중앙 + ±20도, ±40도, ±60도 7발
      bullets = [{angDeg:0,delay:0},{angDeg:20,delay:0},{angDeg:-20,delay:0},{angDeg:40,delay:0},{angDeg:-40,delay:0},{angDeg:60,delay:0},{angDeg:-60,delay:0}];
    } else if (lv <= 90) {
      // ±15도, ±30도, ±45도, ±60도 8발
      bullets = [{angDeg:15,delay:0},{angDeg:-15,delay:0},{angDeg:30,delay:0},{angDeg:-30,delay:0},{angDeg:45,delay:0},{angDeg:-45,delay:0},{angDeg:60,delay:0},{angDeg:-60,delay:0}];
    } else if (lv <= 100) {
      // 중앙 + ±15도, ±30도, ±45도, ±60도 9발
      bullets = [{angDeg:0,delay:0},{angDeg:15,delay:0},{angDeg:-15,delay:0},{angDeg:30,delay:0},{angDeg:-30,delay:0},{angDeg:45,delay:0},{angDeg:-45,delay:0},{angDeg:60,delay:0},{angDeg:-60,delay:0}];
    } else if (lv <= 110) {
      // ±10도, ±20도, ±30도, ±40도, ±50도 10발
      bullets = [{angDeg:10,delay:0},{angDeg:-10,delay:0},{angDeg:20,delay:0},{angDeg:-20,delay:0},{angDeg:30,delay:0},{angDeg:-30,delay:0},{angDeg:40,delay:0},{angDeg:-40,delay:0},{angDeg:50,delay:0},{angDeg:-50,delay:0}];
    } else {
      // 111+: 중앙 + ±10도~±50도 11발
      bullets = [{angDeg:0,delay:0},{angDeg:10,delay:0},{angDeg:-10,delay:0},{angDeg:20,delay:0},{angDeg:-20,delay:0},{angDeg:30,delay:0},{angDeg:-30,delay:0},{angDeg:40,delay:0},{angDeg:-40,delay:0},{angDeg:50,delay:0},{angDeg:-50,delay:0}];
    }
    return { dmg, r, bullets };
  }

  _getItemSchedule(stage) {
    if (stage<5)  return [];
    if (stage<10) return [5];
    if (stage<30) return [5,30];
    if (stage<40) return [5,20,40];
    return null; // continuous
  }

  start() { if (this.running) return; this.running=true; this._lastTime=performance.now(); this._raf=requestAnimationFrame(t=>this._loop(t)); }
  stop()  { this.running=false; if (this._raf) { cancelAnimationFrame(this._raf); this._raf=null; } }
  setDirection(dx, dy) {
    // GhostMonster의 "혼란" 디버프: 방향키 입력이 좌우/상하로 반전된다.
    if (this.confuseTimer>0) { dx=-dx; dy=-dy; }
    this.pendingDir={dx,dy};
  }

  useSword() {
    const sw=this.heldItems.find(h=>h.type==='sword');
    if(!sw) return;
    if(this.lives<=1) return; // 목숨 2 이상일 때만 사용 가능 (마켓 설명 참고)
    const dx=this._lastDx,dy=this._lastDy;
    if(dx===0&&dy===0) return;
    const swordLv=this._swordLevel||0;
    const attrs=_getSwordAttrs(swordLv,this.cs);
    const {reach,arcHalf,bulletEvery,bulletDmg,bulletR,color}=attrs;
    this.swordActive=true; this.swordTimer=0.35;
    this.swordDx=dx; this.swordDy=dy; this.swordReach=reach; this.swordArcHalf=arcHalf;
    this.swordColor=color;
    if(!this._swordSwingCount) this._swordSwingCount=0;
    this._swordSwingCount++;
    const mainAngle=Math.atan2(dy,dx);
    const arcRad=arcHalf*Math.PI/180;
    const dmg=Math.max(1,Math.ceil(swordLv/10)+1);
    // 펫 보유 시: 본캐와 동일한 칼질을 각 펫의 위치에서도 재현한다 (본캐 또는
    // 어느 펫이든 한 곳이라도 닿으면 명중으로 처리).
    const origins=[{x:this.player.px,y:this.player.py,gx:this.player.gx,gy:this.player.gy},
      ...this.pets.map(p=>({x:p.px,y:p.py,gx:Math.floor(p.px/this.cs),gy:Math.floor(p.py/this.cs)}))];
    for(const m of this.monsters){
      let hit=false;
      for(const o of origins){
        if(arcHalf>0){
          const mdx=m.px-o.x,mdy=m.py-o.y;
          const dist=Math.sqrt(mdx*mdx+mdy*mdy);
          if(dist<=reach*this.cs+m.r){
            let ad=Math.atan2(mdy,mdx)-mainAngle;
            while(ad>Math.PI)ad-=2*Math.PI; while(ad<-Math.PI)ad+=2*Math.PI;
            if(Math.abs(ad)<=arcRad){hit=true;break;}
          }
        } else {
          for(let i=1;i<=reach;i++){
            if(m.gx===o.gx+dx*i&&m.gy===o.gy+dy*i){hit=true;break;}
          }
          if(hit) break;
        }
      }
      if(hit) m.takeDamage(dmg);
    }
    let _swordKillsNow=0;
    for(const m of this.monsters){if(m.hp<=0){this._spawnHitParticles(m.px,m.py);this.score+=_killScore(m);_swordKillsNow++;}}
    this.monsters=this.monsters.filter(m=>m.hp>0);
    this._swordKillCount=(this._swordKillCount||0)+_swordKillsNow;
    if(this._swordKillCount>=5){ this._swordKillCount=0; this._triggerSoulSword(); }
    if(bulletEvery>0&&this._swordSwingCount%bulletEvery===0){
      const ang=mainAngle;
      this.playerBullets.push(new PlayerBullet(this.player.px,this.player.py,Math.cos(ang)*300,Math.sin(ang)*300,bulletDmg,bulletR));
    }
    if(swordLv>=100){
      this.playerBullets.push(new PlayerBullet(this.player.px,this.player.py,Math.cos(mainAngle)*300,Math.sin(mainAngle)*300,10,this.cs*1.5));
    }
  }

  useGun() {
    const gun=this.heldItems.find(h=>h.type==='gun');
    if(!gun||!gun.ammo) return;
    const dx=this._lastDx,dy=this._lastDy;
    if(dx===0&&dy===0) return;
    const mainAngle=Math.atan2(dy,dx);
    const gunLv=this._gunLevel||0;
    const {dmg,r,bullets}=this._getGunPattern(gunLv);
    const speed=320;
    // 펫 보유 시: 본캐와 동일한 총알 패턴을 각 펫의 위치에서도 추가로 발사한다
    // (탄약은 본캐 것 1회분만 소모 — 펫 몫을 별도로 깎지 않음).
    const origins=[{x:this.player.px,y:this.player.py},...this.pets.map(p=>({x:p.px,y:p.py}))];
    for(const o of origins){
      for(const {angDeg,delay} of bullets){
        const ang=mainAngle+angDeg*Math.PI/180;
        const vx=Math.cos(ang)*speed,vy=Math.sin(ang)*speed;
        const ox=o.x+Math.cos(mainAngle)*delay*this.cs;
        const oy=o.y+Math.sin(mainAngle)*delay*this.cs;
        const pb=new PlayerBullet(ox,oy,vx,vy,dmg,r);
        pb.isGunBullet=true;
        this.playerBullets.push(pb);
      }
    }
    gun.ammo=Math.max(0,gun.ammo-1);
    if(gun.ammo<=0) this.heldItems=this.heldItems.filter(h=>h!==gun);
  }

  triggerLightning(px, py) {
    const li=this.heldItems.find(h=>h.type==='lightning'||h.type==='zeusLightning');
    if (!li) return;
    const radius=li.type==='zeusLightning'?2:1;
    const gx=Math.floor(px/this.cs), gy=Math.floor(py/this.cs);
    for (let dx=-radius;dx<=radius;dx++) for (let dy=-radius;dy<=radius;dy++) {
      this.grid._s(gx+dx,gy+dy,CAPTURED);
      this._spawnHitParticles((gx+dx+0.5)*this.cs,(gy+dy+0.5)*this.cs);
    }
    this.monsters=this.monsters.filter(m=>{
      if (Math.abs(m.gx-gx)<=radius&&Math.abs(m.gy-gy)<=radius) { this._spawnHitParticles(m.px,m.py); this.score+=_killScore(m); return false; }
      return true;
    });
    li.count=(li.count||1)-1;
    if (li.count<=0) this.heldItems=this.heldItems.filter(h=>h!==li);
    this.lightningMode=false;
    this.flashTimer=0.4;
    this.flashColor=li.type==='zeusLightning'?'rgba(180,255,100,0.7)':'rgba(255,255,100,0.55)';
  }

  triggerSplit() {
    const sp=this.heldItems.find(h=>h.type==='split');
    if(!sp||!(sp.count>=1)) return;
    const toAdd=[];
    for(const m of this.monsters){
      let gx,gy,tries=0;
      do{gx=rndI(3,this.COLS-3);gy=rndI(3,this.ROWS-3);tries++;}while(tries<20);
      const spd=this._monsterSpeed||1;
      if(m instanceof BossMonster) toAdd.push(new BossMonster(gx,gy,this.cs,spd,this.stage));
      else if(m instanceof MidBossMonster) toAdd.push(new MidBossMonster(gx,gy,this.cs,spd,this.stage));
      else if(m instanceof ShooterMonster) toAdd.push(new ShooterMonster(gx,gy,this.cs,spd,this.stage));
      else toAdd.push(new NormalMonster(gx,gy,this.cs,spd,this.stage));
    }
    this.monsters.push(...toAdd);
    // 분열을 연속/다수 사용해도 몹 수가 무한정 늘지 않도록 상한을 둔다
    // (충돌 판정 루프가 몹 수에 비례해 늘어나 버벅거림의 원인이 됨).
    if(this.monsters.length>MAX_MONSTERS) this.monsters.length=MAX_MONSTERS;
    sp.count--;
    if(sp.count<=0) this.heldItems=this.heldItems.filter(h=>h!==sp);
    this.flashTimer=0.2; this.flashColor='rgba(255,100,100,0.35)';
  }

  _triggerSoulSword() {
    this._soulSwordTimer=1.2;
    const swordLv=this._swordLevel||0;
    const attrs=_getSwordAttrs(swordLv,this.cs);
    const dmg=Math.max(1,Math.ceil(swordLv/10)+1);
    for(const m of this.monsters){
      const dx=m.px-this.player.px,dy=m.py-this.player.py;
      if(Math.sqrt(dx*dx+dy*dy)<=attrs.reach*this.cs+m.r) m.takeDamage(dmg);
    }
    for(const m of this.monsters){if(m.hp<=0){this._spawnHitParticles(m.px,m.py);this.score+=_killScore(m);}}
    this.monsters=this.monsters.filter(m=>m.hp>0);
  }

  selectWeapon(type) { if (this.heldItems.find(h=>h.type===type)) this.activeWeapon=type; }
  useActiveWeapon() { if (this.activeWeapon==='sword') this.useSword(); else if (this.activeWeapon==='gun') this.useGun(); }

  // 신화 등급 "오토모드" 켜기/끄기 — 켜져 있으면 _update()에서 매 0.25초(초당 4회)
  // 마다 현재 selectWeapon()으로 선택된 총 또는 칼을 자동으로 사용한다.
  toggleAutoMode() {
    if (!this.autoModeOwned) return false;
    this.autoModeActive = !this.autoModeActive;
    this._autoFireTimer = 0;
    return this.autoModeActive;
  }

  // ── Spawn ────────────────────────────────────────────────────
  _spawnMonsters(speed) {
    this.monsters=[];
    const s=this.stage;
    const doublings=Math.floor(s/10);
    const normals=Math.min(Math.max(1,Math.pow(2,doublings)),16);
    const shooterDoublings=s>=9?Math.floor((s-9)/10):-1;
    const shooters=s>=9?Math.min(Math.max(1,Math.pow(2,shooterDoublings)),8):0;
    const gunLv=this._gunLevel||0, swordLv=this._swordLevel||0;
    const gunAmmo=(this.heldItems.find(h=>h.type==='gun')?.ammo)||0;
    // 중간보스: 스테이지 기준과 무기 강화 기준 중 큰 값 사용
    const stageMidBosses=s>=20?Math.floor(s/10):0;
    const gunMidBosses=gunLv>=20?Math.floor(gunLv/10):0;
    const swordMidBosses=swordLv>=20?Math.floor(swordLv/10):0;
    const midBosses=Math.max(stageMidBosses,gunMidBosses,swordMidBosses);
    // ── 무기 강화에 따른 적 배수 ──────────────────────────────
    let weaponMult=1;
    if (gunLv>=3&&gunAmmo>=5) weaponMult*=2;
    weaponMult*=Math.pow(2,Math.floor(gunLv/10));
    if (swordLv>=6)           weaponMult*=2;
    weaponMult*=Math.pow(2,Math.floor(swordLv/10));
    weaponMult=Math.min(weaponMult,64); // 최대 64배 캡
    const spawnRnd=(cls,...args)=>{
      let gx,gy,tries=0;
      do{gx=rndI(3,this.COLS-3);gy=rndI(3,this.ROWS-3);tries++;}while(gx<6&&gy<6&&tries<30);
      return new cls(gx,gy,this.cs,speed,this.stage,...args);
    };
    // 총알 부족 시 적 감소 (총 보유자만 적용)
    let ammoReduct=1;
    const hasGunItem=this.heldItems.some(h=>h.type==='gun');
    if (hasGunItem) {
      if (gunAmmo<=30) ammoReduct=0.25;
      else if (gunAmmo<=50) ammoReduct=0.5;
    }
    const mNormals=Math.max(1,Math.round(normals*weaponMult*ammoReduct));
    const mShooters=Math.max(0,Math.round(shooters*weaponMult*ammoReduct));
    const mMidBosses=Math.max(0,Math.round(midBosses*weaponMult*ammoReduct));
    // ── 몹 다양성 ──────────────────────────────────────────────
    // 마리수(mNormals/mShooters) 자체는 그대로 두고, 스테이지가 오를수록
    // "일반"/"사격형" 슬롯 안에서 뽑힐 수 있는 몹 종류만 늘려 다양성을 준다.
    const normalPool=[NormalMonster];
    if (s>=15) normalPool.push(ZigzagMonster);
    if (s>=30) normalPool.push(TrackerMonster);
    if (s>=50) normalPool.push(GhostMonster);
    if (s>=70) normalPool.push(SlimeMonster);
    const shooterPool=[ShooterMonster];
    if (s>=40) shooterPool.push(SpreadShooterMonster);
    if (s>=60) shooterPool.push(SniperMonster);
    for(let i=0;i<mNormals;i++)   this.monsters.push(spawnRnd(normalPool[rndI(0,normalPool.length)]));
    for(let i=0;i<mShooters;i++)  this.monsters.push(spawnRnd(shooterPool[rndI(0,shooterPool.length)]));
    for(let i=0;i<mMidBosses;i++) this.monsters.push(spawnRnd(MidBossMonster));
    if(this.monsters.length>30) this.monsters.length=30;
    if(s%10===0){
      let gx,gy,tries=0;
      do{gx=rndI(4,this.COLS-4);gy=rndI(4,this.ROWS-4);tries++;}while(gx<8&&gy<8&&tries<30);
      const boss=new BossMonster(gx,gy,this.cs,speed,this.stage);
      boss._spawnPerTick=Math.max(1,Math.floor(s/10));
      this.monsters.push(boss);
    }
  }

  _spawnItem() {
    const { type,large }=this._pickItemType();
    let gx,gy,tries=0;
    do { gx=rndI(2,this.COLS-2); gy=rndI(2,this.ROWS-2); tries++; }
    while (this.grid.get(gx,gy)!==EMPTY&&tries<30);
    if (tries<30) this.items.push(new Item(gx,gy,this.cs,type,large));
  }

  _pickItemType() {
    if(Math.random()<0.05) return {type:'split',large:false};
    if(Math.random()<0.03) return {type:'enemyUp',large:false};
    const heldTypes=['lightning','speed','sword','gun','timeboost'];
    if (Math.random()<0.05&&this.heldItems.length<3)
      return { type:heldTypes[rndI(0,heldTypes.length)], large:false };
    const norm=['clock','bottle','hourglass','bomb','bubble','shield'];
    const type=norm[rndI(0,norm.length)];
    const large=(type==='clock'||type==='bottle')&&Math.random()<0.25;
    return { type, large };
  }

  _applyItem(item) {
    switch(item.type) {
      case 'clock':     this.timeLeft+=item.large?40:20; break;
      case 'bottle':    this.lives+=item.large?2:1; break;
      case 'hourglass': this.slowTimer=15; break;
      case 'bubble':    this.bubbleActive=true; break;
      case 'rareBubble':
        if (!this.heldItems.find(h=>h.type==='rareBubble'))
          this.heldItems.push({type:'rareBubble'});
        break;
      case 'shield':
        this.shieldTimer=15; this.player.invincible=true; this.player.invTimer=15; break;
      case 'lightning': {
        const exLi=this.heldItems.find(h=>h.type==='lightning');
        if (exLi) exLi.count=(exLi.count||1)+1;
        else if (this.heldItems.length<3) this.heldItems.push({type:'lightning',count:1});
        this.activeWeapon=this.activeWeapon||'lightning'; break;
      }
      case 'speed': {
        const ex=this.heldItems.find(h=>h.type==='speed');
        if (ex) { ex.level=2; this.player.speed=this.PLAYER_SPEED*3; }
        else { if (this.heldItems.length<3) this.heldItems.push({type:'speed',level:1}); this.player.speed=this.PLAYER_SPEED*2; }
        this.speedActive=true; break;
      }
      case 'sword': {
        const ex=this.heldItems.find(h=>h.type==='sword');
        if (ex) ex.count=Math.min(2,(ex.count||1)+1);
        else if (this.heldItems.length<3) this.heldItems.push({type:'sword',count:1});
        this.activeWeapon='sword'; break;
      }
      case 'gun': {
        const ex=this.heldItems.find(h=>h.type==='gun');
        if (ex) ex.ammo=Math.min(ex.ammo+10, 30);
        else if (this.heldItems.length<3) this.heldItems.push({type:'gun',ammo:10});
        this.activeWeapon='gun'; break;
      }
      case 'timeboost': {
        const ex=this.heldItems.find(h=>h.type==='timeboost');
        if (ex) ex.count=(ex.count||1)+1;
        else if (this.heldItems.length<3) this.heldItems.push({type:'timeboost',count:1});
        break;
      }
      case 'split': {
        const ex=this.heldItems.find(h=>h.type==='split');
        if(ex) ex.count=(ex.count||1)+1;
        else if(this.heldItems.length<3) this.heldItems.push({type:'split',count:1});
        break;
      }
      case 'enemyUp': {
        const spd=this._monsterSpeed||1;
        this.monsters=this.monsters.map(m=>{
          if(m instanceof BossMonster) return m;
          if(m instanceof MidBossMonster) return new BossMonster(m.gx,m.gy,this.cs,spd,this.stage);
          if(m instanceof ShooterMonster) return new MidBossMonster(m.gx,m.gy,this.cs,spd,this.stage);
          return new ShooterMonster(m.gx,m.gy,this.cs,spd,this.stage);
        });
        this.flashTimer=0.4; this.flashColor='rgba(255,50,50,0.45)';
        break;
      }
    }
    if(item.type!=='enemyUp') { this.flashTimer=0.15; this.flashColor='rgba(255,255,200,0.25)'; }
  }

  // 서버가 배치 이미지를 아직 생성 중이거나(status!=='ready') 모바일 네트워크
  // 순단으로 fetch가 실패하면, 예전에는 여기서 그냥 포기해 캐릭터 이미지가
  // 스테이지 내내 영영 로드되지 않고 플레이스홀더만 계속 표시되는 버그가 있었다.
  // 준비될 때까지 짧은 간격으로 재시도한다. fetchToken으로 새 init() 호출이
  // 진행 중인 재시도보다 먼저 끝나 낡은 응답이 최신 상태를 덮어쓰는 것을 막는다.
  async _fetchCharImage(stage, rating, fetchToken, attempt=0) {
    if (fetchToken!==this._imageFetchToken) return; // 이 스테이지는 이미 지나감
    try {
      const res=await fetch(`${this.serverUrl}/api/image?stage=${stage}&rating=${rating}`);
      const data=await res.json();
      if (fetchToken!==this._imageFetchToken) return;
      if (data.status==='ready'&&data.url) {
        const img=new Image();
        img.onload=()=>{ if(fetchToken===this._imageFetchToken) this.charImage=img; };
        img.onerror=()=>this._scheduleImageRetry(stage,rating,fetchToken,attempt);
        img.src=data.url;
        return;
      }
    } catch {}
    this._scheduleImageRetry(stage,rating,fetchToken,attempt);
  }

  _scheduleImageRetry(stage, rating, fetchToken, attempt) {
    if (fetchToken!==this._imageFetchToken) return;
    const delay=Math.min(2000+attempt*500,8000); // 2s → 최대 8s 간격으로 재시도
    setTimeout(()=>this._fetchCharImage(stage,rating,fetchToken,attempt+1),delay);
  }

  // ── Loop ─────────────────────────────────────────────────────
  _loop(t) {
    if (!this.running) return;
    const dt=Math.min((t-this._lastTime)/1000,0.1);
    this._lastTime=t; this._time+=dt;
    this._update(dt); this._render();
    this._raf=requestAnimationFrame(ts=>this._loop(ts));
  }

  _update(dt) {
    // Input
    if (this.pendingDir&&this.player.progress===0) {
      const {dx,dy}=this.pendingDir;
      this.player.setDir(dx,dy);
      if (dx!==0||dy!==0) { this._lastDx=dx; this._lastDy=dy; }
      this.pendingDir=null;
    }
    const result=this.player.update(dt,this.grid,this.playerSlowTimer>0?0.6:1.0);
    if (this.pendingDir&&this.player.progress===0) {
      const {dx,dy}=this.pendingDir;
      this.player.setDir(dx,dy);
      if (dx!==0||dy!==0) { this._lastDx=dx; this._lastDy=dy; }
      this.pendingDir=null;
    }
    if (result==='LINE_COMPLETE') { this._onLineComplete(); if (!this.running) return; }

    // Invincibility
    if (this.player.invincible) {
      this.player.invTimer-=dt;
      if (this.player.invTimer<=0) { this.player.invincible=false; if (this.shieldTimer<=0) this.player.invincible=false; }
    }
    if (this.shieldTimer>0) { this.shieldTimer-=dt; if (this.shieldTimer<=0) { this.shieldTimer=0; this.player.invincible=false; } else { this.player.invincible=true; } }
    if (this.slowTimer>0) this.slowTimer-=dt;
    const slow=this.slowTimer>0?0.35:1.0;
    if (this.confuseTimer>0) this.confuseTimer-=dt;
    if (this.playerSlowTimer>0) this.playerSlowTimer-=dt;
    if (this.repelTimer>0) this.repelTimer-=dt;
    if (this.freezeTimer>0) this.freezeTimer-=dt;

    // Monsters — 신화 등급 "동결 부적" 효과 중엔 이동/발사/디버프를 포함해 몹 업데이트를
    // 통째로 건너뛰어 완전히 멈춰있는 것처럼 보이게 한다.
    const toAdd=[];
    if (this.freezeTimer<=0) {
      for (const m of this.monsters) {
        m.update(dt,this.grid,this.player.px,this.player.py,this.player.isDrawing,this.bullets,slow);
        if (m.pendingSpawns.length>0) {
          for (const s of m.pendingSpawns) toAdd.push(new NormalMonster(s.gx,s.gy,this.cs,s.speed,this.stage));
          m.pendingSpawns=[];
        }
        if (m.pendingDebuff) { this._applyDebuff(m.pendingDebuff); m.pendingDebuff=null; }
      }
      // 신화 등급 "회피 부적": 몹 종류와 무관하게 플레이어에게서 멀어지는 방향으로
      // 다음 프레임 이동 방향을 덮어쓴다 (추적형 몹의 추적도 함께 무효화됨).
      if (this.repelTimer>0) {
        for (const m of this.monsters) {
          const dx=m.px-this.player.px, dy=m.py-this.player.py, d=Math.sqrt(dx*dx+dy*dy)||1;
          m.vx=(dx/d)*m.spd; m.vy=(dy/d)*m.spd;
        }
      }
    }
    this.monsters.push(...toAdd);
    if(this.monsters.length>MAX_MONSTERS) this.monsters.length=MAX_MONSTERS;

    // MidBoss merge
    const toRemove=new Set();
    for (const mb of this.monsters) {
      if (!(mb instanceof MidBossMonster)) continue;
      for (const nm of this.monsters) {
        if (!(nm instanceof NormalMonster)||toRemove.has(nm)) continue;
        const dx=mb.px-nm.px,dy=mb.py-nm.py;
        if (dx*dx+dy*dy<(mb.r+nm.r)**2) {
          toRemove.add(nm);
          mb.hp=Math.min(mb.hp+getStageHP(this.stage),mb.maxHp*2);
          mb.r=Math.min(mb.r+this.cs*0.06,this.cs*0.75);
        }
      }
    }
    if (toRemove.size>0) {
      for (const m of toRemove) this._spawnHitParticles(m.px,m.py);
      this.monsters=this.monsters.filter(m=>!toRemove.has(m));
    }

    // Enemy bullets
    for (const b of this.bullets) b.update(dt,this.grid,this.cs,slow);
    this.bullets=this.bullets.filter(b=>!b.dead);

    // Player bullets
    for (const pb of this.playerBullets) pb.update(dt,this.grid,this.cs);
    this.playerBullets=this.playerBullets.filter(pb=>!pb.dead);
    // Laser beams
    for(const lb of this.laserBeams) lb.update(dt);
    this.laserBeams=this.laserBeams.filter(lb=>!lb.dead);
    // Laser beam vs monster collision (pierces — damages each monster once)
    for(const lb of this.laserBeams){
      if(!lb._hitSet) lb._hitSet=new Set();
      for(const m of this.monsters){
        if(!lb._hitSet.has(m)&&lb.hitsMonster(m)){ lb._hitSet.add(m); m.takeDamage(lb.dmg); }
      }
    }
    const _isPiercing=(this._bulletLevel||0)>10;
    for (let i=this.playerBullets.length-1;i>=0;i--) {
      const pb=this.playerBullets[i];
      if(!pb._hitSet) pb._hitSet=new Set();
      for (const m of this.monsters) {
        if(pb._hitSet.has(m)) continue;
        if (pb.hitsMonster(m)) {
          const prevHp=m.hp;
          if(_isPiercing){
            // 관통: 데미지에서 적의 현재 체력만큼 차감, 남은 데미지로 다음 적 공격
            m.takeDamage(pb.dmg);
            pb._hitSet.add(m);
            pb.dmg-=prevHp; // 적의 체력만큼 데미지 소모
            if(pb.isGunBullet&&m.hp<=0){
              this._gunKillCount=(this._gunKillCount||0)+1;
              if(this._gunKillCount>=5){
                this._gunKillCount=0;
                const gunItem=this.heldItems.find(h=>h.type==='gun');
                if(gunItem){ gunItem.ammo+=5; this._ammoRechargeTimer=1.2; }
              }
            }
            if(pb.dmg<=0){ pb.dead=true; break; }
          } else {
            m.takeDamage(pb.dmg); pb.dead=true;
            if(pb.isGunBullet&&m.hp<=0){
              this._gunKillCount=(this._gunKillCount||0)+1;
              if(this._gunKillCount>=5){
                this._gunKillCount=0;
                const gunItem=this.heldItems.find(h=>h.type==='gun');
                if(gunItem){ gunItem.ammo+=5; this._ammoRechargeTimer=1.2; }
              }
            }
            break;
          }
        }
      }
    }
    this.playerBullets=this.playerBullets.filter(pb=>!pb.dead);

    // 펫 — 궤도 위치 갱신 + (강화돼 있으면) 자동 발사
    if (this.pets.length>0) {
      const orbitR=this.cs*1.4;
      for (let i=0;i<this.pets.length;i++) {
        const pet=this.pets[i];
        pet.angle+=dt*1.6*(i%2===0?1:-1);
        pet.px=this.player.px+Math.cos(pet.angle)*orbitR;
        pet.py=this.player.py+Math.sin(pet.angle)*orbitR;
        if (this._petLevel>0) {
          pet.fireTimer-=dt;
          if (pet.fireTimer<=0) {
            const gunBulletCap=BULLET_BASE_CAP*getLoopMultiplier(this.stage);
            const playerMaxR=this.cs*(0.25+(gunBulletCap-1)/99*1.75);
            const pattern=_getPetPattern(this._petLevel,this.cs,playerMaxR/2);
            pet.fireTimer=pattern.interval;
            const baseAngle=Math.atan2(this._lastDy,this._lastDx);
            for (const {angDeg} of pattern.bullets) {
              const ang=baseAngle+angDeg*Math.PI/180;
              this.petBullets.push(new PetBullet(pet.px,pet.py,Math.cos(ang)*260,Math.sin(ang)*260,pattern.dmg,pattern.r,pattern.homing));
            }
          }
        }
      }
    }
    for (const pb of this.petBullets) pb.update(dt,this.grid,this.cs,this.monsters);
    for (const pb of this.petBullets) {
      if (pb.dead) continue;
      for (const m of this.monsters) {
        if (pb.hitsMonster(m)) { m.takeDamage(pb.dmg); pb.dead=true; break; }
      }
    }
    this.petBullets=this.petBullets.filter(pb=>!pb.dead);

    this.monsters=this.monsters.filter(m=>{ if (m.hp<=0) { this._spawnHitParticles(m.px,m.py); this.score+=_killScore(m); return false; } return true; });

    // Particles
    for (const p of this.particles) p.update(dt);
    this.particles=this.particles.filter(p=>!p.dead());

    // Item spawning
    if (this._itemSchedule!==null) {
      if (this._itemScheduleIdx<this._itemSchedule.length&&this._time>=this._itemSchedule[this._itemScheduleIdx]) {
        this._spawnItem(); this._itemScheduleIdx++;
      }
    } else {
      this._itemContinuousTimer-=dt;
      if (this._itemContinuousTimer<=0) { this._spawnItem(); this._itemContinuousTimer=this._itemInterval; }
    }
    if(this._soulSwordTimer>0) this._soulSwordTimer-=dt;
    if(this._ammoRechargeTimer>0) this._ammoRechargeTimer-=dt;
    for (const item of this.items) item.update(dt);

    // Bomb collision with monsters
    for (let bi=this.items.length-1;bi>=0;bi--) {
      const bomb=this.items[bi];
      if (bomb.type!=='bomb') continue;
      for (let mi=this.monsters.length-1;mi>=0;mi--) {
        const m=this.monsters[mi];
        if (m.gx===bomb.gx&&m.gy===bomb.gy) {
          this._spawnHitParticles(bomb.px,bomb.py); this._spawnHitParticles(bomb.px,bomb.py);
          this.score+=_killScore(m);
          this.monsters.splice(mi,1);
          this.items.splice(bi,1);
          this.flashTimer=0.3; this.flashColor='rgba(255,150,0,0.4)';
          break;
        }
      }
    }

    // Item pickup (not bombs)
    for (let i=this.items.length-1;i>=0;i--) {
      const item=this.items[i];
      if (item.type==='bomb') continue;
      if (item.gx===this.player.gx&&item.gy===this.player.gy) {
        this._applyItem(item); this.items.splice(i,1);
      }
    }

    // Sword timer
    if (this.swordTimer>0) this.swordTimer-=dt;
    if (this.swordTimer<=0) this.swordActive=false;

    // 신화 등급 "오토모드" — 활성화 중이면 선택된 무기(총/칼)를 초당 4회 자동 사용
    if (this.autoModeOwned&&this.autoModeActive&&(this.activeWeapon==='gun'||this.activeWeapon==='sword')) {
      this._autoFireTimer-=dt;
      if (this._autoFireTimer<=0) {
        this._autoFireTimer=0.25; // 1초에 4발
        if (this.activeWeapon==='gun') this.useGun(); else this.useSword();
      }
    } else {
      this._autoFireTimer=0;
    }

    // Collision: monster hits LINE
    if (this.player.isDrawing&&!this.player.invincible) {
      for (const m of this.monsters) {
        if (m.hitLine(this.grid)) { this._spawnHitParticles(m.px,m.py); this._onLoseLife(); break; }
      }
    }
    if (!this.running) return;

    // Collision: bullet hits LINE or player
    // 플레이어가 CAPTURED 셀(테두리·점령지)에 있으면 총알 무효
    const playerOnSafe=this.grid.get(this.player.gx,this.player.gy)===CAPTURED;
    if (!this.player.invincible&&!playerOnSafe) {
      for (const b of this.bullets) {
        const hitLine=this.player.isDrawing&&b.hitsLine(this.grid,this.cs);
        const hitPlayer=b.hitsPlayer(this.player.px,this.player.py);
        if (hitLine||hitPlayer) { this._spawnHitParticles(b.px,b.py); b.dead=true; this._onLoseLife(); break; }
      }
    }
    if (!this.running) return;

    // Effects decay
    if (this.shakeTimer>0) this.shakeTimer-=dt;
    if (this.flashTimer>0) this.flashTimer-=dt;
    this.dangerPulse=this.lives<=1?Math.sin(this._time*6)*0.5+0.5:0;
    this.timeLeft-=dt;
    if (this.timeLeft<=0) { this._onGameOver('timeout'); return; }

    this._hudTimer-=dt;
    if (this._hudTimer<=0) {
      this._hudTimer=0.1;
      this.dispatchEvent(new CustomEvent('hud', { detail: {
        fill:this.fillPct, lives:this.lives, time:Math.ceil(this.timeLeft),
        stage:this.stage, score:this.score,
        slowTimer:Math.ceil(Math.max(0,this.slowTimer)),
        shieldTimer:Math.ceil(Math.max(0,this.shieldTimer)),
        heldItems:this.heldItems, bubbleActive:this.bubbleActive,
        rareBubbleActive:!!this.heldItems.find(h=>h.type==='rareBubble'),
        confuseTimer:Math.ceil(Math.max(0,this.confuseTimer)),
        playerSlowTimer:Math.ceil(Math.max(0,this.playerSlowTimer)),
        repelTimer:Math.ceil(Math.max(0,this.repelTimer)),
        freezeTimer:Math.ceil(Math.max(0,this.freezeTimer)),
      }}));
    }
  }

  // ── Events ───────────────────────────────────────────────────
  _onLineComplete() {
    const mpos=this.monsters.map(m=>[m.gx,m.gy]);
    const newCells=this.grid.captureArea(mpos);
    this.player.isDrawing=false; this.player.path=[];
    this.fillPct=this.grid.getFillPct(); this.score+=newCells.length*10;
    const sample=newCells.length>30?newCells.filter((_,i)=>i%3===0):newCells;
    for (const [x,y] of sample) {
      const px=(x+0.5)*this.cs,py=(y+0.5)*this.cs;
      const colors=['#ff6fc8','#c850c0','#ffaaff','#ffe0f0','#4158d0'];
      for (let i=0;i<2;i++) this.particles.push(new Particle(px,py,colors[rndI(0,colors.length)]));
    }
    if (newCells.length>50) {
      this.flashTimer=0.35; this.flashColor='rgba(255,180,255,0.5)';
      this.particles.push(new Particle(this.canvas.width/2,this.canvas.height/2,'#ffe0ff',true));
    } else { this.flashTimer=0.18; this.flashColor='rgba(255,220,255,0.3)'; }
    if (this.fillPct>=this.CLEAR_THRESHOLD) this._onStageClear();
  }

  // GhostMonster/SlimeMonster가 근접 시 요청하는 상태이상을 실제로 적용한다.
  // 이미 걸려있는 동안 다시 걸리면 남은 시간을 갱신(연장)한다.
  _applyDebuff(effect) {
    if (effect.type==='confuse') this.confuseTimer=Math.max(this.confuseTimer||0,effect.duration);
    else if (effect.type==='slow') this.playerSlowTimer=Math.max(this.playerSlowTimer||0,effect.duration);
  }

  _onLoseLife() {
    if (this.bubbleActive) {
      this.bubbleActive=false; this.player.invincible=true; this.player.invTimer=2;
      this.shakeTimer=0.2; this.shakeAmt=5; return;
    }
    const rareBub=this.heldItems.find(h=>h.type==='rareBubble');
    if (rareBub) {
      this.heldItems=this.heldItems.filter(h=>h!==rareBub);
      this.player.invincible=true; this.player.invTimer=2;
      this.shakeTimer=0.2; this.shakeAmt=5; return;
    }
    this.lives--;
    if (this.lives<=2) this._rareLifeLost=true;
    if (this.speedActive && this._persistentSpeedLevel < 2) { this.speedActive=false; this.player.speed=this.PLAYER_SPEED; this.heldItems=this.heldItems.filter(h=>h.type!=='speed'); }
    // 칼은 목숨 1 이하일 때 삭제하지 않고 useSword()에서 사용만 막는다 —
    // 총과 동일하게 한 번 구입하면 목숨과 무관하게 보유·강화가 유지되도록.
    // 수호의 구슬 보유 시: 원위치 복귀·그리던 선 초기화를 건너뛰어 목숨만 깎이고
    // 계속 같은 자리에서 땅따먹기를 이어갈 수 있다.
    if (!this.guardianOrb) {
      this.grid.clearLine();
      this.player.isDrawing=false; this.player.path=[]; this.player.trail=[];
      this.player.gx=Math.floor(this.COLS/2); this.player.gy=0;
      this.player.px=this.player.gx*this.cs+this.cs*0.5; this.player.py=this.cs*0.5;
      this.player.dx=0; this.player.dy=0; this.player.progress=0;
    }
    this.player.invincible=true; this.player.invTimer=1.5;
    this.shakeTimer=0.45; this.shakeAmt=10; this.flashTimer=0.4; this.flashColor='rgba(255,50,50,0.5)';
    this.bullets=[];
    if (this.lives<=0 && this.phoenixHeart && !this._phoenixUsed) {
      // 불사조의 심장: 스테이지당 1회, 게임오버 대신 목숨 1로 즉시 부활.
      this._phoenixUsed=true;
      this.lives=1;
      this.player.invTimer=2.5;
      this.flashTimer=0.6; this.flashColor='rgba(255,150,0,0.65)';
    } else if (this.lives<=0) {
      this._onGameOver('lives');
    }
  }

  _onStageClear() {
    // 스테이지 비례 보너스 배율 (10스테이지마다 +30%) — 포인트 획득 난이도 완화를 위해 2배 지급
    const bonusMult=(1+Math.floor(this.stage/10)*0.3)*2;
    // 신화 등급 영구 아이템 "미다스의 손" — 아래 스테이지 클리어 보너스 전체에 +30%.
    const midasMult=this.midasTouch?1.3:1;
    // 시간/스테이지 보너스: 광고 리워드 포인트 도입 후 이 둘까지 과하게 얹으면
    // 광고를 볼 유인이 사라진다는 피드백에 따라 예전 배율(추가 배율 없음)로 되돌림
    const timeBonus=Math.ceil(Math.ceil(this.timeLeft)*5*bonusMult*midasMult);
    const _pos=((this.stage-1)%10)+1, _cyc=Math.floor((this.stage-1)/10);
    const stageBonus=Math.ceil((_pos*200+_cyc*5000)*bonusMult*midasMult);
    const fillPct100=Math.floor(this.fillPct*100);
    const fillBonus75=fillPct100>75?Math.ceil((fillPct100-75)*100*bonusMult*midasMult):0;
    const fillBonus94=fillPct100>94?Math.ceil((fillPct100-94)*1000*bonusMult*midasMult):0;
    const fillBonus=fillBonus75+fillBonus94;
    // 전멸 보너스: 클리어 시 살아있는 적이 없으면 추가 지급 (예전 배율에서 1.3배로 조정)
    const allClearBonus=this.monsters.length===0?Math.ceil((1000+this.stage*100)*bonusMult*1.3*midasMult):0;
    this.score+=timeBonus+stageBonus+fillBonus+allClearBonus; this.stop();
    this.dispatchEvent(new CustomEvent('stageClear', { detail: {
      stage:this.stage, fill:this.fillPct, timeLeft:Math.ceil(this.timeLeft),
      charImage:this.charImage, score:this.score, timeBonus, stageBonus, fillBonus, allClearBonus,
      heldItems:JSON.parse(JSON.stringify(this.heldItems)),
      rareLifeLost:this._rareLifeLost,
    }}));
  }

  _onGameOver(reason) {
    this.stop();
    this.dispatchEvent(new CustomEvent('gameOver', { detail:{
      stage:this.stage, reason,
      gridSnapshot: this.grid.data.slice(),
      heldItems: JSON.parse(JSON.stringify(this.heldItems)),
      fillPct: this.fillPct,
      timeLeft: Math.ceil(this.timeLeft),
      score: this.score,
    }}));
  }

  _spawnHitParticles(px, py) {
    for (let i=0;i<12;i++) this.particles.push(new Particle(px,py,i%2===0?'#ff4444':'#ffaa00',false));
  }

  // ── Render ───────────────────────────────────────────────────
  _render() {
    const ctx=this.ctx, w=this.canvas.width, h=this.canvas.height, cs=this.cs;
    const sx=this.shakeTimer>0?(Math.random()-0.5)*this.shakeAmt*2:0;
    const sy=this.shakeTimer>0?(Math.random()-0.5)*this.shakeAmt*2:0;
    ctx.save(); ctx.translate(sx,sy);

    // 1. Background
    const cimg=this.charImage;
    if (cimg && cimg.naturalWidth>0 && cimg.naturalHeight>0) {
      const iw=cimg.naturalWidth,ih=cimg.naturalHeight,iar=iw/ih,car=w/h;
      let sx2=0,sy2=0,sw=iw,sh=ih;
      if (iar>car) { sw=ih*car; sx2=(iw-sw)/2; } else { sh=iw/car; sy2=(ih-sh)/2; }
      ctx.drawImage(cimg,sx2,sy2,sw,sh,0,0,w,h);
    } else { this._drawPlaceholder(ctx,w,h); }

    // 2. Fog
    const fc=this.fogCtx;
    fc.clearRect(0,0,w,h); fc.fillStyle='rgba(8,5,20,0.97)'; fc.fillRect(0,0,w,h);
    fc.globalCompositeOperation='destination-out'; fc.fillStyle='#000';
    const g=this.grid;
    for (let y=0;y<g.rows;y++) for (let x=0;x<g.cols;x++) if (g.get(x,y)===CAPTURED) fc.fillRect(x*cs,y*cs,cs,cs);
    fc.globalCompositeOperation='source-over'; ctx.drawImage(this.fogCanvas,0,0);

    // 3. Lightning mode overlay
    if (this.lightningMode) {
      ctx.fillStyle='rgba(255,255,100,0.08)'; ctx.fillRect(0,0,w,h);
      ctx.strokeStyle='rgba(255,255,100,0.5)'; ctx.lineWidth=2; ctx.setLineDash([6,4]);
      ctx.strokeRect(2,2,w-4,h-4); ctx.setLineDash([]);
    }

    // 3b. Confuse debuff overlay (GhostMonster) — 방향키가 반전됐음을 알리는 경고 테두리
    if (this.confuseTimer>0) {
      ctx.save();
      ctx.globalAlpha=0.5+0.15*Math.sin(this._time*10);
      ctx.strokeStyle='#cfa6ff'; ctx.lineWidth=8;
      ctx.strokeRect(4,4,w-8,h-8);
      ctx.restore();
    }

    // 4. Danger vignette
    if (this.dangerPulse>0) {
      const dg=ctx.createRadialGradient(w/2,h/2,h*0.2,w/2,h/2,h*0.7);
      dg.addColorStop(0,'transparent'); dg.addColorStop(1,`rgba(200,0,0,${this.dangerPulse*0.45})`);
      ctx.fillStyle=dg; ctx.fillRect(0,0,w,h);
    }

    // 5. Flash
    if (this.flashTimer>0) { ctx.globalAlpha=Math.min(1,this.flashTimer*3); ctx.fillStyle=this.flashColor; ctx.fillRect(0,0,w,h); ctx.globalAlpha=1; }

    // 6. LINE cells
    for (let y=0;y<g.rows;y++) for (let x=0;x<g.cols;x++) {
      if (g.get(x,y)!==LINE) continue;
      ctx.fillStyle='rgba(255,80,200,0.25)'; ctx.fillRect(x*cs-2,y*cs-2,cs+4,cs+4);
      ctx.fillStyle='#ff6fc8'; ctx.fillRect(x*cs+2,y*cs+2,cs-4,cs-4);
    }

    // 7. Items
    for (const item of this.items) item.draw(ctx);

    // 8. Particles
    for (const p of this.particles) p.draw(ctx);

    // 9. Enemy bullets
    for (const b of this.bullets) b.draw(ctx);

    // 10. Player bullets
    for (const pb of this.playerBullets) pb.draw(ctx);

    // 10c. Pet bullets
    for (const pb of this.petBullets) pb.draw(ctx);

    // 10b. Laser beams
    for(const lb of this.laserBeams) lb.draw(ctx);

    // 11. Monsters
    for (const m of this.monsters) m.draw(ctx);

    // 12. Sword effect
    if (this.swordActive&&this.swordTimer>0) {
      const alpha=this.swordTimer/0.35;
      ctx.save(); ctx.globalAlpha=alpha;
      const sc=this.swordColor||'#ffd700';
      ctx.fillStyle=sc==='rainbow'?`hsl(${(this._time*200)%360},100%,60%)`:sc;
      const sLen=this.swordReach*cs, px=this.player.px, py=this.player.py;
      if ((this.swordArcHalf||0) >= 90) {
        // 200단 이상: 직선 슬래시 대신 반원형 부채꼴로 넓게 휘두르는 모습을 그린다
        // (판정 각도가 실제로 90도라 시각적으로도 그에 맞춰 넓게 표시).
        const mainAngle=Math.atan2(this.swordDy,this.swordDx);
        const arcRad=this.swordArcHalf*Math.PI/180;
        ctx.beginPath();
        ctx.moveTo(px,py);
        ctx.arc(px,py,sLen,mainAngle-arcRad,mainAngle+arcRad);
        ctx.closePath();
        ctx.fill();
      } else if (this.swordDx!==0) { const x=this.swordDx>0?px:px-sLen; ctx.fillRect(x,py-cs*0.18,sLen,cs*0.36); }
      else { const y=this.swordDy>0?py:py-sLen; ctx.fillRect(px-cs*0.18,y,cs*0.36,sLen); }
      ctx.restore();
    }
    // 12b. 검사의 영혼 효과
    if (this._soulSwordTimer>0) {
      const alpha=Math.min(1,this._soulSwordTimer/1.2);
      const swordLv=this._swordLevel||0;
      const reach=_getSwordAttrs(swordLv,cs).reach;
      const hue=(this._time*300)%360;
      ctx.save();
      ctx.globalAlpha=alpha*0.5;
      ctx.strokeStyle=`hsl(${hue},100%,70%)`;
      ctx.lineWidth=cs*0.25;
      ctx.beginPath(); ctx.arc(this.player.px,this.player.py,reach*cs,0,PI2); ctx.stroke();
      ctx.globalAlpha=alpha*0.18;
      ctx.fillStyle=`hsl(${hue},100%,70%)`;
      ctx.beginPath(); ctx.arc(this.player.px,this.player.py,reach*cs,0,PI2); ctx.fill();
      if(this._soulSwordTimer>0.5){
        ctx.globalAlpha=alpha;
        ctx.fillStyle='#ffffff';
        ctx.font=`bold ${Math.max(10,Math.floor(cs*0.85))}px sans-serif`;
        ctx.textAlign='center';
        ctx.fillText(t('game.soulSword'),this.player.px,this.player.py-reach*cs-cs*0.5);
        ctx.textAlign='left';
      }
      ctx.restore();
    }
    // 12c. 탄약 충전 글로우
    if (this._ammoRechargeTimer>0) {
      const alpha=Math.min(1,this._ammoRechargeTimer/1.2);
      const glowR=cs*2.5;
      ctx.save();
      ctx.globalAlpha=alpha*0.75;
      const grd=ctx.createRadialGradient(this.player.px,this.player.py,0,this.player.px,this.player.py,glowR);
      grd.addColorStop(0,'rgba(80,220,255,0.9)');
      grd.addColorStop(0.5,'rgba(80,180,255,0.5)');
      grd.addColorStop(1,'transparent');
      ctx.beginPath(); ctx.arc(this.player.px,this.player.py,glowR,0,PI2);
      ctx.fillStyle=grd; ctx.fill();
      if(this._ammoRechargeTimer>0.6){
        ctx.globalAlpha=alpha;
        ctx.fillStyle='#ffffff';
        ctx.font=`bold ${Math.max(9,Math.floor(cs*0.75))}px sans-serif`;
        ctx.textAlign='center';
        ctx.fillText(t('game.ammoRecharge'),this.player.px,this.player.py-glowR*0.7);
        ctx.textAlign='left';
      }
      ctx.restore();
    }

    // 13. Player trail
    for (let i=0;i<this.player.trail.length;i++) {
      const tr=this.player.trail[i];
      const a=(1-i/this.player.trail.length)*0.55, sz=cs*0.22*(1-i/this.player.trail.length);
      ctx.save(); ctx.globalAlpha=a; ctx.fillStyle=i%2===0?'#ff6fc8':'#ffe566';
      ctx.translate(tr.x,tr.y); ctx.rotate(this._time*4+i*0.8);
      _drawStarShape(ctx,0,0,4,sz,sz*0.42); ctx.restore(); ctx.globalAlpha=1;
    }

    // 13b. Pets (본캐보다 먼저 그려 겹칠 때 본캐가 위로 오게 함)
    for (const pet of this.pets) this._drawPetSprite(ctx,cs,pet);

    // 14. Player
    this._drawCutePlayer(ctx,cs);

    // 15. Fill bar
    const barH=Math.max(4,Math.floor(cs*0.22)), barY=h-barH, pct=this.fillPct;
    ctx.fillStyle='rgba(0,0,0,0.5)'; ctx.fillRect(0,barY,w,barH);
    const barColor=pct>=0.75?'#00e676':pct>=0.5?'#ffee58':'#c850c0';
    ctx.fillStyle=barColor; ctx.fillRect(0,barY,w*pct,barH);
    ctx.strokeStyle='rgba(255,255,255,0.6)'; ctx.lineWidth=1.5;
    ctx.beginPath(); ctx.moveTo(w*0.75,barY); ctx.lineTo(w*0.75,h); ctx.stroke();

    ctx.restore();
  }

  _drawPlaceholder(ctx, w, h) {
    // 주의: 지역변수명을 't'로 쓰면 상단에서 import한 i18n 번역 함수 t()를
    // 가려버려 아래쪽 t('game.imageLoading') 호출이 "t is not a function"
    // 런타임 에러로 죽는다 (이 함수가 매 프레임 렌더링 루프를 멈춰버렸음).
    const time=this._time;
    const bg=ctx.createLinearGradient(0,0,w,h);
    bg.addColorStop(0,`hsl(${270+Math.sin(time*0.3)*20},70%,15%)`);
    bg.addColorStop(0.5,`hsl(${320+Math.sin(time*0.4)*15},60%,12%)`);
    bg.addColorStop(1,`hsl(${220+Math.sin(time*0.25)*20},70%,10%)`);
    ctx.fillStyle=bg; ctx.fillRect(0,0,w,h);
    ctx.save();
    for (let i=0;i<8;i++) {
      const sx=w*(0.2+0.6*(i/8))+Math.sin(time*1.5+i)*w*0.06;
      const sy=h*(0.1+0.8*(i%4/3))+Math.cos(time*1.2+i)*h*0.04;
      const a=(Math.sin(time*2.5+i*1.3)+1)*0.5;
      ctx.beginPath(); ctx.arc(sx,sy,2,0,PI2); ctx.fillStyle=`rgba(255,180,255,${a*0.7})`; ctx.fill();
    }
    ctx.restore();
    const cx=w*0.5,cy=h*0.42,sc=Math.min(w,h)*0.38;
    ctx.save(); ctx.fillStyle='rgba(80,20,110,0.55)';
    ctx.beginPath(); ctx.arc(cx,cy-sc*0.62,sc*0.22,0,PI2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(cx,cy-sc*0.7,sc*0.28,sc*0.18,0,Math.PI,0); ctx.fill();
    ctx.beginPath(); ctx.ellipse(cx-sc*0.2,cy-sc*0.5,sc*0.1,sc*0.28,-0.3,0,PI2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(cx+sc*0.2,cy-sc*0.5,sc*0.1,sc*0.28,0.3,0,PI2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(cx,cy-sc*0.28,sc*0.16,sc*0.28,0,0,PI2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(cx,cy+sc*0.12,sc*0.24,sc*0.2,0,0,PI2); ctx.fill();
    ctx.restore();
    const pulse=Math.sin(time*1.8)*0.4+0.6;
    const sg=ctx.createRadialGradient(cx,cy,0,cx,cy,sc*1.1);
    sg.addColorStop(0,`rgba(200,80,192,${0.12*pulse})`); sg.addColorStop(0.6,`rgba(65,88,208,${0.08*pulse})`); sg.addColorStop(1,'transparent');
    ctx.fillStyle=sg; ctx.fillRect(0,0,w,h);
    ctx.fillStyle=`rgba(255,200,255,${0.3+Math.sin(time*2)*0.15})`;
    ctx.font=`${Math.max(10,Math.floor(w*0.04))}px sans-serif`;
    ctx.textAlign='center'; ctx.fillText(t('game.imageLoading'),w/2,h*0.91); ctx.textAlign='left';
  }

  _drawCutePlayer(ctx, cs) {
    const isShield=this.shieldTimer>0;
    const blinkShield=isShield&&this.shieldTimer<5&&Math.floor(performance.now()/200)%2===0;
    const blinkInv=this.player.invincible&&!isShield&&Math.floor(performance.now()/110)%2===0;
    if (blinkShield||blinkInv) return;

    const px=this.player.px, py=this.player.py, t=this._time;
    const h=cs*0.7;
    const isIdle=this.player.dx===0&&this.player.dy===0;
    const bounce=isIdle?Math.sin(t*3.5)*cs*0.05:Math.sin(t*6)*cs*0.02;
    const tilt=this.player.dx*0.15+this.player.dy*0.07;
    const flipX=this.player.dx>0?-1:1;

    ctx.save(); ctx.translate(px,py+bounce); ctx.rotate(tilt); ctx.scale(flipX,1);

    // Bubble protection ring
    if (this.bubbleActive) {
      const bubR=cs*0.92;
      ctx.beginPath(); ctx.arc(0,0,bubR,0,PI2);
      ctx.fillStyle='rgba(100,200,255,0.18)'; ctx.fill();
      ctx.strokeStyle='rgba(180,230,255,0.7)'; ctx.lineWidth=2; ctx.stroke();
      ctx.strokeStyle='rgba(255,255,255,0.6)'; ctx.lineWidth=1.5; ctx.lineCap='round';
      ctx.beginPath(); ctx.arc(-bubR*0.3,-bubR*0.4,bubR*0.32,Math.PI*1.1,Math.PI*1.65); ctx.stroke();
    }
    // 레어 버블 보호링 (황금색)
    if (this.heldItems.find(h=>h.type==='rareBubble')) {
      const bubR=cs*1.0;
      ctx.beginPath(); ctx.arc(0,0,bubR,0,PI2);
      ctx.fillStyle='rgba(255,215,80,0.15)'; ctx.fill();
      ctx.strokeStyle='rgba(255,200,60,0.8)'; ctx.lineWidth=2.5; ctx.stroke();
      ctx.strokeStyle='rgba(255,255,180,0.65)'; ctx.lineWidth=1.5; ctx.lineCap='round';
      ctx.beginPath(); ctx.arc(-bubR*0.3,-bubR*0.4,bubR*0.32,Math.PI*1.1,Math.PI*1.65); ctx.stroke();
    }

    this._drawSquirrelBody(ctx,h,isShield,t);

    ctx.restore();

    // Gun muzzle indicator (world coords, outside transform)
    const hasGun=this.heldItems.find(hi=>hi.type==='gun');
    if (hasGun) {
      const gdx=this._lastDx, gdy=this._lastDy;
      const mag=Math.sqrt(gdx*gdx+gdy*gdy)||1;
      const nx=gdx/mag, ny=gdy/mag;
      const ox=px+nx*cs*0.28, oy=py+bounce+ny*cs*0.28;
      const ex=px+nx*cs*0.75, ey=py+bounce+ny*cs*0.75;
      ctx.save();
      ctx.lineCap='round';
      // barrel body
      ctx.strokeStyle='#778899'; ctx.lineWidth=Math.max(3,cs*0.1);
      ctx.beginPath(); ctx.moveTo(ox,oy); ctx.lineTo(ex,ey); ctx.stroke();
      // barrel highlight
      ctx.strokeStyle='#aabbcc'; ctx.lineWidth=Math.max(1.5,cs*0.04);
      const side=cs*0.02;
      ctx.beginPath(); ctx.moveTo(ox-ny*side,oy+nx*side); ctx.lineTo(ex-ny*side,ey+nx*side); ctx.stroke();
      // muzzle glow
      const mg=ctx.createRadialGradient(ex,ey,0,ex,ey,cs*0.18);
      mg.addColorStop(0,'rgba(0,255,255,0.9)'); mg.addColorStop(1,'transparent');
      ctx.beginPath(); ctx.arc(ex,ey,cs*0.18,0,PI2); ctx.fillStyle=mg; ctx.fill();
      ctx.restore();
    }
  }

  // 다람쥐 캐릭터 몸체 그리기 — 본캐(_drawCutePlayer)와 펫(_drawPetSprite)이 공용으로
  // 쓴다. 호출 전 ctx가 이미 캐릭터 중심으로 translate(+rotate/scale)돼 있다고 가정하며,
  // 이 함수 안에서는 save/restore를 하지 않는다(호출부가 관리).
  _drawSquirrelBody(ctx, h, isShield, t) {
    // Shield aura
    if (isShield) {
      const hue=(t*120)%360;
      const aura=ctx.createRadialGradient(0,0,h*0.5,0,0,h*2);
      aura.addColorStop(0,`hsla(${hue},100%,70%,0.4)`);
      aura.addColorStop(1,'transparent');
      ctx.beginPath(); ctx.arc(0,0,h*2,0,PI2); ctx.fillStyle=aura; ctx.fill();
    }

    const furColor=isShield?`hsl(${(t*120)%360},100%,72%)`:'#c07030';
    const bellyColor='#f5d080';
    const earInner='#e89070';

    // Glow aura (warm orange for squirrel)
    const grd=ctx.createRadialGradient(0,0,0,0,0,h*1.5);
    grd.addColorStop(0,'rgba(220,140,50,0.45)'); grd.addColorStop(1,'transparent');
    ctx.beginPath(); ctx.arc(0,0,h*1.5,0,PI2); ctx.fillStyle=grd; ctx.fill();

    // Bushy tail (drawn first, behind body)
    const tailWag=Math.sin(t*4.5)*0.28;
    ctx.save();
    ctx.strokeStyle=isShield?furColor:'#a05820';
    ctx.lineWidth=h*0.42; ctx.lineCap='round'; ctx.lineJoin='round';
    ctx.beginPath();
    ctx.moveTo(0,h*0.12);
    ctx.bezierCurveTo(h*(0.55+tailWag*0.2),h*0.35, h*(0.85+tailWag*0.25),-h*0.25, h*(0.42+tailWag*0.18),-h*0.82);
    ctx.stroke();
    // fluffy tail tip
    ctx.fillStyle=isShield?furColor:bellyColor;
    ctx.beginPath(); ctx.arc(h*(0.42+tailWag*0.18),-h*0.85,h*0.24,0,PI2); ctx.fill();
    ctx.restore();

    // Body
    ctx.fillStyle=furColor;
    ctx.beginPath(); ctx.ellipse(0,h*0.15,h*0.31,h*0.27,0,0,PI2); ctx.fill();
    // Belly patch
    ctx.fillStyle=bellyColor;
    ctx.beginPath(); ctx.ellipse(0,h*0.18,h*0.17,h*0.17,0,0,PI2); ctx.fill();

    // Head
    ctx.fillStyle=furColor;
    ctx.beginPath(); ctx.arc(0,-h*0.2,h*0.37,0,PI2); ctx.fill();

    // Ears
    if (isShield) {
      // Super glowing spiky ears
      ctx.fillStyle=furColor;
      ctx.beginPath(); ctx.moveTo(-h*0.26,-h*0.48); ctx.lineTo(-h*0.42,-h*1.0); ctx.lineTo(-h*0.1,-h*0.58); ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.moveTo(h*0.26,-h*0.48); ctx.lineTo(h*0.42,-h*1.0); ctx.lineTo(h*0.1,-h*0.58); ctx.closePath(); ctx.fill();
    } else {
      // Pointy squirrel ears
      ctx.fillStyle=furColor;
      ctx.beginPath(); ctx.moveTo(-h*0.24,-h*0.46); ctx.lineTo(-h*0.38,-h*0.88); ctx.lineTo(-h*0.08,-h*0.56); ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.moveTo(h*0.24,-h*0.46); ctx.lineTo(h*0.38,-h*0.88); ctx.lineTo(h*0.08,-h*0.56); ctx.closePath(); ctx.fill();
      // Inner ear
      ctx.fillStyle=earInner;
      ctx.beginPath(); ctx.moveTo(-h*0.22,-h*0.5); ctx.lineTo(-h*0.33,-h*0.8); ctx.lineTo(-h*0.12,-h*0.59); ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.moveTo(h*0.22,-h*0.5); ctx.lineTo(h*0.33,-h*0.8); ctx.lineTo(h*0.12,-h*0.59); ctx.closePath(); ctx.fill();
    }

    // Eyes (big round cute squirrel eyes)
    const eyY=-h*0.22, eyX=h*0.13, eyR=h*0.115;
    ctx.fillStyle='#fff';
    ctx.beginPath(); ctx.ellipse(-eyX,eyY,eyR*0.78,eyR,0,0,PI2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(eyX,eyY,eyR*0.78,eyR,0,0,PI2); ctx.fill();
    // iris (dark brown, very large = cute)
    ctx.fillStyle='#2a1400';
    ctx.beginPath(); ctx.arc(-eyX,eyY+eyR*0.06,eyR*0.65,0,PI2); ctx.fill();
    ctx.beginPath(); ctx.arc(eyX,eyY+eyR*0.06,eyR*0.65,0,PI2); ctx.fill();
    // shine
    ctx.fillStyle='rgba(255,255,255,0.95)';
    ctx.beginPath(); ctx.arc(-eyX-eyR*0.1,eyY-eyR*0.16,eyR*0.22,0,PI2); ctx.fill();
    ctx.beginPath(); ctx.arc(eyX-eyR*0.1,eyY-eyR*0.16,eyR*0.22,0,PI2); ctx.fill();

    // Nose (small round)
    ctx.fillStyle='#cc6040';
    ctx.beginPath(); ctx.ellipse(0,-h*0.05,eyR*0.3,eyR*0.22,0,0,PI2); ctx.fill();
    // Mouth
    ctx.strokeStyle='#aa3822'; ctx.lineWidth=Math.max(0.8,eyR*0.35); ctx.lineCap='round';
    ctx.beginPath(); ctx.arc(0,-h*0.0,eyR*0.36,0.25,Math.PI-0.25); ctx.stroke();

    // Cheek blush
    ctx.fillStyle='rgba(255,120,80,0.28)';
    ctx.beginPath(); ctx.ellipse(-eyX-eyR*0.35,eyY+eyR*0.7,eyR*0.52,eyR*0.25,0,0,PI2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(eyX+eyR*0.35,eyY+eyR*0.7,eyR*0.52,eyR*0.25,0,0,PI2); ctx.fill();

    // Acorn sparkle accessory
    ctx.fillStyle='#ffe566';
    _drawStarShape(ctx,h*0.28,-h*0.76,4,Math.max(1.5,h*0.09),Math.max(0.8,h*0.04));
  }

  // 신화 등급 "펫" 렌더링 — 본캐와 같은 몸체를 1/3 크기로 그린다. 펫은 죽지 않는
  // 보조 유닛이라 무적 깜빡임 등 본캐 전용 연출은 없다.
  _drawPetSprite(ctx, cs, pet) {
    const isShield=this.shieldTimer>0;
    const t=this._time+pet.index*0.7;
    const h=(cs*0.7)/3;
    const bounce=Math.sin(t*3.5)*cs*0.03;
    ctx.save();
    ctx.translate(pet.px,pet.py+bounce);
    this._drawSquirrelBody(ctx,h,isShield,t);
    ctx.restore();
  }
}
