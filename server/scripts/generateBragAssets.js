/**
 * generateBragAssets.js — "내 캐릭터 자랑하기" 카드용 AI 캐릭터 이미지 생성
 *
 * 기존 벡터로 그리던 다람쥐 캐릭터(squirrel.js)를 브래그 카드 한정으로 AI
 * 생성 이미지로 교체하기 위한 원샷 스크립트. 결과물:
 *   web/character/bare.png          — 악세사리 미착용 기본 캐릭터
 *   web/character/<accessory_id>.png — 악세사리 8종 각각 착용한 캐릭터
 *
 * 캐릭터 일관성을 위해:
 *   - 기본 이미지는 text-to-image로 1장만 생성
 *   - 악세사리 8장은 그 기본 이미지를 image-to-image의 초기 이미지로 넘겨
 *     "구도/캐릭터는 유지한 채 악세사리만 추가"되도록 함 (strength를 낮게)
 *   - 동일 seed를 계속 사용해 모델이 같은 캐릭터를 그리는 경향을 강화
 *
 * 실행:
 *   cd server
 *   npm run generate:brag-assets
 * (STABILITY_API_KEY는 .env에서 읽음 — 유료 API 호출이 총 9회 발생)
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const axios    = require('axios');
const fs       = require('fs');
const path     = require('path');
const FormData = require('form-data');

const API_URL  = 'https://api.stability.ai/v2beta/stable-image/generate/sd3';
const MODEL    = 'sd3-medium';
const SEED     = 424242; // 전 이미지 공통 — 같은 캐릭터로 수렴시키기 위한 고정 seed
const STRENGTH = 0.7;    // image-to-image 변형 강도 (0.4는 실측 결과 악세사리가
                          // 거의 반영되지 않아 0.7로 상향 — 그래도 seed+prompt 공유로
                          // 캐릭터 정체성은 어느 정도 유지됨)

const OUT_DIR = path.join(__dirname, '../../web/character');

const BASE_PROMPT =
  'cute chibi squirrel mascot character, big round sparkling eyes, fluffy bushy tail, ' +
  'warm orange-brown fur, cream belly patch, rosy cheeks, game mascot design, ' +
  'simple flat 2d vector illustration, clean bold outlines, soft cel shading, ' +
  'centered composition, front facing, plain soft purple gradient background, ' +
  'no text, no watermark';

const NEGATIVE =
  'human, person, anime girl, realistic, photo, 3d render, text, watermark, ' +
  'blurry, deformed, extra limbs, bad anatomy, ugly, low quality, multiple characters, ' +
  'nsfw, lowres';

// id: accessories.js의 아이템 id와 반드시 일치해야 bragCard.js가 찾아 쓸 수 있음.
const ACCESSORY_VARIANTS = [
  { id: 'hat_bow',        phrase: 'wearing a small pink bow ribbon on top of its head' },
  { id: 'hat_crown',      phrase: 'wearing a shiny golden crown on its head' },
  { id: 'outfit_scarf',   phrase: 'wearing a cozy red scarf around its neck' },
  { id: 'outfit_cape',    phrase: 'wearing a flowing purple hero cape on its back' },
  { id: 'acc_sunglasses', phrase: 'wearing cool black sunglasses' },
  { id: 'acc_wings',      phrase: 'cosplaying as a fairy, wearing a fairy costume backpack with two large angel wings physically attached and strapped to its back, wings are part of its outfit' },
  { id: 'shoes_sneakers', phrase: 'zoomed out full body view, chunky white sneaker shoes with pink laces covering both of its tiny feet at the very bottom of the frame' },
  { id: 'shoes_rocket',   phrase: 'standing on two feet wearing clearly visible metallic rocket boots shooting orange flame, full body shot showing the feet' },
];

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function generateBase(apiKey) {
  const form = new FormData();
  form.append('prompt',          BASE_PROMPT);
  form.append('negative_prompt', NEGATIVE);
  form.append('model',           MODEL);
  form.append('output_format',   'png');
  form.append('aspect_ratio',    '1:1');
  form.append('seed',            String(SEED));

  const resp = await axios.post(API_URL, form, {
    headers: { ...form.getHeaders(), Authorization: `Bearer ${apiKey}`, Accept: 'image/*' },
    responseType: 'arraybuffer',
    timeout: 60000,
  });
  return Buffer.from(resp.data);
}

async function generateAccessoryVariant(apiKey, baseImageBuffer, phrase, strength = STRENGTH) {
  const form = new FormData();
  form.append('prompt',          `${BASE_PROMPT}, ${phrase}, still the same cute chibi squirrel mascot, same pose, same art style`);
  form.append('negative_prompt', NEGATIVE);
  form.append('model',           MODEL);
  form.append('output_format',   'png');
  form.append('mode',            'image-to-image');
  form.append('strength',        String(strength));
  form.append('seed',            String(SEED));
  form.append('image',           baseImageBuffer, { filename: 'base.png', contentType: 'image/png' });

  const resp = await axios.post(API_URL, form, {
    headers: { ...form.getHeaders(), Authorization: `Bearer ${apiKey}`, Accept: 'image/*' },
    responseType: 'arraybuffer',
    timeout: 60000,
  });
  return Buffer.from(resp.data);
}

async function main() {
  const apiKey = process.env.STABILITY_API_KEY;
  if (!apiKey) {
    console.error('오류: STABILITY_API_KEY 환경변수가 설정되지 않았습니다.');
    process.exit(1);
  }

  fs.mkdirSync(OUT_DIR, { recursive: true });

  console.log('=== 브래그 카드 캐릭터 에셋 생성 (기본 1장 + 악세사리 8장) ===');

  const barePath = path.join(OUT_DIR, 'bare.png');
  const reuseBase = process.argv.includes('--reuse-base') && fs.existsSync(barePath);
  let baseBuffer;
  if (reuseBase) {
    console.log('\n[1/9] 기존 bare.png 재사용 (재생성 생략, 비용 절감)...');
    baseBuffer = fs.readFileSync(barePath);
  } else {
    console.log('\n[1/9] 기본(미착용) 캐릭터 생성 중...');
    baseBuffer = await generateBase(apiKey);
    fs.writeFileSync(barePath, baseBuffer);
    console.log('  → web/character/bare.png 저장 완료');
    await sleep(1000);
  }

  // --only=id1,id2 로 특정 악세사리만 재생성 가능 (첫 실행에서 악세사리가 잘 안
  // 보이던 항목만 더 높은 strength로 재시도할 때 씀). --strength=0.85 로 오버라이드.
  const onlyArg = process.argv.find(a => a.startsWith('--only='));
  const onlyIds = onlyArg ? new Set(onlyArg.slice('--only='.length).split(',')) : null;
  const strengthArg = process.argv.find(a => a.startsWith('--strength='));
  const strengthOverride = strengthArg ? parseFloat(strengthArg.slice('--strength='.length)) : STRENGTH;

  const targets = onlyIds ? ACCESSORY_VARIANTS.filter(v => onlyIds.has(v.id)) : ACCESSORY_VARIANTS;

  let i = 2;
  for (const variant of targets) {
    console.log(`\n[${i}/9] ${variant.id} 착용 캐릭터 생성 중... (strength=${strengthOverride})`);
    try {
      const buf = await generateAccessoryVariant(apiKey, baseBuffer, variant.phrase, strengthOverride);
      fs.writeFileSync(path.join(OUT_DIR, `${variant.id}.png`), buf);
      console.log(`  → web/character/${variant.id}.png 저장 완료`);
    } catch (err) {
      console.error(`  ✗ ${variant.id} 생성 실패: ${err.response?.data ? Buffer.from(err.response.data).toString() : err.message}`);
    }
    i++;
    await sleep(1000); // API rate limit 방지
  }

  console.log('\n=== 완료 — web/character/ 폴더 확인 ===');
}

main().catch(err => {
  console.error('브래그 에셋 생성 실패:', err.message);
  process.exit(1);
});
