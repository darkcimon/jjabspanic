'use strict';

/**
 * batchGenerator.test.js
 * batchGenerator.js의 공개 함수를 단위 테스트한다.
 * - axios, fs, imageStore를 모킹하여 실제 API/파일 I/O 없이 테스트
 * - buildPrompt / calcSeed는 generateImage를 통해 간접 검증
 */

// ── FormData 모킹: append 호출 인수를 캡처 ───────────────
const mockFormAppend   = jest.fn();
const mockFormGetHdrs  = jest.fn(() => ({ 'content-type': 'multipart/form-data; boundary=---' }));

jest.mock('form-data', () =>
    jest.fn().mockImplementation(() => ({
        append:     mockFormAppend,
        getHeaders: mockFormGetHdrs,
    }))
);

// ── axios 모킹 ───────────────────────────────────────────
jest.mock('axios');

// ── fs 모킹 ──────────────────────────────────────────────
jest.mock('fs', () => ({
    writeFileSync: jest.fn(),
    mkdirSync:     jest.fn(),
}));

// ── imageStore 모킹 ──────────────────────────────────────
jest.mock('../imageStore', () => ({
    BATCH_SIZE:           30,
    MAX_STAGE:            300,
    IMG_DIR:              '/tmp/test-images',
    getImageFilePath:     jest.fn((s, r) => `/tmp/test-images/stage_${s}_${r}.jpg`),
    getImageFilename:     jest.fn((s, r) => `stage_${s}_${r}.jpg`),
    setImageUrl:          jest.fn(),
    setRewardImageUrl:    jest.fn(),
    updateBatchProgress:  jest.fn(),
    markBatchReady:       jest.fn(),
}));

// ── 모듈 로드 ────────────────────────────────────────────
const axios     = require('axios');
const generator = require('../batchGenerator');

const FAKE_IMAGE = Buffer.from('fake-jpeg-data');

// ── 헬퍼: FormData에서 특정 필드 추출 ───────────────────
function getFormField(name) {
    const call = mockFormAppend.mock.calls.find((c) => c[0] === name);
    return call ? call[1] : undefined;
}

// ── 공통 설정 ─────────────────────────────────────────────
beforeEach(() => {
    jest.clearAllMocks();
    process.env.STABILITY_API_KEY = 'test-api-key-abc';
    axios.post.mockResolvedValue({ data: FAKE_IMAGE });
});

afterEach(() => {
    delete process.env.STABILITY_API_KEY;
});

