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

/**
 * 다음 광고 시청 보상 포인트를 계산한다.
 * 3,000 → 6,000 → 12,000 (2배씩) → 이후로는 1.5배씩 증가, 100 단위 절삭.
 * @param {number} lastReward  직전에 지급된 보상 포인트 (없으면 0)
 * @returns {number}
 */
export function computeNextAdReward(lastReward) {
  if (!lastReward || lastReward <= 0) return 3000;
  if (lastReward === 3000) return 6000;
  if (lastReward === 6000) return 12000;
  return Math.floor((lastReward * 1.5) / 100) * 100;
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
