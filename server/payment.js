/**
 * payment.js — 토스페이먼츠 결제 라우터
 *
 * 엔드포인트 — 구독:
 *   POST /payment/subscribe    빌링키로 정기 결제 실행 (월 3,900원)
 *   GET  /payment/success      빌링키 발급 완료 처리 → 구독 활성화
 *   GET  /payment/fail         결제 실패 처리 → 클라이언트 리다이렉트
 *   POST /payment/cancel       구독 해지
 *
 * 엔드포인트 — 콘텐츠 팩:
 *   GET  /payment/pack/success  팩 일회성 결제 성공 콜백 → 구매 내역 저장 + 복구 코드 발급
 *   GET  /payment/pack/fail     팩 결제 실패 콜백
 *   GET  /payment/purchases     현재 유저의 팩 구매 내역 조회
 *   POST /payment/redeem        구매 복구 코드로 팩 조회
 *
 * 참고: https://docs.tosspayments.com/reference/using-api/api-keys
 */

const express        = require('express');
const axios          = require('axios');
const userStore      = require('./userStore');
const purchaseStore  = require('./purchaseStore');
const { requireAuth } = require('./auth');

const router = express.Router();

const TOSS_SECRET_KEY  = process.env.TOSS_SECRET_KEY;
const SUBSCRIPTION_AMOUNT = 3900;   // 월 구독 금액 (원)
const SUBSCRIPTION_DAYS   = 30;     // 구독 유효 기간 (일)

// ── 콘텐츠 팩 정의 ────────────────────────────────────────────
const VALID_PACKS = new Set(['pack_a', 'pack_b', 'pack_c', 'pack_all']);

// 토스페이먼츠 API Base64 인증 헤더 생성
function tossAuthHeader() {
    const encoded = Buffer.from(`${TOSS_SECRET_KEY}:`).toString('base64');
    return `Basic ${encoded}`;
}

// 구독 만료일 계산 (현재 시각 + SUBSCRIPTION_DAYS일)
function calcExpiry() {
    const d = new Date();
    d.setDate(d.getDate() + SUBSCRIPTION_DAYS);
    return d.toISOString();
}

// ── GET /payment/success ──────────────────────────────────
// 토스페이먼츠 빌링키 발급 완료 콜백
// 쿼리: authKey, customerKey
router.get('/success', async (req, res) => {
    const { authKey, customerKey } = req.query;

    if (!authKey || !customerKey) {
        return res.redirect('/?payment_error=missing_params');
    }

    try {
        // 빌링키 발급 요청
        const billingRes = await axios.post(
            'https://api.tosspayments.com/v1/billing/authorizations/issue',
            { authKey, customerKey },
            {
                headers: {
                    Authorization:  tossAuthHeader(),
                    'Content-Type': 'application/json',
                },
            }
        );

        const billingKey = billingRes.data.billingKey;
        const userId     = customerKey;   // customerKey는 userId와 동일하게 설정

        // 첫 결제 즉시 실행
        const paymentRes = await axios.post(
            `https://api.tosspayments.com/v1/billing/${billingKey}`,
            {
                customerKey,
                amount:      SUBSCRIPTION_AMOUNT,
                orderId:     `sub_${userId}_${Date.now()}`,
                orderName:   '짭스패닉 프리미엄 월정액',
                customerEmail: null,   // 선택: 이메일 영수증
            },
            {
                headers: {
                    Authorization:  tossAuthHeader(),
                    'Content-Type': 'application/json',
                },
            }
        );

        console.log(`[Payment] 결제 성공 — userId: ${userId}, amount: ${SUBSCRIPTION_AMOUNT}원, paymentKey: ${paymentRes.data.paymentKey}`);

        // 구독 상태 저장
        const expiry = calcExpiry();
        userStore.setSubscription(userId, expiry, billingKey);

        res.redirect('/?payment_success=1');

    } catch (err) {
        const errData = err.response?.data;
        console.error('[Payment] 빌링키 발급/결제 실패:', errData || err.message);
        res.redirect(`/?payment_error=${encodeURIComponent(errData?.message || 'server_error')}`);
    }
});

