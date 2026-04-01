# PRD-phase2-packs — Phase 2: 콘텐츠 팩 일회성 결제

> 목표: 로그인 없이 갤러리 팩을 구매할 수 있는 결제 플로우를 구현한다.
> 완료 기준: 실제 결제 1건 성공 + 구매 코드 발급 및 해금 동작 확인

---

## 1. 개요

구독 없이 구매 가능한 일회성 팩 결제를 도입한다. 서버 인증이나 로그인 없이도 토스페이먼츠로 결제하고, 구매 코드를 발급받아 언제든 환경에 상관없이 해금을 복구할 수 있다.

---

## 2. 상품 정의

| 상품 ID | 이름 | 가격 | 해금 범위 |
|---|---|---|---|
| `pack_a` | 갤러리 팩 A | 3,900원 | 스테이지 1~100 전체 이미지 즉시 해금 |
| `pack_b` | 갤러리 팩 B | 3,900원 | 스테이지 101~200 전체 이미지 즉시 해금 |
| `pack_c` | 갤러리 팩 C | 3,900원 | 스테이지 201~300 전체 이미지 즉시 해금 |
| `pack_all` | 완전판 팩 | 6,900원 | 전 스테이지 즉시 해금 (A+B+C 통합 할인) |

- 이미 플레이로 해금된 스테이지는 잔여분만 추가 해금
- General 티어에서만 적용 (Sexy 티어는 추후 구독 도입 시 별도 처리)

---

## 3. 구현 목록

### 3-1. 서버 — 구매 코드 저장소

**신규 파일: `server/data/purchases.json`**

```json
{
  "GP-A-XXXX-XXXX": {
    "pack": "pack_a",
    "purchasedAt": "2026-03-19T00:00:00Z",
    "email": "optional@email.com"
  }
}
```

**신규 파일: `server/purchaseStore.js`** (imageStore.js와 동일한 패턴)

```js
// 구매 코드 생성, 저장, 조회, 유효성 검증
export function generateCode(packId) { ... }
export function savePurchase(code, packId, email) { ... }
export function getPurchase(code) { ... }
```

---

### 3-2. 서버 — 결제 엔드포인트

**`server/server.js`에 추가:**

| 메서드 | 경로 | 설명 |
|---|---|---|
| POST | `/payment/pack/request` | 결제 요청 생성 (orderId, amount 반환) |
| GET | `/payment/pack/success` | 토스페이먼츠 결제 완료 콜백 → 구매 코드 발급 |
| GET | `/payment/pack/fail` | 결제 실패 처리 |
| POST | `/payment/redeem` | 구매 코드 입력 → 해당 팩 해금 상태 반환 |

---

### 3-3. 토스페이먼츠 — 일회성 결제 연동

**계정 설정:**
1. [developers.tosspayments.com](https://developers.tosspayments.com) 계정 생성
2. 테스트 키 발급 (`test_sk_...`, `test_ck_...`)
3. 상용 전환 시 사업자 정보 등록 필요

**클라이언트 — `web/js/payment.js` 신규 파일:**

```js
const CLIENT_KEY = 'test_ck_...';

export async function requestPackPurchase(packId, amount) {
  const tossPayments = TossPayments(CLIENT_KEY);
  await tossPayments.requestPayment('카드', {
    amount,
    orderId: `pack_${Date.now()}`,
    orderName: PACK_NAMES[packId],
    successUrl: `${SERVER_URL}/payment/pack/success?packId=${packId}`,
    failUrl: `${SERVER_URL}/payment/pack/fail`,
  });
}
```

---

### 3-4. 구매 코드 발급 및 안내 UI

결제 완료 후 클라이언트에 구매 코드 표시:

```
┌─────────────────────────────┐
│  결제 완료!                 │
│                             │
│  구매 코드: GP-A-XXXX-XXXX  │
│                             │
│  이 코드를 저장해두세요.    │
│  다른 기기에서도 사용 가능. │
│                             │
│  [ 코드 복사 ]              │
│  [ 게임으로 돌아가기 ]      │
└─────────────────────────────┘
```

코드는 localStorage에도 자동 저장 (`web/js/storage.js` 확장).

---

### 3-5. 구매 코드 복구 UI

갤러리 화면 또는 설정 화면에 "구매 코드 입력" 버튼 추가:

```
[ 구매 코드 입력 ] 버튼 클릭
    → 코드 입력 모달
    → POST /payment/redeem
    → 서버 응답: { pack: "pack_a", valid: true }
    → localStorage에 해금 상태 저장
```

---

### 3-6. 선택 — 이메일 입력

결제 시 이메일 입력 선택 제공 (필수 아님):
- 이메일 제공 시: 결제 완료 후 구매 코드를 이메일로 발송
- 이메일 미제공: localStorage + 화면 복사만으로 관리

이메일 발송은 추후 구현 가능 (nodemailer 또는 SendGrid).

---

### 3-7. 갤러리 UI — 팩 구매 유도

`web/index.html` 갤러리 화면에 추가:

```
┌─────────────────────────────────────────┐
│  갤러리                                 │
│                                         │
│  [1~100] ██████░░░░  60/100 해금        │
│  [ 팩A — 3,900원으로 전체 즉시 해금 ]  │
│                                         │
│  [101~200] ░░░░░░░░░  3/100 해금        │
│  [ 팩B — 3,900원으로 전체 즉시 해금 ]  │
└─────────────────────────────────────────┘
```

잠긴 이미지는 블러 처리 + 팩 구매 버튼 오버레이.

---

## 4. 완료 체크리스트

- [ ] `server/purchaseStore.js` 구현
- [ ] `server/data/purchases.json` 초기화
- [ ] 토스페이먼츠 테스트 계정 생성 및 클라이언트 키 발급
- [ ] `/payment/pack/success` 콜백 처리 및 구매 코드 발급 동작 확인
- [ ] `/payment/redeem` 엔드포인트 구현 및 동작 확인
- [ ] `web/js/payment.js` 구현 (결제 요청)
- [ ] 결제 완료 후 구매 코드 안내 UI 구현
- [ ] 구매 코드 복구 UI 구현
- [ ] 갤러리 팩 구매 유도 UI 구현
- [ ] 실제 테스트 결제 1건 성공 확인
- [ ] 구매 코드로 해금 복구 동작 확인

---

## 5. 다음 단계

Phase 2 완료 후 → **Phase 3 PWA + Play Store 배포** 진행.
