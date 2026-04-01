/**
 * pregenerate.js — 출시 전 배치 0 (스테이지 1~30) 사전 생성 스크립트
 *
 * 실행:
 *   cd server
 *   STABILITY_API_KEY=sk-... node scripts/pregenerate.js
 *
 * 또는 .env 파일 설정 후:
 *   npm run pregenerate
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const store     = require('../imageStore');
const generator = require('../batchGenerator');

async function main() {
    console.log('=== 짭스패닉 초기 배치 생성 (Stage 1~30) ===');

    if (!process.env.STABILITY_API_KEY) {
        console.error('오류: STABILITY_API_KEY 환경변수가 설정되지 않았습니다.');
        process.exit(1);
    }

    store.init();

    // 배치 0: 스테이지 1~30 (일반 + 섹시 두 레인)
    console.log('\n[1/2] 일반 레인 (g) 생성 중...');
    await generator.generateBatch(0, 'g');

    console.log('\n[2/2] 섹시 레인 (s) 생성 중...');
    await generator.generateBatch(0, 's');

    console.log('\n=== 초기 배치 생성 완료 ===');
    console.log('생성된 이미지: server/public/images/ 폴더 확인');
}

main().catch(err => {
    console.error('초기 배치 생성 실패:', err.message);
    process.exit(1);
});
