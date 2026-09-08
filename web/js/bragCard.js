/**
 * bragCard.js — "내 캐릭터 자랑하기" 공유 카드 렌더링 + 공유 URL 빌더.
 *
 * 메인 메뉴/스테이지 클리어 화면(app.js)과, 공유 링크를 받은 사람이 보는 정적
 * 페이지(share.html)가 이 모듈을 그대로 함께 쓴다 — 카드 모양이 두 군데서
 * 어긋나지 않도록 그리는 로직은 한 곳에만 둔다. 서버 DB 없이 통계값을 그대로
 * URL 쿼리스트링에 실어 stateless하게 공유하는 방식이라(buildShareUrl 참고),
 * 이 모듈은 순수 렌더링 함수만 제공하고 별도 상태를 갖지 않는다.
 */
import { drawSquirrelBody, drawAccessories, resolveDynamicColor } from './squirrel.js';
import { getAccessory } from './accessories.js';

const PI2 = Math.PI * 2;
export const CARD_W = 640;
export const CARD_H = 800;

// ── AI 생성 캐릭터 이미지 (web/character/, scripts/generateBragAssets.js로 생성) ──
// 기존엔 squirrel.js가 벡터로 그리던 캐릭터를, 이 카드에서만 AI 생성 정지 이미지로
// 바꿔치기한다(실제 게임 플레이 중 펫 렌더링은 squirrel.js 벡터 그대로 유지).
// 악세사리는 카테고리별 독립 조합(최대 24가지)이 가능하지만 AI 이미지는 조합당
// 한 장씩 만들 수 없어, 카테고리 우선순위상 가장 먼저 걸리는 "대표 이미지" 한 장만
// 초상화로 보여주고, 실제 착용 중인 항목 전부는 아래 배지 아이콘으로 따로 표시한다
// (일부 악세사리는 이미지에서 티가 잘 안 나는 경우도 있어, 배지가 최종 확인 역할을 함).
const CHAR_IMG_BASE = '/character/';
const ACCESSORY_PORTRAIT_PRIORITY = ['hat', 'accessory', 'outfit', 'shoes'];

const _imgCache = new Map();
function _loadImg(filename) {
  let img = _imgCache.get(filename);
  if (!img) {
    img = new Image();
    img.src = CHAR_IMG_BASE + filename;
    _imgCache.set(filename, img);
  }
  return img;
}
function _isReady(img) {
  return !!img && img.complete && img.naturalWidth > 0;
}

// equipped 상태에서 초상화로 보여줄 이미지 하나를 고른다 (없으면 미착용 이미지).
function _pickPortraitImage(equipped = {}) {
  for (const cat of ACCESSORY_PORTRAIT_PRIORITY) {
    const id = equipped[cat];
    if (id) return _loadImg(`${id}.png`);
  }
  return _loadImg('bare.png');
}

function _equippedList(equipped = {}) {
  return ['hat', 'outfit', 'accessory', 'shoes']
    .map(cat => equipped[cat])
    .filter(Boolean)
    .map(id => getAccessory(id))
    .filter(Boolean);
}

