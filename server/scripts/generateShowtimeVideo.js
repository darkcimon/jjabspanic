/**
 * generateShowtimeVideo.js — 마일스톤 스테이지 "쇼타임" MP4 클립 생성 (Kling image-to-video)
 *
 * 이미 생성돼 있는 스테이지 캐릭터 이미지(stage_<n>_g.jpg)를 첫 프레임으로 넘겨
 * 짧은 축하 영상으로 애니메이션한다. 결과물: web/showtime/stage_<n>.mp4
 *
 * 실행 (유료 API 호출 1회 — 이미 결과 파일이 있으면 --force 없이는 건너뜀):
 *   cd server
 *   npm run generate:showtime                 # 10스테이지, std 모드, 5초
 *   npm run generate:showtime -- --dry-run    # 요청 내용만 출력, API 호출 없음
 *   npm run generate:showtime -- --mode pro --duration 10 --force
 *
 * .env 필요: KLING_ACCESS_KEY, KLING_SECRET_KEY (선택: KLING_API_BASE)
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const axios = require('axios');
const fs    = require('fs');
const path  = require('path');
const jwt   = require('jsonwebtoken');

const API_BASE   = process.env.KLING_API_BASE || 'https://api.klingai.com';
const MODEL_NAME = process.env.KLING_MODEL || 'kling-v1-6';
const POLL_MS    = 10 * 1000;
const TIMEOUT_MS = 15 * 60 * 1000;

const IMG_DIR = path.resolve(__dirname, '..', process.env.IMAGE_DIR || path.join('public', 'images'));
const OUT_DIR = path.join(__dirname, '../../web/showtime');

const PROMPT =
  'the anime character smiles happily and gives a cheerful celebratory wave, ' +
  'hair and clothes flowing gently, sparkles and glowing confetti particles floating around, ' +
  'soft light bloom, slow subtle camera push-in, joyful victory mood';
const NEGATIVE_PROMPT =
  'text, watermark, logo, blurry, deformed face, distorted body, extra limbs, ' +
  'bad anatomy, flicker, low quality';

function parseArgs(argv) {
  const opts = { stage: 10, mode: 'std', duration: '5', force: false, dryRun: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--force') opts.force = true;
    else if (a === '--dry-run') opts.dryRun = true;
    else if (a === '--stage') opts.stage = parseInt(argv[++i], 10);
    else if (a === '--mode') opts.mode = argv[++i];
    else if (a === '--duration') opts.duration = String(argv[++i]);
  }
  if (!Number.isInteger(opts.stage) || opts.stage < 1) throw new Error('--stage는 양의 정수여야 합니다.');
  if (!['std', 'pro'].includes(opts.mode)) throw new Error('--mode는 std 또는 pro 여야 합니다.');
  if (!['5', '10'].includes(opts.duration)) throw new Error('--duration은 5 또는 10 이어야 합니다.');
  return opts;
}

// Kling은 AccessKey/SecretKey로 서명한 단기(30분) HS256 JWT를 Bearer로 요구한다.
function makeToken() {
  const ak = process.env.KLING_ACCESS_KEY;
  const sk = process.env.KLING_SECRET_KEY;
  if (!ak || !sk) throw new Error('.env에 KLING_ACCESS_KEY / KLING_SECRET_KEY가 필요합니다.');
  const now = Math.floor(Date.now() / 1000);
  return jwt.sign({ iss: ak, exp: now + 1800, nbf: now - 5 }, sk, { algorithm: 'HS256', header: { alg: 'HS256', typ: 'JWT' } });
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

function authHeaders() {
  return { Authorization: `Bearer ${makeToken()}`, 'Content-Type': 'application/json' };
}

function assertOk(data, what) {
  if (!data || data.code !== 0) {
    throw new Error(`${what} 실패: code=${data && data.code} message=${data && data.message}`);
  }
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const srcPath = path.join(IMG_DIR, `stage_${opts.stage}_g.jpg`);
  const outPath = path.join(OUT_DIR, `stage_${opts.stage}.mp4`);

  if (!fs.existsSync(srcPath)) throw new Error(`원본 이미지가 없습니다: ${srcPath} (먼저 해당 스테이지 이미지를 생성하세요)`);
  if (fs.existsSync(outPath) && !opts.force) {
    console.log(`이미 존재: ${outPath} — 다시 만들려면 --force (유료 호출 발생)`);
    return;
  }

  // Kling은 data: 접두사 없는 순수 base64를 받는다.
  const image = fs.readFileSync(srcPath).toString('base64');
  const body = {
    model_name: MODEL_NAME,
    mode: opts.mode,
    duration: opts.duration,
    image,
    prompt: PROMPT,
    negative_prompt: NEGATIVE_PROMPT,
    cfg_scale: 0.5,
  };

  if (opts.dryRun) {
    console.log('[dry-run] 호출하지 않음. 요청 요약:');
    console.log(JSON.stringify({ ...body, image: `<base64 ${image.length} chars from ${srcPath}>` }, null, 2));
    return;
  }

  console.log(`[Kling] 작업 제출: stage ${opts.stage}, ${MODEL_NAME}/${opts.mode}/${opts.duration}s`);
  const submit = await axios.post(`${API_BASE}/v1/videos/image2video`, body, { headers: authHeaders(), timeout: 60000 });
  assertOk(submit.data, '작업 제출');
  const taskId = submit.data.data.task_id;
  console.log(`[Kling] task_id=${taskId} — 완료까지 폴링 (${POLL_MS / 1000}초 간격)`);

  const start = Date.now();
  let videoUrl = null;
  while (Date.now() - start < TIMEOUT_MS) {
    await sleep(POLL_MS);
    const res = await axios.get(`${API_BASE}/v1/videos/image2video/${taskId}`, { headers: authHeaders(), timeout: 30000 });
    assertOk(res.data, '상태 조회');
    const { task_status, task_status_msg, task_result } = res.data.data;
    console.log(`[Kling] 상태: ${task_status}`);
    if (task_status === 'succeed') {
      videoUrl = task_result && task_result.videos && task_result.videos[0] && task_result.videos[0].url;
      break;
    }
    if (task_status === 'failed') throw new Error(`생성 실패: ${task_status_msg || '사유 없음'}`);
  }
  if (!videoUrl) throw new Error('시간 초과 또는 결과 URL 없음 (Kling 콘솔에서 task_id로 확인하세요).');

  // 결과 URL은 일정 기간 후 만료되므로 즉시 내려받아 저장한다.
  const dl = await axios.get(videoUrl, { responseType: 'arraybuffer', timeout: 120000 });
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(outPath, Buffer.from(dl.data));
  console.log(`저장 완료: ${outPath} (${(dl.data.byteLength / 1024 / 1024).toFixed(2)} MB)`);
}

main().catch(err => {
  console.error('[오류]', err.response ? `${err.message} — ${JSON.stringify(err.response.data)}` : err.message);
  process.exit(1);
});
