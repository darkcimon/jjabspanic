# PRD-phase3-store — Phase 3: PWA 변환 + 스토어 배포

> 목표: PWA/TWA로 앱스토어에 배포하여 신규 유저 유입 채널을 확보한다.
> 완료 기준: Google Play Store 등록 완료

---

## 1. 개요

Phase 2까지 구현된 게임을 PWA로 변환하고, TWA(Trusted Web Activity)로 Google Play Store에 등록한다.

---

## 2. PWA + 스토어 배포

### 2-1. PWA 변환

**필요 파일 추가:**

`web/manifest.json`:
```json
{
  "name": "짭스패닉",
  "short_name": "짭스패닉",
  "start_url": "/",
  "display": "standalone",
  "orientation": "portrait",
  "background_color": "#1a0a2e",
  "theme_color": "#1a0a2e",
  "icons": [
    { "src": "/icons/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/icons/icon-512.png", "sizes": "512x512", "type": "image/png" }
  ]
}
```

`web/sw.js` (Service Worker):
```js
// 오프라인 폴백: 정적 자산 캐시
// 이미지 캐시: 현재 배치 스테이지 이미지 pre-cache
```

`web/index.html` `<head>`에 추가:
```html
<link rel="manifest" href="/manifest.json">
<script>
  if ('serviceWorker' in navigator)
    navigator.serviceWorker.register('/sw.js');
</script>
```

**아이콘 제작 필요:**
- `web/icons/icon-192.png` (192×192)
- `web/icons/icon-512.png` (512×512)
- `web/icons/icon-maskable-512.png` (마스커블, Play Store용)

---

### 2-2. TWA (Trusted Web Activity) 설정

TWA는 Android 앱 쉘 안에 웹앱을 넣어 Play Store에 배포하는 방식.
실제 게임 코드 변경 없이 배포 가능.

**필요 도구:**
```bash
npm install -g @bubblewrap/cli
bubblewrap init --manifest https://yourdomain.com/manifest.json
bubblewrap build
```

**assetlinks.json — 도메인 소유권 증명:**

`server/public/.well-known/assetlinks.json`:
```json
[{
  "relation": ["delegate_permission/common.handle_all_urls"],
  "target": {
    "namespace": "android_app",
    "package_name": "com.yourcompany.galspanic",
    "sha256_cert_fingerprints": ["YOUR_SIGNING_KEY_SHA256"]
  }
}]
```

서버에서 해당 경로 정적 서빙 추가 (`server/server.js`):
```js
app.use('/.well-known', express.static('public/.well-known'));
```

---

### 2-3. Play Store 등록 절차

1. **Google Play Console** 계정 생성 (개발자 등록비 $25, 1회)
2. 새 앱 등록 → Android 앱 (TWA APK/AAB 업로드)
3. 스토어 등록정보 작성:
   - 앱 이름: 짭스패닉
   - 짧은 설명 (80자): "AI 캐릭터를 수집하는 땅따먹기 캐주얼 게임"
   - 전체 설명 (4000자)
   - 스크린샷: 폰 2장 이상, 태블릿 1장 이상
   - 아이콘: 512×512
   - 배너: 1024×500
4. **콘텐츠 등급** 설정:
   - Sexy 티어가 있으므로 **성인 콘텐츠 포함** 여부 신중히 응답
   - "성적 콘텐츠" 항목에서 기술 수준 선택 → 등급 결정 (최소 17+)
   - 성인 콘텐츠는 Play Store 정책상 **허용 기준이 엄격**함 → 심사 전 정책 재확인 필요
5. **인앱 결제 정책 검토:**
   - TWA 앱이 디지털 콘텐츠를 판매하면 Google Play 인앱결제(30% 수수료) 사용 의무
   - 대안: 구독/결제 버튼을 브라우저로 열어 웹 결제 유지 (정책 회색지대 — 법무 검토 권장)
6. 내부 테스트 트랙 → 비공개 테스트 → 출시

---

### 2-4. 프로덕션 인프라 체크

Play Store 등록 전 필수 확인:

| 항목 | 현재 상태 | 필요 조치 |
|---|---|---|
| HTTPS 도메인 | localhost | 실제 도메인 구매 + SSL 인증서 적용 |
| 서버 호스팅 | 로컬 | Railway / Render / AWS EC2 등 클라우드 배포 |
| 이미지 저장소 | 로컬 파일시스템 | AWS S3 또는 Cloudflare R2로 이전 |
| DB | JSON 파일 | Firebase / Supabase / MongoDB Atlas 이전 권장 |
| 환경변수 | `.env` 파일 | 호스팅 플랫폼 환경변수 설정으로 이전 |

---

## 3. 완료 체크리스트

**PWA**
- [ ] `manifest.json` 작성
- [ ] Service Worker 구현 (정적 자산 캐시)
- [ ] 아이콘 3종 제작 (192, 512, maskable)
- [ ] 모바일 Chrome에서 "홈 화면 추가" 동작 확인
- [ ] Lighthouse PWA 점수 확인 (90점 이상 권장)

**스토어 배포**
- [ ] 실제 도메인 + HTTPS 적용
- [ ] 클라우드 서버 배포
- [ ] `assetlinks.json` 등록 및 검증
- [ ] Bubblewrap으로 TWA APK/AAB 빌드
- [ ] Google Play Console 앱 등록
- [ ] 콘텐츠 등급 설정 (성인 콘텐츠 정책 검토)
- [ ] 인앱결제 정책 법무 검토
- [ ] 내부 테스트 트랙 배포 및 QA
- [ ] 정식 출시

---

## 4. 이후 운영

- Stability AI 이미지 풀 업데이트 (시즌별 테마 교체)
- 리뷰 관리 및 Play Console 크래시 리포트 모니터링
- 수익 구조 재검토: 팩 vs 광고 비율 분석 후 프로모션 조정
- 트래픽 충분 시 구독 도입 검토 → `PRD-phase4-subscription.md` 참고
