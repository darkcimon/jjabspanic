/**
 * squirrel.js — 게임 본캐/펫이 공유하는 "귀여운 다람쥐 캐릭터" 그림 그리기.
 *
 * game.js의 Game 클래스 인스턴스 메서드였던 _drawSquirrelBody를 여기로 옮겨
 * 독립 함수로 만들었다 (내부에서 this를 전혀 쓰지 않아 그대로 뽑아낼 수 있었음).
 * 이렇게 분리해두면 실제 게임 인스턴스가 없는 곳(메인 메뉴의 "내 캐릭터 자랑하기"
 * 카드, 공유 링크를 받은 사람이 보는 정적 페이지)에서도 같은 캐릭터를 그릴 수 있다.
 * game.js는 이 모듈을 import해서 그대로 위임한다 — 그림 자체는 한 곳에만 존재.
 */

const PI2 = Math.PI * 2;

// ── Star shape helper ─────────────────────────────────────────
export function drawStarShape(ctx, cx, cy, pts, outer, inner) {
  ctx.beginPath();
  for (let i = 0; i < pts * 2; i++) {
    const r = i % 2 === 0 ? outer : inner;
    const a = (i / (pts * 2)) * PI2 - Math.PI / 2;
    if (i === 0) ctx.moveTo(cx + Math.cos(a)*r, cy + Math.sin(a)*r);
    else         ctx.lineTo(cx + Math.cos(a)*r, cy + Math.sin(a)*r);
  }
  ctx.closePath(); ctx.fill();
}

// 다람쥐 캐릭터 몸체 그리기 — 호출 전 ctx가 이미 캐릭터 중심으로
// translate(+rotate/scale)돼 있다고 가정하며, 이 함수 안에서는 save/restore를
// 하지 않는다(호출부가 관리).
// furOverride: 색을 갈아입히는 색상 문자열 (펫강화 10단 이상 — _getPetColor 참고,
// 또는 자랑하기 카드의 스테이지 티어 색) — 기본 호출에서는 null.
export function drawSquirrelBody(ctx, h, isShield, t, furOverride=null) {
  // Shield aura
  if (isShield) {
    const hue=(t*120)%360;
    const aura=ctx.createRadialGradient(0,0,h*0.5,0,0,h*2);
    aura.addColorStop(0,`hsla(${hue},100%,70%,0.4)`);
    aura.addColorStop(1,'transparent');
    ctx.beginPath(); ctx.arc(0,0,h*2,0,PI2); ctx.fillStyle=aura; ctx.fill();
  } else if (furOverride) {
    // 색이 바뀌었음을 강조하는 은은한 색상 오라 — "뭔가 더 강해졌다"는 느낌을
    // 몸체 색 자체보다 한눈에 먼저 알아차리게 해준다.
    const aura=ctx.createRadialGradient(0,0,h*0.5,0,0,h*1.8);
    aura.addColorStop(0,furOverride.replace('hsl(','hsla(').replace(')',',0.35)'));
    aura.addColorStop(1,'transparent');
    ctx.beginPath(); ctx.arc(0,0,h*1.8,0,PI2); ctx.fillStyle=aura; ctx.fill();
  }

  const furColor=isShield?`hsl(${(t*120)%360},100%,72%)`:(furOverride||'#c07030');
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
  drawStarShape(ctx,h*0.28,-h*0.76,4,Math.max(1.5,h*0.09),Math.max(0.8,h*0.04));
}

// furOverride 색상 키를 실제 CSS 색으로 풀어준다. 'rainbow' 센티널은 시간에 따라
// 색이 도는 것처럼 매 프레임 다른 hue를 반환한다 (펫강화 최종형, 자랑하기 카드의
// 300단계 이상 티어가 함께 쓴다).
export function resolveDynamicColor(colorKey, t) {
  if (!colorKey) return null;
  if (colorKey === 'rainbow') return `hsl(${(t * 200) % 360}, 90%, 60%)`;
  return colorKey;
}

// ── 악세사리(코스메틱) 렌더링 ────────────────────────────────
// drawSquirrelBody 호출 직후, 같은 좌표계(캐릭터 중심 translate 상태)에서
// 이어서 그린다. equipped: { hat, outfit, accessory, shoes } — 각각 accessories.js의
// 아이템 id 또는 null. 그림 코드를 여기 id로 직접 분기해두면 아이템을 추가할 때
// accessories.js(카탈로그)와 이 파일(모양) 두 곳만 건드리면 된다.
export function drawAccessories(ctx, h, equipped = {}) {
  if (equipped.outfit)    _drawOutfit(ctx, h, equipped.outfit);
  if (equipped.shoes)     _drawShoes(ctx, h, equipped.shoes);
  if (equipped.accessory) _drawFaceAccessory(ctx, h, equipped.accessory);
  if (equipped.hat)       _drawHat(ctx, h, equipped.hat);
}

