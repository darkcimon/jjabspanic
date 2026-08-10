/**
 * app.js — Express 앱 정의 (listen 없이)
 * server.js에서 import하여 서버를 시작하고,
 * 테스트에서는 직접 import해서 supertest로 테스트한다.
 */

const express      = require('express');
const path         = require('path');
const crypto       = require('crypto');
const rateLimit    = require('express-rate-limit');
const cookieParser = require('cookie-parser');
const store        = require('./imageStore');
const generator    = require('./batchGenerator');
const { router: authRouter }    = require('./auth');
const { router: paymentRouter } = require('./payment');

// ── 특전 일회용 토큰 저장소 ───────────────────────────────
// Map<token, { userId, stage, expiresAt }>
const REWARD_VALID_STAGES = new Set([100, 200, 300]);
const REWARD_TOKEN_TTL_MS = 30 * 60 * 1000; // 30분
const rewardTokens = new Map();

const app = express();

app.use(express.json());
app.use(cookieParser());
app.use('/images', express.static(path.join(__dirname, 'public', 'images')));
// TWA 도메인 소유권 증명 파일 서빙 (/.well-known/assetlinks.json)
app.get('/.well-known/assetlinks.json', (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.sendFile(path.join(__dirname, 'public', '.well-known', 'assetlinks.json'));
});
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

// 특전 이미지 생성: IP당 하루 3회
const rewardLimiter = rateLimit({
    windowMs: 24 * 60 * 60 * 1000,
    max: 3,
    keyGenerator: (req) => req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.ip,
    message: { error: '오늘 특전 이미지 생성 횟수를 초과했습니다. 내일 다시 시도해주세요.' },
    skipSuccessfulRequests: false,
});

// userId당 쿨다운 (1시간)
const rewardCooldown = new Map(); // userId → lastGeneratedAt (ms)
const REWARD_COOLDOWN_MS = 60 * 60 * 1000;

// 서버 전체 일일 상한 — IP/userId를 여러 개로 바꿔가며 우회하더라도(예: 여러
// 기기·프록시로 rewardLimiter의 IP당 하루 3회를 각각 새로 채우는 경우) 특전
// 이미지(고비용 sd3-large 모델)에 쓰이는 Stability AI 크레딧이 하루에 무제한으로
// 소진되지 않도록, 요청 출처와 무관한 절대 상한선을 둔다.
const REWARD_GLOBAL_DAILY_CAP = parseInt(process.env.REWARD_GLOBAL_DAILY_CAP, 10) || 30;
const REWARD_GLOBAL_WINDOW_MS = 24 * 60 * 60 * 1000;
let rewardGlobalCount = 0;
let rewardGlobalWindowStart = Date.now();

function consumeGlobalRewardQuota() {
    const now = Date.now();
    if (now - rewardGlobalWindowStart >= REWARD_GLOBAL_WINDOW_MS) {
        rewardGlobalWindowStart = now;
        rewardGlobalCount = 0;
    }
    if (rewardGlobalCount >= REWARD_GLOBAL_DAILY_CAP) return false;
    rewardGlobalCount++;
    return true;
}

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
    if (!stage || stage < 1 || stage > store.MAX_STAGE)
        return res.status(400).json({ error: '잘못된 스테이지 번호' });

    const batchIndex = store.getBatchIndex(stage);
    const batch      = store.getBatchStatus(batchIndex);
    const url        = store.getImageUrl(stage, 'g');

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

// ── 특전 토큰 발급 ────────────────────────────────────────
// 100/200/300 스테이지 클리어 시 프론트에서 호출, 30분 유효 일회용 토큰 반환
app.post('/api/reward/token', (req, res) => {
    const { userId, stage } = req.body;
    const stageNum = parseInt(stage, 10);

    if (!userId || !REWARD_VALID_STAGES.has(stageNum))
        return res.status(400).json({ error: '유효하지 않은 요청입니다.' });

    // 만료된 토큰 정리
    const now = Date.now();
    for (const [t, v] of rewardTokens) {
        if (v.expiresAt < now) rewardTokens.delete(t);
    }

    // 해당 userId+stage에 대한 기존 토큰이 있으면 재사용
    for (const [t, v] of rewardTokens) {
        if (v.userId === userId && v.stage === stageNum) {
            return res.json({ token: t });
        }
    }

    const token = crypto.randomUUID();
    rewardTokens.set(token, { userId, stage: stageNum, expiresAt: now + REWARD_TOKEN_TTL_MS });
    res.json({ token });
});

// ── 완주 보상 이미지 생성 ─────────────────────────────────
app.post('/api/reward/generate', rewardLimiter, async (req, res) => {
    const { userId, keywords, token } = req.body;

    if (!userId || !keywords || keywords.trim().length === 0)
        return res.status(400).json({ error: 'userId와 keywords는 필수입니다.' });

    if (keywords.length > 200)
        return res.status(400).json({ error: '키워드는 200자 이하로 입력해주세요.' });

    // 토큰 검증
    const tokenData = rewardTokens.get(token);
    if (!tokenData)
        return res.status(403).json({ error: '유효하지 않거나 만료된 요청입니다. 스테이지를 클리어한 후 다시 시도해주세요.' });
    if (tokenData.userId !== userId || Date.now() > tokenData.expiresAt)
        return res.status(403).json({ error: '유효하지 않거나 만료된 요청입니다.' });

    const existing = store.getRewardImageUrl(userId);
    if (existing) {
        rewardTokens.delete(token);
        return res.json({ status: 'ready', imageUrl: existing });
    }

    // userId 쿨다운 체크
    const lastGen = rewardCooldown.get(userId);
    if (lastGen && Date.now() - lastGen < REWARD_COOLDOWN_MS) {
        const remaining = Math.ceil((REWARD_COOLDOWN_MS - (Date.now() - lastGen)) / 60000);
        return res.status(429).json({ error: `특전 이미지는 1시간에 1회만 생성할 수 있습니다. ${remaining}분 후 다시 시도해주세요.` });
    }

    // 서버 전체 일일 상한 체크 — 유료 API 호출(generateRewardImage) 전에 막는다.
    // 한도 초과 시 토큰/쿨다운을 소모하지 않아 유저는 내일 같은 토큰으로 재시도 가능.
    if (!consumeGlobalRewardQuota()) {
        return res.status(429).json({ error: '오늘 전체 특전 이미지 생성 한도를 초과했습니다. 내일 다시 시도해주세요.' });
    }

    rewardTokens.delete(token); // 일회용: 생성 시도 시 소모
    try {
        rewardCooldown.set(userId, Date.now());
        await generator.generateRewardImage(userId, keywords.trim());
        const imageUrl = store.getRewardImageUrl(userId);
        res.json({ status: 'ready', imageUrl });
    } catch (err) {
        rewardCooldown.delete(userId); // 실패 시 쿨다운 취소
        rewardGlobalCount = Math.max(0, rewardGlobalCount - 1); // 실패 시 전역 한도도 환급
        console.error(`[Server] 보상 이미지 생성 실패: ${err.message}`);
        res.status(500).json({ error: err.message });
    }
});

module.exports = {
    app,
    // 테스트 전용: 전역 특전 이미지 생성 카운터를 초기화한다 (모듈이 프로세스
    // 생명주기 동안 한 번만 로드되므로, 테스트 간 상태가 새지 않도록 필요).
    __resetRewardGlobalQuotaForTests: () => {
        rewardGlobalCount = 0;
        rewardGlobalWindowStart = Date.now();
    },
};
