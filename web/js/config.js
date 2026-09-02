export const COLS = 20;
export const ROWS = 26;
export const PLAYER_SPEED = 7; // cells/sec
export const CLEAR_THRESHOLD = 0.75;
export const LIVES_START = 3;
export const INVINCIBLE_DURATION = 1.5;
export const MAX_STAGE = 300;
export const BATCH_SIZE = 30;
// 분열 아이템 연쇄 사용 등으로 몹 수가 걷잡을 수 없이 늘어나
// (충돌 판정이 몹 수에 비례/제곱으로 늘어나) 버벅거리는 것을 막기 위한 상한.
export const MAX_MONSTERS = 60;

export const getStageHP = (n) => n <= 10 ? 1 : Math.max(1, Math.ceil(Math.pow(n / 10, 1.5)));

// Stage 1 starts with 2 monsters, grows faster
export const getMonsterCount = (n) => Math.min(2 + Math.floor(n / 3), 8);
export const getMonsterSpeed  = (n) => Math.min(1.0 + n * 0.06, 3.5);
export const getTimeLimit     = (n) => Math.max(120 - n * 2, 60);
export const getBatchIndex    = (n) => Math.floor((n - 1) / BATCH_SIZE);

// 300단계(MAX_STAGE)를 넘어 계속 플레이할 때, 실제로는 존재하는 이미지가 300장뿐이므로
// 캐릭터 아트워크는 1단계 이미지부터 순환해서 보여준다 (스테이지 번호 자체는 계속 증가).
export const toImageStage     = (n) => ((n - 1) % MAX_STAGE) + 1;

// 300단계를 한 바퀴(루프) 돌 때마다 몹 체력이 직전 루프보다 2배씩 강해지는 것과
// 밸런스를 맞추기 위해, 무기 강화 상한도 루프마다 2배씩 계속 풀린다.
// (1~300단계: ×1, 301~600단계: ×2, 601~900단계: ×4, 901~1200단계: ×8 ...)
export const getLoopMultiplier = (n) => Math.pow(2, Math.floor((n - 1) / MAX_STAGE));