// ─────────────────────────────────────────────────────────
describe('generateImage', () => {
    // ── API 키 검증 ────────────────────────────────────────
    test('STABILITY_API_KEY 없으면 에러 발생', async () => {
        delete process.env.STABILITY_API_KEY;
        await expect(generator.generateImage(1, 'g')).rejects.toThrow('STABILITY_API_KEY');
    });

    // ── API 엔드포인트 ─────────────────────────────────────
    test('올바른 Stability AI URL로 호출', async () => {
        await generator.generateImage(1, 'g');
        expect(axios.post).toHaveBeenCalledWith(
            'https://api.stability.ai/v2beta/stable-image/generate/sd3',
            expect.anything(),
            expect.anything()
        );
    });

    test('Authorization 헤더에 Bearer 토큰 포함', async () => {
        await generator.generateImage(1, 'g');
        const [, , config] = axios.post.mock.calls[0];
        expect(config.headers['Authorization']).toBe('Bearer test-api-key-abc');
    });

    test('Accept 헤더는 image/*', async () => {
        await generator.generateImage(1, 'g');
        const [, , config] = axios.post.mock.calls[0];
        expect(config.headers['Accept']).toBe('image/*');
    });

    test('타임아웃은 60초', async () => {
        await generator.generateImage(1, 'g');
        const [, , config] = axios.post.mock.calls[0];
        expect(config.timeout).toBe(60000);
    });

    // ── buildPrompt 검증 (간접) ────────────────────────────
    test('general(g) 프롬프트에 SEXY_MODIFIER 없음', async () => {
        await generator.generateImage(1, 'g');
        const prompt = getFormField('prompt');
        expect(prompt).toBeDefined();
        expect(prompt).not.toContain('sexy pose');
        expect(prompt).not.toContain('swimsuit or lingerie');
    });

    test('sexy(s) 프롬프트에 SEXY_MODIFIER 포함', async () => {
        await generator.generateImage(1, 's');
        const prompt = getFormField('prompt');
        expect(prompt).toContain('sexy pose');
        expect(prompt).toContain('swimsuit or lingerie');
    });

    test('모든 프롬프트에 QUALITY_SUFFIX 포함', async () => {
        await generator.generateImage(7, 'g');
        const prompt = getFormField('prompt');
        expect(prompt).toContain('white background');
        expect(prompt).toContain('high quality');
        expect(prompt).toContain('masterpiece');
    });

    test('stage 1과 stage 13은 같은 기본 프롬프트 (12-cycle)', async () => {
        await generator.generateImage(1, 'g');
        const prompt1 = getFormField('prompt');

        jest.clearAllMocks();

        await generator.generateImage(13, 'g');
        const prompt13 = getFormField('prompt');

        expect(prompt1).toBe(prompt13);
    });

    test('stage 2와 stage 14는 같은 기본 프롬프트 (12-cycle)', async () => {
        await generator.generateImage(2, 'g');
        const prompt2 = getFormField('prompt');

        jest.clearAllMocks();

        await generator.generateImage(14, 'g');
        const prompt14 = getFormField('prompt');

        expect(prompt2).toBe(prompt14);
    });

    test('stage 1과 stage 2는 다른 프롬프트', async () => {
        await generator.generateImage(1, 'g');
        const prompt1 = getFormField('prompt');

        jest.clearAllMocks();

        await generator.generateImage(2, 'g');
        const prompt2 = getFormField('prompt');

        expect(prompt1).not.toBe(prompt2);
    });

    // ── calcSeed 검증 (간접) ───────────────────────────────
    test('calcSeed: stage 1 general → 137', async () => {
        await generator.generateImage(1, 'g');
        // calcSeed(1, 'g') = (1*137 + 0) % 2147483647 = 137
        expect(getFormField('seed')).toBe('137');
    });

    test('calcSeed: stage 1 sexy → 1000136', async () => {
        await generator.generateImage(1, 's');
        // calcSeed(1, 's') = (1*137 + 999999) % 2147483647 = 1000136
        expect(getFormField('seed')).toBe('1000136');
    });

    test('general과 sexy는 다른 seed 사용', async () => {
        await generator.generateImage(5, 'g');
        const seedG = getFormField('seed');

        jest.clearAllMocks();

        await generator.generateImage(5, 's');
        const seedS = getFormField('seed');

        expect(seedG).not.toBe(seedS);
    });

    test('seed는 항상 양의 정수 (결정론적)', async () => {
        await generator.generateImage(100, 'g');
        const seed = parseInt(getFormField('seed'), 10);
        expect(seed).toBeGreaterThanOrEqual(0);
        expect(seed).toBeLessThan(2147483647);
    });

    // ── 폼 파라미터 ───────────────────────────────────────
    test('output_format은 jpeg', async () => {
        await generator.generateImage(1, 'g');
        expect(getFormField('output_format')).toBe('jpeg');
    });

    test('aspect_ratio는 2:3', async () => {
        await generator.generateImage(1, 'g');
        expect(getFormField('aspect_ratio')).toBe('2:3');
    });

    test('model은 sd3-medium', async () => {
        await generator.generateImage(1, 'g');
        expect(getFormField('model')).toBe('sd3-medium');
    });

    test('negative_prompt에 금지 키워드 포함', async () => {
        await generator.generateImage(1, 'g');
        const neg = getFormField('negative_prompt');
        expect(neg).toContain('loli');
        expect(neg).toContain('nsfw');
        expect(neg).toContain('child');
    });

    // ── 파일 저장 & store 업데이트 ────────────────────────
    test('이미지 버퍼를 파일로 저장', async () => {
        const fs = require('fs');
        await generator.generateImage(3, 'g');
        expect(fs.writeFileSync).toHaveBeenCalledWith(
            expect.stringContaining('stage_3_g.jpg'),
            FAKE_IMAGE
        );
    });

    test('store.setImageUrl 호출', async () => {
        const store = require('../imageStore');
        await generator.generateImage(3, 'g');
        expect(store.setImageUrl).toHaveBeenCalledWith(3, 'g', 'stage_3_g.jpg');
    });

    test('파일명 반환', async () => {
        const result = await generator.generateImage(3, 'g');
        expect(result).toBe('stage_3_g.jpg');
    });
});

