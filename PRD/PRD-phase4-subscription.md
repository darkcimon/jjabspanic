# PRD-phase4-subscription — (선택) 구독 수익 도입

> **이 단계는 선택 사항입니다.** Phase 3 이후 트래픽이 충분히 확보된 시점에 검토하세요.
> 목표: 사용자 인증 + 월정액 구독 결제를 연동하여 Sexy 티어 유료화를 완성한다.
> 도입 기준: DAU 500명 이상 또는 팩 판매 수익 월 30만원 이상 달성 시 검토

---

## 1. 개요

현재 콘텐츠 등급(General/Sexy) 선택은 클라이언트 localStorage에만 저장되어 있어 우회가 가능하다. 이 단계에서 **서버 기반 사용자 인증**과 **결제 검증**을 도입하여 Sexy 티어를 실제 유료 콘텐츠로 전환한다.

---

## 2. 구현 목록

### 2-1. 사용자 인증 시스템 추가

**전략: 소셜 로그인 (카카오 or 구글) — 자체 회원가입 없음**

이유:
- 자체 회원가입은 개인정보 관리 부담 증가
- 소셜 로그인은 비밀번호 없이 빠른 가입 가능 → 전환율 상승

**권장 순서:** 카카오 로그인 우선 (국내 유저 대상)

**서버 — 신규 파일: `server/auth.js`**

```
카카오 OAuth 2.0 플로우:
1. 클라이언트 → "카카오로 로그인" 버튼 클릭
2. 카카오 인증 페이지로 리다이렉트
3. 인증 완료 → 서버로 code 전달
4. 서버: code → access_token 교환 → 카카오 사용자 정보 조회
5. 서버: userId, 구독 상태를 DB(또는 JSON 파일)에 저장
6. 서버: JWT 발급 → 클라이언트 쿠키 저장
```

**신규 엔드포인트 (`server/server.js`에 추가):**

| 메서드 | 경로 | 설명 |
|---|---|---|
| GET | `/auth/kakao` | 카카오 OAuth 리다이렉트 |
| GET | `/auth/kakao/callback` | 카카오 콜백 처리, JWT 발급 |
| GET | `/auth/me` | 현재 로그인 유저 정보 + 구독 상태 조회 |
| POST | `/auth/logout` | 로그아웃 (쿠키 삭제) |

**필요 패키지:**
```bash
cd server
npm install jsonwebtoken cookie-parser axios
```

---

### 2-2. 구독 상태 저장소

**초기 구현: `server/data/users.json`** (Firebase/MongoDB 이전 전 임시)

```json
{
  "kakao_12345678": {
    "userId": "kakao_12345678",
    "nickname": "홍길동",
    "subscriptionStatus": "active",
    "subscriptionExpiry": "2026-04-17T00:00:00Z",
    "createdAt": "2026-03-17T00:00:00Z"
  }
}
```

`server/userStore.js` 파일로 CRUD 래핑 (imageStore.js 패턴 동일하게).

---

### 2-3. 결제 연동 — 토스페이먼츠

**계정 설정:**
1. [developers.tosspayments.com](https://developers.tosspayments.com) 에서 계정 생성
2. 테스트 키 발급 (`test_sk_...`, `test_ck_...`)
3. 상용 전환 시 사업자 정보 등록 필요

**클라이언트 — `web/js/payment.js`:**

```js
// 토스페이먼츠 위젯 초기화 및 구독 결제 요청
export async function requestSubscription() {
  const tossPayments = TossPayments(CLIENT_KEY);
  await tossPayments.requestBillingAuth('카드', {
    customerKey: userId,
    successUrl: `${SERVER_URL}/payment/success`,
    failUrl: `${SERVER_URL}/payment/fail`,
  });
}
```

**서버 — `server/payment.js`:**

| 메서드 | 경로 | 설명 |
|---|---|---|
| GET | `/payment/success` | 빌링키 발급 완료 처리 |
| GET | `/payment/fail` | 결제 실패 처리 |
| POST | `/payment/subscribe` | 정기 결제 실행 (월 1회) |
| POST | `/payment/cancel` | 구독 해지 |

**정기 결제 스케줄러:**
```js
// server/scheduler.js — node-cron으로 매일 자정 만료 체크
const cron = require('node-cron');
cron.schedule('0 0 * * *', () => { checkAndChargeSubscriptions(); });
```

```bash
npm install node-cron
```

---

### 2-4. 클라이언트 — 구독 상태 분기

**`web/js/app.js` 수정:**

```
앱 부트 시:
    GET /auth/me → 로그인 여부 + 구독 상태 확인
    └─ 비로그인: ContentSelect에서 Sexy 티어 버튼 비활성화
    └─ 로그인 + 구독 없음: Sexy 선택 시 구독 안내 모달 표시
    └─ 로그인 + 구독 활성: Sexy 티어 정상 진입
```

**`web/js/api.js` 수정:**

모든 API 요청에 쿠키 포함 (`credentials: 'include'`).

---

### 2-5. 구독 안내 모달 UI

`web/index.html`에 모달 추가:

```
┌─────────────────────────────┐
│  짭스패닉 프리미엄          │
│                             │
│  ✓ Sexy 티어 전체 해금      │
│  ✓ 광고 제거                │
│  ✓ 이어하기 무제한          │
│  ✓ 갤러리 전체 열람         │
│                             │
│  월 3,900원                 │
│                             │
│  [ 구독 시작하기 ]          │
│  [ 나중에 ]                 │
└─────────────────────────────┘
```

---

### 2-6. 광고 제거 처리

구독 활성 유저는 `web/js/ad.js`의 `showRewardedAd()` 호출 시 광고 없이 즉시 보상 지급.

```js
export async function showRewardedAd(rewardType, onRewarded) {
  if (await isSubscriber()) {
    onRewarded(); // 광고 없이 즉시
    return;
  }
  // 기존 광고 플로우
}
```

---

### 2-7. 개인정보처리방침 업데이트

Phase 1 `privacy.html`에 추가:
- 결제 정보 처리 주체: 토스페이먼츠
- 카카오 로그인 수집 정보: 닉네임, 이메일(선택)
- 구독 해지 방법

---

## 3. 완료 체크리스트

- [ ] 카카오 개발자 앱 생성 및 OAuth 설정
- [ ] `server/auth.js` 구현 (카카오 로그인, JWT 발급)
- [ ] `server/userStore.js` 구현
- [ ] 토스페이먼츠 테스트 계정 생성 및 빌링키 발급 테스트
- [ ] `server/payment.js` 구독 결제 엔드포인트 구현
- [ ] 정기 결제 스케줄러 동작 확인
- [ ] 클라이언트 구독 분기 로직 동작 확인 (비로그인 / 비구독 / 구독)
- [ ] 구독 안내 모달 UI 구현
- [ ] 구독자 광고 즉시 보상 처리 확인
- [ ] 실제 테스트 결제 1건 성공 확인
- [ ] 구독 해지 플로우 확인
- [ ] `privacy.html` 업데이트

---

## 4. 다음 단계

구독 전환율 5% 이상 or 구독 수입 월 20만원 이상 달성 시 → **Phase 3 콘텐츠 팩 + 스토어 배포** 진행.
