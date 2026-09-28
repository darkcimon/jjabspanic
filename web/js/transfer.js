/**
 * transfer.js — 세이브 데이터 이전 (기기 변경 / 구버전 앱 → 새 앱)
 *
 * 진행 상황은 전부 브라우저 localStorage에만 있으므로, 이전 기기에서 세이브를
 * 서버에 올려 1회용 코드(72시간 유효)를 받고, 새 기기에서 그 코드로 내려받는다.
 * 서버: server/transferStore.js, POST /api/transfer · /api/transfer/redeem
 *
 * 옮기는 것: galspanic_save 전체(userId 포함 — 구매/랭킹이 userId에 묶여 있으므로
 * 그대로 가져가야 한다) + 로컬 구매 목록(gp_local_purchases).
 */

import { Storage } from './storage.js';
import { getLocalPurchases, saveLocalPurchase } from './payment.js';

/** 'ABCD2345' → 'ABCD-2345' */
export function formatTransferCode(code) {
  return code.length === 8 ? `${code.slice(0, 4)}-${code.slice(4)}` : code;
}

/**
 * 현재 기기의 세이브를 올리고 이전 코드를 받는다.
 * @returns {Promise<{ ok: true, code: string, expiresAt: number } | { ok: false, reason: 'server' | 'network' }>}
 */
export async function issueTransferCode() {
  try {
    const res = await fetch('/api/transfer', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ save: Storage.load(), purchases: getLocalPurchases() }),
    });
    if (!res.ok) return { ok: false, reason: 'server' };
    const { code, expiresAt } = await res.json();
    return { ok: true, code, expiresAt };
  } catch {
    return { ok: false, reason: 'network' };
  }
}

/**
 * 코드로 세이브를 내려받아 이 기기의 진행 상황을 덮어쓴다.
 * 성공하면 호출한 쪽에서 페이지를 새로고침해 모든 화면 상태를 다시 읽게 한다.
 * @returns {Promise<{ ok: true } | { ok: false, reason: 'invalid' | 'rate' | 'server' | 'network' }>}
 */
export async function redeemTransferCode(code) {
  let data;
  try {
    const res = await fetch('/api/transfer/redeem', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code }),
    });
    if (res.status === 404) return { ok: false, reason: 'invalid' };
    if (res.status === 429) return { ok: false, reason: 'rate' };
    if (!res.ok) return { ok: false, reason: 'server' };
    data = await res.json();
  } catch {
    return { ok: false, reason: 'network' };
  }
  if (!data || typeof data.save !== 'object' || data.save === null) return { ok: false, reason: 'server' };

  // 이전 버전 세이브에 없는 필드는 기본값으로 채운다 (Storage.load와 같은 방식)
  Storage.save({ ...Storage.defaults(), ...data.save });
  // 구매 목록은 덮어쓰지 않고 합친다 — 이 기기에서 따로 산 팩이 사라지지 않도록
  (data.purchases || []).forEach(saveLocalPurchase);
  return { ok: true };
}
