/**
 * app.js — Express 앱 정의 (listen 없이)
 * server.js에서 import하여 서버를 시작하고,
 * 테스트에서는 직접 import해서 supertest로 테스트한다.
 */

const express      = require('express');
const path         = require('path');
const rateLimit    = require('express-rate-limit');
const cookieParser = require('cookie-parser');
const store        = require('./imageStore');
const generator    = require('./batchGenerator');
const { router: authRouter }    = require('./auth');
const { router: paymentRouter } = require('./payment');

const app = express();

app.use(express.json());
app.use(cookieParser());
app.use('/images', express.static(path.join(__dirname, 'public', 'images')));
// TWA 도메인 소유권 증명 파일 서빙 (/.well-known/assetlinks.json)
app.use('/.well-known', express.static(path.join(__dirname, 'public', '.well-known')));
// Serve web frontend
app.use(express.static(path.join(__dirname, '..', 'web')));

// ── 인증 / 결제 라우터 ────────────────────────────────────
app.use('/auth',    authRouter);
app.use('/payment', paymentRouter);

const apiLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 60,
    message: { error: 'Too many requests' }
});
app.use('/api/', apiLimiter);

// ── 클라이언트 설정 노출 ──────────────────────────────────
// 프론트엔드에서 /api/config를 호출해 토스 클라이언트 키를 가져간다.
// 비밀 키(TOSS_SECRET_KEY)는 절대 포함하지 않는다.
app.get('/api/config', (req, res) => {
    res.json({
        tossClientKey: process.env.TOSS_CLIENT_KEY || null,
    });
});

// ── 이미지 URL 조회 ───────────────────────────────────────
app.get('/api/image', (req, res) => {
    const stage  = parseInt(req.query.stage, 10);
    const rating = req.query.rating === 's' ? 's' : 'g';

    if (!stage || stage < 1 || stage > store.MAX_STAGE)
        return res.status(400).json({ error: '잘못된 스테이지 번호' });

    const batchIndex = store.getBatchIndex(stage);
    const batch      = store.getBatchStatus(batchIndex);
    const url        = store.getImageUrl(stage, rating)
                    || (rating === 's' ? store.getImageUrl(stage, 'g') : null); // fallback to g

    if (url) {
        return res.json({ status: 'ready', url });
    }

    return res.json({
        status: batch.status,
        progress: batch.progress,
        url: null
    });
});

// ── 배치 상태 조회 ────────────────────────────────────────
app.get('/api/batch/status', (req, res) => {
    const batchIndex = parseInt(req.query.batchIndex, 10);
    if (isNaN(batchIndex) || batchIndex < 0 || batchIndex >= store.TOTAL_BATCH)
        return res.status(400).json({ error: '잘못된 배치 인덱스' });

    res.json(store.getBatchStatus(batchIndex));
});

// ── 배치 생성 트리거 ──────────────────────────────────────
app.post('/api/batch/trigger', async (req, res) => {
    const { batchIndex } = req.body;

    if (typeof batchIndex !== 'number' || batchIndex < 1 || batchIndex >= store.TOTAL_BATCH)
        return res.status(400).json({ error: '잘못된 배치 인덱스 (0은 사전 생성됨, 1~9만 트리거 가능)' });

    const current = store.getBatchStatus(batchIndex);

    if (current.status === 'ready')
        return res.json({ status: 'already_ready' });

    if (current.status === 'generating')
        return res.json({ status: 'already_generating', progress: current.progress });

    const claimed = store.claimBatchGeneration(batchIndex);
    if (!claimed)
        return res.json({ status: 'already_generating' });

    res.json({ status: 'triggered', batchIndex });

    generator.generateBatchBothRatings(batchIndex).catch(err => {
        console.error(`[Server] 배치 ${batchIndex} 생성 오류:`, err.message);
    });
});

// ── 완주 보상 이미지 생성 ─────────────────────────────────
app.post('/api/reward/generate', async (req, res) => {
    const { userId, keywords } = req.body;

    if (!userId || !keywords || keywords.trim().length === 0)
        return res.status(400).json({ error: 'userId와 keywords는 필수입니다.' });

    if (keywords.length > 200)
        return res.status(400).json({ error: '키워드는 200자 이하로 입력해주세요.' });

    const existing = store.getRewardImageUrl(userId);
    if (existing)
        return res.json({ status: 'ready', imageUrl: existing });

    try {
        await generator.generateRewardImage(userId, keywords.trim());
        const imageUrl = store.getRewardImageUrl(userId);
        res.json({ status: 'ready', imageUrl });
    } catch (err) {
        console.error(`[Server] 보상 이미지 생성 실패: ${err.message}`);
        res.status(500).json({ error: err.message });
    }
});

module.exports = { app };
