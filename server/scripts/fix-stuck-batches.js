/**
 * fix-stuck-batches.js
 * 배치 4(121~150단계)가 'generating' 상태에서 멈춰 있던 문제를 복구.
 * 새로 확장된(30개) 프롬프트 풀로 처음부터 다시 생성한다.
 */
require('dotenv').config();

const store     = require('../imageStore');
const generator = require('../batchGenerator');

store.init();

async function run() {
    const targets = [4];
    for (const batchIndex of targets) {
        const before = store.getBatchStatus(batchIndex);
        console.log(`[Fix] 배치 ${batchIndex} 시작 전 상태:`, before);
        await generator.generateBatchBothRatings(batchIndex);
        const after = store.getBatchStatus(batchIndex);
        console.log(`[Fix] 배치 ${batchIndex} 완료 후 상태:`, after);
    }
    console.log('[Fix] 모든 배치 복구 완료');
}

run().catch(err => {
    console.error('[Fix] 실패:', err);
    process.exit(1);
});
