/**
 * batchGenerator.js
 * Stability AI API를 호출해 스테이지 이미지를 배치(30개) 단위로 생성한다.
 */

const axios    = require('axios');
const fs       = require('fs');
const FormData = require('form-data');
const store    = require('./imageStore');

const API_URL = 'https://api.stability.ai/v2beta/stable-image/generate/sd3';
const MODEL   = 'sd3-medium';

// ── 프롬프트 풀 (30개 순환 = 배치 크기와 동일 → 한 배치 안에서 중복 없음) ──
const GENERAL_BASE = [
    "anime girl, cute, pink twin tails, cherry blossoms, beautiful spring scene",
    "anime girl, silver long hair, night sky, elegant dress, moonlight, stars",
    "anime girl, red short hair, sporty outfit, energetic pose, outdoor",
    "anime girl, blonde hair, fantasy warrior, armor, glowing sword",
    "anime girl, blue twin tails, magical girl, sparkles, wand, pastel sky",
    "anime girl, dark purple hair, gothic dress, black roses, mysterious",
    "anime girl, orange ponytail, maid outfit, cafe, warm light, friendly",
    "anime girl, white hair, shrine maiden, torii gate, autumn leaves",
    "anime girl, super cute, green hair, forest elf, nature, fairy wings",
    "anime girl, black hair, cyberpunk, neon lights, futuristic city",
    "anime girl, lavender hair, idol singer, stage performance, microphone",
    "anime girl, rainbow gradient hair, celestial being, cosmos, divine aura",
    "anime girl, teal hair, mermaid tail, ocean waves, coral reef, shimmering scales",
    "anime girl, golden hair, astronaut suit, starfield, spaceship window, cosmic wonder",
    "anime girl, black hair, samurai armor, cherry blossom dojo, katana, honor",
    "anime girl, brown hair, witch hat, potion bottles, cozy library, candlelight",
    "anime girl, pink hair, tennis outfit, sunny court, energetic serve, cheerful",
    "anime girl, mint hair, chef uniform, bakery kitchen, fresh bread, warm smile",
    "anime girl, violet hair, painter smock, art studio, easel, colorful paint splashes",
    "anime girl, icy blue hair, ice queen gown, frozen palace, snowflakes, crystal crown",
    "anime girl, crimson hair, dancer costume, stage spotlight, flowing ribbon, grace",
    "anime girl, sandy blonde hair, explorer outfit, jungle ruins, adventure, torchlight",
    "anime girl, sky blue hair, DJ headphones, concert stage, neon lights, music notes",
    "anime girl, copper hair, florist apron, flower shop, blooming roses, gentle smile",
    "anime girl, platinum hair, pilot uniform, clouds, airplane cockpit, adventurous",
    "anime girl, jade green hair, scientist coat, laboratory, glowing test tubes, curious",
    "anime girl, peach hair, baker outfit, pastry shop, sweets display, cheerful",
    "anime girl, steel gray hair, knight armor, castle courtyard, shield, noble",
    "anime girl, coral hair, gamer hoodie, gaming room, RGB lights, controller in hand",
    "anime girl, amber hair, violinist, orchestra stage, elegant gown, music sheets",
];

const QUALITY_SUFFIX = ", white background, full body portrait, high quality, masterpiece, ultra detailed, 2d illustration, clean lineart, soft shading";
const NEGATIVE       = "nsfw, lowres, bad anatomy, bad hands, text, error, missing fingers, ugly, blurry, watermark, extra limbs, deformed";

function buildPrompt(stage) {
    const base = GENERAL_BASE[(stage - 1) % GENERAL_BASE.length];
    return base + QUALITY_SUFFIX;
}

function calcSeed(stage) {
    return ((stage * 137)) % 2147483647;
}

// ── 단일 이미지 생성 ──────────────────────────────────────
async function generateImage(stage, rating = 'g') {
    const apiKey = process.env.STABILITY_API_KEY;
    if (!apiKey) throw new Error('STABILITY_API_KEY 환경변수가 설정되지 않았습니다.');

    const prompt = buildPrompt(stage);
    const seed   = calcSeed(stage);

    const form = new FormData();
    form.append('prompt',          prompt);
    form.append('negative_prompt', NEGATIVE);
    form.append('model',           MODEL);
    form.append('output_format',   'jpeg');
    form.append('aspect_ratio',    '2:3');
    form.append('seed',            seed.toString());

    const resp = await axios.post(API_URL, form, {
        headers: {
            ...form.getHeaders(),
            Authorization: `Bearer ${apiKey}`,
            Accept: 'image/*',
        },
        responseType: 'arraybuffer',
        timeout: 60000,
    });

    const filePath = store.getImageFilePath(stage, rating);
    const filename = store.getImageFilename(stage, rating);
    fs.writeFileSync(filePath, resp.data);
    store.setImageUrl(stage, rating, filename);

    console.log(`[Batch] Stage ${stage} (${rating}) 생성 완료`);
    return filename;
}

