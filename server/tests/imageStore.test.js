'use strict';

/**
 * imageStore.test.js
 * imageStore.js의 모든 공개 함수를 단위 테스트한다.
 * fs 모듈을 인메모리 Map으로 모킹하여 실제 파일시스템을 사용하지 않는다.
 */

// ── fs 모킹 (jest.mock은 파일 상단으로 호이스팅됨) ────────
// 변수명 'mock'으로 시작해야 Jest 호이스팅 예외 적용
const mockFiles = {};

jest.mock('fs', () => ({
    mkdirSync: jest.fn(),
    existsSync: jest.fn((p) => Object.prototype.hasOwnProperty.call(mockFiles, p)),
    readFileSync: jest.fn((p) => {
        if (!Object.prototype.hasOwnProperty.call(mockFiles, p)) {
            const err = new Error(`ENOENT: no such file or directory, open '${p}'`);
            err.code = 'ENOENT';
            throw err;
        }
        return mockFiles[p];
    }),
    writeFileSync: jest.fn((p, data) => {
        mockFiles[p] = typeof data === 'string' ? data : data.toString();
    }),
}));

// ── 테스트 ────────────────────────────────────────────────
describe('imageStore', () => {
    let store;

    beforeEach(() => {
        // 인메모리 파일시스템 초기화
        Object.keys(mockFiles).forEach((k) => delete mockFiles[k]);
        jest.clearAllMocks();

        // 모듈 캐시 제거 후 새로 로드 (상수 재평가 방지 필요 없음 - 모두 env 기반)
        store = require('../imageStore');
        store.init();
    });

    // ── 상수 ────────────────────────────────────────────────
    describe('상수', () => {
        test('BATCH_SIZE는 30', () => {
            expect(store.BATCH_SIZE).toBe(30);
        });

        test('MAX_STAGE는 300', () => {
            expect(store.MAX_STAGE).toBe(300);
        });

        test('TOTAL_BATCH는 10', () => {
            expect(store.TOTAL_BATCH).toBe(10);
        });
    });

    // ── getBatchIndex ────────────────────────────────────────
    describe('getBatchIndex', () => {
        test.each([
            [1,   0],
            [30,  0],
            [31,  1],
            [60,  1],
            [61,  2],
            [150, 4],
            [270, 8],
            [271, 9],
            [300, 9],
        ])('stage %i → 배치 %i', (stage, expected) => {
            expect(store.getBatchIndex(stage)).toBe(expected);
        });
    });

    // ── init ─────────────────────────────────────────────────
    describe('init', () => {
        test('배치 0은 ready 상태, progress=30으로 초기화', () => {
            const batch0 = store.getBatchStatus(0);
            expect(batch0.status).toBe('ready');
            expect(batch0.progress).toBe(30);
        });

        test('배치 1~9는 pending 상태, progress=0으로 초기화', () => {
            for (let b = 1; b <= 9; b++) {
                const batch = store.getBatchStatus(b);
                expect(batch.status).toBe('pending');
                expect(batch.progress).toBe(0);
            }
        });

        test('이미 DB 파일이 있으면 덮어쓰지 않음', () => {
            const fs = require('fs');
            const callCount = fs.writeFileSync.mock.calls.length;
            store.init(); // 두 번째 init 호출
            // writeFileSync 호출 횟수가 늘지 않아야 한다
            expect(fs.writeFileSync.mock.calls.length).toBe(callCount);
        });
    });

    // ── getBatchStatus ───────────────────────────────────────
    describe('getBatchStatus', () => {
        test('존재하는 배치 상태 반환', () => {
            const batch = store.getBatchStatus(0);
            expect(batch).toHaveProperty('status');
            expect(batch).toHaveProperty('progress');
        });

        test('존재하지 않는 배치는 기본값 반환', () => {
            const batch = store.getBatchStatus(999);
            expect(batch).toEqual({ status: 'pending', progress: 0 });
        });
    });

    // ── claimBatchGeneration ─────────────────────────────────
    describe('claimBatchGeneration', () => {
        test('pending 배치를 generating으로 전환 → true 반환', () => {
            const result = store.claimBatchGeneration(1);
            expect(result).toBe(true);
            expect(store.getBatchStatus(1).status).toBe('generating');
        });

        test('generating 상태 전환 시 triggeredAt 설정', () => {
            store.claimBatchGeneration(1);
            const batch = store.getBatchStatus(1);
            expect(batch.triggeredAt).not.toBeNull();
            expect(typeof batch.triggeredAt).toBe('string');
        });

        test('generating 중인 배치 재시도 → false 반환', () => {
            store.claimBatchGeneration(1);
            const result = store.claimBatchGeneration(1);
            expect(result).toBe(false);
        });

        test('ready 상태 배치(배치 0) → false 반환', () => {
            const result = store.claimBatchGeneration(0);
            expect(result).toBe(false);
        });

        test('claim 후 진행도는 0으로 리셋', () => {
            store.claimBatchGeneration(1);
            expect(store.getBatchStatus(1).progress).toBe(0);
        });
    });

    // ── updateBatchProgress ──────────────────────────────────
    describe('updateBatchProgress', () => {
        test('진행도 업데이트', () => {
            store.claimBatchGeneration(1);
            store.updateBatchProgress(1, 15);
            expect(store.getBatchStatus(1).progress).toBe(15);
        });

        test('여러 번 업데이트 가능', () => {
            store.claimBatchGeneration(2);
            store.updateBatchProgress(2, 10);
            store.updateBatchProgress(2, 20);
            store.updateBatchProgress(2, 30);
            expect(store.getBatchStatus(2).progress).toBe(30);
        });
    });

    // ── markBatchReady ───────────────────────────────────────
    describe('markBatchReady', () => {
        test('배치 상태를 ready로 변경', () => {
            store.claimBatchGeneration(1);
            store.markBatchReady(1);
            expect(store.getBatchStatus(1).status).toBe('ready');
        });

        test('markBatchReady 후 progress는 BATCH_SIZE(30)', () => {
            store.claimBatchGeneration(1);
            store.markBatchReady(1);
            expect(store.getBatchStatus(1).progress).toBe(store.BATCH_SIZE);
        });

        test('markBatchReady 후 completedAt이 설정됨', () => {
            store.claimBatchGeneration(1);
            store.markBatchReady(1);
            expect(store.getBatchStatus(1).completedAt).toBeDefined();
        });
    });

    // ── 이미지 URL ───────────────────────────────────────────
    describe('setImageUrl / getImageUrl', () => {
        test('URL 저장 후 조회 가능', () => {
            store.setImageUrl(1, 'g', 'stage_1_g.jpg');
            const url = store.getImageUrl(1, 'g');
            expect(url).toContain('stage_1_g.jpg');
        });

        test('이미지가 없으면 null 반환', () => {
            expect(store.getImageUrl(1, 'g')).toBeNull();
        });

        test('general(g)과 sexy(s)는 독립적으로 저장', () => {
            store.setImageUrl(5, 'g', 'stage_5_g.jpg');
            store.setImageUrl(5, 's', 'stage_5_s.jpg');

            const gUrl = store.getImageUrl(5, 'g');
            const sUrl = store.getImageUrl(5, 's');

            expect(gUrl).toContain('stage_5_g.jpg');
            expect(sUrl).toContain('stage_5_s.jpg');
            expect(gUrl).not.toBe(sUrl);
        });

        test('URL에 BASE_URL이 포함됨', () => {
            store.setImageUrl(10, 'g', 'stage_10_g.jpg');
            const url = store.getImageUrl(10, 'g');
            // BASE_URL은 환경변수 또는 기본값 http://localhost:3000/images
            expect(url).toMatch(/^http/);
        });

        test('다른 스테이지는 독립적으로 저장', () => {
            store.setImageUrl(1, 'g', 'stage_1_g.jpg');
            store.setImageUrl(2, 'g', 'stage_2_g.jpg');

            expect(store.getImageUrl(1, 'g')).toContain('stage_1_g.jpg');
            expect(store.getImageUrl(2, 'g')).toContain('stage_2_g.jpg');
        });
    });

    // ── getImageFilename / getImageFilePath ──────────────────
    describe('getImageFilename', () => {
        test.each([
            [1,   'g', 'stage_1_g.jpg'],
            [100, 's', 'stage_100_s.jpg'],
            [300, 'g', 'stage_300_g.jpg'],
        ])('stage %i, rating %s → %s', (stage, rating, expected) => {
            expect(store.getImageFilename(stage, rating)).toBe(expected);
        });
    });

    describe('getImageFilePath', () => {
        test('파일 경로에 파일명 포함', () => {
            const filePath = store.getImageFilePath(1, 'g');
            expect(filePath).toContain('stage_1_g.jpg');
        });

        test('filePath는 IMG_DIR로 시작', () => {
            const filePath = store.getImageFilePath(1, 'g');
            expect(filePath).toContain(store.IMG_DIR);
        });
    });

    // ── 보상 이미지 ──────────────────────────────────────────
    describe('setRewardImageUrl / getRewardImageUrl', () => {
        test('보상 이미지 저장 후 조회 가능', () => {
            store.setRewardImageUrl('user-123', 'reward_user-123_9999.jpg');
            const url = store.getRewardImageUrl('user-123');
            expect(url).toContain('reward_user-123_9999.jpg');
        });

        test('보상 이미지 URL에 /rewards/ 경로 포함', () => {
            store.setRewardImageUrl('user-abc', 'reward_user-abc_1234.jpg');
            const url = store.getRewardImageUrl('user-abc');
            expect(url).toContain('/rewards/');
        });

        test('없는 유저는 null 반환', () => {
            expect(store.getRewardImageUrl('nonexistent-user')).toBeNull();
        });

        test('서로 다른 유저의 보상 이미지는 독립적', () => {
            store.setRewardImageUrl('user-A', 'reward_A.jpg');
            store.setRewardImageUrl('user-B', 'reward_B.jpg');

            expect(store.getRewardImageUrl('user-A')).toContain('reward_A.jpg');
            expect(store.getRewardImageUrl('user-B')).toContain('reward_B.jpg');
        });

        test('같은 유저 덮어쓰기 가능', () => {
            store.setRewardImageUrl('user-X', 'reward_old.jpg');
            store.setRewardImageUrl('user-X', 'reward_new.jpg');
            expect(store.getRewardImageUrl('user-X')).toContain('reward_new.jpg');
        });
    });
});
