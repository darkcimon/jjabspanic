/**
 * app.js — Express 앱 정의 (listen 없이)
 * server.js에서 import하여 서버를 시작하고,
 * 테스트에서는 직접 import해서 supertest로 테스트한다.
 */

const express      = require('express');
const path         = require('path');
const fs           = require('fs');
const crypto       = require('crypto');
const rateLimit    = require('express-rate-limit');
const cookieParser = require('cookie-parser');
const store        = require('./imageStore');
const generator    = require('./batchGenerator');
const { router: authRouter }    = require('./auth');
const { router: paymentRouter } = require('./payment');
const i18n = require('./i18n');

// ── 특전 일회용 토큰 저장소 ───────────────────────────────
// Map<token, { userId, stage, expiresAt }>
// 특전은 100단계마다 반복 지급된다 (100, 200, 300, ... 300단계를 넘어 계속
// 이어서 플레이해도 400, 500...에서 계속 발동). 예전엔 100/200/300 세 개만
// 허용하는 고정 Set이라, 300단계를 넘긴 이후로는 특전 화면 자체가 뜨지 않았다.
function isValidRewardStage(n) {
    return Number.isInteger(n) && n > 0 && n % 100 === 0;
}
const REWARD_TOKEN_TTL_MS = 30 * 60 * 1000; // 30분
const rewardTokens = new Map();

const app = express();

// Railway 등 PaaS는 앞단에 리버스 프록시가 1홉 있고, 그 프록시가 실제 클라이언트
// IP를 X-Forwarded-For에 담아 전달한다. Express가 이를 신뢰하도록 설정하지 않으면
// express-rate-limit이 X-Forwarded-For를 보고도 신뢰할 수 없다며 ERR_ERL_UNEXPECTED_X_FORWARDED_FOR
// 에러를 던지고, req.ip도 항상 프록시 IP로 잡혀 모든 사용자가 같은 레이트리밋
// 버킷을 공유하게 된다. 프록시 1홉만 신뢰하도록 설정.
app.set('trust proxy', 1);

app.use(express.json());
app.use(cookieParser());
app.use('/images', express.static(path.join(__dirname, 'public', 'images')));
// TWA 도메인 소유권 증명 파일 서빙 (/.well-known/assetlinks.json)
app.get('/.well-known/assetlinks.json', (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.sendFile(path.join(__dirname, 'public', '.well-known', 'assetlinks.json'));
});

