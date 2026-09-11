/**
 * ads.js — 구글 애드센스 리워드 광고(Ad Placement API) 연동
 *
 * 애드센스 심사를 통과해 테스트 모드(`data-adbreak-test="on"`)를 해제했다.
 * 이제 index.html의 스크립트 태그가 실제 보상형 광고를 요청한다.
 *
 * 참고: https://developers.google.com/ad-placement
 *
 * window.adBreak / window.adConfig는 index.html에서 애드센스 스크립트와
 * 함께 미리 선언해둔 전역 함수이므로 이 모듈은 그것을 호출하기만 한다.
 */

const AD_NAME = 'gp_point_reward';
// 무한정 커지면 밸런스가 깨지므로 상한을 둔다. 신화 등급에 펫(500만)·펫강화(최대
// 1억)·방패(최대 750만) 등 고가 소모처가 추가되면서 예전 상한(10만)은 그 경제
// 규모에 비해 너무 작아져(끝까지 시청해도 사실상 껌값) 광고를 볼 유인이 없었다.
// 100만으로 올려 "방패 한 단계는 광고 한 번, 펫은 대여섯 번" 정도로 체감되게 맞춘다.
const AD_REWARD_CAP = 1000000;

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