// 다람쥐 색 티어 — 최고 스테이지(bestStage) 기준. 펫강화 색상 시스템
// (game.js _getPetColor: 10단마다 색 변경, 200단 이상 무지개)과 같은 감각으로
// 맞췄고, 300단계(1회차 클리어)를 "무지개" 최상위 티어로 뒀다.
export function getBragTier(bestStage) {
  const s = bestStage || 0;
  if (s >= 300) return { furColor: 'rainbow' };
  if (s >= 10)  return { furColor: `hsl(${(Math.floor(s / 30) * 137) % 360}, 75%, 58%)` };
  return { furColor: null };
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// AI 캐릭터 이미지의 털색은 orange(hue≈30) 기준으로 그려졌다. 티어 색이 다른
// hue면 그 차이만큼 hue-rotate를 걸어 펫강화(game.js _getPetColor)와 같은
// "레벨 오를수록 색이 화려해진다" 감각을 이미지에도 입힌다.
const BASE_FUR_HUE = 30;
function _tierHueRotateDeg(tier, t) {
  if (!tier.furColor) return 0;
  if (tier.furColor === 'rainbow') return ((t * 200) % 360) - BASE_FUR_HUE;
  const m = /hsl\(([\d.]+)/.exec(tier.furColor);
  if (!m) return 0;
  return (parseFloat(m[1]) - BASE_FUR_HUE + 360) % 360;
}

// 사인 기반 의사난수 해시 (Math.random() 대신 — 같은 t엔 항상 같은 그림이
// 나와야 리액트/재요청 시에도 일관됨). 0~1 범위.
function _hash01(n) {
  const x = Math.sin(n * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}

// 폭죽 효과 — 슬롯 3개가 서로 다른 주기로 터지고 사라지길 반복.
function _drawFireworks(ctx, W, H, t) {
  const SLOTS = 3, PERIOD = 3.4, BURST_DUR = 1.1;
  for (let slot = 0; slot < SLOTS; slot++) {
    const offset = slot * (PERIOD / SLOTS);
    const local = (t + offset) % PERIOD;
    if (local > BURST_DUR) continue;
    const iter = Math.floor((t + offset) / PERIOD);
    const ox = W * (0.15 + _hash01(iter*3 + slot) * 0.7);
    const oy = H * (0.08 + _hash01(iter*7 + slot + 1) * 0.30);
    const hue = (iter * 67 + slot * 130) % 360;
    const progress = local / BURST_DUR;
    const radius = progress * 68;
    const alpha = Math.max(0, 1 - progress);
    const rays = 10;
    for (let r = 0; r < rays; r++) {
      const a = (r / rays) * PI2;
      const x2 = ox + Math.cos(a)*radius, y2 = oy + Math.sin(a)*radius*0.9;
      ctx.strokeStyle = `hsla(${hue + r*6},90%,65%,${alpha})`;
      ctx.lineWidth = Math.max(1, 3*(1-progress));
      ctx.beginPath(); ctx.moveTo(ox,oy); ctx.lineTo(x2,y2); ctx.stroke();
      ctx.fillStyle = `hsla(${hue + r*6},95%,78%,${alpha})`;
      ctx.beginPath(); ctx.arc(x2, y2, Math.max(0.6, 2*(1-progress)), 0, PI2); ctx.fill();
    }
  }
}

/**
 * ctx: CARD_W×CARD_H 캔버스의 2d context
 * stats: { bestStage, totalScore, highFillClearCount }
 * t: 애니메이션 시간(초, performance.now()/1000 등) — 무지개 티어 색 순환에 쓰임.
 *    정적 이미지로 내보낼 땐 아무 고정값이나 넘기면 그 순간 색으로 고정된다.
 * labels: { title, level, points, highFillClears, tagline, appName } — 호출부가
 *    i18n으로 채워 넘긴다 (이 모듈 자체는 다국어 텍스트를 모름).
 */
export function drawBragCard(ctx, stats, t, labels) {
  const W = CARD_W, H = CARD_H;
  ctx.clearRect(0, 0, W, H);

  // Background
  const bg = ctx.createRadialGradient(W/2, H*0.32, 20, W/2, H*0.4, H*0.9);
  bg.addColorStop(0, '#2d1b4e');
  bg.addColorStop(1, '#0d0720');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  // Decorative sparkles (위치는 고정 시드 기반이라 프레임마다 안 바뀌지만, 밝기는
  // t에 따라 반짝이도록 twinkle을 곱한다)
  for (let i = 0; i < 26; i++) {
    const sx = (i * 137.5) % W;
    const sy = (i * 71.3) % H;
    const twinkle = 0.35 + 0.65 * Math.max(0, Math.sin(t*2.2 + i*1.35));
    ctx.fillStyle = `rgba(255,255,255,${(0.05 + 0.10*((i*53)%7)/7) * twinkle})`;
    ctx.beginPath(); ctx.arc(sx, sy, 1.2 + (i%3), 0, PI2); ctx.fill();
  }

  // Firework bursts — 배경 위에 주기적으로 터지는 폭죽 (결정론적 의사난수라 매번
  // 같은 t에는 같은 모양이 나옴 — Math.random() 대신 사인 기반 해시 사용)
  _drawFireworks(ctx, W, H, t);

  // Title
  ctx.textAlign = 'center';
  ctx.fillStyle = '#f0e6ff';
  ctx.font = '700 30px "Segoe UI", sans-serif';
  ctx.fillText(labels.title, W/2, 58);

  // Card panel
  const panelX = 40, panelY = 84, panelW = W-80, panelH = H-84-136;
  ctx.fillStyle = 'rgba(34,21,69,0.78)';
  roundRect(ctx, panelX, panelY, panelW, panelH, 28);
  ctx.fill();
  ctx.strokeStyle = 'rgba(200,80,192,0.55)'; ctx.lineWidth = 2;
  roundRect(ctx, panelX, panelY, panelW, panelH, 28); ctx.stroke();

  // Character — 악세사리 조합 중 우선순위상 가장 앞선 것 하나를 대표 이미지로
  // 보여준다 (이미지 로딩 전이거나 파일이 없으면 예전 벡터 그림으로 폴백).
  const tier = getBragTier(stats.bestStage);
  const furColor = resolveDynamicColor(tier.furColor, t);
  const headCx = W/2, headCy = panelY + panelH*0.33;
  const h = panelH * 0.40;
  const equipped = stats.equippedAccessories || {};
  const portraitImg = _pickPortraitImage(equipped);

  if (_isReady(portraitImg)) {
    const size = h * 1.3;
    // 캐릭터 뒤 은은한 오라 — 티어 색이 있으면 그 색, 없으면 기본 웜톤
    const auraColor = furColor ? furColor.replace('hsl(','hsla(').replace(')',',0.4)') : 'rgba(220,140,50,0.4)';
    const aura = ctx.createRadialGradient(headCx, headCy, size*0.25, headCx, headCy, size*0.85);
    aura.addColorStop(0, auraColor); aura.addColorStop(1, 'transparent');
    ctx.beginPath(); ctx.arc(headCx, headCy, size*0.85, 0, PI2); ctx.fillStyle = aura; ctx.fill();

    ctx.save();
    roundRect(ctx, headCx-size/2, headCy-size/2, size, size, size*0.14);
    ctx.clip();
    // 레벨 티어 색(펫강화와 같은 감각)을 AI 이미지에도 반영 — hue-rotate로 털색만 슬쩍 틀어준다.
    ctx.filter = `hue-rotate(${_tierHueRotateDeg(tier, t)}deg)`;
    ctx.drawImage(portraitImg, headCx-size/2, headCy-size/2, size, size);
    ctx.filter = 'none';
    ctx.restore();
    ctx.strokeStyle = 'rgba(255,255,255,0.25)'; ctx.lineWidth = 2;
    roundRect(ctx, headCx-size/2, headCy-size/2, size, size, size*0.14); ctx.stroke();
  } else {
    // 폴백: 벡터 다람쥐 (이미지가 아직 안 떴거나 로드 실패)
    ctx.save();
    ctx.translate(headCx, headCy);
    drawSquirrelBody(ctx, h, false, t, furColor);
    drawAccessories(ctx, h, equipped);
    ctx.restore();
  }
  // Equipped badges — 초상화 한 장으로는 다 못 담는 조합(최대 4종 동시 착용)을
  // 아이콘으로 보완 표시. accessories.js의 emoji 아이콘을 그대로 쓴다.
  const equippedList = _equippedList(equipped);
  if (equippedList.length > 0) {
    const badgeY = panelY + panelH*0.615;
    const gap = 44;
    const startX = W/2 - ((equippedList.length-1) * gap)/2;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    equippedList.forEach((acc, i) => {
      const bx = startX + i*gap;
      ctx.fillStyle = 'rgba(255,255,255,0.10)';
      ctx.beginPath(); ctx.arc(bx, badgeY, 18, 0, PI2); ctx.fill();
      ctx.font = '20px system-ui, sans-serif';
      ctx.fillText(acc.icon, bx, badgeY+1);
    });
    ctx.textBaseline = 'alphabetic';
  }

  // Stats rows
  const statY0 = panelY + panelH*0.70;
  const rows = [
    [labels.level, `Lv.${stats.bestStage || 0}`],
    [labels.points, `${(stats.totalScore || 0).toLocaleString()}pt`],
    [labels.highFillClears, `${stats.highFillClearCount || 0}${labels.timesSuffix || ''}`],
  ];
  rows.forEach(([label, value], i) => {
    const y = statY0 + i*48;
    ctx.textAlign = 'left';
    ctx.fillStyle = 'rgba(240,230,255,0.72)';
    ctx.font = '600 19px "Segoe UI", sans-serif';
    ctx.fillText(label, panelX+30, y);
    ctx.textAlign = 'right';
    ctx.fillStyle = '#ffd76e';
    ctx.font = '800 22px "Segoe UI", sans-serif';
    ctx.fillText(value, panelX+panelW-30, y);
  });

  // Footer tagline + app name
  ctx.textAlign = 'center';
  ctx.fillStyle = 'rgba(240,230,255,0.85)';
  ctx.font = '600 17px "Segoe UI", sans-serif';
  ctx.fillText(labels.tagline, W/2, H-72);
  ctx.fillStyle = '#c850c0';
  ctx.font = '800 26px "Segoe UI", sans-serif';
  ctx.fillText(labels.appName, W/2, H-32);
}

// 공유 URL 빌더 — 서버에 DB를 두지 않고, 통계값을 그대로 쿼리스트링에 실어
// stateless하게 공유 페이지(서버의 GET /share, web/share.html)에서 같은 카드를
// 다시 그릴 수 있게 한다.
export function buildShareUrl(origin, stats) {
  const params = new URLSearchParams({
    stage:  String(stats.bestStage || 0),
    score:  String(stats.totalScore || 0),
    clears: String(stats.highFillClearCount || 0),
  });
  // 착용 중인 악세사리도 함께 실어 보낸다 — 공유받은 사람도 꾸민 모습 그대로 본다.
  const eq = stats.equippedAccessories || {};
  for (const category of ['hat', 'outfit', 'accessory', 'shoes']) {
    if (eq[category]) params.set(category, eq[category]);
  }
  return `${origin}/share?${params.toString()}`;
}

export function statsFromSearchParams(searchParams) {
  return {
    bestStage:          parseInt(searchParams.get('stage'), 10) || 0,
    totalScore:         parseInt(searchParams.get('score'), 10) || 0,
    highFillClearCount: parseInt(searchParams.get('clears'), 10) || 0,
    equippedAccessories: {
      hat:       searchParams.get('hat')       || null,
      outfit:    searchParams.get('outfit')    || null,
      accessory: searchParams.get('accessory') || null,
      shoes:     searchParams.get('shoes')     || null,
    },
  };
}