// ── manifest.json — 언어별 name/description ────────────────
// 정적 파일 하나로는 방문자 브라우저 언어에 맞춰 값을 바꿀 수 없어서,
// web/manifest.json을 서빙하는 express.static보다 먼저 이 라우트를 등록해
// Accept-Language 헤더(웹 프론트의 navigator.language 감지와 동일한 규칙:
// 한국어면 한국어, 그 외에는 영어)로 매니페스트를 동적으로 생성한다.
const MANIFEST_BASE = {
    start_url: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#1a0a2e',
    theme_color: '#1a0a2e',
    icons: [
        { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
        { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
        { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
};
const MANIFEST_I18N = {
    ko: { lang: 'ko', name: '짭스패닉', short_name: '짭스패닉', description: 'AI 캐릭터를 수집하는 땅따먹기 캐주얼 게임' },
    en: { lang: 'en', name: 'GalsPanic', short_name: 'GalsPanic', description: 'A territory-capture casual game with collectible AI characters' },
};
function detectServerLang(req) {
    const primary = (req.headers['accept-language'] || '').split(',')[0].trim().toLowerCase();
    return primary.startsWith('ko') ? 'ko' : 'en';
}
app.get('/manifest.json', (req, res) => {
    const lang = detectServerLang(req);
    res.setHeader('Content-Type', 'application/manifest+json');
    res.json({ ...MANIFEST_I18N[lang], ...MANIFEST_BASE });
});

// ── /share — "내 캐릭터 자랑하기" 공유 링크 ──────────────────
// DB 없이 stateless하게 동작한다: 클라이언트(web/js/bragCard.js buildShareUrl)가
// 통계값을 쿼리스트링에 그대로 실어 보내면, 서버는 그 값으로 동적 OG 메타태그
// (카카오톡/디스코드/트위터 등 링크 미리보기용)만 채워 web/share.html을 내려준다.
// 카드 그림 자체는 서버가 렌더링하지 않고, 그 페이지의 JS가 bragCard.js로
// 다시 그린다 — manifest.json과 동일한 "정적 파일 + 언어별 동적 헤더" 패턴.
function _escapeHtml(s) {
    return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
app.get('/share', (req, res) => {
    const stage = Math.max(0, parseInt(req.query.stage, 10) || 0);
    const score = Math.max(0, parseInt(req.query.score, 10) || 0);
    const lang  = detectServerLang(req);

    let html;
    try {
        html = fs.readFileSync(path.join(__dirname, '..', 'web', 'share.html'), 'utf8');
    } catch (err) {
        return res.status(500).send('share page unavailable');
    }

    const title = lang === 'ko'
        ? `스테이지 ${stage} 달성! 짭스패닉 다람쥐 자랑`
        : `Reached stage ${stage}! GalsPanic squirrel flex`;
    const desc = lang === 'ko'
        ? `누적 ${score.toLocaleString()}pt — 나도 도전해볼까?`
        : `${score.toLocaleString()}pt total — think you can beat it?`;
    const imageUrl = `${req.protocol}://${req.get('host')}/icons/icon-512.png`;
    const ogTags = `<title>${_escapeHtml(title)}</title>
<meta property="og:title" content="${_escapeHtml(title)}">
<meta property="og:description" content="${_escapeHtml(desc)}">
<meta property="og:type" content="website">
<meta property="og:image" content="${_escapeHtml(imageUrl)}">
<meta name="twitter:card" content="summary">`;

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html.replace('<!--OG_TAGS-->', ogTags));
});

// Serve web frontend
app.use(express.static(path.join(__dirname, '..', 'web')));

// ── 인증 / 결제 라우터 ────────────────────────────────────
app.use('/auth',    authRouter);
app.use('/payment', paymentRouter);

const apiLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 60,
    message: (req) => ({ error: i18n.t(req, 'tooManyRequests') })
});
app.use('/api/', apiLimiter);

// 특전 이미지 생성: userId(기기)당 하루 3회 — 실제로 생성에 성공한 요청만
// 센다. 콘텐츠 차단, 유효성 검사 실패, API 오류 등으로 실패한 요청은 애초에
// 카운트를 올리지 않는다(hasUserRewardQuota로 확인만 하고, 생성이 성공한
// 뒤에야 consumeUserRewardQuota를 호출 — "증가 후 실패 시 환불"이 아니라
// "성공했을 때만 증가"라 실패가 카운트에 반영될 여지 자체가 없다). 그렇지
// 않으면 성인물 등 차단된 키워드를 몇 번 시도해본 사용자가 진짜 원인
// ("성적인 이미지는 생성할 수 없습니다")을 모른 채 "횟수 초과"라는 엉뚱한
// 메시지만 보게 된다.
//
// IP가 아니라 userId 기준인 이유: 예전엔 IP당 하루 3회였는데, 모바일
// 통신사는 CGNAT로 여러 가입자가 같은 공인 IP를 공유하는 경우가 흔해서,
// 내가 한 번도 시도한 적 없어도 같은 통신사의 다른 사용자가 그날 몫을 다
// 써버리면 막혀버렸다(게다가 리셋도 자정이 아니라 "그 IP가 처음 걸린 시점 +
// 24시간"이라, 공유 IP 트래픽이 많으면 하루가 지나도 계속 막힌 것처럼
// 보였다).
const REWARD_USER_DAILY_CAP = parseInt(process.env.REWARD_USER_DAILY_CAP, 10) || 3;
const REWARD_USER_WINDOW_MS = 24 * 60 * 60 * 1000;
const rewardUserDailyUsage = new Map(); // userId → { count, windowStart }

function hasUserRewardQuota(userId) {
    const entry = rewardUserDailyUsage.get(userId);
    if (!entry || Date.now() - entry.windowStart >= REWARD_USER_WINDOW_MS) return true;
    return entry.count < REWARD_USER_DAILY_CAP;
}

function consumeUserRewardQuota(userId) {
    const now = Date.now();
    const entry = rewardUserDailyUsage.get(userId);
    if (!entry || now - entry.windowStart >= REWARD_USER_WINDOW_MS) {
        rewardUserDailyUsage.set(userId, { count: 1, windowStart: now });
    } else {
        entry.count++;
    }
}

// userId당 쿨다운 (1시간)
const rewardCooldown = new Map(); // userId → lastGeneratedAt (ms)
const REWARD_COOLDOWN_MS = 60 * 60 * 1000;

// 서버 전체 일일 상한 — userId를 여러 개로 바꿔가며 우회하더라도(예: 여러
// 기기로 각자의 하루 3회를 따로 채우는 경우) 특전 이미지(고비용 sd3-large
// 모델)에 쓰이는 Stability AI 크레딧이 하루에 무제한으로 소진되지 않도록,
// 요청 출처와 무관한 절대 상한선을 둔다. 이 역시 성공한 생성만 카운트한다.
const REWARD_GLOBAL_DAILY_CAP = parseInt(process.env.REWARD_GLOBAL_DAILY_CAP, 10) || 30;
const REWARD_GLOBAL_WINDOW_MS = 24 * 60 * 60 * 1000;
let rewardGlobalCount = 0;
let rewardGlobalWindowStart = Date.now();

function hasGlobalRewardQuota() {
    const now = Date.now();
    if (now - rewardGlobalWindowStart >= REWARD_GLOBAL_WINDOW_MS) {
        rewardGlobalWindowStart = now;
        rewardGlobalCount = 0;
    }
    return rewardGlobalCount < REWARD_GLOBAL_DAILY_CAP;
}

function consumeGlobalRewardQuota() {
    const now = Date.now();
    if (now - rewardGlobalWindowStart >= REWARD_GLOBAL_WINDOW_MS) {
        rewardGlobalWindowStart = now;
        rewardGlobalCount = 0;
    }
    rewardGlobalCount++;
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
        return res.status(400).json({ error: i18n.t(req, 'invalidStage') });

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
        return res.status(400).json({ error: i18n.t(req, 'invalidBatchIndex') });

    res.json(store.getBatchStatus(batchIndex));
});

// ── 배치 생성 트리거 ──────────────────────────────────────
app.post('/api/batch/trigger', async (req, res) => {
    const { batchIndex } = req.body;

    if (typeof batchIndex !== 'number' || batchIndex < 1 || batchIndex >= store.TOTAL_BATCH)
        return res.status(400).json({ error: i18n.t(req, 'invalidBatchTrigger') });

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

    if (!userId || !isValidRewardStage(stageNum))
        return res.status(400).json({ error: i18n.t(req, 'invalidRequest') });

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
app.post('/api/reward/generate', async (req, res) => {
    const { userId, keywords, token } = req.body;

    if (!userId || !keywords || keywords.trim().length === 0)
        return res.status(400).json({ error: i18n.t(req, 'userIdKeywordsRequired') });

    if (keywords.length > 200)
        return res.status(400).json({ error: i18n.t(req, 'keywordsTooLong') });

    // 토큰 검증
    const tokenData = rewardTokens.get(token);
    if (!tokenData)
        return res.status(403).json({ error: i18n.t(req, 'tokenExpiredRetry') });
    if (tokenData.userId !== userId || Date.now() > tokenData.expiresAt)
        return res.status(403).json({ error: i18n.t(req, 'tokenExpired') });

    // images.json에는 레코드가 남아있어도 실제 파일이 없으면(예: 호스팅 재배포로
    // 디스크가 초기화됨) "성공"으로 응답하면 프론트에서 엑박만 뜨고 끝나버리므로,
    // 파일 존재를 직접 확인해 없으면 재생성 절차로 진행시킨다.
    // try/catch로 감싸는 이유: 이 라우트는 async 핸들러라 Express 4가 던져진
    // 예외를 자동으로 잡아주지 않는다 — 여기서 뭔가 던지면(예: store 쪽 예외)
    // 응답을 아예 못 보내 요청이 클라이언트 타임아웃까지 무한 대기하게 되고,
    // 사용자에게는 "특전 이미지 요청 실패(응답 없음)"로 보인다.
    try {
        const existing = store.getRewardImageUrl(userId);
        if (existing) {
            const existingPath = store.getRewardImagePath(userId);
            if (existingPath && fs.existsSync(existingPath)) {
                rewardTokens.delete(token);
                return res.json({ status: 'ready', imageUrl: existing });
            }
            console.warn(`[Server] 보상 이미지 레코드는 있으나 파일이 없어 재생성합니다: ${userId}`);
        }
    } catch (err) {
        console.error(`[Server] 기존 보상 이미지 확인 중 오류: ${err.message}`);
        return res.status(500).json({ error: i18n.t(req, 'rewardGenericError') });
    }

    // userId 쿨다운 체크
    const lastGen = rewardCooldown.get(userId);
    if (lastGen && Date.now() - lastGen < REWARD_COOLDOWN_MS) {
        const remaining = Math.ceil((REWARD_COOLDOWN_MS - (Date.now() - lastGen)) / 60000);
        return res.status(429).json({ error: i18n.t(req, 'rewardCooldown', remaining) });
    }

    // 서버 전체 일일 상한 체크 — 유료 API 호출(generateRewardImage) 전에 막는다.
    // 확인만 하고 실제 차감(consumeGlobalRewardQuota)은 생성 성공 후에 하므로
    // 한도 초과 시는 물론 생성 실패 시에도 토큰/쿨다운/전역 한도 어느 것도
    // 소모되지 않아, 유저는 같은 토큰으로 (내일 기다릴 필요 없이) 재시도 가능.
    if (!hasGlobalRewardQuota()) {
        return res.status(429).json({ error: i18n.t(req, 'rewardGlobalCap') });
    }

    // userId(기기)당 하루 3회 한도 체크 — 역시 확인만 하고, 실제 차감은 생성
    // 성공 후에만 한다(실패는 카운트되지 않음).
    if (!hasUserRewardQuota(userId)) {
        return res.status(429).json({ error: i18n.t(req, 'rewardDailyLimit') });
    }

    // 토큰은 "생성 성공" 시에만 소모한다. 실패(금지 키워드, API 차단 등) 후에도
    // 토큰을 미리 지워버리면, 사용자가 문제 있는 요청을 다른 키워드로 고쳐서
    // 다시 보내려 해도 "유효하지 않거나 만료된 요청입니다"만 뜨고 막혀버린다
    // (성공할 때까지 같은 토큰으로 재시도할 수 있어야 함).
    try {
        rewardCooldown.set(userId, Date.now());
        await generator.generateRewardImage(userId, keywords.trim());
        rewardTokens.delete(token); // 일회용: 생성 "성공" 시에만 소모
        consumeGlobalRewardQuota(); // 전역 한도도 성공 시에만 차감
        consumeUserRewardQuota(userId); // 유저 하루 3회 한도도 성공 시에만 차감
        const imageUrl = store.getRewardImageUrl(userId);
        res.json({ status: 'ready', imageUrl });
    } catch (err) {
        rewardCooldown.delete(userId); // 실패 시 쿨다운 취소
        console.error(`[Server] 보상 이미지 생성 실패: ${err.message}`);
        const message = err.code === 'BLOCKED_KEYWORD' ? i18n.t(req, 'blockedKeyword') : err.message;
        res.status(500).json({ error: message });
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
    // 테스트 전용: userId당 하루 3회 한도를 초기화한다.
    __resetRewardLimiterForTests: () => {
        rewardUserDailyUsage.clear();
    },
};
