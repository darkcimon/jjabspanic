'use strict';

/**
 * server.test.js
 * API 엔드포인트를 supertest로 통합 테스트한다.
 * imageStore와 batchGenerator는 모킹하여 외부 의존성 제거.
 */

// ── imageStore 모킹 ──────────────────────────────────────
jest.mock('../imageStore', () => ({
    MAX_STAGE:              300,
    BATCH_SIZE:             30,
    TOTAL_BATCH:            10,
    getBatchIndex:          jest.fn((stage) => Math.floor((stage - 1) / 30)),
    getBatchStatus:         jest.fn(),
    getImageUrl:            jest.fn(),
    claimBatchGeneration:   jest.fn(),
    getRewardImageUrl:      jest.fn(),
}));

// ── batchGenerator 모킹 ──────────────────────────────────
jest.mock('../batchGenerator', () => ({
    generateBatchBothRatings: jest.fn().mockResolvedValue(undefined),
    generateRewardImage:      jest.fn().mockResolvedValue('reward_user_12345.jpg'),
}));

const request   = require('supertest');
const { app }   = require('../app');
const store     = require('../imageStore');
const generator = require('../batchGenerator');

// ── 공통 설정 ─────────────────────────────────────────────
beforeEach(() => {
    jest.clearAllMocks();
});

// ─────────────────────────────────────────────────────────
describe('GET /api/image', () => {
    // ── 유효성 검사 ───────────────────────────────────────
    test('stage 파라미터 없으면 400', async () => {
        const res = await request(app).get('/api/image');
        expect(res.status).toBe(400);
        expect(res.body).toHaveProperty('error');
    });

    test('stage=0 → 400', async () => {
        const res = await request(app).get('/api/image?stage=0&rating=g');
        expect(res.status).toBe(400);
    });

    test('stage=301 → 400 (MAX_STAGE 초과)', async () => {
        const res = await request(app).get('/api/image?stage=301&rating=g');
        expect(res.status).toBe(400);
    });

    test('stage=abc → 400 (NaN)', async () => {
        const res = await request(app).get('/api/image?stage=abc&rating=g');
        expect(res.status).toBe(400);
    });

    // ── 이미지 준비된 경우 ────────────────────────────────
    test('이미지가 있으면 status=ready + url 반환', async () => {
        store.getImageUrl.mockReturnValue('http://localhost:3000/images/stage_1_g.jpg');
        store.getBatchStatus.mockReturnValue({ status: 'ready', progress: 30 });

        const res = await request(app).get('/api/image?stage=1&rating=g');

        expect(res.status).toBe(200);
        expect(res.body.status).toBe('ready');
        expect(res.body.url).toContain('stage_1_g.jpg');
    });

    // ── 이미지 미준비 케이스 ──────────────────────────────
    test('이미지 없고 배치 pending → status=pending, url=null', async () => {
        store.getImageUrl.mockReturnValue(null);
        store.getBatchStatus.mockReturnValue({ status: 'pending', progress: 0 });

        const res = await request(app).get('/api/image?stage=31&rating=g');

        expect(res.status).toBe(200);
        expect(res.body.status).toBe('pending');
        expect(res.body.url).toBeNull();
        expect(res.body.progress).toBe(0);
    });

    test('이미지 없고 배치 generating → status=generating + progress', async () => {
        store.getImageUrl.mockReturnValue(null);
        store.getBatchStatus.mockReturnValue({ status: 'generating', progress: 15 });

        const res = await request(app).get('/api/image?stage=31&rating=g');

        expect(res.status).toBe(200);
        expect(res.body.status).toBe('generating');
        expect(res.body.progress).toBe(15);
    });

    // ── rating 파라미터 처리 ──────────────────────────────
    test("rating='s'일 때 sexy 이미지 URL 반환", async () => {
        store.getImageUrl.mockReturnValue('http://localhost:3000/images/stage_1_s.jpg');
        store.getBatchStatus.mockReturnValue({ status: 'ready', progress: 30 });

        const res = await request(app).get('/api/image?stage=1&rating=s');

        expect(res.body.url).toContain('stage_1_s.jpg');
    });

    test("잘못된 rating은 기본값 'g' 처리", async () => {
        store.getImageUrl.mockReturnValue('http://localhost:3000/images/stage_1_g.jpg');
        store.getBatchStatus.mockReturnValue({ status: 'ready', progress: 30 });

        await request(app).get('/api/image?stage=1&rating=xxx');

        // getImageUrl은 'g'로 호출되어야 함
        expect(store.getImageUrl).toHaveBeenCalledWith(1, 'g');
    });

    // ── 경계값 ────────────────────────────────────────────
    test('stage=1 (최솟값) 정상 처리', async () => {
        store.getImageUrl.mockReturnValue('http://localhost:3000/images/stage_1_g.jpg');
        store.getBatchStatus.mockReturnValue({ status: 'ready', progress: 30 });

        const res = await request(app).get('/api/image?stage=1&rating=g');
        expect(res.status).toBe(200);
    });

    test('stage=300 (최댓값) 정상 처리', async () => {
        store.getImageUrl.mockReturnValue('http://localhost:3000/images/stage_300_g.jpg');
        store.getBatchStatus.mockReturnValue({ status: 'ready', progress: 30 });

        const res = await request(app).get('/api/image?stage=300&rating=g');
        expect(res.status).toBe(200);
    });
});