function _drawHat(ctx, h, id) {
  ctx.save();
  if (id === 'hat_bow') {
    ctx.translate(h*0.2, -h*0.55);
    ctx.fillStyle = '#ff5fa2';
    ctx.beginPath(); ctx.moveTo(0,0); ctx.lineTo(-h*0.22,-h*0.16); ctx.lineTo(-h*0.22,h*0.16); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(0,0); ctx.lineTo(h*0.22,-h*0.16); ctx.lineTo(h*0.22,h*0.16); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#e0356b';
    ctx.beginPath(); ctx.arc(0,0,h*0.08,0,PI2); ctx.fill();
  } else if (id === 'hat_crown') {
    ctx.translate(0, -h*0.6);
    ctx.fillStyle = '#ffd700';
    ctx.beginPath();
    ctx.moveTo(-h*0.32,h*0.1); ctx.lineTo(-h*0.32,-h*0.04); ctx.lineTo(-h*0.16,h*0.06);
    ctx.lineTo(0,-h*0.22); ctx.lineTo(h*0.16,h*0.06); ctx.lineTo(h*0.32,-h*0.04); ctx.lineTo(h*0.32,h*0.1);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#b8860b'; ctx.lineWidth = Math.max(1,h*0.02); ctx.stroke();
    ctx.fillStyle = '#e0356b';
    ctx.beginPath(); ctx.arc(0,-h*0.12,h*0.055,0,PI2); ctx.fill();
    ctx.fillStyle = '#4fc3f7';
    ctx.beginPath(); ctx.arc(-h*0.2,h*0.0,h*0.04,0,PI2); ctx.fill();
    ctx.beginPath(); ctx.arc(h*0.2,h*0.0,h*0.04,0,PI2); ctx.fill();
  }
  ctx.restore();
}

function _drawOutfit(ctx, h, id) {
  ctx.save();
  if (id === 'outfit_scarf') {
    ctx.translate(0, h*0.0);
    ctx.strokeStyle = '#e0356b'; ctx.lineWidth = h*0.14; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.arc(0, h*0.02, h*0.3, Math.PI*0.15, Math.PI*0.85); ctx.stroke();
    ctx.fillStyle = '#e0356b';
    ctx.beginPath(); ctx.ellipse(h*0.16, h*0.32, h*0.07, h*0.16, -0.3, 0, PI2); ctx.fill();
  } else if (id === 'outfit_cape') {
    ctx.translate(0, h*0.05);
    const grd = ctx.createLinearGradient(0,-h*0.1,0,h*0.7);
    grd.addColorStop(0, '#6a3de8'); grd.addColorStop(1, '#2d1b6e');
    ctx.fillStyle = grd;
    ctx.beginPath();
    ctx.moveTo(-h*0.28,-h*0.1);
    ctx.quadraticCurveTo(-h*0.55,h*0.35,-h*0.3,h*0.75);
    ctx.lineTo(h*0.3,h*0.75);
    ctx.quadraticCurveTo(h*0.55,h*0.35,h*0.28,-h*0.1);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#ffd700';
    ctx.beginPath(); ctx.arc(0,-h*0.08,h*0.06,0,PI2); ctx.fill();
  }
  ctx.restore();
}

function _drawFaceAccessory(ctx, h, id) {
  ctx.save();
  if (id === 'acc_sunglasses') {
    ctx.translate(0, -h*0.22);
    ctx.fillStyle = 'rgba(20,20,30,0.88)';
    ctx.beginPath(); ctx.ellipse(-h*0.13,0,h*0.13,h*0.09,0,0,PI2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(h*0.13,0,h*0.13,h*0.09,0,0,PI2); ctx.fill();
    ctx.strokeStyle = '#222'; ctx.lineWidth = Math.max(1,h*0.02);
    ctx.beginPath(); ctx.moveTo(-h*0.02,0); ctx.lineTo(h*0.02,0); ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.beginPath(); ctx.ellipse(-h*0.17,-h*0.03,h*0.04,h*0.025,0,0,PI2); ctx.fill();
  } else if (id === 'acc_wings') {
    ctx.translate(0, h*0.1);
    ctx.fillStyle = 'rgba(200,230,255,0.55)';
    ctx.strokeStyle = 'rgba(150,200,255,0.8)'; ctx.lineWidth = Math.max(1,h*0.015);
    for (const side of [-1, 1]) {
      ctx.save(); ctx.scale(side, 1);
      ctx.beginPath();
      ctx.moveTo(h*0.15, 0);
      ctx.quadraticCurveTo(h*0.55, -h*0.35, h*0.62, h*0.05);
      ctx.quadraticCurveTo(h*0.45, h*0.28, h*0.15, h*0.15);
      ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.restore();
    }
  }
  ctx.restore();
}

function _drawShoes(ctx, h, id) {
  ctx.save();
  ctx.translate(0, h*0.42);
  if (id === 'shoes_sneakers') {
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.ellipse(-h*0.14,0,h*0.13,h*0.08,0,0,PI2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(h*0.14,0,h*0.13,h*0.08,0,0,PI2); ctx.fill();
    ctx.fillStyle = '#ff5fa2';
    ctx.beginPath(); ctx.ellipse(-h*0.14,h*0.02,h*0.08,h*0.03,0,0,PI2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(h*0.14,h*0.02,h*0.08,h*0.03,0,0,PI2); ctx.fill();
  } else if (id === 'shoes_rocket') {
    ctx.fillStyle = '#c0c8d4';
    ctx.beginPath(); ctx.ellipse(-h*0.15,0,h*0.11,h*0.09,0,0,PI2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(h*0.15,0,h*0.11,h*0.09,0,0,PI2); ctx.fill();
    for (const side of [-1, 1]) {
      const flame = ctx.createRadialGradient(side*h*0.15,h*0.16,0,side*h*0.15,h*0.16,h*0.12);
      flame.addColorStop(0,'#fff176'); flame.addColorStop(0.5,'#ff9800'); flame.addColorStop(1,'transparent');
      ctx.fillStyle = flame;
      ctx.beginPath(); ctx.ellipse(side*h*0.15,h*0.16,h*0.09,h*0.14,0,0,PI2); ctx.fill();
    }
  }
  ctx.restore();
}
