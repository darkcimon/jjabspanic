/**
 * bragCard.js — "내 캐릭터 자랑하기" 공유 카드 렌더링 + 공유 URL 빌더.
 *
 * 메인 메뉴/스테이지 클리어 화면(app.js)과, 공유 링크를 받은 사람이 보는 정적
 * 페이지(share.html)가 이 모듈을 그대로 함께 쓴다 — 카드 모양이 두 군데서
 * 어긋나지 않도록 그리는 로직은 한 곳에만 둔다. 서버 DB 없이 통계값을 그대로
 * URL 쿼리스트링에 실어 stateless하게 공유하는 방식이라(buildShareUrl 참고),
 * 이 모듈은 순수 렌더링 함수만 제공하고 별도 상태를 갖지 않는다.
 */
import { drawSquirrelBody, drawLaurelWreath, drawAccessories, resolveDynamicColor } from './squirrel.js';

const PI2 = Math.PI * 2;
export const CARD_W = 640;
export const CARD_H = 800;

// 다람쥐 색·월계관 티어 — 최고 스테이지(bestStage) 기준. 펫강화 색상 시스템
// (game.js _getPetColor: 10단마다 색 변경, 200단 이상 무지개)과 같은 감각으로
// 맞췄고, 300단계(1회차 클리어)를 "무지개 + 월계관" 최상위 티어로 뒀다.
export function getBragTier(bestStage) {
  const s = bestStage || 0;
  if (s >= 300) return { furColor: 'rainbow', wreath: true };
  if (s >= 10)  return { furColor: `hsl(${(Math.floor(s / 30) * 137) % 360}, 75%, 58%)`, wreath: s >= 100 };
  return { furColor: null, wreath: false };
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

  // Decorative sparkles (고정 시드 기반 — 프레임마다 위치가 안 바뀌게 인덱스로만 계산)
  for (let i = 0; i < 26; i++) {
    const sx = (i * 137.5) % W;
    const sy = (i * 71.3) % H;
    ctx.fillStyle = `rgba(255,255,255,${0.05 + 0.10*((i*53)%7)/7})`;
    ctx.beginPath(); ctx.arc(sx, sy, 1.2 + (i%3), 0, PI2); ctx.fill();
  }

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

  // Squirrel
  const tier = getBragTier(stats.bestStage);
  const furColor = resolveDynamicColor(tier.furColor, t);
  const headCx = W/2, headCy = panelY + panelH*0.33;
  const h = panelH * 0.40;
  ctx.save();
  ctx.translate(headCx, headCy);
  drawSquirrelBody(ctx, h, false, t, furColor);
  if (stats.equippedAccessories) drawAccessories(ctx, h, stats.equippedAccessories);
  ctx.restore();
  if (tier.wreath) drawLaurelWreath(ctx, headCx, headCy - h*0.05, h*0.62, '#ffd700');

  // Stats rows
  const statY0 = panelY + panelH*0.64;
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