// ─────────────────────────────────────────────────────────
describe('GET /api/batch/status', () => {
    test('batchIndex 없으면 400', async () => {
        const res = await request(app).get('/api/batch/status');
        expect(res.status).toBe(400);
    });

    test('batchIndex=-1 → 400', async () => {
        const res = await request(app).get('/api/batch/status?batchIndex=-1');
        expect(res.status).toBe(400);
    });

    test('batchIndex=10 (범위 초과) → 400', async () => {
        const res = await request(app).get('/api/batch/status?batchIndex=10');
        expect(res.status).toBe(400);
    });

    test('batchIndex=abc → 400 (NaN)', async () => {
        const res = await request(app).get('/api/batch/status?batchIndex=abc');
        expect(res.status).toBe(400);
    });

    test('유효한 batchIndex → 배치 상태 반환', async () => {
        store.getBatchStatus.mockReturnValue({ status: 'pending', progress: 0 });

        const res = await request(app).get('/api/batch/status?batchIndex=1');

        expect(res.status).toBe(200);
        expect(res.body.status).toBe('pending');
    });

    test.each([0, 1, 5, 9])('batchIndex=%i (유효 범위) → 200', async (idx) => {
        store.getBatchStatus.mockReturnValue({ status: 'pending', progress: 0 });

        const res = await request(app).get(`/api/batch/status?batchIndex=${idx}`);
        expect(res.status).toBe(200);
    });
});

// ─────────────────────────────────────────────────────────
describe('POST /api/batch/trigger', () => {
    test('batchIndex 없으면 400', async () => {
        const res = await request(app).post('/api/batch/trigger').send({});
        expect(res.status).toBe(400);
    });

    test('batchIndex=0 → 400 (사전 생성 배치)', async () => {
        const res = await request(app)
            .post('/api/batch/trigger')
            .send({ batchIndex: 0 });
        expect(res.status).toBe(400);
        expect(res.body.error).toContain('0은 사전 생성됨');
    });

    test('batchIndex=10 (범위 초과) → 400', async () => {
        const res = await request(app)
            .post('/api/batch/trigger')
            .send({ batchIndex: 10 });
        expect(res.status).toBe(400);
    });

    test('batchIndex가 문자열 → 400', async () => {
        const res = await request(app)
            .post('/api/batch/trigger')
            .send({ batchIndex: '1' });
        expect(res.status).toBe(400);
    });

    test('이미 ready 상태 → already_ready 반환', async () => {
        store.getBatchStatus.mockReturnValue({ status: 'ready', progress: 30 });

        const res = await request(app)
            .post('/api/batch/trigger')
            .send({ batchIndex: 1 });

        expect(res.status).toBe(200);
        expect(res.body.status).toBe('already_ready');
    });

    test('이미 generating 중 → already_generating + progress 반환', async () => {
        store.getBatchStatus.mockReturnValue({ status: 'generating', progress: 12 });

        const res = await request(app)
            .post('/api/batch/trigger')
            .send({ batchIndex: 1 });

        expect(res.status).toBe(200);
        expect(res.body.status).toBe('already_generating');
        expect(res.body.progress).toBe(12);
    });

    test('pending 상태이고 claim 성공 → triggered 반환', async () => {
        store.getBatchStatus.mockReturnValue({ status: 'pending', progress: 0 });
        store.claimBatchGeneration.mockReturnValue(true);

        const res = await request(app)
            .post('/api/batch/trigger')
            .send({ batchIndex: 2 });

        expect(res.status).toBe(200);
        expect(res.body.status).toBe('triggered');
        expect(res.body.batchIndex).toBe(2);
    });

    test('claim 실패(경쟁 조건) → already_generating 반환', async () => {
        store.getBatchStatus.mockReturnValue({ status: 'pending', progress: 0 });
        store.claimBatchGeneration.mockReturnValue(false);

        const res = await request(app)
            .post('/api/batch/trigger')
            .send({ batchIndex: 3 });

        expect(res.status).toBe(200);
        expect(res.body.status).toBe('already_generating');
    });

    test('triggered 시 generateBatchBothRatings 비동기 호출', async () => {
        store.getBatchStatus.mockReturnValue({ status: 'pending', progress: 0 });
        store.claimBatchGeneration.mockReturnValue(true);

        await request(app)
            .post('/api/batch/trigger')
            .send({ batchIndex: 2 });

        // 백그라운드 실행이므로 즉시 확인하거나 짧게 대기
        await new Promise((r) => setTimeout(r, 10));
        expect(generator.generateBatchBothRatings).toHaveBeenCalledWith(2);
    });
});

