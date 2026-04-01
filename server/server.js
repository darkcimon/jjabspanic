/**
 * server.js — 짭스패닉 이미지 서버
 *
 * 엔드포인트:
 *   GET  /api/image?stage={n}&rating={g|s}      이미지 URL 조회
 *   GET  /api/batch/status?batchIndex={n}        배치 상태 조회
 *   POST /api/batch/trigger                      배치 생성 트리거
 *   POST /api/reward/generate                    완주 보상 이미지 생성
 *   GET  /images/*                               정적 이미지 파일 서빙
 */

require('dotenv').config();

const { app }        = require('./app');
const store          = require('./imageStore');
const userStore      = require('./userStore');
const purchaseStore  = require('./purchaseStore');
const scheduler      = require('./scheduler');

const PORT = process.env.PORT || 3000;

// ── 서버 시작 ─────────────────────────────────────────────
store.init();
userStore.init();
purchaseStore.init();
scheduler.init();

app.listen(PORT, () => {
    console.log(`짭스패닉 이미지 서버 실행 중: http://localhost:${PORT}`);
    console.log(`최대 스테이지: ${store.MAX_STAGE} | 배치 크기: ${store.BATCH_SIZE} | 총 배치: ${store.TOTAL_BATCH}`);
});
