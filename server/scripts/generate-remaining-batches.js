/**
 * generate-remaining-batches.js
 * 스테이지 151~300 (배치 5~9)이 'pending' 상태로 멈춰 있던 문제를 복구.
 * 순차적으로 각 배치를 생성한다 (일반 레인만, 기존 batch/trigger와 동일한 동작).
 *
 * 실행:
 *   cd server
 *   node scripts/generate-remaining-batches.js
 */
require('dotenv').config();

const store     = require('../imageStore');
const generator = require('../batchGenerator');

store.init();

async function run() {
    const targets = [5, 6, 7, 8, 9];
    for (const batchIndex of targets) {
        const before = store.getBatchStatus(batchIndex);
        console.log(`[Fix] 배치 ${batchIndex} 시작 전 상태:`, before);

        if (before.status === 'ready') {
            console.log(`[Fix] 배치 ${batchIndex} 이미 완료됨, 건너뜀`);
            continue;
        }

        await generator.generateBatchBothRatings(batchIndex);
        const after = store.getBatchStatus(batchIndex);
        console.log(`[Fix] 배치 ${batchIndex} 완료 후 상태:`, after);
    }
    console.log('[Fix] 배치 5~9 (스테이지 151~300) 복구 완료');
}

run().catch(err => {
    console.error('[Fix] 실패:', err);
    process.exit(1);
});