// ─────────────────────────────────────────────────────────
describe('generateRewardImage', () => {
    // ── 금지 키워드 필터 ───────────────────────────────────
    const BLOCKED = ['nsfw', 'loli', 'young', 'teen', 'child', 'school uniform'];

    test.each(BLOCKED)(
        '금지 키워드 "%s" → 에러 발생 (API 호출 없음)',
        async (keyword) => {
            await expect(
                generator.generateRewardImage('user-1', keyword)
            ).rejects.toThrow('허용되지 않는 키워드');
            expect(axios.post).not.toHaveBeenCalled();
        }
    );

    test('금지 키워드 대소문자 구분 없이 차단 (NSFW)', async () => {
        await expect(
            generator.generateRewardImage('user-1', 'NSFW content')
        ).rejects.toThrow('허용되지 않는 키워드');
    });

    test('금지 키워드 대소문자 구분 없이 차단 (Loli)', async () => {
        await expect(
            generator.generateRewardImage('user-1', 'Loli art')
        ).rejects.toThrow('허용되지 않는 키워드');
    });

    test('STABILITY_API_KEY 없으면 에러', async () => {
        delete process.env.STABILITY_API_KEY;
        await expect(
            generator.generateRewardImage('user-1', 'fantasy girl')
        ).rejects.toThrow('STABILITY_API_KEY');
    });

    // ── 정상 케이스 ───────────────────────────────────────
    test('유효한 키워드로 이미지 생성 성공', async () => {
        await expect(
            generator.generateRewardImage('user-ok', 'magical girl, sparkles')
        ).resolves.toEqual(expect.stringContaining('reward_user-ok_'));
    });

    test('보상 이미지는 sd3-large 모델 사용', async () => {
        await generator.generateRewardImage('user-ok', 'fantasy');
        expect(getFormField('model')).toBe('sd3-large');
    });

    test('타임아웃은 90초', async () => {
        await generator.generateRewardImage('user-ok', 'fantasy');
        const [, , config] = axios.post.mock.calls[0];
        expect(config.timeout).toBe(90000);
    });

    test('프롬프트에 키워드 포함', async () => {
        await generator.generateRewardImage('user-ok', 'cyberpunk, neon');
        const prompt = getFormField('prompt');
        expect(prompt).toContain('cyberpunk, neon');
    });

    test('프롬프트에 mature female 포함', async () => {
        await generator.generateRewardImage('user-ok', 'fantasy');
        const prompt = getFormField('prompt');
        expect(prompt).toContain('mature female');
    });

    test('store.setRewardImageUrl 호출', async () => {
        const store = require('../imageStore');
        await generator.generateRewardImage('user-xyz', 'fantasy');
        expect(store.setRewardImageUrl).toHaveBeenCalledWith(
            'user-xyz',
            expect.stringContaining('reward_user-xyz_')
        );
    });

    test('파일명에 타임스탬프 포함', async () => {
        const result = await generator.generateRewardImage('user-ts', 'fantasy');
        expect(result).toMatch(/^reward_user-ts_\d+\.jpg$/);
    });

    test('이미지 버퍼를 rewards 폴더에 저장', async () => {
        const fs = require('fs');
        await generator.generateRewardImage('user-save', 'fantasy');
        expect(fs.writeFileSync).toHaveBeenCalledWith(
            expect.stringContaining('rewards'),
            FAKE_IMAGE
        );
    });
});

// ─────────────────────────────────────────────────────────
describe('generateBatchBothRatings', () => {
    /**
     * generateBatchBothRatings는 내부적으로 generateBatch를 직접 호출하므로
     * (CommonJS 로컬 바인딩) spy로 가로챌 수 없다.
     * 대신 fake timer로 sleep을 건너뛴 뒤 axios.post 호출 횟수로 검증한다.
     * batchIndex=0 → stage 1~30, g+s = 60회 API 호출 기대.
     */
    test('general + sexy 배치를 순차적으로 완료 (60회 API 호출)', async () => {
        jest.useFakeTimers();
        try {
            const batchPromise = generator.generateBatchBothRatings(0);
            // Jest 29.1+ runAllTimersAsync: 타이머 소진 + Promise flush를 교대로 수행
            await jest.runAllTimersAsync();
            await batchPromise;

            expect(axios.post).toHaveBeenCalledTimes(60);
        } finally {
            jest.useRealTimers();
        }
    });
});
