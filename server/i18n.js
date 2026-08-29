/**
 * i18n.js — 서버가 클라이언트로 내려주는 텍스트(에러 메시지, 결제 콜백 페이지 등)의
 * 언어를 Accept-Language 헤더로 판별한다. 프론트엔드(web/js/i18n.js)와 동일한 규칙:
 * 한국어(ko)면 한국어, 그 외에는 영어.
 */

const dict = {
    ko: {
        tooManyRequests: '너무 많은 요청이 발생했습니다',
        rewardDailyLimit: '오늘 특전 이미지 생성 횟수를 초과했습니다. 내일 다시 시도해주세요.',
        invalidStage: '잘못된 스테이지 번호',
        invalidBatchIndex: '잘못된 배치 인덱스',
        invalidBatchTrigger: '잘못된 배치 인덱스 (0은 사전 생성됨, 1~9만 트리거 가능)',
        invalidRequest: '유효하지 않은 요청입니다.',
        userIdKeywordsRequired: 'userId와 keywords는 필수입니다.',
        keywordsTooLong: '키워드는 200자 이하로 입력해주세요.',
        tokenExpiredRetry: '유효하지 않거나 만료된 요청입니다. 스테이지를 클리어한 후 다시 시도해주세요.',
        tokenExpired: '유효하지 않거나 만료된 요청입니다.',
        rewardCooldown: (n) => `특전 이미지는 1시간에 1회만 생성할 수 있습니다. ${n}분 후 다시 시도해주세요.`,
        rewardGlobalCap: '오늘 전체 특전 이미지 생성 한도를 초과했습니다. 내일 다시 시도해주세요.',
        blockedKeyword: '허용되지 않는 키워드가 포함되어 있습니다. 다른 키워드로 다시 시도해주세요.',

        userNotFound: '유저를 찾을 수 없습니다.',
        noPaymentMethod: '등록된 결제 수단이 없습니다. 구독 등록을 먼저 진행해주세요.',
        paymentProcessError: '결제 처리 중 오류가 발생했습니다.',
        noActiveSubscription: '활성 구독이 없습니다.',
        subscriptionCanceled: (untilText) => `구독이 해지되었습니다. ${untilText}`,
        subscriptionUntil: (dateStr) => `${dateStr}까지 이용 가능합니다.`,
        invalidPackId: '잘못된 팩 ID입니다.',
        invalidPaymentCallback: '잘못된 결제 콜백입니다.',
        invalidOrExpiredOrder: '유효하지 않거나 만료된 주문입니다.',
        redeemCodeRequired: '구매 코드를 입력해주세요.',
        invalidRedeemCode: '유효하지 않은 구매 코드입니다.',

        loginRequired: '로그인이 필요합니다.',
        invalidAuthToken: '인증 토큰이 유효하지 않습니다.',
        userInfoNotFound: '유저 정보를 찾을 수 없습니다.',
    },
    en: {
        tooManyRequests: 'Too many requests',
        rewardDailyLimit: "You've reached today's bonus image limit. Please try again tomorrow.",
        invalidStage: 'Invalid stage number',
        invalidBatchIndex: 'Invalid batch index',
        invalidBatchTrigger: 'Invalid batch index (0 is pre-generated; only 1-9 can be triggered)',
        invalidRequest: 'Invalid request.',
        userIdKeywordsRequired: 'userId and keywords are required.',
        keywordsTooLong: 'Keywords must be 200 characters or fewer.',
        tokenExpiredRetry: 'Invalid or expired request. Please clear a stage and try again.',
        tokenExpired: 'Invalid or expired request.',
        rewardCooldown: (n) => `You can only generate a bonus image once per hour. Please try again in ${n} minute(s).`,
        rewardGlobalCap: "Today's total bonus image limit has been reached. Please try again tomorrow.",
        blockedKeyword: 'Your keywords include a word that is not allowed. Please try again with different keywords.',

        userNotFound: 'User not found.',
        noPaymentMethod: 'No payment method on file. Please subscribe first.',
        paymentProcessError: 'An error occurred while processing the payment.',
        noActiveSubscription: 'No active subscription.',
        subscriptionCanceled: (untilText) => `Your subscription has been canceled. ${untilText}`,
        subscriptionUntil: (dateStr) => `You can use the service until ${dateStr}.`,
        invalidPackId: 'Invalid pack ID.',
        invalidPaymentCallback: 'Invalid payment callback.',
        invalidOrExpiredOrder: 'Invalid or expired order.',
        redeemCodeRequired: 'Please enter your purchase code.',
        invalidRedeemCode: 'Invalid purchase code.',

        loginRequired: 'Login required.',
        invalidAuthToken: 'Invalid auth token.',
        userInfoNotFound: 'User info not found.',
    },
};

function detectLang(req) {
    const primary = (req.headers['accept-language'] || '').split(',')[0].trim().toLowerCase();
    return primary.startsWith('ko') ? 'ko' : 'en';
}

function t(req, key, ...args) {
    const lang = detectLang(req);
    const entry = dict[lang][key] ?? dict.en[key];
    return typeof entry === 'function' ? entry(...args) : entry;
}

module.exports = { t, detectLang };
