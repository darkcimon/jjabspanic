/**
 * ads.js — 구글 애드센스 리워드 광고(Ad Placement API) 연동
 *
 * 사전 준비 (필수):
 *  1. web/index.html <head>의 `ca-pub-XXXXXXXXXXXXXXXX`를 실제 애드센스
 *     게시자 ID로 교체한다.
 *  2. 애드센스 계정에서 사이트를 "H5 게임 광고(Ad Placement API)"용으로
 *     승인받아야 실제 보상형 광고가 노출된다.
 *  3. index.html 스크립트 태그의 `data-adbreak-test="on"`은 승인 전
 *     테스트 광고를 보여주기 위한 속성이다 — 실제 서비스 배포 전 반드시 제거할 것.
 *
 * 참고: https://developers.google.com/ad-placement
 *
 * window.adBreak / window.adConfig는 index.html에서 애드센스 스크립트와
 * 함께 미리 선언해둔 전역 함수이므로 이 모듈은 그것을 호출하기만 한다.
 */

const AD_NAME = 'gp_point_reward';
// 무한정 커지면 밸런스가 깨지므로, 10만 포인트에 도달하면 그 이후로는 고정 지급.
const AD_REWARD_CAP = 100000;

// ── 보관함 팩 해금: 광고 누적 시청 횟수 기준 ──────────────────
// "누적 시청"은 adViewed(끝까지 봐서 보상이 실제로 지급된 경우)만 센다.
// 중간에 닫아 보상을 못 받은 시청(adDismissed)은 카운트하지 않는다.
export const AD_PACK_THRESHOLDS = { pack_a: 100, pack_b: 200, pack_c: 300 };

/**
 * 누적 광고 시청 횟수(성공 지급 기준)로 팩이 해금됐는지 확인한다.
 * @param {string} packId  'pack_a' | 'pack_b' | 'pack_c'
 * @param {number} adWatchCount  누적 성공 시청 횟수
 * @returns {boolean}
 */
export function isPackUnlockedByAds(packId, adWatchCount) {
  const threshold = AD_PACK_THRESHOLDS[packId];
  return threshold != null && (adWatchCount || 0) >= threshold;
}

/**
 * 다음 광고 시청 보상 포인트를 계산한다.
 * 3,000 → 6,000 → 12,000 (2배씩) → 이후로는 1.5배씩 증가, 100 단위 절삭.
 * 10만 포인트에 도달한 뒤로는 더 늘지 않고 10만으로 고정된다.
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

/**
 * 리워드 광고 시청을 요청한다.
 * @param {{ onReward: () => void, onUnavailable?: (reason: string) => void }} handlers
 */
export function watchRewardAd({ onReward, onUnavailable }) {
  if (typeof window.adBreak !== 'function') {
    onUnavailable && onUnavailable('sdk-not-loaded');
    return;
  }

  let rewarded = false;
  try {
    window.adBreak({
      type: 'reward',
      name: AD_NAME,
      beforeReward: (showAdFn) => { showAdFn(); },
      adViewed: () => { rewarded = true; onReward(); },
      adDismissed: () => { /* 끝까지 시청하지 않고 닫음 — 보상 없음 */ },
      adBreakDone: (placementInfo) => {
        if (!rewarded) onUnavailable && onUnavailable(placementInfo && placementInfo.breakStatus);
      },
    });
  } catch (e) {
    console.warn('[ads] adBreak failed:', e);
    onUnavailable && onUnavailable('error');
  }
}
