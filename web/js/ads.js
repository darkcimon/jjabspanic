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

// 무한정 커지면 밸런스가 깨지므로 상한을 둔다. 신화 등급에 펫(500만)·펫강화(최대
// 1억)·방패(최대 750만) 등 고가 소모처가 추가되면서 예전 상한(10만)은 그 경제
// 규모에 비해 너무 작아져(끝까지 시청해도 사실상 껌값) 광고를 볼 유인이 없었다.
// 100만으로 올려 "방패 한 단계는 광고 한 번, 펫은 대여섯 번" 정도로 체감되게 맞춘다.
const AD_REWARD_CAP = 1000000;

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

/**
 * 다음 광고 시청 보상 포인트를 계산한다.
 * 3,000 → 6,000 → 12,000 (2배씩) → 이후로는 1.5배씩 증가, 100 단위 절삭.
 * AD_REWARD_CAP에 도달한 뒤로는 더 늘지 않고 그 값으로 고정된다.
 * @param {number} lastReward  직전에 지급된 보상 포인트 (없으면 0)
 * @returns {number}
 */
export function computeNextAdReward(lastReward) {
  if (!lastReward || lastReward <= 0) return 3000;
  if (lastReward >= AD_REWARD_CAP) return AD_REWARD_CAP;
  if (lastReward === 3000) return 6000;
  if (lastReward === 6000) return 12000;
  return Math.min(Math.floor((lastReward * 1.5) / 100) * 100, AD_REWARD_CAP);
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
      if (!req.rewarded) req.onUnavailable && req.onUnavailable(event === 'closed' ? 'dismissed' : 'error');
      break;
  }
};

/**
 * 리워드 광고 시청을 요청한다.
 * @param {{ onReward: () => void, onUnavailable?: (reason: string) => void }} handlers
 */
export function watchRewardAd({ onReward, onUnavailable }) {
  if (!IS_NATIVE_APP) {
    onUnavailable && onUnavailable('disabled');
    return;
  }
  const requestId = `ad${Date.now()}_${++requestSeq}`;
  const req = { onReward, onUnavailable, rewarded: false, timeoutId: 0 };
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