// ── 배치 생성 (30개, 순차) ───────────────────────────────
async function generateBatch(batchIndex, rating) {
    const startStage = batchIndex * store.BATCH_SIZE + 1;
    const endStage   = Math.min(startStage + store.BATCH_SIZE - 1, store.MAX_STAGE);

    console.log(`[Batch] 배치 ${batchIndex} 생성 시작 (stage ${startStage}~${endStage}, rating: ${rating})`);

    let progress = 0;
    for (let stage = startStage; stage <= endStage; stage++) {
        if (store.getImageUrl(stage, rating)) {
            // 이미 생성되어 있으면 재생성하지 않음 (재시도 시 API 비용 절감)
            progress++;
            store.updateBatchProgress(batchIndex, progress);
            continue;
        }
        try {
            await generateImage(stage, rating);
            progress++;
            store.updateBatchProgress(batchIndex, progress);
        } catch (err) {
            console.error(`[Batch] Stage ${stage} 생성 실패: ${err.message}`);
            // 실패한 스테이지는 건너뛰고 계속 진행 (완료 여부는 아래에서 다시 확인)
        }
        // API rate limit 방지: 스테이지 간 1초 대기
        await sleep(1000);
    }

    // progress 카운터가 아니라 실제 저장된 이미지 존재 여부로 완료를 판단한다 —
    // 예전엔 일부 스테이지 생성이 실패해도 배치가 'ready'로 표시돼, 그 스테이지
    // 이미지가 영구히 표시되지 않는 문제가 있었다 (재시도 경로가 없었음).
    const missing = [];
    for (let stage = startStage; stage <= endStage; stage++) {
        if (!store.getImageUrl(stage, rating)) missing.push(stage);
    }
    if (missing.length > 0) {
        console.error(`[Batch] 배치 ${batchIndex}(${rating}) 미완료 — 누락된 스테이지: ${missing.join(', ')}. 'pending'으로 되돌려 다음 트리거 때 재시도하게 함.`);
        store.resetBatchToPending(batchIndex);
        return;
    }

    store.markBatchReady(batchIndex);
    console.log(`[Batch] 배치 ${batchIndex} 완료`);
}

// ── 배치 생성 (일반 레인만) ───────────────────────────────
async function generateBatchBothRatings(batchIndex) {
    await generateBatch(batchIndex, 'g');
}

// ── 보상 이미지 생성 (커스텀 키워드) ─────────────────────
async function generateRewardImage(userId, keywords) {
    const apiKey = process.env.STABILITY_API_KEY;
    if (!apiKey) throw new Error('STABILITY_API_KEY 미설정');

    // 금지 키워드 필터
    const BLOCKED = ['nsfw', 'loli', 'gore', 'violence', 'blood', 'death', 'sexy', 'nude', 'naked', 'lingerie', 'swimsuit', 'bikini', 'adult', 'mature', 'porn', 'hentai', 'erotic', 'lewd'];
    const lc = keywords.toLowerCase();
    for (const word of BLOCKED) {
        if (lc.includes(word)) {
            const err = new Error('허용되지 않는 키워드가 포함되어 있습니다.');
            err.code = 'BLOCKED_KEYWORD';
            throw err;
        }
    }

    const prompt = `anime girl, ${keywords}${QUALITY_SUFFIX}`;

    const form = new FormData();
    form.append('prompt',          prompt);
    form.append('negative_prompt', NEGATIVE);
    form.append('model',           'sd3-large');  // 보상 이미지는 고화질
    form.append('output_format',   'jpeg');
    form.append('aspect_ratio',    '2:3');

    const resp = await axios.post(API_URL, form, {
        headers: {
            ...form.getHeaders(),
            Authorization: `Bearer ${apiKey}`,
            Accept: 'image/*',
        },
        responseType: 'arraybuffer',
        timeout: 90000,
    });

    const rewardDir  = require('path').join(store.IMG_DIR, 'rewards');
    fs.mkdirSync(rewardDir, { recursive: true });

    const filename = `reward_${userId}_${Date.now()}.jpg`;
    const filePath = require('path').join(rewardDir, filename);
    fs.writeFileSync(filePath, resp.data);
    store.setRewardImageUrl(userId, filename);

    console.log(`[Reward] 사용자 ${userId} 보상 이미지 생성 완료`);
    return filename;
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

module.exports = {
    generateBatch,
    generateBatchBothRatings,
    generateRewardImage,
    generateImage,
};