// ── GET /payment/fail ─────────────────────────────────────
// 토스페이먼츠 결제 실패/취소 콜백
// 쿼리: code, message, orderId
router.get('/fail', (req, res) => {
    const { code, message } = req.query;
    console.warn(`[Payment] 결제 실패 — code: ${code}, message: ${message}`);
    res.redirect(`/?payment_error=${encodeURIComponent(message || code || 'unknown')}`);
});

// ── POST /payment/subscribe ───────────────────────────────
// 저장된 빌링키로 정기 결제 수동 실행 (스케줄러 또는 어드민에서 호출)
// 인증 필요
router.post('/subscribe', requireAuth, async (req, res) => {
    const { userId } = req.user;
    const user = userStore.getUser(userId);

    if (!user) {
        return res.status(404).json({ error: '유저를 찾을 수 없습니다.' });
    }

    if (!user.billingKey) {
        return res.status(400).json({ error: '등록된 결제 수단이 없습니다. 구독 등록을 먼저 진행해주세요.' });
    }

    try {
        const paymentRes = await axios.post(
            `https://api.tosspayments.com/v1/billing/${user.billingKey}`,
            {
                customerKey: userId,
                amount:      SUBSCRIPTION_AMOUNT,
                orderId:     `sub_${userId}_${Date.now()}`,
                orderName:   '짭스패닉 프리미엄 월정액',
            },
            {
                headers: {
                    Authorization:  tossAuthHeader(),
                    'Content-Type': 'application/json',
                },
            }
        );

        console.log(`[Payment] 정기 결제 성공 — userId: ${userId}, paymentKey: ${paymentRes.data.paymentKey}`);

        const expiry = calcExpiry();
        const updated = userStore.setSubscription(userId, expiry, user.billingKey);

        res.json({
            ok:                 true,
            subscriptionStatus: updated.subscriptionStatus,
            subscriptionExpiry: updated.subscriptionExpiry,
        });

    } catch (err) {
        const errData = err.response?.data;
        console.error('[Payment] 정기 결제 실패 — userId:', userId, errData || err.message);
        res.status(500).json({ error: errData?.message || '결제 처리 중 오류가 발생했습니다.' });
    }
});

// ── POST /payment/cancel ──────────────────────────────────
// 구독 해지 (만료일까지 서비스 이용 가능)
// 인증 필요
router.post('/cancel', requireAuth, (req, res) => {
    const { userId } = req.user;
    const user = userStore.getUser(userId);

    if (!user) {
        return res.status(404).json({ error: '유저를 찾을 수 없습니다.' });
    }

    if (user.subscriptionStatus === 'none' || user.subscriptionStatus === 'cancelled') {
        return res.status(400).json({ error: '활성 구독이 없습니다.' });
    }

    const updated = userStore.cancelSubscription(userId);

    console.log(`[Payment] 구독 해지 — userId: ${userId}, expiry: ${updated.subscriptionExpiry}`);

    res.json({
        ok:                 true,
        subscriptionStatus: updated.subscriptionStatus,
        subscriptionExpiry: updated.subscriptionExpiry,
        message:            `구독이 해지되었습니다. ${updated.subscriptionExpiry ? new Date(updated.subscriptionExpiry).toLocaleDateString('ko-KR') + '까지 이용 가능합니다.' : ''}`,
    });
});

// ── userId 추출 헬퍼 ──────────────────────────────────────────
/**
 * 요청에서 userId를 추출한다.
 * 우선순위: Bearer JWT > 세션 쿠키 > null
 */
function extractUserId(req) {
    // 1순위: Bearer JWT (Phase 2에서 서명 검증 추가 예정)
    const auth = req.headers['authorization'];
    if (auth && auth.startsWith('Bearer ')) {
        try {
            const token   = auth.slice(7);
            const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());
            if (payload.sub) return payload.sub;
        } catch { /* 무시 */ }
    }

    // 2순위: 세션 쿠키의 userId (Phase 2 auth 미들웨어가 주입)
    if (req.session && req.session.userId) return req.session.userId;

    return null;
}

// ── GET /payment/pack/success ──────────────────────────────────
/**
 * 토스페이먼츠 팩 결제 성공 후 리다이렉트 콜백.
 * 쿼리: packId, orderId, paymentKey, amount
 *
 * TODO (상용): paymentKey + amount를 토스 서버 API로 검증 후 저장할 것
 */
