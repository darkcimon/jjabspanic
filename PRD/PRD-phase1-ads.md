# PRD-phase1-ads — Phase 1: 광고 수익 검증

> 목표: 보상형 광고 플로우를 구현하고 실제 광고 수익 발생을 확인한다.
> 완료 기준: 보상형 광고 1회 이상 정상 시청 + AdSense/AdFit 수익 대시보드 확인

---

## 1. 개요

게임의 핵심 루프를 유지하면서 유저가 자발적으로 광고를 시청하도록 유도하는 보상형 광고 시스템을 구축한다. 강제 광고는 이탈률을 높이므로 이 단계에서는 **선택형 광고만** 구현한다.

---

## 2. 구현 목록

### 2-1. 광고 제공사 선택 및 계정 설정

**옵션 A — Google AdSense** (권장)
- [adsense.google.com](https://adsense.google.com) 에서 사이트 등록 및 심사 신청
- 심사 통과 조건: 독자적인 콘텐츠, 명확한 개인정보처리방침 페이지 보유
- `web/privacy.html` 파일 추가 필요 (개인정보처리방침)

**옵션 B — Kakao AdFit** (국내 트래픽 특화)
- [adfit.kakao.com](https://adfit.kakao.com) 에서 앱/사이트 등록
- 심사 기간 약 3~5 영업일

> 둘 다 등록 후 성과 비교 권장. 초기에는 AdFit을 먼저 적용하고 AdSense 심사 병행.

---

### 2-2. `web/js/ad.js` 모듈 구현

광고 시청 완료를 감지하고 보상을 지급하는 래퍼 모듈.

**파일 위치:** `web/js/ad.js`

**핵심 인터페이스:**

```js
// 광고 시청 후 콜백 실행
// rewardType: 'continue' | 'life' | 'preview'
export async function showRewardedAd(rewardType, onRewarded) { ... }

// 광고 가능 여부 확인 (광고 차단기 감지 등)
export function isAdAvailable() { ... }
```

**보상형 광고 구현 방식 (AdSense 미지원 → 직접 구현):**

```
광고 버튼 클릭
    → 광고 오버레이 표시 (팝업 또는 전체화면)
    → iframe 또는 광고 스크립트 삽입
    → 타이머 카운트다운 (최소 시청 시간: 15초)
    → 타이머 완료 → onRewarded() 호출
    → 오버레이 닫기
```

또는 **Google Ad Manager의 rewarded ad unit** 사용 시:
- Ad Manager 계정 생성 → rewarded 광고 단위 발급
- GPT(Google Publisher Tag) 스크립트로 `web/index.html`에 삽입

---

### 2-3. 광고 트리거 3곳 추가

**트리거 A — 스테이지 실패 시 이어하기**

`web/js/game.js` — 실패 처리 부분에 추가:
```
게임 오버 화면 표시
    → "광고 보고 이어하기" 버튼 노출
    → showRewardedAd('continue', () => { 현재 스테이지 재시작, 목숨 1 유지 })
```

**트리거 B — 목숨 충전**

메인 화면 또는 게임 중 일시정지 화면:
```
"광고 보고 목숨 +1" 버튼 (하루 최대 3회 제한)
    → showRewardedAd('life', () => { lives++ })
```

**트리거 C — 다음 스테이지 캐릭터 미리보기**

스테이지 클리어 화면:
```
"다음 캐릭터 미리보기" 버튼
    → showRewardedAd('preview', () => { 다음 스테이지 이미지 블러 해제 5초 })
```

---

### 2-4. 광고 횟수 제한 (어뷰징 방지)

`web/js/storage.js`에 일일 광고 시청 횟수 저장:

```js
// 오늘 날짜 기준으로 횟수 초기화
const AD_DAILY_LIMIT = { continue: 3, life: 3, preview: 5 };
```

---

### 2-5. 개인정보처리방침 페이지

AdSense 심사 및 법적 요건 충족을 위해 필수.

**파일 위치:** `web/privacy.html`

포함 내용:
- 수집 정보: 광고 쿠키, localStorage 데이터
- 제3자 제공: Google AdSense/AdFit
- 쿠키 정책 및 거부 방법

---

### 2-6. 서버 변경 사항 (최소)

이 단계에서는 서버 변경 없음. 광고는 순수 클라이언트 사이드로 동작.

---

## 3. 완료 체크리스트

- [ ] AdFit 또는 AdSense 계정 생성 및 심사 통과
- [ ] `web/js/ad.js` 구현 완료
- [ ] 실패 시 이어하기 광고 트리거 동작 확인
- [ ] 목숨 충전 광고 트리거 동작 확인
- [ ] 미리보기 광고 트리거 동작 확인
- [ ] 일일 광고 횟수 제한 동작 확인
- [ ] `web/privacy.html` 작성 및 푸터에 링크 추가
- [ ] 광고 차단기 감지 시 대체 메시지 노출 확인
- [ ] 실제 광고 수익 대시보드에서 수익 확인

---

## 4. 다음 단계

Phase 1 완료 후 → **Phase 2 콘텐츠 팩 판매** 진행.
광고 수익이 월 10만원 이상이거나 DAU 200명 이상이면 수익화 전략 재검토.
