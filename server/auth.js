/**
 * auth.js — 카카오 OAuth 2.0 + JWT 인증 라우터
 *
 * 엔드포인트:
 *   GET  /auth/kakao             카카오 OAuth 인증 페이지로 리다이렉트
 *   GET  /auth/kakao/callback    카카오 code → access_token → 유저 정보 → JWT 발급
 *   GET  /auth/me                현재 로그인 유저 정보 + 구독 상태 조회
 *   POST /auth/logout            쿠키 삭제 (로그아웃)
 */

const express   = require('express');
const axios     = require('axios');
const jwt       = require('jsonwebtoken');
const userStore = require('./userStore');

const router = express.Router();

const KAKAO_CLIENT_ID    = process.env.KAKAO_CLIENT_ID;
const KAKAO_REDIRECT_URI = process.env.KAKAO_REDIRECT_URI;
const JWT_SECRET         = process.env.JWT_SECRET;
const JWT_EXPIRES_IN     = '7d';

const COOKIE_NAME = 'gp_token';
const COOKIE_OPTS = {
    httpOnly: true,
    sameSite: 'lax',
    maxAge:   7 * 24 * 60 * 60 * 1000,   // 7일 (ms)
    // 운영 환경에서만 secure: true 설정
    secure: process.env.NODE_ENV === 'production',
};

// ── 미들웨어: JWT 검증 ─────────────────────────────────────
/**
 * 요청 쿠키에서 JWT를 검증하고 req.user에 페이로드를 주입한다.
 * 검증 실패 시 401 반환.
 */
function requireAuth(req, res, next) {
    const token = req.cookies && req.cookies[COOKIE_NAME];
    if (!token) {
        return res.status(401).json({ error: '로그인이 필요합니다.' });
    }
    try {
        req.user = jwt.verify(token, JWT_SECRET);
        next();
    } catch (err) {
        return res.status(401).json({ error: '인증 토큰이 유효하지 않습니다.' });
    }
}

// ── GET /auth/kakao ───────────────────────────────────────
// 카카오 OAuth 인증 URL로 리다이렉트
router.get('/kakao', (req, res) => {
    if (!KAKAO_CLIENT_ID || !KAKAO_REDIRECT_URI) {
        return res.status(500).json({ error: '카카오 앱 설정이 누락되었습니다. (KAKAO_CLIENT_ID, KAKAO_REDIRECT_URI)' });
    }

    const params = new URLSearchParams({
        client_id:     KAKAO_CLIENT_ID,
        redirect_uri:  KAKAO_REDIRECT_URI,
        response_type: 'code',
    });

    res.redirect(`https://kauth.kakao.com/oauth/authorize?${params.toString()}`);
});

// ── GET /auth/kakao/callback ──────────────────────────────
// 카카오 인증 완료 후 code를 받아 access_token 교환 → 유저 정보 조회 → JWT 발급
router.get('/kakao/callback', async (req, res) => {
    const { code, error } = req.query;

    if (error || !code) {
        console.error('[Auth] 카카오 콜백 오류:', error);
        return res.redirect('/?auth_error=kakao_denied');
    }

    try {
        // 1. code → access_token 교환
        const tokenRes = await axios.post(
            'https://kauth.kakao.com/oauth/token',
            new URLSearchParams({
                grant_type:   'authorization_code',
                client_id:    KAKAO_CLIENT_ID,
                redirect_uri: KAKAO_REDIRECT_URI,
                code,
            }).toString(),
            { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
        );

        const accessToken = tokenRes.data.access_token;

        // 2. 카카오 사용자 정보 조회
        const profileRes = await axios.get('https://kapi.kakao.com/v2/user/me', {
            headers: { Authorization: `Bearer ${accessToken}` },
        });

        const kakaoId    = profileRes.data.id;
        const nickname   = profileRes.data.kakao_account?.profile?.nickname || '';
        const profileImg = profileRes.data.kakao_account?.profile?.profile_image_url || null;

        const userId = `kakao_${kakaoId}`;

        // 3. userStore에 upsert
        userStore.upsertUser(userId, { nickname, profileImage: profileImg });

        // 4. JWT 발급
        const payload = { userId, nickname };
        const token   = jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });

        // 5. httpOnly 쿠키 세팅 후 루트로 리다이렉트
        res.cookie(COOKIE_NAME, token, COOKIE_OPTS);
        res.redirect('/');

    } catch (err) {
        console.error('[Auth] 카카오 콜백 처리 실패:', err.response?.data || err.message);
        res.redirect('/?auth_error=server_error');
    }
});

// ── GET /auth/me ──────────────────────────────────────────
// JWT 쿠키 검증 → 유저 정보 + 구독 상태 반환
router.get('/me', requireAuth, (req, res) => {
    const { userId, nickname } = req.user;
    const user = userStore.getUser(userId);

    if (!user) {
        // JWT는 유효하지만 store에 유저가 없는 엣지 케이스
        return res.status(404).json({ error: '유저 정보를 찾을 수 없습니다.' });
    }

    const subscribed = userStore.isSubscribed(userId);

    res.json({
        userId,
        nickname:            user.nickname || nickname,
        subscriptionStatus:  user.subscriptionStatus,
        subscriptionExpiry:  user.subscriptionExpiry,
        isSubscribed:        subscribed,
    });
});

// ── POST /auth/logout ─────────────────────────────────────
// 쿠키 삭제
router.post('/logout', (req, res) => {
    res.clearCookie(COOKIE_NAME, { httpOnly: true, sameSite: 'lax' });
    res.json({ ok: true });
});

module.exports = { router, requireAuth };
