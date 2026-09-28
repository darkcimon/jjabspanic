/**
 * transferStore.js
 * 세이브 데이터 이전 코드를 JSON 파일로 관리한다.
 *
 * 이 게임은 로그인 없이 모든 진행 상황을 브라우저 localStorage에 저장하므로,
 * 기기를 바꾸거나 Android 앱이 TWA(크롬 저장소) → WebView(앱 전용 저장소)로
 * 바뀌면 진행 상황이 따라가지 않는다. 이전 기기에서 세이브를 올려 짧은 코드를
 * 받고, 새 기기에서 그 코드를 입력해 내려받는 방식으로 옮긴다.
 *
 * - 코드는 1회용 — 불러오는 순간 삭제된다.
 * - TTL이 지난 코드는 쓰기 시점마다 정리한다.
 * - 저장 내용은 클라이언트 세이브 그대로이며 서버가 검증하지 않는다
 *   (rankStore와 같은 신뢰 수준 — 어차피 localStorage는 사용자가 수정할 수 있다).
 */

const fs     = require('fs');
const path   = require('path');
const crypto = require('crypto');
const { DATA_DIR } = require('./dataDir');

const DB_PATH = path.join(DATA_DIR, 'transfers.json');

const TTL_MS = 72 * 60 * 60 * 1000; // 72시간
// 헷갈리는 글자(0/O, 1/I/L) 제외 — 31자 × 8자리 ≈ 8,500억 조합
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 8;
const MAX_PAYLOAD_BYTES = 90 * 1024; // express.json 기본 한도(100kb) 안쪽

function init() {
    if (!fs.existsSync(DB_PATH)) save({});
}

function load() {
    try { return JSON.parse(fs.readFileSync(DB_PATH, 'utf8')); }
    catch { return {}; }
}

function save(data) {
    fs.writeFileSync(DB_PATH, JSON.stringify(data));
}

function prune(db, now) {
    for (const [code, entry] of Object.entries(db)) {
        if (!entry || entry.expiresAt <= now) delete db[code];
    }
}

function generateCode() {
    const bytes = crypto.randomBytes(CODE_LENGTH);
    let code = '';
    for (let i = 0; i < CODE_LENGTH; i++) code += ALPHABET[bytes[i] % ALPHABET.length];
    return code;
}

/** 사용자가 입력한 코드를 정규화한다 — 대소문자·하이픈·공백 무시. 형식이 틀리면 null. */
function normalizeCode(input) {
    if (typeof input !== 'string') return null;
    const code = input.toUpperCase().replace(/[\s-]/g, '');
    if (code.length !== CODE_LENGTH) return null;
    for (const ch of code) if (!ALPHABET.includes(ch)) return null;
    return code;
}

/**
 * @param {{ save: object, purchases?: string[] }} payload
 * @returns {{ code: string, expiresAt: number }}
 */
function create(payload) {
    if (!payload || typeof payload.save !== 'object' || payload.save === null || Array.isArray(payload.save)) {
        throw new Error('invalid payload');
    }
    const purchases = Array.isArray(payload.purchases)
        ? payload.purchases.filter(p => typeof p === 'string' && p.length <= 32).slice(0, 20)
        : [];
    const data = { save: payload.save, purchases };
    if (Buffer.byteLength(JSON.stringify(data)) > MAX_PAYLOAD_BYTES) throw new Error('payload too large');

    const now = Date.now();
    const db = load();
    prune(db, now);
    let code;
    do { code = generateCode(); } while (db[code]);
    const expiresAt = now + TTL_MS;
    db[code] = { data, createdAt: now, expiresAt };
    save(db);
    return { code, expiresAt };
}

/**
 * 코드를 사용해 데이터를 꺼낸다. 성공하면 코드는 즉시 삭제된다(1회용).
 * @returns {{ save: object, purchases: string[] } | null}
 */
function redeem(input) {
    const code = normalizeCode(input);
    if (!code) return null;
    const now = Date.now();
    const db = load();
    const entry = db[code];
    if (!entry || entry.expiresAt <= now) return null;
    delete db[code];
    prune(db, now);
    save(db);
    return entry.data;
}

module.exports = { init, create, redeem, normalizeCode, TTL_MS, DB_PATH };
