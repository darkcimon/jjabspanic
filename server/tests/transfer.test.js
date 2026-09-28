'use strict';

/**
 * transfer.test.js
 * 세이브 데이터 이전 API(/api/transfer, /api/transfer/redeem) 통합 테스트.
 * DATA_DIR를 임시 폴더로 돌려 실제 server/data를 건드리지 않는다.
 */

const os   = require('os');
const fs   = require('fs');
const path = require('path');

const TMP_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'kn-transfer-'));
process.env.DATA_DIR = TMP_DIR;

jest.mock('../imageStore', () => ({
    MAX_STAGE: 300, BATCH_SIZE: 30, TOTAL_BATCH: 10,
    IMG_DIR: require('path').join(__dirname, '..', 'public', 'images'),
}));
jest.mock('../batchGenerator', () => ({}));

const request = require('supertest');
const { app } = require('../app');
const transferStore = require('../transferStore');

afterAll(() => fs.rmSync(TMP_DIR, { recursive: true, force: true }));

const SAVE = { stage: 42, bestStage: 41, totalScore: 123456, gallery: [1, 2, 3], userId: 'u-1' };

test('코드 발급 후 불러오면 세이브와 구매 목록이 그대로 돌아온다', async () => {
    const created = await request(app).post('/api/transfer').send({ save: SAVE, purchases: ['pack_a'] });
    expect(created.status).toBe(200);
    expect(created.body.code).toMatch(/^[A-Z2-9]{8}$/);
    expect(created.body.expiresAt).toBeGreaterThan(Date.now());

    const code = created.body.code;
    const redeemed = await request(app).post('/api/transfer/redeem')
        .send({ code: `${code.slice(0, 4).toLowerCase()}-${code.slice(4)}` });
    expect(redeemed.status).toBe(200);
    expect(redeemed.body).toEqual({ save: SAVE, purchases: ['pack_a'] });
});

test('코드는 1회용이다', async () => {
    const { body } = await request(app).post('/api/transfer').send({ save: SAVE });
    expect((await request(app).post('/api/transfer/redeem').send({ code: body.code })).status).toBe(200);
    const again = await request(app).post('/api/transfer/redeem').send({ code: body.code });
    expect(again.status).toBe(404);
    expect(again.body).toHaveProperty('error');
});

test('만료된 코드는 거부한다', async () => {
    const realNow = Date.now;
    const { code } = transferStore.create({ save: SAVE });
    Date.now = () => realNow() + transferStore.TTL_MS + 1000;
    try {
        expect(transferStore.redeem(code)).toBeNull();
    } finally {
        Date.now = realNow;
    }
});

test('잘못된 형식의 코드 → 404', async () => {
    const res = await request(app).post('/api/transfer/redeem').send({ code: 'O0I1' });
    expect(res.status).toBe(404);
});

test('save가 객체가 아니면 400', async () => {
    for (const save of [undefined, null, 'x', [1, 2]]) {
        const res = await request(app).post('/api/transfer').send({ save });
        expect(res.status).toBe(400);
    }
});

test('너무 큰 세이브는 400', async () => {
    const res = await request(app).post('/api/transfer')
        .send({ save: { blob: 'x'.repeat(95 * 1024) } });
    expect(res.status).toBe(400);
});
