/**
 * ads.js — 리워드 광고 연동 (Android 앱 전용, Google AdMob)
 *
 * 앱(WebView)이 window.KunnannaAds 브리지를 주입하고, 광고 결과는
 * window.__kunnannaAdEvent(requestId, event)로 돌려준다.
 *   event: shown | rewarded | closed | failed
 * (네이티브 코드: app/src/main/java/com/jjabspanic/app/MainActivity.java)
 *
 * 웹 브라우저에서는 광고가 없다 — 리워드 광고 버튼(메인/클리어/액세서리)을 모두
 * 숨기고, 광고 시청 조건(액세서리 구매 등)은 면제한다.
 */

// Android 앱 WebView 안에서 실행 중인지 — addJavascriptInterface로 주입된 객체는
// 페이지 스크립트보다 먼저 존재하므로 모듈 로드 시점에 판별해도 된다.
const nativeAds = window.KunnannaAds;
export const IS_NATIVE_APP = !!(nativeAds && typeof nativeAds.showRewarded === 'function');
export const REWARD_ADS_ENABLED = IS_NATIVE_APP;

// ── 보관함 팩 해금: 광고 누적 시청 횟수 기준 ──────────────────
// "누적 시청"은 rewarded 이벤트(끝까지 봐서 보상이 실제로 지급된 경우)만 센다.
// 중간에 닫아 보상을 못 받은 시청(closed만 온 경우)은 카운트하지 않는다.
export const AD_PACK_THRESHOLDS = { pack_a: 100, pack_b: 200, pack_c: 300 };

/**
 * 누적 광고 시청 횟수(성공 지급 기준)로 팩이 해금됐는지 확인한다.
 * @param {string} packId  'pack_a' | 'pack_b' | 'pack_c'
 * @param {number} adWatchCount  누적 성공 시청 횟수
 * @returns {boolean}
 */
export function isPackUnlockedByAds(packId, adWatchCount) {
  const threshold = AD_PACK_THRESHOLDS[packId];
  return REWARD_ADS_ENABLED && threshold != null && (adWatchCount || 0) >= threshold;
}

// ── 광고 시청 보상 포인트 ─────────────────────────────
// 예전엔 시청할 때마다 3,000→6,000→12,000→×1.5씩 계속 커져(초기화 없음) 14번째부터
// 매번 100만pt — 신화 아이템 하나를 광고 한 번에 살 수 있어 밸런스가 무너졌다.
// 이제는 현재 스테이지의 클리어 보너스(game.js _onStageClear의 stageBonus, 10단계
// 주기 평균)의 AD_REWARD_RATIO배를 준다 — "광고 30초 ≈ 스테이지 절반" 정도의 체감.
const AD_REWARD_RATIO = 0.5;
const AD_REWARD_MIN = 3000;

/**
 * 현재 스테이지 기준 광고 시청 보상 포인트 (100 단위 절삭).
 * @param {number} stage  현재 도전 중인 스테이지
 * @returns {number}
 */
export function computeAdReward(stage) {
  const s = Math.max(1, stage || 1);
  const bonusMult = (1 + Math.floor(s / 10) * 0.3) * 2;
  const cycle = Math.floor((s - 1) / 10);
  const avgStageBonus = (5.5 * 200 + cycle * 5000) * bonusMult;
  return Math.max(AD_REWARD_MIN, Math.floor((avgStageBonus * AD_REWARD_RATIO) / 100) * 100);
}

// 네이티브는 광고 로드를 최대 10초 기다린 뒤 스스로 'failed'를 보낸다. 이 값은
// 브리지 응답이 아예 끊겼을 때를 대비한 안전장치라 그보다 길게 잡는다.
// 광고가 화면에 뜨면('shown') 타임아웃을 해제한다 — 30초짜리 광고 시청 중에
// 타임아웃이 먼저 터져 보상을 못 받는 일이 없도록.
const AD_LOAD_TIMEOUT_MS = 20000;
const pendingRequests = new Map();
let requestSeq = 0;

window.__kunnannaAdEvent = (requestId, event) => {
  const req = pendingRequests.get(requestId);
  if (!req) return;
  switch (event) {
    case 'shown':
      clearTimeout(req.timeoutId);
      break;
    case 'rewarded':
      req.rewarded = true;
      clearTimeout(req.timeoutId);
      req.onReward();
      break;
    case 'closed':
    case 'failed':
      clearTimeout(req.timeoutId);
      pendingRequests.delete(requestId);
      if (req.rewarded) req.onClosed && req.onClosed();
      else req.onUnavailable && req.onUnavailable(event === 'closed' ? 'dismissed' : 'error');
      break;
  }
};

/**
 * 리워드 광고 시청을 요청한다.
 * - onReward: 보상 확정 즉시 호출 — 여기서 보상을 지급·저장한다. 이 시점엔 광고가 아직
 *   화면을 덮고 있으므로(보상은 영상이 끝날 때 오고, 유저는 엔드카드를 보거나 광고를
 *   클릭해 스토어에 가 있을 수 있음) 토스트·화면 전환은 여기서 하면 보이지 않는다.
 * - onClosed: 보상을 받은 광고가 닫혀 게임 화면으로 돌아온 뒤 호출 — 토스트·화면 전환용.
 * - onUnavailable: 광고를 못 띄웠거나 보상 전에 닫힌 경우.
 * @param {{ onReward: () => void, onClosed?: () => void, onUnavailable?: (reason: string) => void }} handlers
 */
export function watchRewardAd({ onReward, onClosed, onUnavailable }) {
  if (!IS_NATIVE_APP) {
    onUnavailable && onUnavailable('disabled');
    return;
  }
  const requestId = `ad${Date.now()}_${++requestSeq}`;
  const req = { onReward, onClosed, onUnavailable, rewarded: false, timeoutId: 0 };
  req.timeoutId = setTimeout(() => {
    if (!pendingRequests.delete(requestId)) return;
    console.warn('[ads] rewarded ad timed out');
    onUnavailable && onUnavailable('timeout');
  }, AD_LOAD_TIMEOUT_MS);
  pendingRequests.set(requestId, req);
  try {
    nativeAds.showRewarded(requestId);
  } catch (e) {
    clearTimeout(req.timeoutId);
    pendingRequests.delete(requestId);
    console.warn('[ads] showRewarded failed:', e);
    onUnavailable && onUnavailable('error');
  }
}

/**
 * 앱(WebView)에는 navigator.share가 없으므로 네이티브 공유 시트를 쓴다.
 * @returns {boolean} 네이티브 공유를 호출했으면 true
 */
export function nativeShare({ title, text, url }) {
  if (!IS_NATIVE_APP || typeof nativeAds.share !== 'function') return false;
  nativeAds.share(title || '', text || '', url || '');
  return true;
}
