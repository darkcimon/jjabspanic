/**
 * userStore.js
 * 유저 메타데이터(인증, 구독 상태)를 JSON 파일로 관리한다.
 * imageStore.js와 동일한 패턴 사용.
 * 상용 배포 시 이 파일을 Firebase Firestore / MongoDB / Redis 구현으로 교체.
 */

const fs   = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, 'data', 'users.json');

// ── 초기화 ────────────────────────────────────────────────
function init() {
    fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

    if (!fs.existsSync(DB_PATH)) {
        save({});
    }
}

// ── DB 읽기/쓰기 ──────────────────────────────────────────
function load() {
    return JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
}

function save(data) {
    fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
}

// ── 유저 조회 ─────────────────────────────────────────────
/**
 * userId로 유저 정보 조회.
 * 존재하지 않으면 null 반환.
 * @param {string} userId  예: 'kakao_12345678'
 */
function getUser(userId) {
    const db = load();
    return db[userId] || null;
}

// ── 유저 생성/갱신 ────────────────────────────────────────
/**
 * 유저 정보를 upsert (없으면 생성, 있으면 병합 업데이트).
 * @param {string} userId
 * @param {object} data   nickname, profileImage 등 병합할 필드
 */
function upsertUser(userId, data) {
    const db = load();
    const now = new Date().toISOString();

    if (!db[userId]) {
        db[userId] = {
            userId,
            nickname: data.nickname || '',
            profileImage: data.profileImage || null,
            subscriptionStatus: 'none',   // none | active | cancelled | expired
            subscriptionExpiry: null,
            billingKey: null,
            createdAt: now,
            updatedAt: now,
        };
    }

    // 병합: createdAt은 유지, 나머지만 덮어씀
    const { createdAt } = db[userId];
    db[userId] = {
        ...db[userId],
        ...data,
        userId,      // userId는 외부에서 변경 불가
        createdAt,   // 최초 생성일 유지
        updatedAt: now,
    };

    save(db);
    return db[userId];
}

// ── 구독 관련 ─────────────────────────────────────────────
/**
 * 구독 활성화: subscriptionStatus를 'active'로, 만료일을 expiry로 설정.
 * @param {string} userId
 * @param {string} expiry  ISO 8601 문자열 (예: '2026-04-17T00:00:00Z')
 * @param {string} [billingKey]  토스페이먼츠 빌링키 (선택)
 */
function setSubscription(userId, expiry, billingKey) {
    const db = load();
    if (!db[userId]) return null;

    db[userId].subscriptionStatus = 'active';
    db[userId].subscriptionExpiry = expiry;
    db[userId].updatedAt = new Date().toISOString();
    if (billingKey) db[userId].billingKey = billingKey;

    save(db);
    return db[userId];
}

/**
 * 구독 상태가 'active'이고 만료일이 미래인지 확인.
 * @param {string} userId
 * @returns {boolean}
 */
function isSubscribed(userId) {
    const db = load();
    const user = db[userId];
    if (!user) return false;
    if (user.subscriptionStatus !== 'active') return false;
    if (!user.subscriptionExpiry) return false;
    return new Date(user.subscriptionExpiry) > new Date();
}

/**
 * 만료된 구독 유저를 일괄 처리 (스케줄러에서 호출).
 * subscriptionStatus가 'active'이고 subscriptionExpiry가 과거인 유저를 'expired'로 변경.
 * @returns {string[]}  처리된 userId 목록
 */
function expireSubscriptions() {
    const db   = load();
    const now  = new Date();
    const expired = [];

    for (const [userId, user] of Object.entries(db)) {
        if (
            user.subscriptionStatus === 'active' &&
            user.subscriptionExpiry &&
            new Date(user.subscriptionExpiry) <= now
        ) {
            db[userId].subscriptionStatus = 'expired';
            db[userId].updatedAt = now.toISOString();
            expired.push(userId);
        }
    }

    if (expired.length > 0) save(db);
    return expired;
}

/**
 * 구독 해지: subscriptionStatus를 'cancelled'로 변경.
 * 만료일까지는 서비스 이용 가능 (isSubscribed는 여전히 expiry 기준으로 판단).
 * @param {string} userId
 */
function cancelSubscription(userId) {
    const db = load();
    if (!db[userId]) return null;

    db[userId].subscriptionStatus = 'cancelled';
    db[userId].updatedAt = new Date().toISOString();
    save(db);
    return db[userId];
}

module.exports = {
    init,
    getUser,
    upsertUser,
    setSubscription,
    isSubscribed,
    expireSubscriptions,
    cancelSubscription,
};
