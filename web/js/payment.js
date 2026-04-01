/**
 * payment.js — 짭스패닉 콘텐츠 팩 결제 모듈
 *
 * 의존성: 토스페이먼츠 SDK (index.html에서 script 태그로 로드)
 *   <script src="https://js.tosspayments.com/v1/payment"></script>
 *
 * 클라이언트 키는 서버가 /api/config 엔드포인트로 제공하거나
 * window.TOSS_CLIENT_KEY에 주입한다.
 */

// ── 상품 정의 ────────────────────────────────────────────────
export const PACK_DEFS = {
  pack_a: {
    name:    '갤러리 팩 A',
    amount:  3900,
    stages:  [1, 100],    // 해금 범위 (포함)
  },
  pack_b: {
    name:    '갤러리 팩 B',
    amount:  3900,
    stages:  [101, 200],
  },
  pack_c: {
    name:    '갤러리 팩 C',
    amount:  3900,
    stages:  [201, 300],
  },
  pack_all: {
    name:    '완전판 팩',
    amount:  6900,
    stages:  [1, 300],
  },
};

// ── 내부 상태 ────────────────────────────────────────────────
let _purchases = null;  // null = 아직 로드 안 됨

const LS_KEY = 'gp_local_purchases';  // localStorage 키

// ── localStorage 구매 목록 ────────────────────────────────────
function _loadLocal() {
  try {
    return JSON.parse(localStorage.getItem(LS_KEY) || '[]');
  } catch { return []; }
}

function _saveLocal(list) {
  localStorage.setItem(LS_KEY, JSON.stringify([...new Set(list)]));
}

/**
 * 로컬에 팩을 저장한다 (결제 성공 리다이렉트 후, 코드 복구 후 호출).
 * pack_all 저장 시 하위 팩도 함께 저장.
 */
export function saveLocalPurchase(packId) {
  const list = _loadLocal();
  if (!list.includes(packId)) {
    list.push(packId);
    if (packId === 'pack_all') {
      ['pack_a','pack_b','pack_c'].forEach(p => { if (!list.includes(p)) list.push(p); });
    }
    _saveLocal(list);
  }
  _purchases = null; // 캐시 무효화
}

// ── 구매 내역 조회 ────────────────────────────────────────────
/**
 * 서버 + localStorage 구매 내역을 합산해 반환한다.
 * 세션 내 한 번만 서버를 조회하고 이후에는 캐시 값 반환.
 * @returns {Promise<string[]>}  예: ['pack_a', 'pack_all']
 */
export async function getPurchases() {
  if (_purchases !== null) return _purchases;

  let serverPurchases = [];
  try {
    const res = await fetch('/payment/purchases');
    if (res.ok) {
      const data = await res.json();
      serverPurchases = Array.isArray(data.purchases) ? data.purchases : [];
    }
  } catch { /* 오프라인 등 — 무시 */ }

  const local = _loadLocal();
  _purchases = [...new Set([...serverPurchases, ...local])];
  return _purchases;
}

/**
 * 구매 내역 캐시를 무효화한다.
 * 결제 성공 콜백 후 호출해 최신 내역을 다시 로드하도록 한다.
 */
export function invalidatePurchaseCache() {
  _purchases = null;
}

// ── 구매 코드 복구 ────────────────────────────────────────────
/**
 * 구매 복구 코드를 서버에 전송해 팩을 복구한다.
 * 성공 시 localStorage에도 저장하고 팩 ID를 반환.
 * @param {string} redeemCode  예: 'ABCD-EFGH-IJKL-MNOP'
 * @returns {Promise<{ ok: boolean, packId?: string, error?: string }>}
 */
export async function redeemPurchase(redeemCode) {
  try {
    const res  = await fetch('/payment/redeem', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ redeemCode: redeemCode.trim() }),
    });
    const data = await res.json();
    if (data.ok && data.packId) {
      saveLocalPurchase(data.packId);
      return { ok: true, packId: data.packId };
    }
    return { ok: false, error: data.error || '복구에 실패했습니다.' };
  } catch {
    return { ok: false, error: '서버에 연결할 수 없습니다.' };
  }
}

// ── 팩 보유 여부 확인 ─────────────────────────────────────────
/**
 * 특정 팩을 구매했는지 확인한다.
 * pack_all 구매 시 pack_a, pack_b, pack_c도 보유로 간주한다.
 * @param {string} packId
 * @returns {Promise<boolean>}
 */
export async function hasPack(packId) {
  const list = await getPurchases();
  if (list.includes('pack_all')) return true;  // 완전판은 전체 포함
  return list.includes(packId);
}

/**
 * 스테이지 번호가 구매한 팩으로 커버되는지 확인한다.
 * @param {number} stageNum
 * @param {string[]} purchases  getPurchases()의 반환값
 * @returns {boolean}
 */
export function stageUnlockedByPack(stageNum, purchases) {
  if (purchases.includes('pack_all')) return true;
  if (stageNum >=   1 && stageNum <= 100 && purchases.includes('pack_a')) return true;
  if (stageNum >= 101 && stageNum <= 200 && purchases.includes('pack_b')) return true;
  if (stageNum >= 201 && stageNum <= 300 && purchases.includes('pack_c')) return true;
  return false;
}

// ── 토스페이먼츠 결제 요청 ────────────────────────────────────
/**
 * 팩 일회성 결제를 요청한다.
 * 성공 시 토스페이먼츠가 successUrl로 리다이렉트하고,
 * 서버가 구매 내역을 저장한 뒤 갤러리 화면으로 다시 리다이렉트한다.
 *
 * @param {string} packId   'pack_a' | 'pack_b' | 'pack_c' | 'pack_all'
 * @param {number} [amount] 생략 시 PACK_DEFS에서 자동 결정
 */
export async function requestPackPurchase(packId, amount) {
  const def = PACK_DEFS[packId];
  if (!def) throw new Error(`알 수 없는 팩: ${packId}`);

  // 클라이언트 키: 서버 주입 우선, 없으면 /api/config에서 조회
  const clientKey = await resolveClientKey();
  if (!clientKey) {
    alert('결제 설정을 불러오지 못했습니다. 잠시 후 다시 시도해주세요.');
    return;
  }

  const tossPayments = TossPayments(clientKey);  // 토스페이먼츠 SDK (전역)
  const orderId      = `pack_${packId}_${Date.now()}`;
  const origin       = location.origin;

  await tossPayments.requestPayment('카드', {
    amount:      amount ?? def.amount,
    orderId,
    orderName:   def.name,
    successUrl: `${origin}/payment/pack/success?packId=${packId}&orderId=${orderId}`,
    failUrl:    `${origin}/payment/pack/fail?packId=${packId}`,
  });
  // requestPayment는 리다이렉트로 끝나므로 이후 코드는 실행되지 않음
}

// ── 내부 헬퍼 ────────────────────────────────────────────────
async function resolveClientKey() {
  // 1순위: 서버가 index.html에 주입한 전역 변수
  if (window.TOSS_CLIENT_KEY) return window.TOSS_CLIENT_KEY;

  // 2순위: /api/config 엔드포인트
  try {
    const res  = await fetch('/api/config');
    if (!res.ok) return null;
    const data = await res.json();
    return data.tossClientKey || null;
  } catch {
    return null;
  }
}
