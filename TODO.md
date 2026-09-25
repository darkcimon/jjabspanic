# TODO — 쿤난나 수익화 로드맵

## 🚨 지금 할 일 — 애드센스 재심사 (2026-09-25 "정책 위반" 거절 대응)

코드 작업(브랜드명 변경, 콘텐츠 페이지 6개, 리워드 광고 숨김, 아이콘 PNG 재생성)은
`fix/adsense-review` 브랜치에 커밋·푸시 완료. 아래는 직접 해야 하는 일.

### 1. 배포
- [ ] `fix/adsense-review` PR 확인 후 `master`에 머지 → Railway 자동 배포 확인
- [ ] 배포된 사이트에서 새 페이지가 열리는지 확인
      `/about.html` `/how-to-play.html` `/items.html` `/tips.html` `/faq.html` `/contact.html`
- [ ] 메인 화면 제목·로고가 "쿤난나"로 바뀌었는지, 광고 보기 버튼이 안 보이는지 확인
      (안 바뀌어 보이면 새로고침 1~2회 — 서비스워커 캐시 v31로 올려둠)

### 2. 구글 검색 등록 (재심사 전에 크롤링되게)
- [ ] [Google Search Console](https://search.google.com/search-console)에 사이트 등록
- [ ] `https://jjabspanic.up.railway.app/sitemap.xml` 제출
- [ ] URL 검사로 메인·about·how-to-play 페이지 "색인 생성 요청"

### 3. 도메인 (강력 권장 — 승인 가능성에 가장 큰 영향)
- [ ] `.com` / `.kr` 등 개인 도메인 구입 (예: kunnanna.com)
- [ ] Railway 서비스 Settings → Custom Domain 연결 (DNS CNAME 설정)
- [ ] 연결 후 Claude에게 "도메인 바꿔줘" 요청 → `sitemap.xml`, `robots.txt`,
      페이지 canonical 주소, `twa-manifest.json` host, assetlinks 등 일괄 교체
- [ ] 애드센스 → 사이트에 새 도메인 추가 (기존 railway 사이트는 삭제)

### 4. 재심사 요청
- [ ] 배포 후 며칠(3~7일) 기다려 새 페이지가 크롤링되게 하기
- [ ] 애드센스 → 사이트 → "문제를 수정했음을 확인합니다" 체크 → **검토 요청**
- [ ] 또 거절되면 애드센스 **정책 센터** 메뉴에 구체 사유가 뜨는지 확인

### 5. 승인 후
- [ ] H5 게임 광고(Ad Placement API) 별도 신청 — 리워드 광고는 이 프로그램 전용
- [ ] 승인되면 `web/js/ads.js`의 `REWARD_ADS_ENABLED`를 `true`로,
      `web/index.html` 애드센스 스크립트의 `data-adbreak-test="on"` 제거

### 6. 기타
- [ ] Play 스토어 앱(TWA): 앱 이름이 "쿤난나"로 바뀌었으므로 Bubblewrap으로 다시 빌드
      (`twa-manifest.json`은 수정됨, `app/`의 런처 아이콘은 새 `web/icons/icon-512.png`로 재생성 필요)
- [ ] 스토어 등록정보(앱 이름·설명·그래픽 이미지)도 새 이름/새 `feature-graphic.png`로 교체
- [ ] 이번 커밋에 포함하지 않은 기존 작업 확인 후 별도 커밋:
      `server/dataDir.js` + store들의 DATA_DIR 변경, `server/.env.example`, `web/js/game.js`(전멸 시 점령률 100%),
      `web/icons/*-en.*` 영문 아이콘, `server/data/images.json`·특전 이미지 1장

---

## Phase 0 — 게임 완성 확인

- [ ] `stability_ai_tester.html`로 이미지 품질 확인
- [ ] 서버 실행 후 게임 전체 플레이 테스트
- [ ] Go/No-Go 결정

---

## Phase 1 — 팩 결제

- [x] 토스페이먼츠 계정 생성 및 테스트 키 발급
- [x] `server/purchaseStore.js` 구현
- [x] `server/data/purchases.json` 초기화
- [x] 결제 엔드포인트 추가 (`/payment/pack/success`, `/payment/pack/fail`, `/payment/redeem`)
- [x] `web/js/payment.js` 구현 (결제 요청)
- [x] 결제 완료 후 구매 코드 안내 UI
- [x] 구매 코드 복구 UI (갤러리 또는 설정 화면)
- [x] 갤러리 UI에 팩 구매 버튼 추가 (블러 + 구매 유도)
- [x] 테스트 결제 1건 성공 확인

---

## Phase 2 — 배포

- [x] 도메인 구매 + HTTPS 적용 (Railway 서브도메인으로 대체, 커스텀 도메인 불필요)
- [x] 클라우드 서버 배포 (Railway)
- [x] `web/manifest.json` 작성
- [x] `web/sw.js` Service Worker 구현
- [x] 아이콘 제작 — 192×192, 512×512, maskable
- [x] 모바일 Chrome "홈 화면 추가" 동작 확인
- [x] Google Play Console 계정 생성 ($25, 1회)
- [x] `server/public/.well-known/assetlinks.json` 등록
- [x] Bubblewrap으로 TWA APK/AAB 빌드
- [ ] 내부 테스트 트랙 배포 및 QA
- [ ] 콘텐츠 등급 설정 (성인 콘텐츠 정책 검토)
- [ ] 정식 출시

---

## Phase 3 — 광고 연동 (배포 후 — URL 필요)

- [ ] Kakao AdFit 계정 신청 및 사이트/앱 등록
- [x] `web/privacy.html` 작성 (광고 심사 필수 요건)
- [ ] AdFit 심사 통과 확인 → `ad.js`의 ADFIT_UNIT_ID 교체
- [x] `web/js/ad.js` 구현 (보상형 광고 플로우 + AdFit SDK 연동)
- [x] 광고 트리거 연결 — 스테이지 실패 이어하기
- [x] 광고 트리거 연결 — 목숨 +1 충전
- [x] 광고 트리거 연결 — 다음 캐릭터 미리보기
- [x] 일일 광고 횟수 제한 구현 (continue 3회, points 10회, preview 5회)
- [x] 광고 차단기 감지 시 대체 메시지 노출

---

## Phase 4 — 구독 (선택, 트래픽 확보 후 검토)

- [ ] 구독 플랜 설계 (광고 제거, 보상 이미지 횟수 증가 등 혜택 정의)
- [ ] 토스페이먼츠 정기결제(빌링) 키 발급
- [ ] `server/subscriptionStore.js` 구현 (구독 상태, 갱신일, 해지 관리)
- [ ] 정기결제 엔드포인트 추가 (`/payment/sub/start`, `/payment/sub/webhook`, `/payment/sub/cancel`)
- [ ] `web/js/subscription.js` 구현 (구독 상태 조회 및 결제 요청)
- [ ] `ad.js`의 `isSubscriber()` 실제 구독 상태와 연동
- [ ] 구독 관리 UI (현재 플랜 확인, 해지 버튼)
- [ ] 웹훅으로 갱신/해지 자동 처리
- [ ] 테스트 정기결제 1건 성공 확인
