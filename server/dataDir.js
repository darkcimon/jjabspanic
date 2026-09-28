/**
 * dataDir.js
 * rankStore/userStore/purchaseStore 등이 JSON 파일을 저장하는 디렉토리를
 * 하나로 통일한다. DATA_DIR 환경변수가 있으면 그 경로(Railway Volume 마운트
 * 경로 등 재시작·재배포에도 남는 영구 디스크)를 쓰고, 없으면 기존처럼
 * server/data를 쓴다(로컬 개발 기본값, 하위 호환).
 *
 * imageStore.js의 IMG_DIR와 같은 이유로 path.resolve(__dirname, ...)를 써서
 * 항상 이 파일 기준 절대경로로 고정한다 — Railway는 저장소 루트에서
 * `npm start` -> `node server/server.js`로 실행되어 CWD가 server/가 아니므로,
 * 상대경로를 그대로 쓰면 CWD 기준으로 엉뚱한 곳에 쓰인다. DATA_DIR이 이미
 * 절대경로(예: "/data")면 path.resolve가 그대로 유지해준다.
 */

const fs   = require('fs');
const path = require('path');

const DATA_DIR = path.resolve(__dirname, process.env.DATA_DIR || 'data');
fs.mkdirSync(DATA_DIR, { recursive: true });

module.exports = { DATA_DIR };
