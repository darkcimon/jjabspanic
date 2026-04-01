// ── Ad module ─────────────────────────────────────────────────
// 보상형 광고 래퍼. 실제 광고 SDK(AdSense/AdFit) 연동 전
// 15초 카운트다운 오버레이로 시청 흐름을 시뮬레이션한다.

const AD_STORE_KEY = 'galspanic_ad';

export const AD_DAILY_LIMIT = { continue: Infinity, points: Infinity, preview: 5 };

// ── 구독 여부 (추후 IAPManager 연동 시 교체) ─────────────────
function isSubscriber() {
  return false;
}

// ── 광고 차단기 감지 (추후 실 감지 로직으로 교체) ────────────
export function isAdAvailable() {
  return true;
}

// ── 일일 횟수 저장 ────────────────────────────────────────────
function _todayKey() {
  return new Date().toISOString().slice(0, 10); // 'YYYY-MM-DD'
}

function _loadAdData() {
  try {
    const raw = JSON.parse(localStorage.getItem(AD_STORE_KEY));
    if (raw) {
      // totalViews는 날짜와 무관하게 영구 보존
      const totalViews = raw.totalViews || 0;
      if (raw.date === _todayKey()) return { ...raw, totalViews };
      // 날짜가 바뀌면 일일 횟수만 초기화, totalViews 유지
      return { date: _todayKey(), counts: { continue: 0, points: 0, preview: 0 }, totalViews };
    }
  } catch { /* ignore */ }
  return { date: _todayKey(), counts: { continue: 0, points: 0, preview: 0 }, totalViews: 0 };
}

function _saveAdData(data) {
  localStorage.setItem(AD_STORE_KEY, JSON.stringify(data));
}

export function getAdCount(rewardType) {
  return _loadAdData().counts[rewardType] ?? 0;
}

export function getTotalAdViews() {
  return _loadAdData().totalViews || 0;
}

// ── 광고 시청 누적 수에 따른 보상 포인트 ─────────────────────
// 많이 볼수록 보상이 올라가 재시청을 유도한다.
export function getAdRewardPoints() {
  const v = getTotalAdViews();
  if (v <  5) return  3000;
  if (v < 15) return  5000;
  if (v < 30) return  8000;
  if (v < 60) return 12000;
  if (v < 100) return 18000;
  return 30000;
}

function _incrementAdCount(rewardType) {
  const data = _loadAdData();
  data.counts[rewardType] = (data.counts[rewardType] ?? 0) + 1;
  // 'points' 타입 시청만 totalViews 증가 (보상형 광고 카운트)
  if (rewardType === 'points') data.totalViews = (data.totalViews || 0) + 1;
  _saveAdData(data);
}

// ── 오버레이 DOM ──────────────────────────────────────────────
let _overlayTimer = null;

function _getOverlay() {
  return document.getElementById('ad-overlay');
}

function _showOverlay(rewardType, onDone, onCancel, rewardLabel) {
  const overlay = _getOverlay();
  if (!overlay) { onCancel(); return; }

  const labelEl  = overlay.querySelector('#ad-overlay-label');
  const countEl  = overlay.querySelector('#ad-overlay-countdown');
  const msgEl    = overlay.querySelector('#ad-overlay-msg');

  const defaultLabels = { continue: '이어하기', points: '포인트', preview: '미리보기' };
  const label = rewardLabel ?? defaultLabels[rewardType] ?? '보상';
  if (labelEl) labelEl.textContent = `광고 시청 후 "${label}" 지급`;

  overlay.classList.add('active');
  document.body.style.overflow = 'hidden';

  let remaining = 15;
  if (countEl) countEl.textContent = remaining;
  if (msgEl)   msgEl.textContent   = '광고를 끝까지 시청해 주세요';

  _overlayTimer = setInterval(() => {
    remaining -= 1;
    if (countEl) countEl.textContent = remaining;

    if (remaining <= 0) {
      clearInterval(_overlayTimer);
      _overlayTimer = null;
      _hideOverlay();
      onDone();
    }
  }, 1000);
}

function _hideOverlay() {
  const overlay = _getOverlay();
  if (overlay) overlay.classList.remove('active');
  document.body.style.overflow = '';
  if (_overlayTimer) { clearInterval(_overlayTimer); _overlayTimer = null; }
}

// ── showRewardedAd ────────────────────────────────────────────
/**
 * @param {'continue'|'points'|'preview'} rewardType
 * @param {() => void} onRewarded - 광고 완료 후 실행할 콜백
 * @param {string} [rewardLabel] - 오버레이에 표시할 보상 문구 (생략 시 기본값)
 */
export function showRewardedAd(rewardType, onRewarded, rewardLabel) {
  // 구독자: 광고 없이 즉시 보상
  if (isSubscriber()) {
    onRewarded();
    return;
  }

  // 광고 차단기
  if (!isAdAvailable()) {
    _showNotice('광고를 불러올 수 없습니다.\n광고 차단기를 해제해 주세요.');
    return;
  }

  // 일일 한도 확인
  const limit = AD_DAILY_LIMIT[rewardType] ?? 0;
  const count = getAdCount(rewardType);
  if (count >= limit) {
    _showNotice(`오늘 이 보상은 최대 ${limit}회까지 받을 수 있습니다.\n내일 다시 시도해 주세요.`);
    return;
  }

  // 오버레이 표시 → 완료 시 횟수 증가 후 콜백
  _showOverlay(
    rewardType,
    () => {
      _incrementAdCount(rewardType);
      onRewarded();
    },
    () => { /* 취소: 아무 보상 없음 */ },
    rewardLabel,
  );
}

// ── 알림 메시지 (간단한 토스트) ──────────────────────────────
function _showNotice(msg) {
  const existing = document.getElementById('ad-notice-toast');
  if (existing) existing.remove();

  const toast = document.createElement('div');
  toast.id = 'ad-notice-toast';
  toast.className = 'ad-toast';
  toast.textContent = msg;
  document.body.appendChild(toast);

  // 강제 reflow → transition 적용
  void toast.offsetWidth;
  toast.classList.add('visible');

  setTimeout(() => {
    toast.classList.remove('visible');
    setTimeout(() => toast.remove(), 400);
  }, 3000);
}
