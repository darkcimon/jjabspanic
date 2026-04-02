# TODO — 짭스패닉 수익화 로드맵

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

- [ ] 토스페이먼츠 계정 생성 및 테스트 키 발급
- [ ] `server/purchaseStore.js` 구현
- [ ] `server/data/purchases.json` 초기화
- [ ] 결제 엔드포인트 추가 (`/payment/pack/success`, `/payment/pack/fail`, `/payment/redeem`)
- [ ] `web/js/payment.js` 구현 (결제 요청)
- [ ] 결제 완료 후 구매 코드 안내 UI
- [ ] 구매 코드 복구 UI (갤러리 또는 설정 화면)
- [ ] 갤러리 UI에 팩 구매 버튼 추가 (블러 + 구매 유도)
- [ ] 테스트 결제 1건 성공 확인
