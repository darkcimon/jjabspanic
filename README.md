# 짭스패닉 (GalsPanic)

AI로 생성된 캐릭터를 활용한 땅따먹기 캐주얼 웹 게임 (Vanilla JS + Node.js)

---

## 목차

1. [프로젝트 구조](#프로젝트-구조)
2. [사전 요구사항](#사전-요구사항)
3. [백엔드 서버 실행](#백엔드-서버-실행)
4. [웹 프론트엔드 실행](#웹-프론트엔드-실행)
5. [프롬프트 품질 테스트](#프롬프트-품질-테스트)
6. [API 엔드포인트](#api-엔드포인트)
7. [트러블슈팅](#트러블슈팅)

---

## 프로젝트 구조

```
jjabspanic/
├── server/                  # Node.js 백엔드 서버
│   ├── server.js            # Express API 서버 (포트 3000)
│   ├── imageStore.js        # JSON 기반 이미지 메타데이터 저장소
│   ├── batchGenerator.js    # Stability AI SD3 이미지 배치 생성기
│   ├── scripts/
│   │   └── pregenerate.js   # Batch 0 사전 생성 스크립트
│   ├── package.json
│   └── .env.example         # 환경 변수 예시
├── web/                     # 웹 프론트엔드 (Vanilla JS)
│   ├── index.html           # 단일 HTML 진입점 (모든 화면 포함)
│   ├── js/
│   │   ├── config.js        # 게임 상수 및 난이도 공식
│   │   ├── game.js          # 게임 루프, 선 그리기, BFS 영역 계산
│   │   ├── api.js           # 서버 API 클라이언트
│   │   ├── app.js           # 화면 라우터 및 최상위 상태
│   │   └── storage.js       # localStorage 저장/불러오기
│   └── css/
│       └── style.css        # 모바일 퍼스트 스타일
├── PRD/                     # 기획 문서
├── stability_ai_tester.html # 프롬프트 수동 테스트 도구
└── CLAUDE.md
```

---

## 사전 요구사항

### 백엔드

| 항목 | 버전 |
|---|---|
| Node.js | 18.x 이상 |
| npm | 9.x 이상 |
| Stability AI API 키 | [platform.stability.ai](https://platform.stability.ai) 에서 발급 |

### 웹 프론트엔드

별도 빌드 도구 없음. 모던 브라우저(Chrome/Firefox/Safari 최신버전) 및 ES Modules 지원 환경이면 됩니다.

---

## 백엔드 서버 실행

### 1단계 — 의존성 설치

```bash
cd server
npm install
```

### 2단계 — 환경 변수 설정

`.env.example`을 복사하여 `.env` 파일을 생성합니다.

```bash
cp .env.example .env
```

`.env` 파일을 열고 값을 채웁니다:

```env
STABILITY_API_KEY=sk-여기에_실제_API_키_입력
PORT=3000
IMAGE_BASE_URL=http://localhost:3000/images
IMAGE_DIR=./public/images
```

> **주의:** API 키는 절대 코드에 하드코딩하거나 Git에 커밋하지 마세요.

### 3단계 — Batch 0 이미지 사전 생성 (출시 전 1회 실행)

스테이지 1~30에 필요한 이미지를 미리 생성합니다. Stability AI API 호출 횟수만큼 과금되므로 신중하게 실행하세요.

```bash
cd server
npm run pregenerate
```

- 생성된 이미지는 `server/public/images/` 폴더에 저장됩니다.
- 약 30회 API 호출이 발생합니다 (스테이지당 1회, 1초 간격).

### 4단계 — 서버 실행

**개발 환경 (코드 변경 시 자동 재시작):**

```bash
npm run dev
```

**프로덕션 환경:**

```bash
npm start
```

서버가 정상 실행되면 `http://localhost:3000` 에서 접근할 수 있습니다.

---

## 웹 프론트엔드 실행

서버가 실행된 상태에서 브라우저로 접속합니다.

```
http://localhost:3000
```

서버가 `web/` 폴더를 정적 파일로 서빙합니다. 별도의 빌드 과정은 필요 없습니다.

### 모바일 실기기 테스트

PC와 모바일이 같은 Wi-Fi에 연결되어 있어야 합니다.

1. PC의 로컬 IP 확인 (예: `192.168.1.100`)
2. 모바일 브라우저에서 `http://192.168.1.100:3000` 접속

---

## 프롬프트 품질 테스트

Stability AI 이미지 생성 프롬프트를 배치 실행 전에 수동으로 테스트할 수 있습니다.

1. `stability_ai_tester.html` 파일을 브라우저에서 직접 열기
2. API 키와 프롬프트 입력
3. 이미지 생성 결과 확인

> API 비용이 발생하므로 테스트는 최소한으로 진행하세요.

---

## API 엔드포인트

서버 실행 후 사용 가능한 엔드포인트:

| 메서드 | 경로 | 설명 |
|---|---|---|
| GET | `/api/image?stage={n}&rating={g\|s}` | 스테이지 이미지 URL 조회 |
| GET | `/api/batch/status?batchIndex={n}` | 배치 생성 진행 상태 확인 |
| POST | `/api/batch/trigger` | 배치 이미지 비동기 생성 시작 |
| POST | `/api/reward/generate` | 키워드 기반 보상 이미지 생성 |
| GET | `/images/*` | 생성된 이미지 정적 파일 서빙 |

---

## 트러블슈팅

### 서버가 시작되지 않을 때

- `.env` 파일이 `server/` 폴더 안에 있는지 확인
- `STABILITY_API_KEY` 값이 올바르게 입력되었는지 확인
- 포트 3000이 다른 프로세스에 의해 점유되어 있으면 `.env`의 `PORT` 값을 변경

### 이미지가 생성되지 않을 때

- Stability AI API 크레딧 잔액 확인
- API 키의 유효성 확인
- `server/data/images.json` 파일 상태 확인 (없으면 서버 최초 실행 시 자동 생성됨)

### 브라우저에서 이미지 로드 실패 시

- 서버가 실행 중인지 확인 (`npm run dev`)
- 브라우저 콘솔에서 CORS 오류 여부 확인
- 실기기 테스트 시 서버 URL이 PC의 실제 IP로 설정되어 있는지 확인

### ES Module 오류 (로컬 파일로 직접 열 때)

`web/index.html`을 `file://`로 직접 열면 ES Modules가 동작하지 않습니다.
반드시 서버(`http://localhost:3000`)를 통해 접속하세요.

---

## 관련 문서

전체 기획 문서는 `PRD/` 폴더를 참고하세요.

| 문서 | 내용 |
|---|---|
| `PRD/INDEX.md` | 문서 목록 및 개요 |
| `PRD/PRD-00-overview.md` | 제품 개요 & 전략 |
| `PRD/PRD-monetization.md` | 수익화 전략 |
