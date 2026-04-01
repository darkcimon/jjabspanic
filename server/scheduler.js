/**
 * scheduler.js — 구독 만료 배치 처리 스케줄러
 *
 * 매일 자정(00:00 KST)에 실행하여:
 * - subscriptionStatus가 'active'이고 subscriptionExpiry가 과거인 유저를 'expired'로 변경
 *
 * 사용:
 *   const scheduler = require('./scheduler');
 *   scheduler.init();
 */

const cron      = require('node-cron');
const userStore = require('./userStore');

/**
 * 만료된 구독 유저를 일괄 처리한다.
 * userStore.expireSubscriptions()에 위임.
 */
function checkExpiredSubscriptions() {
    try {
        const expired = userStore.expireSubscriptions();
        if (expired.length > 0) {
            console.log(`[Scheduler] 구독 만료 처리 완료 — ${expired.length}명: ${expired.join(', ')}`);
        } else {
            console.log('[Scheduler] 만료 대상 구독 없음');
        }
    } catch (err) {
        console.error('[Scheduler] 구독 만료 처리 오류:', err.message);
    }
}

/**
 * 스케줄러를 시작한다.
 * 매일 자정(00:00, 크론: '0 0 * * *')에 checkExpiredSubscriptions 실행.
 */
function init() {
    cron.schedule('0 0 * * *', () => {
        console.log('[Scheduler] 자정 구독 만료 체크 시작');
        checkExpiredSubscriptions();
    }, {
        timezone: 'Asia/Seoul',
    });

    console.log('[Scheduler] 구독 만료 체크 스케줄러 등록 완료 (매일 00:00 KST)');
}

module.exports = { init, checkExpiredSubscriptions };
