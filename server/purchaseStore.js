/**
 * purchaseStore.js — 콘텐츠 팩 구매 내역 저장소
 *
 * 계정 없이도 구매 코드(redeemCode)로 다른 기기에서 복구할 수 있도록
 * userStore와 독립적으로 관리.
 *
 * purchases.json 구조:
 *   { [redeemCode]: { packId, orderId, redeemCode, createdAt } }
 */

const fs     = require('fs');
const path   = require('path');
const crypto = require('crypto');

const DB_PATH = path.join(__dirname, 'data', 'purchases.json');

// ── 초기화 ────────────────────────────────────────────────────
function init() {
    fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
    if (!fs.existsSync(DB_PATH)) {
        save({});
    }
}

// ── DB 읽기/쓰기 ──────────────────────────────────────────────
function load() {
    return JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
}

function save(data) {
    fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
}

// ── 코드 정규화 ───────────────────────────────────────────────
function normalizeCode(raw) {
    return (raw || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function formatCode(hex16) {
    return `${hex16.slice(0,4)}-${hex16.slice(4,8)}-${hex16.slice(8,12)}-${hex16.slice(12,16)}`;
}

// ── 구매 생성 ─────────────────────────────────────────────────
/**
 * 결제 성공 후 새 구매 코드를 생성하고 저장한다.
 * orderId 중복 시 기존 코드를 반환한다.
 *
 * @param {string} packId    'pack_a' | 'pack_b' | 'pack_c' | 'pack_all'
 * @param {string} orderId   토스페이먼츠 orderId
 * @returns {string}         예: 'AB12-CD34-EF56-GH78'
 */
function createPurchase(packId, orderId) {
    const db = load();

    // orderId 중복 방지
    const existing = Object.values(db).find(p => p.orderId === orderId);
    if (existing) return existing.redeemCode;

    const hex = crypto.randomBytes(8).toString('hex').toUpperCase();
    const redeemCode = formatCode(hex);
    const key = normalizeCode(redeemCode);

    db[key] = {
        packId,
        orderId,
        redeemCode,
        createdAt: new Date().toISOString(),
    };

    save(db);
    return redeemCode;
}

// ── 코드로 구매 조회 ──────────────────────────────────────────
/**
 * 구매 코드로 구매 정보를 조회한다.
 * 코드 입력 시 하이픈/공백/소문자를 허용한다.
 *
 * @param {string} redeemCode  예: 'ab12-cd34-ef56-gh78'
 * @returns {{ packId: string, redeemCode: string } | null}
 */
function getPurchaseByCode(redeemCode) {
    const db  = load();
    const key = normalizeCode(redeemCode);
    if (!key || key.length !== 16) return null;
    return db[key] || null;
}

module.exports = { init, createPurchase, getPurchaseByCode };
