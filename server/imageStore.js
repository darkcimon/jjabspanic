/**
 * imageStore.js
 * 이미지 메타데이터(배치 상태, URL)를 JSON 파일로 관리한다.
 * 상용 배포 시 이 파일을 Firebase Firestore / MongoDB / Redis 구현으로 교체.
 */

const fs   = require('fs');
const path = require('path');

const DB_PATH  = path.join(__dirname, 'data', 'images.json');
const IMG_DIR  = process.env.IMAGE_DIR || path.join(__dirname, 'public', 'images');

const BATCH_SIZE  = 30;
const MAX_STAGE   = 300;
const TOTAL_BATCH = MAX_STAGE / BATCH_SIZE;  // 10

// ── 초기화 ────────────────────────────────────────────────
function init() {
    fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
    fs.mkdirSync(IMG_DIR, { recursive: true });

    if (!fs.existsSync(DB_PATH)) {
        const initial = { batches: {}, images: {} };
        // 배치 0 (1-30)는 pre-generated 상태로 초기화
        for (let b = 0; b < TOTAL_BATCH; b++) {
            initial.batches[b] = {
                status: b === 0 ? 'ready' : 'pending',
                progress: b === 0 ? BATCH_SIZE : 0,
                triggeredAt: null
            };
        }
        save(initial);
    }
}

// ── DB 읽기/쓰기 ──────────────────────────────────────────
function load() {
    return JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
}

function save(data) {
    fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
}

// ── 배치 관련 ─────────────────────────────────────────────
function getBatchIndex(stage) {
    return Math.floor((stage - 1) / BATCH_SIZE);
}

function getBatchStatus(batchIndex) {
    const db = load();
    return db.batches[batchIndex] || { status: 'pending', progress: 0 };
}

/**
 * 배치를 'generating' 상태로 원자적으로 전환 시도.
 * 이미 generating/ready면 false 반환 (다른 요청이 먼저 트리거한 것).
 */
function claimBatchGeneration(batchIndex) {
    const db = load();
    const batch = db.batches[batchIndex];
    if (!batch || batch.status !== 'pending') return false;

    db.batches[batchIndex].status = 'generating';
    db.batches[batchIndex].progress = 0;
    db.batches[batchIndex].triggeredAt = new Date().toISOString();
    save(db);
    return true;
}

function updateBatchProgress(batchIndex, progress) {
    const db = load();
    db.batches[batchIndex].progress = progress;
    save(db);
}

function markBatchReady(batchIndex) {
    const db = load();
    db.batches[batchIndex].status = 'ready';
    db.batches[batchIndex].progress = BATCH_SIZE;
    db.batches[batchIndex].completedAt = new Date().toISOString();
    save(db);
}

// ── 이미지 관련 ───────────────────────────────────────────
function getImageKey(stage, rating) {
    return `${stage}_${rating}`;
}

function setImageUrl(stage, rating, filename) {
    const db = load();
    db.images[getImageKey(stage, rating)] = filename;
    save(db);
}

function getImageUrl(stage, rating) {
    const db = load();
    const filename = db.images[getImageKey(stage, rating)];
    if (!filename) return null;
    return `/images/${filename}`;
}

function getImageFilePath(stage, rating) {
    return path.join(IMG_DIR, `stage_${stage}_${rating}.jpg`);
}

function getImageFilename(stage, rating) {
    return `stage_${stage}_${rating}.jpg`;
}

// ── 보상 이미지 ───────────────────────────────────────────
function setRewardImageUrl(userId, filename) {
    const db = load();
    if (!db.rewards) db.rewards = {};
    db.rewards[userId] = filename;
    save(db);
}

function getRewardImageUrl(userId) {
    const db = load();
    if (!db.rewards || !db.rewards[userId]) return null;
    return `/images/rewards/${db.rewards[userId]}`;
}

module.exports = {
    init,
    BATCH_SIZE,
    MAX_STAGE,
    TOTAL_BATCH,
    getBatchIndex,
    getBatchStatus,
    claimBatchGeneration,
    updateBatchProgress,
    markBatchReady,
    setImageUrl,
    getImageUrl,
    getImageFilePath,
    getImageFilename,
    setRewardImageUrl,
    getRewardImageUrl,
    IMG_DIR,
};
