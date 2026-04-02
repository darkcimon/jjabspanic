// ── Ad module — Kakao AdFit 연동 ──────────────────────────────
// AdFit 단가 ID는 승인 후 아래 상수에 입력한다.
// 심사 전에는 오버레이 카운트다운만 동작한다(시뮬레이션 모드).

const ADFIT_UNIT_ID = 'DAN-XXXXXXXXXXXXXXXX'; // ← AdFit 승인 후 교체

const AD_STORE_KEY = 'galspanic_ad';

// 일일 한도: continue 3회, points 10회, preview 5회
export const AD_DAILY_LIMIT = { continue: 3, points: 10, preview: 5 };

// ── 구독 여부 (추후 IAPManager 연동 시 교체) ─────────────────
function isSubscriber() {
  return false;
}

// ── 광고 차단기 감지 ──────────────────────────────────────────
let _adSdkStatus = 'unknown'; // 'unknown' | 'loaded' | 'blocked'

function _detectAdBlocker() {
  if (_adSdkStatus !== 'unknown') return;
  const bait = document.createElement('div');
  bait.className = 'ad-unit adsbox ad-banner';
  bait.style.cssText = 'height:1px;width:1px;position:absolute;left:-9999px;';
  document.body.appendChild(bait);
  requestAnimationFrame(() => {
    const blocked = bait.offsetParent === null || bait.offsetHeight === 0;
    _adSdkStatus = blocked ? 'blocked' : 'loaded';
    bait.remove();
  });
}

export function isAdAvailable() {
  _detectAdBlocker();
  return _adSdkStatus !== 'blocked';
}

// ── 일일 횟수 저장 ────────────────────────────────────────────
function _todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function _loadAdData() {
  try {
    const raw = JSON.parse(localStorage.getItem(AD_STORE_KEY));
    if (raw) {
      const totalViews = raw.totalViews || 0;
      if (raw.date === _todayKey()) return { ...raw, totalViews };
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
  if (rewardType === 'points') data.totalViews = (data.totalViews || 0) + 1;
  _saveAdData(data);
}

// ── AdFit 배너 렌더링 ─────────────────────────────────────────
function _renderAdFitBanner(container) {
  if (ADFIT_UNIT_ID.startsWith('DAN-XXX')) return false; // 미설정 시 스킵

  container.innerHTML = '';
  const ins = document.createElement('ins');
  ins.className = 'kakao_ad_area';
  ins.setAttribute('data-ad-unit', ADFIT_UNIT_ID);
  ins.setAttribute('data-ad-width', '320');
  ins.setAttribute('data-ad-height', '100');
  container.appendChild(ins);

  if (window.kakao && window.kakao.adfit) {
    try { window.kakao.adfit.fill(ins); } catch { /* ignore */ }
  }
  return true;
}

// ── 오버레이 DOM ──────────────────────────────────────────────
let _overlayTimer = null;

function _getOverlay() {
  return document.getElementById('ad-overlay');
}

function _showOverlay(rewardType, onDone, onCancel, rewardLabel) {
  const overlay = _getOverlay();
  if (!overlay) { onCancel(); return; }

  const labelEl = overlay.querySelector('#ad-overlay-label');
  const countEl = overlay.querySelector('#ad-overlay-countdown');
  const msgEl   = overlay.querySelector('#ad-overlay-msg');
  const adArea  = overlay.querySelector('#ad-overlay-ad-area');

  const defaultLabels = { continue: '이어하기', points: '포인트', preview: '미리보기' };
  const label = rewardLabel ?? defaultLabels[rewardType] ?? '보상';
  if (labelEl) labelEl.textContent = `광고 시청 후 "${label}" 지급`;

  const adRendered = adArea ? _renderAdFitBanner(adArea) : false;

  overlay.classList.add('active');
  document.body.style.overflow = 'hidden';

  let remaining = 15;
  if (countEl) countEl.textContent = remaining;
  if (msgEl)   msgEl.textContent   = adRendered ? '광고를 끝까지 시청해 주세요' : '잠시 기다려 주세요';

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
 * @param {() => void} onRewarded
 * @param {string} [rewardLabel]
 */
export function showRewardedAd(rewardType, onRewarded, rewardLabel) {
  if (isSubscriber()) {
    onRewarded();
    return;
  }

  if (!isAdAvailable()) {
    _showNotice('광고를 불러올 수 없습니다.\n광고 차단기를 해제해 주세요.');
    return;
  }

  const limit = AD_DAILY_LIMIT[rewardType] ?? 0;
  const count = getAdCount(rewardType);
  if (count >= limit) {
    _showNotice(`오늘 이 보상은 최대 ${limit}회까지 받을 수 있습니다.\n내일 다시 시도해 주세요.`);
    return;
  }

  _showOverlay(
    rewardType,
    () => {
      _incrementAdCount(rewardType);
      onRewarded();
    },
    () => { /* 취소: 보상 없음 */ },
    rewardLabel,
  );
}

// ── 토스트 알림 ───────────────────────────────────────────────
function _showNotice(msg) {
  const existing = document.getElementById('ad-notice-toast');
  if (existing) existing.remove();

  const toast = document.createElement('div');
  toast.id = 'ad-notice-toast';
  toast.className = 'ad-toast';
  toast.textContent = msg;
  document.body.appendChild(toast);

  void toast.offsetWidth;
  toast.classList.add('visible');

  setTimeout(() => {
    toast.classList.remove('visible');
    setTimeout(() => toast.remove(), 400);
  }, 3000);
}