// ─────────────────────────────────────────────────────────
describe('POST /api/reward/generate', () => {
    // ── 유효성 검사 ───────────────────────────────────────
    test('userId 없으면 400', async () => {
        const res = await request(app)
            .post('/api/reward/generate')
            .send({ keywords: 'fantasy' });
        expect(res.status).toBe(400);
        expect(res.body.error).toContain('필수');
    });

    test('keywords 없으면 400', async () => {
        const res = await request(app)
            .post('/api/reward/generate')
            .send({ userId: 'user-1' });
        expect(res.status).toBe(400);
    });

    test('keywords가 빈 문자열 → 400', async () => {
        const res = await request(app)
            .post('/api/reward/generate')
            .send({ userId: 'user-1', keywords: '   ' });
        expect(res.status).toBe(400);
    });

    test('keywords 200자 초과 → 400', async () => {
        const longKeywords = 'a'.repeat(201);
        const res = await request(app)
            .post('/api/reward/generate')
            .send({ userId: 'user-1', keywords: longKeywords });
        expect(res.status).toBe(400);
        expect(res.body.error).toContain('200자');
    });

    test('keywords 정확히 200자 → 허용', async () => {
        store.getRewardImageUrl.mockReturnValue(null);
        generator.generateRewardImage.mockResolvedValue('reward.jpg');
        store.getRewardImageUrl
            .mockReturnValueOnce(null)
            .mockReturnValue('http://localhost:3000/images/rewards/reward.jpg');

        const exactly200 = 'a'.repeat(200);
        const res = await request(app)
            .post('/api/reward/generate')
            .send({ userId: 'user-1', keywords: exactly200 });
        expect(res.status).toBe(200);
    });

    // ── 이미 생성된 보상 이미지 ──────────────────────────
    test('이미 보상 이미지 존재 → 즉시 반환 (API 호출 없음)', async () => {
        store.getRewardImageUrl.mockReturnValue(
            'http://localhost:3000/images/rewards/reward_user-1_9999.jpg'
        );

        const res = await request(app)
            .post('/api/reward/generate')
            .send({ userId: 'user-1', keywords: 'fantasy' });

        expect(res.status).toBe(200);
        expect(res.body.status).toBe('ready');
        expect(res.body.imageUrl).toContain('reward_user-1_9999.jpg');
        expect(generator.generateRewardImage).not.toHaveBeenCalled();
    });

    // ── 새 이미지 생성 ────────────────────────────────────
    test('보상 이미지 없을 때 생성 후 반환', async () => {
        store.getRewardImageUrl
            .mockReturnValueOnce(null)  // 첫 호출: 없음
            .mockReturnValue('http://localhost:3000/images/rewards/reward_user-2_111.jpg');

        const res = await request(app)
            .post('/api/reward/generate')
            .send({ userId: 'user-2', keywords: 'magical girl' });

        expect(res.status).toBe(200);
        expect(res.body.status).toBe('ready');
        expect(generator.generateRewardImage).toHaveBeenCalledWith(
            'user-2',
            'magical girl'
        );
    });

    test('keywords 앞뒤 공백 trim 후 전달', async () => {
        store.getRewardImageUrl.mockReturnValueOnce(null).mockReturnValue('http://x/img.jpg');

        await request(app)
            .post('/api/reward/generate')
            .send({ userId: 'user-3', keywords: '  fantasy  ' });

        expect(generator.generateRewardImage).toHaveBeenCalledWith('user-3', 'fantasy');
    });

    // ── 에러 처리 ─────────────────────────────────────────
    test('generateRewardImage 실패 → 500 반환', async () => {
        store.getRewardImageUrl.mockReturnValue(null);
        generator.generateRewardImage.mockRejectedValue(
            new Error('허용되지 않는 키워드가 포함되어 있습니다.')
        );

        const res = await request(app)
            .post('/api/reward/generate')
            .send({ userId: 'user-err', keywords: 'bad content' });

        expect(res.status).toBe(500);
        expect(res.body.error).toContain('허용되지 않는 키워드');
    });

    test('API 서버 오류 → 500 반환', async () => {
        store.getRewardImageUrl.mockReturnValue(null);
        generator.generateRewardImage.mockRejectedValue(new Error('API connection failed'));

        const res = await request(app)
            .post('/api/reward/generate')
            .send({ userId: 'user-err2', keywords: 'fantasy' });

        expect(res.status).toBe(500);
    });
});