router.get('/pack/success', async (req, res) => {
    const { packId, orderId, paymentKey, amount } = req.query;

    if (!packId || !VALID_PACKS.has(packId)) {
        return res.status(400).send('잘못된 팩 ID입니다.');
    }
    if (!orderId) {
        return res.status(400).send('주문 ID가 없습니다.');
    }

    const userId = extractUserId(req);

    if (userId) {
        try {
            let user = userStore.getUser(userId);
            if (!user) {
                user = userStore.upsertUser(userId, { nickname: userId });
            }

            const current = Array.isArray(user.purchases) ? user.purchases : [];
            if (!current.includes(packId)) {
                // pack_all 구매 시 개별 팩도 함께 기록
                const toAdd = [packId];
                if (packId === 'pack_all') {
                    ['pack_a', 'pack_b', 'pack_c'].forEach(p => {
                        if (!current.includes(p)) toAdd.push(p);
                    });
                }
                userStore.upsertUser(userId, { purchases: [...current, ...toAdd] });
                console.log(`[Payment/Pack] ${userId} → ${packId} 구매 완료 (orderId: ${orderId})`);
            } else {
                console.log(`[Payment/Pack] ${userId} → ${packId} 이미 보유 (orderId: ${orderId})`);
            }
        } catch (err) {
            console.error('[Payment/Pack] 구매 내역 저장 실패:', err.message);
        }
    } else {
        // 비로그인: 프론트에서 orderId로 localStorage에 임시 저장
        console.log(`[Payment/Pack] 비로그인 구매: ${packId} (orderId: ${orderId})`);
    }

    // 구매 코드 생성 (기기 분실 시 복구용)
    const redeemCode = purchaseStore.createPurchase(packId, orderId || `direct_${Date.now()}`);

    // 갤러리 화면으로 리다이렉트 (구매 완료 플래그 + 복구 코드 포함)
    res.redirect(`/?purchase=success&packId=${encodeURIComponent(packId)}&redeemCode=${encodeURIComponent(redeemCode)}`);
});

// ── GET /payment/pack/fail ────────────────────────────────────
router.get('/pack/fail', (req, res) => {
    const { packId, code, message } = req.query;
    console.warn(`[Payment/Pack] 결제 실패 — packId: ${packId}, code: ${code}, message: ${message}`);
    res.redirect(`/?purchase=fail&packId=${encodeURIComponent(packId || '')}`);
});

// ── GET /payment/purchases ────────────────────────────────────
/**
 * 현재 유저의 팩 구매 내역 반환.
 * 인증 없는 경우 빈 배열 반환 (에러 없음).
 */
router.get('/purchases', (req, res) => {
    const userId = extractUserId(req);

    if (!userId) {
        return res.json({ purchases: [] });
    }

    try {
        const user = userStore.getUser(userId);
        const purchases = (user && Array.isArray(user.purchases)) ? user.purchases : [];
        res.json({ purchases });
    } catch (err) {
        console.error('[Payment/Pack] 구매 내역 조회 실패:', err.message);
        res.json({ purchases: [] });
    }
});

// ── POST /payment/redeem ──────────────────────────────────────
/**
 * 구매 복구 코드로 팩을 조회한다.
 * body: { redeemCode: 'XXXX-XXXX-XXXX-XXXX' }
 * response: { ok: true, packId: 'pack_a', redeemCode: '...' }
 *           { ok: false, error: '...' }
 */
router.post('/redeem', (req, res) => {
    const { redeemCode } = req.body;

    if (!redeemCode || typeof redeemCode !== 'string') {
        return res.status(400).json({ ok: false, error: '구매 코드를 입력해주세요.' });
    }

    const purchase = purchaseStore.getPurchaseByCode(redeemCode.trim());

    if (!purchase) {
        return res.status(404).json({ ok: false, error: '유효하지 않은 구매 코드입니다.' });
    }

    console.log(`[Payment/Redeem] 코드 복구: ${redeemCode.trim()} → ${purchase.packId}`);
    res.json({ ok: true, packId: purchase.packId, redeemCode: purchase.redeemCode });
});

module.exports = { router };
