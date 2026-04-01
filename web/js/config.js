export const COLS = 20;
export const ROWS = 26;
export const PLAYER_SPEED = 7; // cells/sec
export const CLEAR_THRESHOLD = 0.75;
export const LIVES_START = 3;
export const INVINCIBLE_DURATION = 1.5;
export const MAX_STAGE = 300;
export const BATCH_SIZE = 30;

export const getStageHP = (n) => n <= 10 ? 1 : Math.max(1, Math.ceil(Math.pow(n / 10, 1.5)));

// Stage 1 starts with 2 monsters, grows faster
export const getMonsterCount = (n) => Math.min(2 + Math.floor(n / 3), 8);
export const getMonsterSpeed  = (n) => Math.min(1.0 + n * 0.06, 3.5);
export const getTimeLimit     = (n) => Math.max(120 - n * 2, 60);
export const getBatchIndex    = (n) => Math.floor((n - 1) / BATCH_SIZE);
