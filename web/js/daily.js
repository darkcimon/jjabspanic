// daily.js — 7일 연속 출석 보상.
//
// 매일 처음 메인 화면에 들어오면 보상을 1회 받을 수 있다. 하루라도 빠지면 1일차로
// 돌아가고, 7일차를 받으면 다시 1일차부터 순환한다. 날짜는 기기 로컬 기준.
// 보상 포인트는 최고 스테이지 30단계마다 1배씩 늘어나, 후반 유저에게도 의미가 있게 한다.
//
// 저장 필드 (save): dailyLastClaim('YYYY-MM-DD'), dailyStreak(누적 연속 일수)

export const DAILY_POINTS = [2000, 3000, 5000, 7000, 10000, 15000, 30000];
// 7일차에는 포인트와 함께 다음 게임 목숨 +1 (save.bonusLives).
export const DAILY_LIFE_DAY = 7;

function dateKey(d) {
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function dailyMultiplier(save) {
  return 1 + Math.floor((save.bestStage || 0) / 30);
}

// 오늘 받을 수 있는 보상 상태. claimable=false면 오늘 이미 받았다.
// day: 오늘 받을(또는 받은) 회차 1~7, continued: 어제 받아서 연속이 이어지는지.
export function getDailyState(save, now = new Date()) {
  const today = dateKey(now);
  const y = new Date(now); y.setDate(y.getDate() - 1);
  const yesterday = dateKey(y);
  const streak = save.dailyStreak || 0;
  if (save.dailyLastClaim === today) {
    return { claimable: false, day: ((streak - 1) % 7) + 1, continued: true, today };
  }
  const continued = save.dailyLastClaim === yesterday && streak > 0;
  const day = continued ? (streak % 7) + 1 : 1;
  return { claimable: true, day, continued, today };
}

// 보상을 save에 반영하고 지급 내역을 돌려준다. 이미 받았으면 null.
export function claimDaily(save, now = new Date()) {
  const st = getDailyState(save, now);
  if (!st.claimable) return null;
  const points = DAILY_POINTS[st.day - 1] * dailyMultiplier(save);
  const life = st.day === DAILY_LIFE_DAY ? 1 : 0;
  save.totalScore = (save.totalScore || 0) + points;
  if (life) save.bonusLives = (save.bonusLives || 0) + life;
  save.dailyStreak = st.continued ? (save.dailyStreak || 0) + 1 : 1;
  save.dailyLastClaim = st.today;
  return { day: st.day, points, life };
}
