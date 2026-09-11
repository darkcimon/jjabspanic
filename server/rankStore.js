/**
 * rankStore.js
 * "내 캐릭터 자랑하기" 랭킹(포인트/스테이지/점령율) 통계를 JSON 파일로 관리한다.
 * imageStore.js/userStore.js와 동일한 패턴 — 상용 배포 시 Firebase/MongoDB/Redis로 교체.
 *
 * 신뢰 수준: 이 게임은 로그인·서버 검증 없이 모든 진행 상태를 클라이언트
 * (localStorage, storage.js)가 들고 있는 구조다. 랭킹에 쓰이는 값도 클라이언트가
 * 보내주는 그대로 저장하며, 다른 통계(총점·최고 스테이지 등)와 같은 신뢰 수준으로
 * 취급한다 — 즉 클라이언트가 값을 조작해 보내면 랭킹도 그만큼 왜곡될 수 있다.
 * 경쟁 심리를 자극하는 가벼운 재미 요소이지 공정성이 보장된 리더보드는 아니다.
 */

const fs   = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, 'data', 'ranks.json');

// 실제 제출자가 적을 때 "1명 중 1등" 처럼 랭킹이 무의미해 보이는 걸 막기 위해
// 표시용 전체 인원수에만 더해주는 여유값. 등수 계산 자체(rankOf)에는 영향을
// 주지 않는다 — 실제보다 등수가 좋게/나쁘게 보이도록 조작하지는 않는다.
const DISPLAY_PADDING = 100;

// ── 초기화 ────────────────────────────────────────────────
function init() {
    fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
    if (!fs.existsSync(DB_PATH)) save({});
}

// ── DB 읽기/쓰기 ──────────────────────────────────────────
function load() {
    try { return JSON.parse(fs.readFileSync(DB_PATH, 'utf8')); }
    catch { return {}; }
}

function save(data) {
    fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
}

function _clampInt(value, min, max) {
    const n = Math.floor(Number(value) || 0);
    return Math.min(max, Math.max(min, n));
}

/**
 * 유저의 최신 통계를 반영하고, 세 지표(누적 포인트/최고 스테이지/최고 점령율)
 * 각각의 순위와 표시용 전체 참여자 수를 계산해 돌려준다.
 *
 * @param {string} userId
 * @param {{ totalScore:number, bestStage:number, bestFillPct:number }} stats
 */
function submitAndRank(userId, stats) {
    if (!userId || typeof userId !== 'string') throw new Error('userId required');

    const totalScore  = _clampInt(stats.totalScore, 0, Number.MAX_SAFE_INTEGER);
    const bestStage   = _clampInt(stats.bestStage, 0, 100000);
    const bestFillPct = _clampInt(stats.bestFillPct, 0, 100);

    const db = load();
    db[userId] = { totalScore, bestStage, bestFillPct, updatedAt: new Date().toISOString() };
    save(db);

    const all = Object.values(db);
    // 동점자는 같은 순위를 공유하는 표준 경쟁 순위(1224 방식) — 나보다 큰 값을
    // 가진 사람 수 + 1.
    const rankOf = (value, key) => 1 + all.filter(u => u[key] > value).length;

    return {
        totalRealUsers: all.length,
        totalUsers:     all.length + DISPLAY_PADDING,
        score:   { value: totalScore,  rank: rankOf(totalScore,  'totalScore')  },
        stage:   { value: bestStage,   rank: rankOf(bestStage,   'bestStage')   },
        fillPct: { value: bestFillPct, rank: rankOf(bestFillPct, 'bestFillPct') },
    };
}

module.exports = { init, submitAndRank, DISPLAY_PADDING };
