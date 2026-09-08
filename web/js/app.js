import { Game }    from './game.js';
import { Storage } from './storage.js';
import { API }     from './api.js';
import {
  getPurchases, hasPack, stageUnlockedByPack, invalidatePurchaseCache,
  requestPackPurchase, saveLocalPurchase, PACK_DEFS,
} from './payment.js';
import {
  COLS, ROWS, PLAYER_SPEED, CLEAR_THRESHOLD, MAX_STAGE,
  getMonsterCount, getMonsterSpeed, getTimeLimit, getBatchIndex, toImageStage, getLoopMultiplier,
  GUN_BASE_CAP, BULLET_BASE_CAP, SWORD_BASE_CAP, PET_BASE_CAP, PET_MAX_COUNT,
} from './config.js';
import { t, onLangChange } from './i18n.js';
import { computeNextAdReward, watchRewardAd, AD_PACK_THRESHOLDS, isPackUnlockedByAds } from './ads.js';
import { drawBragCard, buildShareUrl } from './bragCard.js';
import { ACCESSORY_LEVEL_REQUIREMENT, ACCESSORY_CATEGORIES, ACCESSORIES, getAccessory } from './accessories.js';

// ── Screen management ────────────────────────────────────────
const $ = id => document.getElementById(id);
const screens = ['boot','main','content-select','game','stage-clear','game-over','gallery','collection-pick','reward','help','market'];

function show(name) {
  screens.forEach(s => $(`screen-${s}`).classList.toggle('active', s === name));
}

// ── State ────────────────────────────────────────────────────
let save = Storage.load();
let game = null;
let api  = new API('');
// 10스테이지 완료 후 소장품 선택 / 100단계 특전 대기 중인 스테이지 번호.
// save.pendingCollectionStage·save.pendingRewardStage로도 함께 저장해서, 모바일에서
// 페이지가 백그라운드 재로드되어 이 변수가 날아가도(=화면이 안 뜨고 다음 스테이지로
// 넘어가버리는 문제) boot() 시점에 복구할 수 있게 한다.
let pendingCollectionStage = 0;
let pendingRewardStage = 0;
// 300단계(MAX_STAGE) 클리어 후 특전/소장품 화면이 끝나면 보여줄 "게임 클리어" 안내 대기 플래그.
// 위 두 변수와 마찬가지로 save.pendingGameComplete로도 함께 저장해 모바일 재로드에도 복구한다.
let pendingGameComplete = false;
let marketReturnScreen = 'main'; // 마켓 진입 전 화면
// 오토모드로 클리어했을 때, 라이트박스로 클리어 이미지를 4초간 띄운 뒤 자동으로
// 다음 진행 단계로 넘어가는 타이머. onStageClear()가 새로 열릴 때마다, 그리고
// 사용자가 직접 "다음 스테이지"/메인 메뉴 버튼을 눌렀을 때 취소해 중복 진행을 막는다.
let _clearAutoAdvanceTimer = null;
// 무기 선택(activeWeapon)과 오토모드 on/off는 새 Game 인스턴스를 만들 때마다
// (매 스테이지 시작 시) 초기화되므로, 스테이지가 바뀌어도 이어지도록 마지막 상태를
// 여기 기록해뒀다가 startGame()에서 복원한다 (updateHeldItemsBar 참고).
let _lastActiveWeapon = null;
let _lastAutoModeActive = false;

// ── Canvas sizing ────────────────────────────────────────────
function calcCellSize() {
  // hud=54, effect-timers=28, dpad(=game-bottom)=156, pad=8
  const hud = 54, timers = 28, dpad = 156, pad = 8;
  const maxW = Math.min(window.innerWidth,  600) - pad * 2;
  const maxH = (window.innerHeight || 700) - hud - timers - dpad - pad * 2;
  return Math.max(10, Math.floor(Math.min(maxW / COLS, maxH / ROWS)));
}

function resizeCanvas() {
  const cs = calcCellSize();
  const c = $('game-canvas');
  c.width  = COLS * cs;
  c.height = ROWS * cs;
}

// ── Item icon helpers (mini canvas) ──────────────────────────
const ITEM_ICONS = {
  lightning: '⚡', zeusLightning: '🌩️', speed: '💨', sword: '⚔️', gun: '🔫', timeboost: '⏱️', split: '💥', rareBubble: '🫧',
};

function makeHeldItemButton(item, game) {
  const btn = document.createElement('button');
  btn.className = 'held-item-btn';
  if (game && game.activeWeapon === item.type) btn.classList.add('active');

  const icon = ITEM_ICONS[item.type] || '?';
  let sub = '';
  if (item.type === 'gun')       sub = `×${item.ammo}`;
  if (item.type === 'sword')     sub = `×${item.count || 1}`;
  if (item.type === 'lightning' || item.type === 'zeusLightning') sub = `×${item.count || 1}`;
  if (item.type === 'split') sub = `×${item.count || 1}`;

  btn.innerHTML = `<span style="font-size:1.2rem;line-height:1">${icon}</span>${sub ? `<span class="held-item-sub">${sub}</span>` : ''}`;

  btn.addEventListener('pointerdown', e => {
    e.preventDefault();
    if (!game) return;
    if (item.type === 'lightning' || item.type === 'zeusLightning') {
      game.lightningMode = !game.lightningMode;
    } else if (item.type === 'sword') {
      game.useSword();
      // 버튼을 탭하면 즉시 한 번 휘두르는 것과 별개로, "선택된 무기"로도 표시해둔다 —
      // 이후엔 무기 버튼을 다시 탭하지 않고 화면(캔버스)을 탭하기만 해도
      // useActiveWeapon()으로 같은 무기가 계속 발동된다 (onCanvasClick/TouchEnd 참고).
      game.activeWeapon = 'sword';
    } else if (item.type === 'gun') {
      game.useGun();
      game.activeWeapon = 'gun';
    } else if (item.type === 'split') {
      game.triggerSplit();
    } else if (item.type === 'rareBubble') {
      // 황금 버블은 피격 시 자동으로 발동되는 수동형 아이템이라 직접 선택/발사할
      // 무기가 아님 — 예전엔 여기서 selectWeapon('rareBubble')이 호출돼 activeWeapon이
      // 총/칼도 아닌 값으로 바뀌어버려서, 탭하면 "아무 반응도 없어 보이는" 데다
      // 총/칼 발사(Z/X)까지 먹통이 되는 부작용이 있었다.
      _showMarketToast(t('game.rareBubbleAutoToast'));
    } else {
      game.selectWeapon(item.type);
    }
    updateHeldItemsBar(game.heldItems);
  });
  return btn;
}

function makeAutoModeButton(g) {
  const btn = document.createElement('button');
  btn.className = 'held-item-btn' + (g.autoModeActive ? ' active' : '');
  btn.innerHTML = `<span style="font-size:1.2rem;line-height:1">🤖</span>`;
  btn.title = t('market.item.autoMode.name');
  btn.addEventListener('pointerdown', e => {
    e.preventDefault();
    g.toggleAutoMode();
    updateHeldItemsBar(g.heldItems);
  });
  return btn;
}

function updateHeldItemsBar(heldItems) {
  const bar = $('held-items-bar');
  bar.innerHTML = '';
  for (const item of heldItems) {
    // speed/timeboost는 원래도 바 목록에서 제외. rareBubble(황금버블)은 탭해도
    // 아무 동작이 없는 수동형 아이템이라 버튼으로 보여줄 필요가 없고, 보유 중엔
    // 화면 하단에 이미 "황금버블" 타이머 필(rareBubbleActive)이 떠 있어 중복이다.
    if (item.type === 'speed' || item.type === 'timeboost' || item.type === 'rareBubble') continue;
    bar.appendChild(makeHeldItemButton(item, game));
  }
  // 신화 등급 "오토모드" — 예전엔 held-items-bar(세로로 쌓이는 좁은 칸)에 무기
  // 버튼들과 같이 넣었는데, 무기를 여러 개 들고 있으면 칸이 꽉 차서 아래쪽
  // 아이템이 가려져 탭할 수 없는 문제가 있었다. 그래서 반대편(왼쪽, dpad-spacer)의
  // 전용 슬롯으로 옮겨 무기 슬롯과 완전히 분리했다.
  const autoSlot = $('automode-slot');
  autoSlot.innerHTML = '';
  if (game && game.autoModeOwned) autoSlot.appendChild(makeAutoModeButton(game));
  // 이 함수는 무기 선택/오토모드 토글이 바뀔 때마다(그리고 매 HUD tick마다) 호출되므로,
  // 다음 스테이지 시작 시 복원할 수 있도록 최신 상태를 계속 기록해둔다.
  if (game) { _lastActiveWeapon = game.activeWeapon; _lastAutoModeActive = game.autoModeActive; }
}

// ── HUD ──────────────────────────────────────────────────────
function updateHUD({ fill, lives, time, stage, score = 0,
                     slowTimer = 0, shieldTimer = 0, bubbleActive = false,
                     rareBubbleActive = false, heldItems = [],
                     confuseTimer = 0, playerSlowTimer = 0,
                     repelTimer = 0, freezeTimer = 0, gatherTimer = 0 }) {
  $('hud-stage').textContent = stage;
  $('hud-score').textContent = score;
  if (time >= 60) {
    const m = Math.floor(time / 60), s = time % 60;
    $('hud-time').textContent = `${m}:${String(s).padStart(2, '0')}`;
  } else {
    $('hud-time').textContent = time;
  }
  $('hud-lives').textContent = lives > 5 ? `❤️ ×${lives}` : '❤️'.repeat(Math.max(0, lives));

  // Effect timer pills
  const timersEl = $('effect-timers');
  timersEl.innerHTML = '';
  if (slowTimer > 0) {
    const p = document.createElement('span');
    p.className = 'timer-pill slow';
    p.textContent = `🐌 ${slowTimer}s`;
    timersEl.appendChild(p);
  }
  if (shieldTimer > 0) {
    const p = document.createElement('span');
    p.className = 'timer-pill shield';
    p.textContent = `🛡 ${shieldTimer}s`;
    timersEl.appendChild(p);
  }
  if (bubbleActive) {
    const p = document.createElement('span');
    p.className = 'timer-pill bubble';
    p.textContent = t('game.bubbleTag');
    timersEl.appendChild(p);
  }
  if (rareBubbleActive) {
    const p = document.createElement('span');
    p.className = 'timer-pill bubble';
    p.textContent = t('game.rareBubbleTag');
    timersEl.appendChild(p);
  }
  if (confuseTimer > 0) {
    const p = document.createElement('span');
    p.className = 'timer-pill confuse';
    p.textContent = `🌀 ${confuseTimer}s`;
    timersEl.appendChild(p);
  }
  if (playerSlowTimer > 0) {
    const p = document.createElement('span');
    p.className = 'timer-pill playerslow';
    p.textContent = `🐢 ${playerSlowTimer}s`;
    timersEl.appendChild(p);
  }
  if (repelTimer > 0) {
    const p = document.createElement('span');
    p.className = 'timer-pill repel';
    p.textContent = `🚧 ${repelTimer}s`;
    timersEl.appendChild(p);
  }
  if (freezeTimer > 0) {
    const p = document.createElement('span');
    p.className = 'timer-pill freeze';
    p.textContent = `⏳ ${freezeTimer}s`;
    timersEl.appendChild(p);
  }
  if (gatherTimer > 0) {
    const p = document.createElement('span');
    p.className = 'timer-pill gather';
    p.textContent = `🧲 ${gatherTimer}s`;
    timersEl.appendChild(p);
  }

  // Held items (only re-render if counts changed — simple approach: always rebuild)
  updateHeldItemsBar(heldItems);
}

// ── Game lifecycle ───────────────────────────────────────────
async function startGame(stage, rating, resumeState = null) {
  if (game) { game.stop(); game = null; }
  show('game');
  resizeCanvas();

  const canvas = $('game-canvas');
  const pb = save.persistentBonus;
  // 신화 등급 "영역의 각인": 클리어 판정 기준선을 75%→70%로 영구 하향.
  const clearThreshold = pb?.territoryMark ? CLEAR_THRESHOLD - 0.05 : CLEAR_THRESHOLD;
  game = new Game(canvas, { cols: COLS, rows: ROWS, playerSpeed: PLAYER_SPEED,
                             clearThreshold, serverUrl: '' });

  game.addEventListener('hud',        e => updateHUD(e.detail));
  game.addEventListener('stageClear', e => onStageClear(e.detail));
  game.addEventListener('gameOver',   e => onGameOver(e.detail));

  const mc = getMonsterCount(stage);
  const ms = getMonsterSpeed(stage);
  const tl = getTimeLimit(stage);
  const heldItems = save.heldItems || [];
  // 신화 등급 회피/동결/수집 부적 — 영구 확률 스탯(repelChance/freezeChance/gatherChance, %)
  // 이라 매 스테이지 시작마다 그 확률로 새로 추첨한다. 방패와 동일한 이유로 이어하기
  // (resumeState)에는 다시 추첨하지 않는다 — 이미 그 스테이지 시작 때 한 번 정해졌어야 함.
  const useRepel  = !resumeState && Math.random() * 100 < (pb?.repelChance  || 0);
  const useFreeze = !resumeState && Math.random() * 100 < (pb?.freezeChance || 0);
  const useGather = !resumeState && Math.random() * 100 < (pb?.gatherChance || 0);
  // 신화 등급 "방패"는 스테이지 시작 순간의 연출이라 이어하기(resumeState)에는 재적용하지 않는다
  // (회피/동결/수집 부적과 동일한 이유 — 이미 그 스테이지 시작 때 한 번 소진됐어야 함).
  const shieldSeconds = !resumeState ? Math.min(pb?.mythicShieldLevel || 0, MYTHIC_SHIELD_MAX) : 0;
  await game.init(stage, rating, mc, ms, tl, heldItems, resumeState,
    { gunLevel: pb?.gunLevel||0, swordLevel: pb?.swordLevel||0, bulletLevel: pb?.bulletLevel||0,
      guardianOrb: !!pb?.guardianOrb, phoenixHeart: !!pb?.phoenixHeart, midasTouch: !!pb?.midasTouch,
      petCount: pb?.petCount||0, petLevel: pb?.petLevel||0, autoModeOwned: !!pb?.autoModeOwned,
      autoModeUpgradeLevel: getAutoModeUpgradeLevel(pb),
      mythicZeusOwned: !!pb?.mythicZeusOwned, mythicZeusLevel: pb?.mythicZeusLevel||0,
      equippedAccessories: save.accessoryEquipped||{},
      repelSeconds: useRepel ? 15 : 0, freezeSeconds: useFreeze ? 5 : 0,
      gatherSeconds: useGather ? 15 : 0, shieldSeconds });
  if (!resumeState) {
    if (save.bonusLives > 0) {
      game.lives += save.bonusLives;
      save.bonusLives = 0;
    }
    if (pb) {
      if (pb.extraLives > 0 && !pb.rareLifeSuspended) game.lives += pb.extraLives;
      if (pb.extraTime  > 0) game.timeLeft += pb.extraTime;
      if (pb.speedLevel >= 1) {
        const alreadySpeed = game.heldItems.find(h => h.type === 'speed');
        if (!alreadySpeed) {
          const spd = pb.speedLevel >= 2 ? game.PLAYER_SPEED * 3 : game.PLAYER_SPEED * 2;
          game.heldItems.push({ type: 'speed', level: pb.speedLevel, persistent: true });
          game.speedActive = true;
          game.player.speed = spd;
        }
      }
    }
    Storage.save(save);
  } else {
    // 이어하기: extraLives만 재적용
    // (extraTime은 resumeState.timeLeft에 이미 포함, speed는 resumeState.heldItems에 포함)
    if (pb && pb.extraLives > 0 && !pb.rareLifeSuspended) game.lives += pb.extraLives;
    // 시간 소진 게임오버 후 이어하기 시 최소 30초 보장
    if (game.timeLeft <= 0) game.timeLeft = 30;
  }
  game._persistentSpeedLevel = pb?.speedLevel || 0;
  game.setWeaponLevels(pb?.gunLevel || 0, pb?.swordLevel || 0, pb?.bulletLevel || 0);
  game.start();
  setupInput(canvas, game);
  // 새 Game 인스턴스는 무기 선택(activeWeapon)과 오토모드 on/off가 항상 초기화된
  // 상태로 시작하므로, 직전 스테이지에서의 선택을 그대로 이어서 복원한다.
  if (_lastActiveWeapon && game.heldItems.some(h => h.type === _lastActiveWeapon)) {
    game.selectWeapon(_lastActiveWeapon);
  }
  if (_lastAutoModeActive && game.autoModeOwned) game.toggleAutoMode();
  // HUD의 첫 tick(최대 0.1초 지연)을 기다리지 않고 즉시 갱신 —
  // 그 전까지 이전 스테이지의 held-items-bar 버튼(멈춘 이전 game 인스턴스를 참조)이
  // 그대로 남아있어, 시작 직후 총(무기) 버튼을 바로 누르면 죽은 game 객체에 발사되어
  // 총알이 나가지 않는 것처럼 보이는 문제가 있었음.
  updateHeldItemsBar(game.heldItems);

  // Pre-trigger next batch if needed
  const nextBatch = getBatchIndex(stage + 15);
  if (nextBatch >= 1) api.triggerBatch(nextBatch).catch(() => {});
}

function onStageClear({ stage, fill, timeLeft, charImage, score = 0,
                         timeBonus = 0, stageBonus = 0, fillBonus = 0, allClearBonus = 0, heldItems = [],
                         rareLifeLost = false }) {
  // 화면 전환 플래그를 가장 먼저 설정 — 이후 코드 예외에 영향받지 않도록.
  // save에도 함께 기록해 페이지 재로드로 이 값이 유실돼도 복구 가능하게 한다.
  // 소장품 선택화면은 1회차(1~300단계)에서만 뜬다 — 300단계를 넘어 이어서
  // 플레이할 때도 10단계마다 계속 떴던 걸, 아트워크가 1~300으로 순환되는 시점부터는
  // 뜨지 않도록 막았다(특전 이미지는 반대로 계속 반복 지급 — 위 pendingRewardStage 참고).
  if (stage % 10 === 0 && stage <= MAX_STAGE) { pendingCollectionStage = stage; save.pendingCollectionStage = stage; }
  // 특전 이미지는 100단계마다 반복 지급 — 300단계를 넘어 이어서 플레이해도
  // 400, 500... 에서 계속 나온다.
  if (stage % 100 === 0) { pendingRewardStage = stage; save.pendingRewardStage = stage; }
  // 300단계를 처음 클리어한 순간에만 "게임 클리어" 안내를 띄운다 (이어서 플레이를
  // 선택하면 스테이지는 계속 증가하므로 이후 루프에서는 다시 뜨지 않음 — 처음부터
  // 다시 시작을 선택해 재도전한 경우에만 재발생).
  if (stage === MAX_STAGE) {
    pendingGameComplete = true;
    save.pendingGameComplete = true;
  }

  if (stage > save.bestStage) save.bestStage = stage;
  // 자랑하기 카드용 통계 — 99% 이상 점령하고 클리어한 횟수를 누적 기록한다.
  if (fill >= 0.99) save.highFillClearCount = (save.highFillClearCount || 0) + 1;
  // 스테이지 번호 자체는 300 이후로도 계속 증가한다 — 실제 존재하는 아트워크는
  // 300장뿐이라 캐릭터 이미지만 1단계부터 순환해서 보여준다 (game.js의 toImageStage 참고).
  save.stage = stage + 1;
  // Persistent/single-use speed items are re-applied each stage — don't carry them over
  save.heldItems = heldItems.filter(h => !(h.type === 'speed' && (h.persistent || h.singleUse)));
  // rareLife suspension: lost when lives dropped to ≤2 during the stage
  if (save.persistentBonus) save.persistentBonus.rareLifeSuspended = rareLifeLost;
  if (!save.totalScore) save.totalScore = 0;
  save.totalScore += score;
  // 갤러리(소장 이미지)는 실제 아트워크 식별자(1~300)로 저장한다 — 300 이후 루프에서
  // 같은 이미지를 다시 클리어해도 중복 없이 동일한 칸을 가리키게 하기 위함.
  if (stage % 10 === 0) {
    const imgStage = toImageStage(stage);
    if (!save.gallery.includes(imgStage)) save.gallery.push(imgStage);
  }
  try { Storage.save(save); } catch (e) { console.warn('[Storage] save failed:', e); }
  updateMainStats();

  $('clear-score').textContent      = score.toLocaleString();
  $('clear-fill').textContent       = Math.floor(fill * 100) + '%';
  $('clear-time').textContent       = timeLeft + t('clear.timeUnit');
  $('clear-time-bonus').textContent  = '+' + timeBonus.toLocaleString();
  $('clear-stage-bonus').textContent = '+' + stageBonus.toLocaleString();
  const fillBonusEl = $('clear-fill-bonus');
  if (fillBonusEl) {
    fillBonusEl.textContent = fillBonus > 0 ? '+' + fillBonus.toLocaleString() : '+0';
    fillBonusEl.closest('.stat-item').style.display = '';
  }
  const allClearRow = $('clear-allclear-row');
  if (allClearRow) {
    if (allClearBonus > 0) {
      $('clear-allclear-bonus').textContent = '+' + allClearBonus.toLocaleString();
      allClearRow.style.display = '';
    } else {
      allClearRow.style.display = 'none';
    }
  }
  const img = $('clear-image');
  if (charImage) { img.src = charImage.src; img.style.display = 'block'; }
  else img.style.display = 'none';
  $('clear-stage').textContent = stage;
  const totalScore = save.totalScore || 0;
  $('btn-clear-market').style.display = totalScore >= 3000 ? 'block' : 'none';
  const clearTotalEl = $('clear-total-score');
  if (clearTotalEl) clearTotalEl.textContent = totalScore.toLocaleString() + 'pt';

  show('stage-clear');

  // 오토모드로 클리어했을 때만: 갤러리에서 사진을 탭해 크게 보는 것과 동일한
  // 전면 라이트박스로 클리어 이미지를 4초간 띄운 뒤 자동으로 닫고, "다음 스테이지"
  // 버튼을 누른 것과 동일하게 진행한다 (특전/소장품 화면으로 가야 하면 그쪽으로 —
  // btn-next-stage의 클릭 핸들러를 그대로 재사용). 수동 플레이 중엔 예전처럼
  // 클리어 화면에 계속 머물러 있고, 그 사이 사용자가 다른 화면(마켓/광고 등)으로
  // 넘어갔다면 건드리지 않는다.
  if (_clearAutoAdvanceTimer) clearTimeout(_clearAutoAdvanceTimer);
  if (game && game.autoModeActive) {
    if (charImage) openLightbox(charImage.src);
    _clearAutoAdvanceTimer = setTimeout(() => {
      _clearAutoAdvanceTimer = null;
      closeLightbox();
      if ($('screen-stage-clear').classList.contains('active')) $('btn-next-stage').click();
    }, 4000);
  }
}

function onGameOver({ stage }) {
  save.heldItems = [];
  // 게임오버 패널티: 영구 무기 업그레이드 -3
  if (save.persistentBonus) {
    const pb = save.persistentBonus;
    if (pb.gunLevel    > 0) pb.gunLevel    = Math.max(0, pb.gunLevel    - 3);
    if (pb.swordLevel  > 0) pb.swordLevel  = Math.max(0, pb.swordLevel  - 3);
    if (pb.bulletLevel > 0) pb.bulletLevel = Math.max(0, pb.bulletLevel - 3);
  }
  Storage.save(save);
  $('over-stage').textContent = stage;
  const warningEl = $('over-points-warning');
  if (warningEl) {
    // 보유 장비 현황 문구 생성
    const pb = save.persistentBonus || {};
    const weaponParts = [];
    if ((pb.gunLevel || 0) > 0)    weaponParts.push(t('over.gunLevelPart', { n: pb.gunLevel }));
    if ((pb.bulletLevel || 0) > 0) weaponParts.push(t('over.bulletLevelPart', { n: pb.bulletLevel }));
    if ((pb.swordLevel || 0) > 0)  weaponParts.push(t('over.swordLevelPart', { n: pb.swordLevel }));
    const weaponEl = $('over-weapon-warning');
    if (weaponEl) {
      weaponEl.innerHTML = weaponParts.length > 0
        ? t('over.weaponWarningText', { parts: weaponParts.join(' · ') })
        : '';
    }
    warningEl.style.display = weaponParts.length > 0 ? '' : 'none';
  }
  show('game-over');
}

// ── Input ────────────────────────────────────────────────────
let _inputClean = null;
function setupInput(canvas, g) {
  if (_inputClean) _inputClean();
  const dirs = { ArrowUp:[0,-1], ArrowDown:[0,1], ArrowLeft:[-1,0], ArrowRight:[1,0],
                 w:[0,-1], s:[0,1], a:[-1,0], d:[1,0] };

  const held = new Set();
  const onKey = e => {
    if (e.key === 'z' || e.key === 'Z') { e.preventDefault(); g.useSword(); return; }
    if (e.key === 'x' || e.key === 'X' || e.key === ' ' || e.code === 'Space') { e.preventDefault(); g.useGun(); return; }
    const d = dirs[e.key];
    if (!d) return;
    e.preventDefault();
    held.add(e.key);
    g.setDirection(...d);
  };
  const isContinuous = () => $('chk-continuous-move').checked;
  const onKeyUp = e => {
    if (!dirs[e.key]) return;
    e.preventDefault();
    held.delete(e.key);
    if (isContinuous()) return;
    const other = Object.entries(dirs).find(([k]) => held.has(k));
    if (other) g.setDirection(...other[1]);
    else g.setDirection(0, 0);
  };
  document.addEventListener('keydown', onKey);
  document.addEventListener('keyup',   onKeyUp);

  const dpad = (id, dx, dy) => {
    const el = $(id);
    const onDown = e => { e.preventDefault(); g.setDirection(dx, dy); };
    const onUp   = e => { e.preventDefault(); if (!isContinuous()) g.setDirection(0, 0); };
    el.addEventListener('pointerdown',  onDown);
    el.addEventListener('pointerup',    onUp);
    el.addEventListener('pointerleave', onUp);
    return () => {
      el.removeEventListener('pointerdown',  onDown);
      el.removeEventListener('pointerup',    onUp);
      el.removeEventListener('pointerleave', onUp);
    };
  };
  const cleanUp = [
    dpad('dpad-up',    0, -1), dpad('dpad-down',  0,  1),
    dpad('dpad-left', -1,  0), dpad('dpad-right', 1,  0),
  ];

  // Canvas click/touch: 번개 조준 발사 + 선택된 총/칼 발사
  const _lightningFire = (clientX, clientY) => {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width  / rect.width;
    const scaleY = canvas.height / rect.height;
    g.triggerLightning((clientX - rect.left) * scaleX, (clientY - rect.top) * scaleY);
  };
  // 총/칼이 "선택된 무기"(activeWeapon)로 표시돼 있으면, 무기 버튼을 다시 탭하지
  // 않고 화면 아무 곳이나 탭해도 같은 무기가 발동한다 (번개의 탭-발사 방식과 통일).
  const _isFireableWeaponActive = () => g.activeWeapon === 'gun' || g.activeWeapon === 'sword';
  const onCanvasClick = e => {
    if (g.lightningMode) { e.preventDefault(); _lightningFire(e.clientX, e.clientY); return; }
    if (_isFireableWeaponActive()) { e.preventDefault(); g.useActiveWeapon(); }
  };
  const onCanvasTouchEnd = e => {
    if (g.lightningMode) {
      e.preventDefault();
      const t = e.changedTouches[0];
      _lightningFire(t.clientX, t.clientY);
      return;
    }
    // 손가락이 거의 안 움직인(=드래그가 아닌) 탭일 때만 발사한다. 드래그였다면
    // onTM에서 이미 이동 처리를 했으므로 여기서 또 발사하면 안 된다 (아래 참고).
    if (_isFireableWeaponActive() && !touchMoved) { e.preventDefault(); g.useActiveWeapon(); }
  };
  canvas.addEventListener('click',    onCanvasClick);
  canvas.addEventListener('touchend', onCanvasTouchEnd, { passive: false });

  // Swipe on canvas.
  // 총/칼이 "선택된 무기"로 활성화돼 있을 때 화면 터치를 전부 "발사 전용"으로
  // 막아버렸던 예전 방식은, 무기를 선택한 상태에서는 드래그로 이동하는 기능
  // 자체가 완전히 죽어버리는 버그였다(D패드/키보드로만 이동 가능). 대신 손가락
  // 이동 거리로 탭과 드래그를 구분한다: 24px 이상 움직이면 드래그로 보고 평소처럼
  // 캐릭터를 이동시키고(이 경우 무기는 발사하지 않음), 그만큼 움직이지 않은 채
  // 손을 떼면 탭으로 보고 onCanvasTouchEnd에서 선택된 무기를 발사한다.
  // 번개 조준 모드는 정확한 한 지점을 짚어야 하므로 예외적으로 계속 탭 전용이다.
  let tx = 0, ty = 0, touchMoved = false;
  const onTS = e => {
    e.preventDefault();
    if (g.lightningMode) return;
    touchMoved = false;
    tx = e.touches[0].clientX; ty = e.touches[0].clientY;
  };
  const onTM = e => {
    e.preventDefault();
    if (g.lightningMode) return;
    const dx = e.touches[0].clientX - tx, dy = e.touches[0].clientY - ty;
    if (Math.abs(dx) + Math.abs(dy) > 24) {
      touchMoved = true;
      if (Math.abs(dx) > Math.abs(dy)) g.setDirection(dx > 0 ? 1 : -1, 0);
      else g.setDirection(0, dy > 0 ? 1 : -1);
      tx = e.touches[0].clientX; ty = e.touches[0].clientY;
    }
  };
  const onTE = e => {
    if (g.lightningMode) return; // 조준 발사는 onCanvasTouchEnd가 처리
    if (_isFireableWeaponActive() && !touchMoved) return; // 탭 발사는 onCanvasTouchEnd가 처리
    if (!isContinuous()) g.setDirection(0, 0);
  };
  canvas.addEventListener('touchstart', onTS, { passive: false });
  canvas.addEventListener('touchmove',  onTM, { passive: false });
  canvas.addEventListener('touchend',   onTE, { passive: false });

  _inputClean = () => {
    document.removeEventListener('keydown', onKey);
    document.removeEventListener('keyup',   onKeyUp);
    cleanUp.forEach(f => f());
    canvas.removeEventListener('click',      onCanvasClick);
    canvas.removeEventListener('touchend',   onCanvasTouchEnd);
    canvas.removeEventListener('touchend',   onTE);
    canvas.removeEventListener('touchstart', onTS);
    canvas.removeEventListener('touchmove',  onTM);
  };
}

// ── Gallery ──────────────────────────────────────────────────

// 팩별 스테이지 범위
const PACK_RANGES = {
  pack_a: { from: 1,   to: 100 },
  pack_b: { from: 101, to: 200 },
  pack_c: { from: 201, to: 300 },
};

/**
 * 팩 보유 여부: 실 결제(purchases) 또는 광고 누적 시청 해금(adWatchCount) 중
 * 하나라도 충족하면 보유로 간주한다.
 */
function isPackOwned(packId, purchases) {
  if (purchases.includes('pack_all')) return true;
  if (purchases.includes(packId)) return true;
  return isPackUnlockedByAds(packId, save.adWatchCount || 0);
}

/**
 * 갤러리 카드 한 장을 생성한다.
 * packOwned = true이면 이미지를 정상 표시, false이면 블러 + 자물쇠 오버레이.
 */
function makeGalleryCard(stageNum, packOwned, lightbox = false) {
  const card = document.createElement('div');
  card.className = 'gallery-card' + (packOwned ? ' loading' : ' gallery-card-locked');
  card.innerHTML = `<div class="card-label">Stage ${stageNum}</div>`;

  if (!packOwned) {
    const lock = document.createElement('div');
    lock.className = 'gallery-lock-overlay';
    lock.innerHTML = '<span class="gallery-lock-icon">🔒</span>';
    card.appendChild(lock);
    return card;
  }

  api.getImage(stageNum, save.rating).then(data => {
    card.classList.remove('loading');
    if (data.status === 'ready' && data.url) {
      const img = document.createElement('img');
      img.src = data.url;
      img.alt = `Stage ${stageNum}`;
      card.prepend(img);
      if (lightbox) {
        card.style.cursor = 'pointer';
        card.addEventListener('click', () => openLightbox(data.url));
      }
    }
  }).catch(() => card.classList.remove('loading'));

  return card;
}

function openLightbox(url) {
  const lb  = $('img-lightbox');
  const img = $('img-lightbox-img');
  img.src = url;
  lb.classList.remove('hidden');
}
function closeLightbox() {
  const lb = $('img-lightbox');
  lb.classList.add('hidden');
  $('img-lightbox-img').src = '';
}
$('img-lightbox').addEventListener('click', e => {
  if (e.target !== $('img-lightbox') && e.target !== $('img-lightbox-close')) return;
  closeLightbox();
  // 오토모드 클리어 자동 진행(라이트박스 4초 후 다음 스테이지) 중에 사용자가 직접
  // 닫으면(예: 그 사이 마켓에서 아이템을 사고 싶어서) 자동 진행만 취소한다 — 이걸로
  // 오토모드 자체(게임 내 발사 on/off)까지 꺼버리면 안 된다. 갤러리 등 다른 곳에서
  // 연 라이트박스는 이 타이머가 애초에 안 걸려 있어 그냥 무해하다.
  if (_clearAutoAdvanceTimer) { clearTimeout(_clearAutoAdvanceTimer); _clearAutoAdvanceTimer = null; }
});

/**
 * 팩 배너의 구매 버튼 상태를 갱신한다.
 * 구매 완료 시 버튼을 숨기고 완료 메시지를 표시.
 *
 * [팩 구매 보류] 실 결제 구매는 막아두고, 광고 누적 시청으로만 해금한다
 * (팩 A: 100회, 팩 B: 200회, 팩 C: 300회 — 끝까지 봐서 보상이 지급된 시청만 카운트).
 * 재개하려면 아래 else 분기를 원래 구현(주석 처리된 코드)으로 되돌리면 된다.
 */
function updatePackBanner(packId, owned) {
  const suffixMap = { pack_a: 'a', pack_b: 'b', pack_c: 'c', pack_all: 'all' };
  const suffix = suffixMap[packId];
  if (!suffix || suffix === 'all') return;

  const btn    = $(`btn-pack-${suffix}`);
  const status = $(`pack-${suffix}-status`);
  if (!btn || !status) return;

  // -- 구매 재개 시 아래로 원복 --
  // btn.style.display = owned ? 'none' : '';
  btn.style.display = 'none';

  if (owned) {
    status.textContent   = t('gallery.packUnlocked');
    status.classList.add('pack-owned');
  } else {
    const threshold = AD_PACK_THRESHOLDS[packId];
    const count = Math.min(save.adWatchCount || 0, threshold);
    status.textContent   = t('gallery.packAdProgress', { count, threshold });
    status.classList.remove('pack-owned');
  }
}

// ── Collection Pick ──────────────────────────────────────────
const COLLECTION_LIMIT = 10;

function hasUnlimitedCollection(purchases) {
  return ['pack_a','pack_b','pack_c'].every(p => isPackOwned(p, purchases));
}

async function showCollectionPick(completedStage) {
  show('collection-pick');
  const fromStage = completedStage - 9;

  const purchases = await getPurchases();
  const unlimited = hasUnlimitedCollection(purchases);
  const collCount = (save.collection || []).length;
  const isFull = !unlimited && collCount >= COLLECTION_LIMIT;

  $('collection-pick-desc').textContent =
    t('collection.pickDesc', { from: fromStage, to: completedStage });

  // 슬롯 안내 제거 후 재삽입
  let slotEl = $('collection-slot-info');
  if (!slotEl) {
    slotEl = document.createElement('p');
    slotEl.id = 'collection-slot-info';
    $('collection-pick-desc').insertAdjacentElement('afterend', slotEl);
  }
  if (unlimited) {
    slotEl.className = 'collection-slot-info';
    slotEl.textContent = t('collection.unlimitedNote');
  } else {
    slotEl.className = 'collection-slot-info' + (isFull ? ' full' : '');
    slotEl.textContent = t('collection.slotCount', { count: collCount, limit: COLLECTION_LIMIT });
  }

  // 가득 찬 경우 안내 문구 — 더 이상 선택을 막지 않고, 확정 시 가장 오래된
  // 소장품을 덮어쓴다는 것을 알려준다.
  let fullNoteEl = $('collection-full-note');
  if (isFull) {
    if (!fullNoteEl) {
      fullNoteEl = document.createElement('p');
      fullNoteEl.id = 'collection-full-note';
      fullNoteEl.className = 'collection-full-note';
      slotEl.insertAdjacentElement('afterend', fullNoteEl);
    }
    fullNoteEl.textContent = t('collection.fullNote', { limit: COLLECTION_LIMIT });
  } else if (fullNoteEl) {
    fullNoteEl.remove();
  }

  const grid = $('collection-pick-grid');
  grid.innerHTML = '';

  const confirmBtn = $('btn-collection-confirm');
  confirmBtn.disabled = true;
  let selectedStage = 0;

  for (let s = fromStage; s <= completedStage; s++) {
    const card = makeCollectionPickCard(s, purchases, stageNum => {
      selectedStage = stageNum;
      // 가득 찬 상태에서도 선택은 가능 — 확정 시 덮어쓰기로 처리한다.
      confirmBtn.disabled = false;
      grid.querySelectorAll('.collection-pick-card').forEach(c => {
        c.classList.toggle('selected', +c.dataset.stage === stageNum);
      });
    });
    grid.appendChild(card);
  }

  confirmBtn.onclick = () => {
    if (!selectedStage) return;
    if (!save.collection) save.collection = [];
    if (!save.collection.includes(selectedStage)) {
      // 소장 공간이 가득 찼으면 가장 오래(먼저) 소장한 항목을 밀어내고 새로 추가한다 (FIFO 덮어쓰기).
      if (isFull) save.collection.shift();
      save.collection.push(selectedStage);
    }
    // 소장품 화면을 실제로 완료한 시점에만 pending 플래그를 지운다 (특전 화면과
    // 동일한 이유 — 진입 시점에 지우면 화면에 머무는 동안 새로고침 시 스킵됨).
    save.pendingCollectionStage = 0;
    Storage.save(save);
    advanceAfterClear();
  };
}

// stageNum: 실제 플레이한 스테이지 번호(300 이후에도 계속 증가) — 라벨 표시에만 사용.
// imgStage: 실제 존재하는 아트워크 식별자(1~300, 300 이후는 순환) — 이미지 조회/소장 저장은
// 이 값을 기준으로 한다 (그래야 나중에 갤러리에서도 같은 이미지로 정상 표시됨).
function makeCollectionPickCard(stageNum, purchases, onSelect) {
  const imgStage = toImageStage(stageNum);
  const packId = imgStage <= 100 ? 'pack_a' : imgStage <= 200 ? 'pack_b' : 'pack_c';
  const packOwned = isPackOwned(packId, purchases);
  const alreadyCollected = (save.collection || []).includes(imgStage);

  const card = document.createElement('div');
  card.className = 'collection-pick-card' + (packOwned ? ' loading' : ' locked');
  card.dataset.stage = imgStage;

  const label = document.createElement('div');
  label.className = 'card-label';
  label.textContent = `Stage ${stageNum}`;
  card.appendChild(label);

  if (!packOwned) {
    const lock = document.createElement('div');
    lock.className = 'gallery-lock-overlay';
    lock.innerHTML = '<span class="gallery-lock-icon">🔒</span>';
    card.appendChild(lock);
  } else {
    api.getImage(imgStage, save.rating).then(data => {
      card.classList.remove('loading');
      if (data.status === 'ready' && data.url) {
        const img = document.createElement('img');
        img.src = data.url;
        img.alt = `Stage ${stageNum}`;
        card.prepend(img);
      }
    }).catch(() => card.classList.remove('loading'));
  }

  if (alreadyCollected) {
    const badge = document.createElement('div');
    badge.className = 'collection-pick-badge';
    badge.textContent = t('collection.alreadyCollected');
    card.appendChild(badge);
  }

  card.addEventListener('pointerdown', () => onSelect(imgStage));
  return card;
}

async function showGallery() {
  show('gallery');

  // 특전 이미지 렌더링
  const rewardGrid = $('gallery-reward-images');
  const rewardBanner = $('reward-images-banner');
  rewardGrid.innerHTML = '';
  const rewardImages = save.rewardImages || [];
  if (rewardImages.length > 0) {
    rewardBanner.style.display = '';
    for (const { stage, url } of rewardImages) {
      const card = document.createElement('div');
      card.className = 'gallery-card';
      const img = document.createElement('img');
      img.src = url;
      img.alt = t('gallery.rewardAlt', { n: stage });
      img.style.cssText = 'width:100%;height:100%;object-fit:cover;border-radius:8px;cursor:pointer;';
      img.addEventListener('click', () => {
        const lbImg = $('img-lightbox');
        lbImg.src = url;
        $('div-lightbox').classList.add('active');
      });
      const label = document.createElement('div');
      label.className = 'card-label';
      label.textContent = t('gallery.rewardLabel', { n: stage });
      card.appendChild(img);
      card.appendChild(label);
      rewardGrid.appendChild(card);
    }
  } else {
    rewardBanner.style.display = 'none';
  }

  // 내 소장품 렌더링
  const collectionGrid = $('gallery-collection');
  collectionGrid.innerHTML = '';
  if (!save.collection || save.collection.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'gallery-empty';
    empty.textContent = t('gallery.collectionEmpty');
    collectionGrid.appendChild(empty);
  } else {
    for (const stageNum of save.collection) {
      collectionGrid.appendChild(makeGalleryCard(stageNum, true, true)); // 직접 고른 소장품은 항상 공개 + 전체화면
    }
  }

  // 구매 내역 조회
  const purchases = await getPurchases();

  // 팩 A/B/C 배너 상태 갱신
  for (const packId of ['pack_a', 'pack_b', 'pack_c']) {
    updatePackBanner(packId, isPackOwned(packId, purchases));
  }

  // 완전판 팩 버튼: 전체 구매 완료 시 숨김
  // [팩 구매 보류] 실 결제 구매를 막아두는 동안은 항상 숨김.
  const allOwned = ['pack_a', 'pack_b', 'pack_c'].every(p => isPackOwned(p, purchases));
  const btnAll = $('btn-pack-all');
  // if (btnAll) btnAll.style.display = allOwned ? 'none' : '';
  if (btnAll) btnAll.style.display = 'none';

  // 팩별 그리드 렌더링
  for (const [packId, range] of Object.entries(PACK_RANGES)) {
    const suffix   = packId.replace('pack_', '');
    const gridEl   = $(`gallery-grid-${suffix}`);
    if (!gridEl) continue;
    gridEl.innerHTML = '';

    const packOwned = isPackOwned(packId, purchases);

    // 플레이로 언락된 스테이지 중 이 팩 범위에 해당하는 것만 표시
    const staged = save.gallery.filter(s => s >= range.from && s <= range.to);

    if (staged.length === 0 && !packOwned) {
      const empty = document.createElement('p');
      empty.className = 'gallery-empty';
      empty.textContent = t('gallery.packEmpty', { from: range.from, to: range.to });
      gridEl.appendChild(empty);
      continue;
    }

    // 클리어한 스테이지 카드 (팩 보유 여부에 따라 블러 처리)
    for (const stageNum of staged) {
      gridEl.appendChild(makeGalleryCard(stageNum, packOwned));
    }
  }
}

// ── UI helpers ───────────────────────────────────────────────
function updateMainStats() {
  $('best-stage').textContent    = save.bestStage;
  $('current-stage').textContent = save.stage;
  const tsEl = $('main-total-score');
  if (tsEl) tsEl.textContent = (save.totalScore || 0).toLocaleString();
  updateAdButtons();
}

// ── 리워드 광고 (구글 애드센스 Ad Placement API) ────────────────
// 시청 1회당 3,000 → 6,000 → 12,000(2배씩) → 이후 1.5배씩(100 단위 절삭) 지급.
function updateAdButtons() {
  const amount = computeNextAdReward(save.lastAdReward || 0);
  const label = `(+${amount.toLocaleString()}pt)`;
  const mainEl  = $('main-ad-amount');
  const clearEl = $('clear-ad-amount');
  if (mainEl)  mainEl.textContent  = label;
  if (clearEl) clearEl.textContent = label;
}

let _adInFlight = false;
function requestRewardAd() {
  if (_adInFlight) return;
  _adInFlight = true;
  const btnMain  = $('btn-main-ad');
  const btnClear = $('btn-clear-ad');
  if (btnMain)  btnMain.disabled  = true;
  if (btnClear) btnClear.disabled = true;

  const finish = () => {
    _adInFlight = false;
    if (btnMain)  btnMain.disabled  = false;
    if (btnClear) btnClear.disabled = false;
  };

  watchRewardAd({
    onReward: () => {
      const reward = computeNextAdReward(save.lastAdReward || 0);
      save.totalScore   = (save.totalScore || 0) + reward;
      save.lastAdReward = reward;
      // 보관함 팩 해금용 누적 시청 횟수 — 끝까지 봐서 보상이 실제로 지급된 경우만 카운트.
      // (adDismissed로 중간에 닫은 시청은 onReward가 호출되지 않으므로 자동으로 제외됨)
      save.adWatchCount = (save.adWatchCount || 0) + 1;
      Storage.save(save);
      updateMainStats();
      const clearTotalEl = $('clear-total-score');
      if (clearTotalEl) clearTotalEl.textContent = save.totalScore.toLocaleString() + 'pt';
      $('btn-clear-market').style.display = save.totalScore >= 3000 ? 'block' : 'none';
      _showMarketToast(t('ads.rewardToast', { n: reward.toLocaleString() }));
      finish();
    },
    onUnavailable: () => {
      _showMarketToast(t('ads.unavailable'));
      finish();
    },
  });
}


// ── 팩 구매 버튼 핸들러 ──────────────────────────────────────
async function onPackBuy(packId) {
  const def = PACK_DEFS[packId];
  if (!def) return;
  try {
    await requestPackPurchase(packId);
    // requestPackPurchase는 토스 리다이렉트로 끝남 — 이후 코드는 실행되지 않음
  } catch (err) {
    console.error('[Pack] 결제 오류:', err);
    showAlert(err.message || t('payment.genericError'));
  }
}

// ── URL에서 결제 결과 확인 (성공 리다이렉트 후 처리) ──────────
(function checkPaymentReturn() {
  const params = new URLSearchParams(location.search);
  const result = params.get('purchase');
  const packId = params.get('packId');
  if (!result) return;

  // URL 파라미터 제거 (히스토리 교체)
  const cleanUrl = location.pathname;
  history.replaceState(null, '', cleanUrl);

  if (result === 'success' && packId) {
    saveLocalPurchase(packId);   // localStorage에 즉시 저장
    invalidatePurchaseCache();
    // 갤러리 화면을 열어 구매 결과 바로 확인
    setTimeout(() => showGallery(), 100);
  } else if (result === 'fail') {
    showAlert(t('payment.failedOrCanceled'));
  }
})();

// ── Reward Screen ────────────────────────────────────────────
// 특전 화면을 실제로 다 거친(계속하기/건너뛰기를 누른) 시점에야 pendingRewardStage를
// save에서 지운다 — 화면에 진입만 한 시점에 지워버리면, 특전 이미지 생성이 실패해
// 화면에 머물러 있는 동안 새로고침했을 때 특전 기회 자체가 조용히 날아가 버린다.
function proceedAfterReward() {
  save.pendingRewardStage = 0;
  Storage.save(save);
  if (pendingCollectionStage > 0) {
    const s = pendingCollectionStage;
    pendingCollectionStage = 0;
    showCollectionPick(s);
  } else {
    advanceAfterClear();
  }
}

// 특전/소장품 화면을 모두 거친 뒤 다음 스테이지로 넘어가는 마지막 관문.
// 300단계 클리어 직후라면 다음 스테이지를 시작하는 대신 게임 클리어 안내를 띄운다.
function advanceAfterClear() {
  if (pendingGameComplete) {
    // save.pendingGameComplete는 모달을 실제로 닫을 때(btn-complete-yes/no)
    // 지운다 — 여기서 미리 지우면 모달이 떠 있는 동안 새로고침 시 안내 없이
    // 스킵된다 (특전/소장품 화면과 동일한 이유).
    pendingGameComplete = false;
    showGameCompleteModal();
    return;
  }
  startGame(save.stage, save.rating);
}

function showGameCompleteModal() {
  $('modal-game-complete').classList.add('active');
}

async function showRewardScreen(completedStage) {
  $('reward-badge').textContent = t('reward.badge', { n: completedStage });

  // 입력 영역 초기화
  const textarea = $('reward-keywords');
  textarea.value = '';
  $('reward-char-now').textContent = '0';
  $('reward-input-area').classList.remove('hidden');
  $('reward-loading').classList.add('hidden');
  $('reward-result').classList.add('hidden');
  $('btn-reward-save').classList.add('hidden');
  $('btn-reward-continue').classList.add('hidden');
  $('btn-reward-skip').classList.remove('hidden');
  $('btn-reward-generate').disabled = false;
  $('btn-reward-generate').textContent = t('reward.btnGenerate');

  show('reward');

  // 스테이지 클리어 직후 일회용 토큰 발급.
  // 생성 요청이 실패한 뒤 재시도 버튼을 다시 눌렀을 때도 이 함수를 다시 불러
  // 토큰을 갱신한다 — 서버는 같은 userId+stage에 유효한 토큰이 남아있으면 그걸
  // 그대로 재사용해서 돌려주고, 이미 소모(성공)됐거나 만료됐으면 새로 발급하므로
  // 호출 자체는 항상 안전하다. (아래 "이미지는 실제로 만들어졌는데 브라우저가
  // 표시만 실패한 경우" 참고 — 이때는 서버가 토큰을 이미 소모한 뒤라, 갱신 없이
  // 같은 토큰으로 재시도하면 "유효하지 않거나 만료된 요청입니다"만 반복해서 뜬다.)
  const rewardUserId = `${save.userId}_stage${completedStage}`;
  let rewardToken = null;
  async function fetchRewardToken() {
    try {
      const tokenData = await api.rewardToken(rewardUserId, completedStage);
      rewardToken = tokenData.token;
      $('btn-reward-generate').disabled = false;
      $('btn-reward-generate').textContent = t('reward.btnGenerate');
    } catch (e) {
      console.warn('[Reward] 토큰 발급 실패:', e.message);
      rewardToken = null;
      $('btn-reward-generate').disabled = true;
      $('btn-reward-generate').textContent = t('reward.genUnavailable');
    }
  }
  await fetchRewardToken();

  textarea.addEventListener('input', () => {
    $('reward-char-now').textContent = textarea.value.length;
  }, { once: false });

  $('btn-reward-generate').onclick = async () => {
    if (!rewardToken) return;
    const keywords = textarea.value.trim();
    if (!keywords) { textarea.focus(); return; }

    $('reward-input-area').classList.add('hidden');
    $('reward-loading').classList.remove('hidden');
    $('btn-reward-skip').classList.add('hidden');

    // 생성 요청은 성공했지만 이미지가 실제로 뜨지 않는 경우(엑박) —
    // 예를 들어 응답에 imageUrl이 없거나, URL이 가리키는 파일이 없어 로드에
    // 실패하는 경우 — 를 "성공"으로 취급해 다음 버튼을 눌러버리지 않도록,
    // 이미지가 실제로 로드된 뒤에만 완료 상태로 전환한다.
    //
    // 이 경로로 실패하는 경우 서버는 이미 생성을 마치고 토큰을 소모한 뒤이므로
    // (구버전 문제) 같은 토큰으로 재시도하면 "이미지 생성에 실패했습니다" 다음에
    // "유효하지 않거나 만료된 요청입니다"만 반복해서 뜨고 막혀버렸다. failGeneration()
    // 뒤에 fetchRewardToken()으로 토큰을 갱신해 재시도 버튼이 항상 살아있게 한다.
    const failGeneration = (msg) => {
      $('reward-loading').classList.add('hidden');
      $('reward-input-area').classList.remove('hidden');
      $('btn-reward-skip').classList.remove('hidden');
      showAlert(msg || t('reward.genError'));
      fetchRewardToken();
    };

    // sd3-large 보상 이미지는 용량이 커서, 느린 네트워크에서는 실제로는 정상
    // 생성된 이미지인데도 첫 로드 시도가 타이밍상 실패로 보일 수 있다. 완전히
    // 포기하기 전에 짧은 대기 후 몇 차례 더 로드를 시도한다.
    function loadResultImage(url, attempt = 0) {
      return new Promise((resolve, reject) => {
        const resultImg = $('reward-result-img');
        resultImg.onload = () => { resultImg.onload = null; resultImg.onerror = null; resolve(); };
        resultImg.onerror = () => { resultImg.onload = null; resultImg.onerror = null; reject(); };
        resultImg.src = attempt === 0 ? url : `${url}${url.includes('?') ? '&' : '?'}retry=${attempt}`;
      });
    }

    try {
      const data = await api.rewardGenerate(rewardUserId, keywords, rewardToken);
      if (!data.imageUrl) { failGeneration(); return; }

      let loaded = false;
      for (let attempt = 0; attempt <= 2 && !loaded; attempt++) {
        if (attempt > 0) await new Promise(r => setTimeout(r, 800));
        try { await loadResultImage(data.imageUrl, attempt); loaded = true; } catch { /* 다음 시도 */ }
      }
      if (!loaded) { failGeneration(); return; }

      $('reward-loading').classList.add('hidden');
      $('reward-result').classList.remove('hidden');

      // 저장 버튼: 이미 저장된 스테이지면 비활성화
      const alreadySaved = (save.rewardImages || []).some(r => r.stage === completedStage);
      const saveBtn = $('btn-reward-save');
      saveBtn.classList.remove('hidden');
      saveBtn.disabled = alreadySaved;
      saveBtn.textContent = alreadySaved ? t('reward.savedBtn') : t('reward.btnSave');
      saveBtn.onclick = () => {
        if (!save.rewardImages) save.rewardImages = [];
        const idx = save.rewardImages.findIndex(r => r.stage === completedStage);
        if (idx >= 0) save.rewardImages[idx] = { stage: completedStage, url: data.imageUrl };
        else save.rewardImages.push({ stage: completedStage, url: data.imageUrl });
        Storage.save(save);
        saveBtn.disabled = true;
        saveBtn.textContent = t('reward.savedBtn');
      };

      $('btn-reward-continue').classList.remove('hidden');
      $('btn-reward-skip').classList.remove('hidden');
    } catch (err) {
      // 서버가 구체적인 사유(금지 키워드, 쿨다운, 일일 한도 등)를 내려주므로
      // 그대로 보여줘 사용자가 원인을 알고 다시 시도할 수 있게 한다.
      failGeneration(err.message);
    }
  };

  $('btn-reward-continue').onclick = () => proceedAfterReward();
  $('btn-reward-skip').onclick     = () => proceedAfterReward();
}

// ── Button bindings ──────────────────────────────────────────
$('btn-start').onclick = () => { save.rating = 'g'; startGame(save.stage, 'g'); };
$('btn-gallery').onclick = () => showGallery();
$('btn-help').onclick = () => { show('help'); switchHelpTab('how'); };
$('btn-back-help').onclick = () => show('main');

// ── 내 캐릭터 자랑하기 ────────────────────────────────────────
// 서버 DB 없이, 통계값을 그대로 공유 URL 쿼리스트링에 실어 공유 페이지
// (share.html)에서 같은 카드를 다시 그리게 한다 (bragCard.js buildShareUrl 참고).
// 레벨/색상 등 티어는 최고 스테이지(bestStage) 기준 — bragCard.js getBragTier.
let _bragRafId = null;
function _bragStats() {
  return {
    bestStage: save.bestStage || 0,
    totalScore: save.totalScore || 0,
    highFillClearCount: save.highFillClearCount || 0,
    equippedAccessories: save.accessoryEquipped || {},
  };
}
function _bragLabels() {
  return {
    title: t('brag.cardTitle'),
    level: t('brag.level'),
    points: t('brag.points'),
    highFillClears: t('brag.highFillClears'),
    timesSuffix: t('brag.timesSuffix'),
    tagline: t('brag.tagline'),
    appName: t('brand.name'),
  };
}
function openBragModal() {
  const ctx = $('brag-canvas').getContext('2d');
  const stats = _bragStats();
  const labels = _bragLabels();
  const start = performance.now();
  const draw = () => {
    drawBragCard(ctx, stats, (performance.now() - start) / 1000, labels);
    _bragRafId = requestAnimationFrame(draw);
  };
  draw();
  $('modal-brag').classList.add('active');
}
function closeBragModal() {
  $('modal-brag').classList.remove('active');
  if (_bragRafId) { cancelAnimationFrame(_bragRafId); _bragRafId = null; }
}
$('btn-brag-close').onclick = closeBragModal;
$('modal-brag').addEventListener('pointerdown', e => {
  if (e.target === $('modal-brag')) closeBragModal();
});
$('btn-main-brag').onclick  = () => openBragModal();
$('btn-clear-brag').onclick = () => openBragModal();

$('btn-brag-share').onclick = async () => {
  const stats = _bragStats();
  const shareUrl = buildShareUrl(location.origin, stats);
  const shareText = t('brag.shareText', { stage: stats.bestStage });
  const shareTitle = t('brag.cardTitle');
  const copyFallback = () => {
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(shareUrl).then(
        () => showAlert(t('brag.linkCopied')),
        () => showAlert(shareUrl)
      );
    } else {
      showAlert(shareUrl);
    }
  };
  try {
    if (navigator.share) {
      await navigator.share({ title: shareTitle, text: shareText, url: shareUrl });
      return;
    }
    copyFallback();
  } catch (e) {
    // 사용자가 공유 시트를 직접 취소한 경우(AbortError)는 실패로 취급하지 않는다.
    if (e?.name !== 'AbortError') copyFallback();
  }
};

// 도움말 탭 전환
function switchHelpTab(tabId) {
  document.querySelectorAll('.help-tab').forEach(b =>
    b.classList.toggle('active', b.dataset.tab === tabId));
  document.querySelectorAll('.help-section').forEach(s =>
    s.classList.toggle('active', s.id === `help-tab-${tabId}`));
}
document.querySelectorAll('.help-tab').forEach(btn =>
  btn.addEventListener('click', () => switchHelpTab(btn.dataset.tab)));

$('btn-general').onclick = () => { save.rating = 'g'; startGame(save.stage, 'g'); };
$('btn-sexy').onclick    = null;
$('btn-back-main').onclick    = () => show('main');
$('btn-back-main2').onclick   = () => show('main');
$('btn-back-gallery').onclick = () => show('main');

// 팩 구매 버튼
// [팩 구매 보류] 실 결제 구매 도입을 미루고 광고 기반 해금을 검토 중이라
// 버튼 자체를 숨겨뒀다 (updatePackBanner/showGallery 참고). 재개 시 아래 주석 해제.
// $('btn-pack-a').onclick   = () => onPackBuy('pack_a');
// $('btn-pack-b').onclick   = () => onPackBuy('pack_b');
// $('btn-pack-c').onclick   = () => onPackBuy('pack_c');
// $('btn-pack-all').onclick = () => onPackBuy('pack_all');

$('btn-next-stage').onclick = () => {
  // 자동 진행 타이머가 아직 대기 중이면 취소 — 수동으로 눌렀으니 중복 진행 불필요.
  if (_clearAutoAdvanceTimer) { clearTimeout(_clearAutoAdvanceTimer); _clearAutoAdvanceTimer = null; }
  // save.pendingRewardStage/pendingCollectionStage는 여기서 지우지 않는다 — 해당
  // 화면을 실제로 완료했을 때(proceedAfterReward/confirmBtn.onclick)만 지워야,
  // 화면에 머무는 동안 새로고침해도 boot()에서 같은 화면으로 복귀할 수 있다.
  if (pendingRewardStage > 0) {
    const s = pendingRewardStage;
    pendingRewardStage = 0;
    showRewardScreen(s);
  } else if (pendingCollectionStage > 0) {
    const s = pendingCollectionStage;
    pendingCollectionStage = 0;
    showCollectionPick(s);
  } else {
    advanceAfterClear();
  }
};
$('btn-collection-skip').onclick = () => advanceAfterClear();
$('btn-retry').onclick      = () => { save.heldItems = []; startGame(save.stage, save.rating); };
$('btn-back-menu').onclick  = () => {
  if (_clearAutoAdvanceTimer) { clearTimeout(_clearAutoAdvanceTimer); _clearAutoAdvanceTimer = null; }
  show('main');
};
$('btn-back-menu2').onclick = () => show('main');

$('btn-reset').onclick = () => {
  $('modal-reset').classList.add('active');
};
$('btn-reset-cancel').onclick = () => {
  $('modal-reset').classList.remove('active');
};
$('modal-reset').addEventListener('pointerdown', e => {
  if (e.target === $('modal-reset')) $('modal-reset').classList.remove('active');
});
$('btn-reset-confirm').onclick = () => {
  $('modal-reset').classList.remove('active');
  save = Storage.load();
  save.stage = 1; save.bestStage = 0; save.gallery = []; save.heldItems = []; save.collection = [];
  save.totalScore = 0; save.bonusLives = 0; save.mythicUnlockShown = false;
  save.accessoryOwned = []; save.accessoryEquipped = {}; save.accessoryAdProgress = {};
  save.persistentBonus = { extraLives: 0, extraTime: 0, speedLevel: 0, gunLevel: 0, swordLevel: 0, bulletLevel: 0, guardianOrb: false,
    phoenixHeart: false, midasTouch: false, territoryMark: false, mythicShieldLevel: 0, petCount: 0, petLevel: 0,
    repelChance: 0, freezeChance: 0, gatherChance: 0, autoModeOwned: false, autoModeUpgradeLevel: 0, mythicZeusOwned: false, mythicZeusLevel: 0 };
  Storage.save(save);
  updateMainStats();
  show('main');
};

// ── 게임 클리어(300단계 완주) 안내 모달 ────────────────────
// 확인: 스테이지 번호는 301부터 계속 이어서 증가하되(체력 등 난이도는 루프마다 더 어려워짐 —
//       getStageHP 참고), 배경 이미지는 1단계 이미지부터 다시 순환. 갤러리·소장품·특전
//       이미지·무기 정보는 그대로 유지.
// 아니오: 스테이지 1부터 새로 시작 — 갤러리·소장품·특전 이미지·무기 정보를 비우되, 누적 점수는 유지.
$('btn-complete-yes').onclick = () => {
  $('modal-game-complete').classList.remove('active');
  save.pendingGameComplete = false;
  Storage.save(save);
  // save.stage는 onStageClear에서 이미 301로 증가해둔 상태 — 그대로 이어서 시작.
  startGame(save.stage, save.rating);
};
$('btn-complete-no').onclick = () => {
  $('modal-game-complete').classList.remove('active');
  save.pendingGameComplete = false;
  save.stage = 1;
  save.gallery = [];
  save.collection = [];
  save.rewardImages = [];
  save.heldItems = [];
  save.mythicUnlockShown = false;
  save.accessoryOwned = []; save.accessoryEquipped = {}; save.accessoryAdProgress = {};
  save.persistentBonus = { extraLives: 0, extraTime: 0, speedLevel: 0, gunLevel: 0, swordLevel: 0, bulletLevel: 0, guardianOrb: false,
    phoenixHeart: false, midasTouch: false, territoryMark: false, mythicShieldLevel: 0, petCount: 0, petLevel: 0,
    repelChance: 0, freezeChance: 0, gatherChance: 0, autoModeOwned: false, autoModeUpgradeLevel: 0, mythicZeusOwned: false, mythicZeusLevel: 0 };
  Storage.save(save);
  updateMainStats();
  show('main');
};

// ── Alert modal ──────────────────────────────────────────────
function showAlert(msg) {
  $('modal-alert-msg').textContent = msg;
  $('modal-alert').classList.add('active');
}
$('btn-alert-ok').onclick = () => $('modal-alert').classList.remove('active');
$('modal-alert').addEventListener('pointerdown', e => {
  if (e.target === $('modal-alert')) $('modal-alert').classList.remove('active');
});

// 오토모드 강화 단계 — 0(기본, 초당 2발) → 1(5,000,000pt, 초당 4발) → 2(10,000,000pt,
// 초당 6발). pb.autoModeUpgraded는 2단계 도입 전 1단계만 있던 시절의 boolean
// 필드라 하위 호환을 위해 그대로 둔다 — autoModeUpgradeLevel이 없는 예전 세이브도
// autoModeUpgraded:true면 1단계로 취급한다.
function getAutoModeUpgradeLevel(pb) {
  if (!pb) return 0;
  return pb.autoModeUpgradeLevel || (pb.autoModeUpgraded ? 1 : 0);
}

// ── Market ───────────────────────────────────────────────────
// 무기 강화(총/총탄/칼/펫) 상한 — 1회차(1~300단계) 기준치. 300단계를 한 바퀴 돌 때마다
// 몹 체력이 직전 루프보다 2배씩 강해지는 것과 밸런스를 맞추기 위해, 루프마다
// (getLoopMultiplier) 2배씩 계속 풀린다. 실제 상수는 game.js와 공유하도록 config.js에 둔다.
function getUpgradeCaps() {
  const mult = getLoopMultiplier(save.stage);
  // 펫강화만 예외: "N강화 = N스테이지 몹 체력"으로 맞춰뒀기 때문에(game.js의
  // _getPetPattern 참고), 상한도 루프배수 대신 실제 스테이지 번호를 그대로 따라간다.
  // 200단 기본 상한은 스테이지 300에서 300으로, 이후 100스테이지를 더 깰 때마다
  // (400/500/600…) 그만큼씩 계속 풀린다.
  const petCap = Math.max(PET_BASE_CAP, Math.floor(save.stage / 100) * 100);
  return { gun: GUN_BASE_CAP * mult, bullet: BULLET_BASE_CAP * mult, sword: SWORD_BASE_CAP * mult, pet: petCap };
}

// 신화 등급 "방패" — 스테이지 시작 시 무적 시간을 1초씩 늘려주는 영구템. 최대 100초까지
// 누적 구매 가능하고, 살 때마다 다음 구매 가격이 50만씩 비싸진다. 운명의 주사위의
// "방패강화" 항목도 같은 스탯(persistentBonus.mythicShieldLevel)을 올려준다.
const MYTHIC_SHIELD_MAX = 100;

// 운명의 주사위 가격 — 기본 60,000pt에서, 레벨(최고 스테이지 기준) 50단계마다
// 기본가의 절반(0.5배)씩 추가로 붙는다 (50단: 1.5배, 100단: 2배, 150단: 2.5배 ...).
const DICE_OF_FATE_BASE_COST = 60000;
function getDiceOfFateCost() {
  const tier = Math.floor((save.bestStage || 0) / 50);
  return Math.round(DICE_OF_FATE_BASE_COST * (1 + tier * 0.5));
}

// 신화 등급 "제우스의 분노" — 구매마다(2000만pt) 독립된 자동 발동 타이머가 하나씩
// 늘어나는 영구템. 최대 5강화까지 가능 (기본 5초 + 10/15/20/25/30초 타이머).
const MYTHIC_ZEUS_MAX_LEVEL = 5;

// 신화 등급 "몬스터 회피/시간 동결 부적" — 구매마다 다음 스테이지에 발동할 확률이
// +1%p씩 쌓이는 영구 스탯. 100개 사면 100% 확정 발동, 그 이상은 구매 불가.
const REPEL_FREEZE_CHANCE_MAX = 100;
function getMythicShieldCost(currentLevel) {
  return 500000 * (currentLevel + 1);
}

// 신화 등급 "펫강화" 비용 — 1강화(100,000pt)에서 최대강화(cap, 10,000,000pt)까지
// 지수적으로 증가한다 (강화로 쌓인 포인트를 소진시키기 위한 의도적인 포인트 싱크).
// 최초 배포 값(100만→1억)이 체감상 밸런스 붕괴 수준으로 비쌌다는 피드백에 따라
// 1/10로 낮췄다.
function getPetUpgradeCost(nextLevel, cap) {
  const p = cap > 1 ? (nextLevel - 1) / (cap - 1) : 1;
  return Math.round(100000 * Math.pow(100, p) / 1000) * 1000;
}

// 51단계부터 레어 등급 상점이 마감되고 신화 등급이 해금된다 (오래 플레이해서
// 포인트가 넉넉히 쌓인 유저에게 낯익은 레어템 대신 새로운 목표를 준다).
const MYTHIC_UNLOCK_STAGE = 51;

function getMarketItems() {
  const pb      = save.persistentBonus || {};
  const speedLv = pb.speedLevel || 0;
  const hasSword = save.heldItems.some(h => h.type === 'sword');
  const hasGun   = save.heldItems.some(h => h.type === 'gun');
  // 스피드 부스트·황금버블은 중첩 보유가 안 되고(구매해도 효과가 없음) 스테이지를
  // 넘기거나(스피드) 터지면(황금버블) 소모되므로, 이미 보유 중일 때만 목록에서 숨긴다.
  const hasSpeedItem  = save.heldItems.some(h => h.type === 'speed');
  const hasRareBubble = save.heldItems.some(h => h.type === 'rareBubble');
  const mythicUnlocked = save.stage >= MYTHIC_UNLOCK_STAGE;
  const caps = getUpgradeCaps();
  // 총/칼/총탄 강화 포인트는 300단계(MAX_STAGE)를 넘어가면 2배로 오른다 — 몹 체력·
  // 무기 강화 상한 등 다른 밸런스 요소도 300단계를 한 바퀴 돌 때마다 크게 세지는데
  // 강화 비용만 그대로면 상대적으로 너무 저렴해지기 때문.
  const weaponCostMult = save.stage > MAX_STAGE ? 2 : 1;
  // 분열 아이템은 스테이지당 최대 2개까지만 구매 가능 (무제한 파밍 방지).
  // save.splitBuyStage에 마지막으로 센 스테이지 번호를 저장해두고, 현재
  // save.stage와 다르면(=새 스테이지로 넘어감) 자동으로 0부터 다시 센다.
  const SPLIT_BUY_LIMIT = 2;
  const splitBuyCount = save.splitBuyStage === save.stage ? (save.splitBuysCount || 0) : 0;

  const items = [
    // Normal
    { id:'timeboost',      tier:'normal', cost:3000,  icon:'⏱️', name:t('market.item.timeboost.name'),   desc:t('market.item.timeboost.desc') },
    { id:'extraLife',      tier:'normal', cost:3000,  icon:'💊', name:t('market.item.extraLife.name'),   desc:t('market.item.extraLife.desc') },
    ...(hasSpeedItem ? [] : [{ id:'speed', tier:'normal', cost:3000, icon:'💨', name:t('market.item.speed.name'), desc:t('market.item.speed.desc') }]),
    ...(splitBuyCount < SPLIT_BUY_LIMIT ? [{ id:'splitCharge', tier:'normal', cost:4000, icon:'💥',
      name:t('market.item.splitCharge.name'),
      desc:t('market.item.splitCharge.desc', { count: splitBuyCount, max: SPLIT_BUY_LIMIT }) }] : []),
  ];
  // Rare — 51단계(MYTHIC_UNLOCK_STAGE) 이후로는 상점에서 완전히 사라진다.
  if (!mythicUnlocked) {
    items.push(
      { id:'rareLife',       tier:'rare',   cost:12000, icon:'❤️‍🔥', name:t('market.item.rareLife.name'),  desc:t('market.item.rareLife.desc') },
      { id:'rareClock',      tier:'rare',   cost:10000, icon:'🕰️', name:t('market.item.rareClock.name'),  desc:t('market.item.rareClock.desc') },
    );
    if (speedLv < 1) items.push(
      { id:'endureSpeed',    tier:'rare',   cost:15000, icon:'💫', name:t('market.item.endureSpeed.name'), desc:t('market.item.endureSpeed.desc') }
    );
    if (speedLv < 2) items.push(
      { id:'transcendSpeed', tier:'rare',   cost:20000, icon:'🌀', name:t('market.item.transcendSpeed.name'),
        desc:t('market.item.transcendSpeed.desc') + (speedLv===1 ? t('market.item.transcendSpeed.replaceNote') : '') }
    );
  }
  // Mythic — 51단계부터 해금. 레어 상점이 마감된 자리를 채운다.
  // 영구템(1회 구매, 이미 보유 중이면 목록에서 빠짐)은 전부 500,000pt 이상으로 책정,
  // 소모템(구매할 때마다 개수가 쌓여 계속 다시 살 수 있음)은 적당히 저렴하게 책정했다.
  if (mythicUnlocked) {
    if (!pb.guardianOrb) items.push(
      { id:'guardianOrb', tier:'mythic', cost:1000000, icon:'🔮',
        name:t('market.item.guardianOrb.name'), desc:t('market.item.guardianOrb.desc') }
    );
    if (!pb.phoenixHeart) items.push(
      { id:'phoenixHeart', tier:'mythic', cost:700000, icon:'🔥',
        name:t('market.item.phoenixHeart.name'), desc:t('market.item.phoenixHeart.desc') }
    );
    if (!pb.midasTouch) items.push(
      { id:'midasTouch', tier:'mythic', cost:800000, icon:'💰',
        name:t('market.item.midasTouch.name'), desc:t('market.item.midasTouch.desc') }
    );
    if (!pb.territoryMark) items.push(
      { id:'territoryMark', tier:'mythic', cost:900000, icon:'🗺️',
        name:t('market.item.territoryMark.name'), desc:t('market.item.territoryMark.desc') }
    );
    // 오토모드 — 게임 중 토글해서 선택된 총/칼을 자동 발사 (game.js의
    // toggleAutoMode/_update 참고). 구매 자체는 1회성 영구, 발동은 게임 내 토글.
    // 기본 발사 속도는 초당 2발이며, 아래 "오토모드 강화"를 단계별로 사면
    // 1단계(500만pt) 초당 4발 → 2단계(1000만pt) 초당 6발까지 오른다.
    if (!pb.autoModeOwned) items.push(
      { id:'autoMode', tier:'mythic', cost:50000000, icon:'🤖',
        name:t('market.item.autoMode.name'), desc:t('market.item.autoMode.desc') }
    );
    const autoUpgLv = getAutoModeUpgradeLevel(pb);
    if (pb.autoModeOwned && autoUpgLv < 1) items.push(
      { id:'autoModeUpgrade', tier:'mythic', cost:5000000, icon:'🎯',
        name:t('market.item.autoModeUpgrade.name'), desc:t('market.item.autoModeUpgrade.desc') }
    );
    if (pb.autoModeOwned && autoUpgLv === 1) items.push(
      { id:'autoModeUpgrade2', tier:'mythic', cost:10000000, icon:'🎯',
        name:t('market.item.autoModeUpgrade2.name'), desc:t('market.item.autoModeUpgrade2.desc') }
    );
    // 제우스의 분노 — 구매 자체는 1회성 영구, 켜져 있으면 조작 없이 정해진 주기마다
    // 캐릭터 앞쪽에 제우스의 번개(5x5)를 자동으로 내리친다 (game.js _update/
    // _triggerMythicZeusWrath 참고). 기본 주기 5초, 강화마다 독립된 타이머가
    // 하나씩 늘어나(10/15/20/25/30초) 최대 5강화까지 발동 빈도가 계속 늘어난다.
    const zeusLv = pb.mythicZeusLevel || 0;
    if (!pb.mythicZeusOwned) items.push(
      { id:'mythicZeusWrath', tier:'mythic', cost:10000000, icon:'⚡',
        name:t('market.item.mythicZeusWrath.name'), desc:t('market.item.mythicZeusWrath.desc') }
    );
    if (pb.mythicZeusOwned && zeusLv < MYTHIC_ZEUS_MAX_LEVEL) items.push(
      { id:'mythicZeusWrathUpgrade', tier:'mythic', cost:20000000, icon:'⚡',
        name:t('market.item.mythicZeusWrathUpgrade.name', { from: zeusLv, to: zeusLv + 1 }),
        desc:t('market.item.mythicZeusWrathUpgrade.desc', { sec: (zeusLv + 2) * 5, max: MYTHIC_ZEUS_MAX_LEVEL }) }
    );
    // 방패 — 스테이지 시작 시 무적 시간 +1초(최대 100초), 살 때마다 50만씩 비싸짐.
    const shieldLv = pb.mythicShieldLevel || 0;
    if (shieldLv < MYTHIC_SHIELD_MAX) items.push(
      { id:'mythicShield', tier:'mythic', cost:getMythicShieldCost(shieldLv), icon:'🛡️',
        name:t('market.item.mythicShield.name'),
        desc:t('market.item.mythicShield.desc', { sec: shieldLv + 1, max: MYTHIC_SHIELD_MAX }) }
    );
    // 펫 — 최대 PET_MAX_COUNT마리, 마리당 500만pt 고정가.
    const petCount = pb.petCount || 0;
    if (petCount < PET_MAX_COUNT) items.push(
      { id:'pet', tier:'mythic', cost:5000000, icon:'🐿️',
        name:t('market.item.pet.name'), desc:t('market.item.pet.desc', { count: petCount, max: PET_MAX_COUNT }) }
    );
    // 펫강화 — 펫을 1마리 이상 보유해야 표시, 10만→최대 1000만pt.
    const petLv = pb.petLevel || 0, petCap = caps.pet;
    if (petCount > 0 && petLv < petCap) items.push(
      { id:'petUpgrade', tier:'mythic', cost:getPetUpgradeCost(petLv + 1, petCap), icon:'🔧',
        name:t('market.item.petUpgrade.name', { from: t('market.unitLevel', { n: petLv }), to: t('market.unitLevel', { n: petLv + 1 }) }),
        desc:t('market.item.petUpgrade.desc', { to: petLv + 1, max: petCap }) }
    );
    // 회피/동결/수집 부적 — 예전엔 "구매 개수만큼 다음 스테이지부터 순서대로 소모"되는
    // 소모품이었는데, 한 스테이지 안에서는 몇 개를 갖고 있든 효과(15초/5초 고정)가
    // 똑같아 "여러 개 보유"가 사실상 미래 스테이지 몫을 미리 사두는 것 이상의 의미가
    // 없었다. 그래서 영구 스탯으로 바꿔, 매 구매마다 "다음 스테이지에 발동할 확률"이
    // +1%p씩 쌓이는 방식으로 변경 (100개 사면 100% 확정 발동, 그 이상은 못 삼).
    // 회피 부적은 몹이 캐릭터에게서 최대 총알 크기 반경 안으로 못 들어오게 막는
    // 장벽으로, 수집 부적은 몹을 캐릭터 쪽으로 끌어당기는 용도로 바뀌었다 — 둘을
    // 함께 쓰면 몹이 끌려오다 장벽에 막혀 캐릭터 바로 바깥에 뭉치므로, 총/칼로
    // 한 번에 쓸어담기 좋다 (game.js _update 참고).
    const repelChance  = Math.min(REPEL_FREEZE_CHANCE_MAX, pb.repelChance  || 0);
    const freezeChance = Math.min(REPEL_FREEZE_CHANCE_MAX, pb.freezeChance || 0);
    const gatherChance = Math.min(REPEL_FREEZE_CHANCE_MAX, pb.gatherChance || 0);
    if (repelChance < REPEL_FREEZE_CHANCE_MAX) items.push(
      { id:'repelCharm', tier:'mythic', cost:120000, icon:'🚧',
        name:t('market.item.repelCharm.name'),
        desc:t('market.item.repelCharm.desc', { pct: repelChance + 1, max: REPEL_FREEZE_CHANCE_MAX }) }
    );
    if (freezeChance < REPEL_FREEZE_CHANCE_MAX) items.push(
      { id:'freezeCharm', tier:'mythic', cost:100000, icon:'⏳',
        name:t('market.item.freezeCharm.name'),
        desc:t('market.item.freezeCharm.desc', { pct: freezeChance + 1, max: REPEL_FREEZE_CHANCE_MAX }) }
    );
    if (gatherChance < REPEL_FREEZE_CHANCE_MAX) items.push(
      { id:'gatherCharm', tier:'mythic', cost:130000, icon:'🧲',
        name:t('market.item.gatherCharm.name'),
        desc:t('market.item.gatherCharm.desc', { pct: gatherChance + 1, max: REPEL_FREEZE_CHANCE_MAX }) }
    );
    items.push(
      { id:'diceOfFate', tier:'mythic', cost:getDiceOfFateCost(), icon:'🎲',
        name:t('market.item.diceOfFate.name'), desc:t('market.item.diceOfFate.desc') },
    );
  }
  // Legend — conditional
  if (!hasSword) items.push(
    { id:'sword',          tier:'legend', cost:30000, icon:'⚔️', name:t('market.item.sword.name'), desc:t('market.item.sword.desc') }
  );
  const swordCount = save.heldItems.find(h => h.type === 'sword')?.count || 0;
  if (hasSword && swordCount < 2) items.push(
    { id:'swordUpgrade',   tier:'legend', cost:30000, icon:'🗡️', name:t('market.item.swordUpgrade.name'), desc:t('market.item.swordUpgrade.desc') }
  );
  // 칼 강화 — 칼 관련 항목끼리 묶이도록 칼/신검 바로 다음에 배치 (기존엔 목록
  // 맨 끝에 있어 모바일에서 스크롤을 끝까지 내려야만 보였음)
  const swordLv = (save.persistentBonus?.swordLevel) || 0;
  if (hasSword && swordLv < caps.sword) {
    const swCost = (5000 + Math.floor(swordLv / 5) * 1000) * weaponCostMult;
    const swIcons=['⚪','🔴','🟠','🟡','🟢','🔵','🔷','🟣','⚫','🩵','🌈'];
    const swIcon = swIcons[Math.min(Math.floor(swordLv/10),10)];
    items.push({id:'swordLevelUp', tier: swordLv<10?'normal':swordLv<30?'rare':'legend', cost:swCost, icon:swIcon+'⚔️',
      name: t('market.item.swordLevelUp.name', { from: t('market.unitLevel', { n: swordLv }), to: t('market.unitLevel', { n: swordLv + 1 }) }),
      desc: t('market.item.swordLevelUp.desc', { to: swordLv + 1, max: caps.sword }) });
  }
  if (!hasGun) items.push(
    { id:'gun',            tier:'legend', cost:30000, icon:'🔫', name:t('market.item.gun.name'), desc:t('market.item.gun.desc') }
  );
  if (hasGun) items.push(
    { id:'ammo',           tier:'legend', cost:5000,  icon:'🔫', name:t('market.item.ammo.name'), desc:t('market.item.ammo.desc') }
  );
  items.push(
    { id:'lightning',      tier:'legend', cost:10000,  icon:'⚡',  name:t('market.item.lightning.name'),     desc:t('market.item.lightning.desc') },
    { id:'zeusLightning',  tier:'legend', cost:15000,  icon:'🌩️', name:t('market.item.zeusLightning.name'), desc:t('market.item.zeusLightning.desc') },
  );
  if (!hasRareBubble) items.push(
    { id:'rareBubble',     tier:'legend', cost:20000,  icon:'🫧',  name:t('market.item.rareBubble.name'),    desc:t('market.item.rareBubble.desc') }
  );
  // Gun upgrade — 총 보유 시에만 표시
  const gunLv = (save.persistentBonus?.gunLevel) || 0;
  if (hasGun && gunLv < caps.gun) {
    const gunCost = (3000 + Math.floor(gunLv / 5) * 1000) * weaponCostMult;
    const gunLabel = gunLv===0 ? t('market.item.gunUpgrade.labelBase') : t('market.unitLevel', { n: gunLv });
    const _gunPatternKey = lv => {
      if (lv<=10)  return 'market.gunPattern.p2';
      if (lv<=30)  return 'market.gunPattern.p3';
      if (lv<=40)  return 'market.gunPattern.p3_45';
      if (lv<=50)  return 'market.gunPattern.p4';
      if (lv<=60)  return 'market.gunPattern.p5';
      if (lv<=70)  return 'market.gunPattern.p3_45';
      if (lv<=80)  return 'market.gunPattern.p7';
      if (lv<=90)  return 'market.gunPattern.p8';
      if (lv<=100) return 'market.gunPattern.p9';
      if (lv<=110) return 'market.gunPattern.p10';
      return 'market.gunPattern.p11';
    };
    items.push({id:'gunUpgrade', tier: gunLv<10?'normal':gunLv<50?'rare':'legend', cost:gunCost, icon:'🔫',
      name: t('market.item.gunUpgrade.name', { from: gunLabel, to: t('market.unitLevel', { n: gunLv + 1 }) }),
      desc: t('market.item.gunUpgrade.desc', { pattern: t(_gunPatternKey(gunLv + 1)), dmg: gunLv + 1 }) });
  }
  // Bullet upgrade — 총 보유 시에만 표시.
  // 1~BULLET_BASE_CAP(100)단계까지는 메인 탄 크기가 커지고, 그 이후로는(루프를
  // 돌아 상한이 더 풀려도) 화면을 가득 채우지 않도록 크기를 고정한 채 데미지
  // 상승 + 코어 탄 성장으로 전환된다 (game.js _getGunPattern 참고).
  const bulletLv = (save.persistentBonus?.bulletLevel) || 0;
  if (hasGun && bulletLv < caps.bullet) {
    const bulletCost = (3000 + Math.floor(bulletLv / 5) * 1000) * weaponCostMult;
    const nextLv = bulletLv + 1;
    const desc = nextLv <= BULLET_BASE_CAP
      ? t('market.item.bulletUpgrade.desc', { size: Math.round((0.25 + (nextLv-1)/(BULLET_BASE_CAP-1)*1.75)*10)/10 })
      : t('market.item.bulletUpgrade.descCore', {
          dmg: nextLv - BULLET_BASE_CAP,
          size: Math.round((0.25 + (Math.min(nextLv-BULLET_BASE_CAP,BULLET_BASE_CAP)-1)/(BULLET_BASE_CAP-1)*0.75)*10)/10,
        });
    items.push({id:'bulletUpgrade', tier: bulletLv<10?'normal':bulletLv<50?'rare':'legend', cost:bulletCost, icon:'🔵',
      name: t('market.item.bulletUpgrade.name', { from: t('market.unitLevel', { n: bulletLv }), to: t('market.unitLevel', { n: bulletLv + 1 }) }),
      desc });
  }
  return items;
}

// 보유 아이템 바에 실제로 "칸"을 차지하는 아이템 수 — speed/timeboost는
// updateHeldItemsBar()에서도 바에 표시하지 않는 즉시효과/보조효과라 칸 계산에서도
// 제외한다. 이걸 raw heldItems.length로 잘못 세면(예전 버그), speed·timeboost처럼
// 화면엔 안 보이는 아이템 때문에 칸이 이미 다 찬 것처럼 계산돼 — 새 무기(칼/총/번개
// 등)를 구매해도 포인트만 빠져나가고 아무것도 지급되지 않는 문제가 있었다.
function _heldSlotCount(heldItems) {
  return (heldItems || []).filter(h => h.type !== 'speed' && h.type !== 'timeboost').length;
}

function _mergeHeldItem(heldItems, item) {
  const arr = JSON.parse(JSON.stringify(heldItems || []));
  if (item.type === 'split') {
    const ex = arr.find(h => h.type === 'split');
    if (ex) ex.count = (ex.count || 1) + 1;
    else arr.push({ type: 'split', count: 1 });
  } else if (item.type === 'timeboost') {
    const ex = arr.find(h => h.type === 'timeboost');
    if (ex) ex.count = (ex.count || 1) + 1;
    else arr.push({ type: 'timeboost', count: 1 });
  } else if (item.type === 'sword') {
    const ex = arr.find(h => h.type === 'sword');
    if (ex) ex.count = Math.min(2, (ex.count || 1) + 1);
    else if (_heldSlotCount(arr) < 3) arr.push({ type: 'sword', count: 1 });
  } else if (item.type === 'gun') {
    const ex = arr.find(h => h.type === 'gun');
    if (ex) ex.ammo = Math.min(1000, (ex.ammo || 0) + (item.ammo || 5));
    else if (_heldSlotCount(arr) < 3) arr.push({ type: 'gun', ammo: item.ammo || 5 });
  } else if (item.type === 'lightning' || item.type === 'zeusLightning') {
    const ex = arr.find(h => h.type === item.type);
    if (ex) ex.count = (ex.count || 1) + 1;
    else if (_heldSlotCount(arr) < 3) arr.push({ type: item.type, count: 1 });
  } else if (item.type === 'speed') {
    const ex = arr.find(h => h.type === 'speed');
    if (ex) { ex.level = Math.max(ex.level || 1, item.level || 1); }
    else if (_heldSlotCount(arr) < 3) arr.push({ type: 'speed', level: item.level || 1, singleUse: item.singleUse });
  } else if (item.type === 'rareBubble') {
    // 황금 버블: 한 개만 보유, 아이템 칸 제한 없이 저장
    if (!arr.find(h => h.type === 'rareBubble')) arr.push({ type: 'rareBubble' });
  } else {
    if (!arr.find(h => h.type === item.type) && _heldSlotCount(arr) < 3) arr.push(item);
  }
  return arr;
}

function tierLabel(tier) {
  return { normal: t('market.tierNormal'), rare: t('market.tierRare'), legend: t('market.tierLegend'), mythic: t('market.tierMythic') }[tier] || tier;
}

// 운명의 주사위 — 구매 즉시 결과가 나오는 도박성 소모템. 가중치 순서대로 굴려 첫 당첨
// 구간에 해당하는 효과를 save에 바로 적용하고, 결과 안내 토스트 문구를 반환한다.
// 펫구매/펫강화/방패강화 세 항목은 상태에 따라 아예 목록에서 빠질 수 있는데(이미
// 최대치라 더 줄 게 없는 경우), 그 확률만큼은 그냥 사라진다 — 안전망(table[0], "꽝")이
// 남는 확률을 자연스럽게 흡수하므로 나머지 가중치를 다시 100으로 맞출 필요는 없다.
function _rollDiceOfFate() {
  if (!save.persistentBonus) save.persistentBonus = { extraLives:0, extraTime:0, speedLevel:0, gunLevel:0, swordLevel:0, bulletLevel:0 };
  const pb = save.persistentBonus;
  const petCap = getUpgradeCaps().pet;

  const table = [
    // 당첨 포인트는 전부 기존의 10배로 책정 (가중치/확률은 그대로).
    { weight: 39, apply: () => t('market.dice.bust') },
    { weight: 25, apply: () => { save.totalScore += 100000; return t('market.dice.small', { n: '100,000' }); } },
    { weight: 15, apply: () => { save.totalScore += 300000; return t('market.dice.small', { n: '300,000' }); } },
    { weight: 10, apply: () => { save.bonusLives = (save.bonusLives || 0) + 1; return t('market.dice.life'); } },
    { weight: 7,  apply: () => { save.totalScore += 1000000; return t('market.dice.big', { n: '1,000,000' }); } },
    { weight: 3,  apply: () => { save.totalScore += 3000000; return t('market.dice.jackpot', { n: '3,000,000' }); } },
  ];

  // 펫구매(1%) — 펫을 한 마리도 안 샀을 때만 등장. 사고 나면(마리 수와 무관하게)
  // 이 항목은 영영 사라지고, 대신 펫강화 항목이 등장한다.
  if ((pb.petCount || 0) === 0) {
    table.push({ weight: 1, apply: () => {
      pb.petCount = (pb.petCount || 0) + 1;
      return t('market.dice.pet');
    } });
  } else if ((pb.petLevel || 0) < petCap) {
    // 펫강화(2%) — 펫을 이미 보유 중일 때만 등장, 강화 상한(petCap)에 닿으면 사라진다.
    table.push({ weight: 2, apply: () => {
      pb.petLevel = Math.min(petCap, (pb.petLevel || 0) + 1);
      return t('market.dice.petUpgrade', { lv: pb.petLevel });
    } });
  }

  // 방패강화(1%) — 스테이지 시작 시 무적 시간 +1초. MYTHIC_SHIELD_MAX(100초)를
  // 넘기면 사라진다. 마켓의 "방패" 아이템과 완전히 같은 스탯을 올려준다.
  if ((pb.mythicShieldLevel || 0) < MYTHIC_SHIELD_MAX) {
    table.push({ weight: 1, apply: () => {
      pb.mythicShieldLevel = Math.min(MYTHIC_SHIELD_MAX, (pb.mythicShieldLevel || 0) + 1);
      return t('market.dice.shield', { sec: pb.mythicShieldLevel });
    } });
  }

  const roll = Math.random() * 100;
  let acc = 0;
  for (const entry of table) {
    acc += entry.weight;
    if (roll < acc) return entry.apply();
  }
  return table[0].apply(); // 안전망 — 가중치 합이 100 미만으로 남는 실수를 방지
}

function showMarket() {
  if (!save.totalScore) save.totalScore = 0;
  if (!save.persistentBonus) save.persistentBonus = { extraLives: 0, extraTime: 0, speedLevel: 0, gunLevel: 0, swordLevel: 0 };
  $('market-total-score').textContent = save.totalScore.toLocaleString();

  // 51단계 진입 후 처음 상점을 열었을 때 한 번만: 레어 상점 마감 · 신화 등급 해금 안내.
  if (save.stage >= MYTHIC_UNLOCK_STAGE && !save.mythicUnlockShown) {
    save.mythicUnlockShown = true;
    Storage.save(save);
    _showMarketToast(t('market.mythicUnlockToast'));
  }

  // Show persistent bonus summary
  const pb = save.persistentBonus;
  let pbSummary = $('market-pb-summary');
  if (!pbSummary) {
    pbSummary = document.createElement('div');
    pbSummary.id = 'market-pb-summary';
    pbSummary.className = 'market-pb-summary';
    $('market-item-list').before(pbSummary);
  }
  const pbParts = [];
  if (pb.extraLives > 0)  pbParts.push(t('market.pbExtraLives', { n: pb.extraLives }) + (pb.rareLifeSuspended ? t('market.pbSuspended') : ''));
  if (pb.extraTime  > 0)  pbParts.push(t('market.pbExtraTime', { n: pb.extraTime }));
  if (pb.speedLevel === 1) pbParts.push(t('market.pbEndureSpeed'));
  if (pb.speedLevel === 2) pbParts.push(t('market.pbTranscendSpeed'));
  if (pb.gunLevel    > 0) pbParts.push(t('market.pbGunLevel', { n: pb.gunLevel }));
  if (pb.bulletLevel > 0) pbParts.push(t('market.pbBulletLevel', { n: pb.bulletLevel }));
  if (pb.swordLevel  > 0) pbParts.push(t('market.pbSwordLevel', { n: pb.swordLevel }));
  if (pb.guardianOrb)     pbParts.push(t('market.pbGuardianOrb'));
  if (pb.phoenixHeart)    pbParts.push(t('market.pbPhoenixHeart'));
  if (pb.midasTouch)      pbParts.push(t('market.pbMidasTouch'));
  if (pb.territoryMark)   pbParts.push(t('market.pbTerritoryMark'));
  if (pb.mythicShieldLevel > 0) pbParts.push(t('market.pbMythicShield', { n: Math.min(pb.mythicShieldLevel, MYTHIC_SHIELD_MAX) }));
  if (pb.petCount > 0)    pbParts.push(t('market.pbPet', { n: pb.petCount, lv: pb.petLevel || 0 }));
  if (pb.repelChance > 0)  pbParts.push(t('market.pbRepelChance',  { n: Math.min(pb.repelChance,  REPEL_FREEZE_CHANCE_MAX) }));
  if (pb.freezeChance > 0) pbParts.push(t('market.pbFreezeChance', { n: Math.min(pb.freezeChance, REPEL_FREEZE_CHANCE_MAX) }));
  if (pb.gatherChance > 0) pbParts.push(t('market.pbGatherChance', { n: Math.min(pb.gatherChance, REPEL_FREEZE_CHANCE_MAX) }));
  if (pb.autoModeOwned) {
    const autoUpgLv = getAutoModeUpgradeLevel(pb);
    pbParts.push(t(autoUpgLv >= 2 ? 'market.pbAutoModeUpgraded2' : autoUpgLv >= 1 ? 'market.pbAutoModeUpgraded' : 'market.pbAutoMode'));
  }
  if (pb.mythicZeusOwned) pbParts.push(t('market.pbMythicZeusWrath', { n: (pb.mythicZeusLevel || 0) + 1 }));
  pbSummary.style.display = pbParts.length ? '' : 'none';
  pbSummary.innerHTML = pbParts.length
    ? `<b>${t('market.pbTitle')}</b><br>${pbParts.join(' · ')}` : '';

  const list = $('market-item-list');
  list.innerHTML = '';

  for (const mi of getMarketItems()) {
    const card = document.createElement('div');
    card.className = `market-card market-${mi.tier}`;
    const canAfford = save.totalScore >= mi.cost;
    card.innerHTML = `
      <span class="market-icon">${mi.icon}</span>
      <div class="market-info">
        <b class="market-name">${mi.name}</b>
        <span class="market-desc">${mi.desc}</span>
        <span class="market-tier-badge">${tierLabel(mi.tier)}</span>
      </div>
      <button class="market-buy-btn btn-primary" ${canAfford ? '' : 'disabled'}>
        ${mi.cost.toLocaleString()}pt
      </button>`;
    card.querySelector('.market-buy-btn').addEventListener('click', () => {
      if (save.totalScore < mi.cost) return;
      // 칼/총/번개/스피드처럼 "새로 얻을 때만" 보유 칸(최대 3칸)이 필요한 아이템은,
      // 결제 전에 칸 여유를 먼저 확인한다 — 안 그러면 칸이 없어 지급이 안 되는데도
      // 포인트만 빠져나가는 문제가 생긴다 (이미 보유 중이면 칸을 새로 안 쓰므로 통과).
      const NEW_SLOT_TYPES = ['sword', 'gun', 'lightning', 'zeusLightning', 'speed'];
      if (NEW_SLOT_TYPES.includes(mi.id) && !save.heldItems.some(h => h.type === mi.id)
          && _heldSlotCount(save.heldItems) >= 3) {
        _showMarketToast(t('market.slotFull'));
        return;
      }
      save.totalScore -= mi.cost;
      if (!save.persistentBonus) save.persistentBonus = { extraLives: 0, extraTime: 0, speedLevel: 0, gunLevel: 0, swordLevel: 0 };
      let diceToastMsg = null; // 운명의 주사위 결과 — 있으면 구매 토스트 대신 이걸 보여준다
      if (mi.id === 'splitCharge') {
        if (save.splitBuyStage !== save.stage) { save.splitBuyStage = save.stage; save.splitBuysCount = 0; }
        save.splitBuysCount = (save.splitBuysCount || 0) + 1;
        save.heldItems = _mergeHeldItem(save.heldItems, { type: 'split' });
      } else if (mi.id === 'extraLife') {
        save.bonusLives = (save.bonusLives || 0) + 1;
      } else if (mi.id === 'rareLife') {
        save.persistentBonus.extraLives = (save.persistentBonus.extraLives || 0) + 1;
      } else if (mi.id === 'rareClock') {
        save.persistentBonus.extraTime = (save.persistentBonus.extraTime || 0) + 20;
      } else if (mi.id === 'endureSpeed') {
        save.persistentBonus.speedLevel = 1;
      } else if (mi.id === 'transcendSpeed') {
        save.persistentBonus.speedLevel = 2;
      } else if (mi.id === 'guardianOrb') {
        // 신화 등급 영구템: 적과 부딪혀도 원위치로 돌아가지 않고 그리던 선을 유지한 채
        // 계속 땅따먹기할 수 있다 (목숨은 동일하게 1 깎임) — game.js _onLoseLife 참고.
        save.persistentBonus.guardianOrb = true;
      } else if (mi.id === 'phoenixHeart') {
        // 신화 등급 영구템: 목숨이 0이 되어도 스테이지당 1회 즉시 부활 — game.js _onLoseLife 참고.
        save.persistentBonus.phoenixHeart = true;
      } else if (mi.id === 'midasTouch') {
        // 신화 등급 영구템: 스테이지 클리어 보너스(시간/스테이지/영역/전멸) +30% — game.js _onStageClear 참고.
        save.persistentBonus.midasTouch = true;
      } else if (mi.id === 'territoryMark') {
        // 신화 등급 영구템: 클리어 판정 기준선을 75%→70%로 영구 하향 — startGame()의 clearThreshold 참고.
        save.persistentBonus.territoryMark = true;
      } else if (mi.id === 'autoMode') {
        // 신화 등급 영구템: 게임 중 토글로 켜고 끌 수 있는 자동 발사 — game.js init()의
        // autoModeOwned/toggleAutoMode() 참고. 구매 자체는 소지 여부만 켜둔다.
        save.persistentBonus.autoModeOwned = true;
      } else if (mi.id === 'autoModeUpgrade') {
        // 신화 등급 영구템: 오토모드 발사 속도를 초당 2발 → 4발로 올린다 — game.js _update()의
        // autoModeUpgradeLevel 참고.
        save.persistentBonus.autoModeUpgradeLevel = Math.max(1, getAutoModeUpgradeLevel(save.persistentBonus));
      } else if (mi.id === 'autoModeUpgrade2') {
        // 신화 등급 영구템: 오토모드 발사 속도를 초당 4발 → 6발로 올린다 — game.js _update()의
        // autoModeUpgradeLevel 참고.
        save.persistentBonus.autoModeUpgradeLevel = 2;
      } else if (mi.id === 'mythicZeusWrath') {
        // 신화 등급 영구템: 켜져 있으면 5초마다 자동으로 캐릭터 앞쪽에 제우스의
        // 번개를 내리친다 — game.js init()의 mythicZeusOwned 참고.
        save.persistentBonus.mythicZeusOwned = true;
      } else if (mi.id === 'mythicZeusWrathUpgrade') {
        // 신화 등급 영구템: 독립된 자동 발동 타이머를 하나 더 추가한다(최대 5강화)
        // — game.js _getZeusPeriods 참고.
        save.persistentBonus.mythicZeusLevel = Math.min(MYTHIC_ZEUS_MAX_LEVEL, (save.persistentBonus.mythicZeusLevel || 0) + 1);
      } else if (mi.id === 'mythicShield') {
        // 신화 등급 영구템: 스테이지 시작 시 무적 시간 +1초(최대 100초) — game.js init()의 shieldSeconds 참고.
        save.persistentBonus.mythicShieldLevel = Math.min(MYTHIC_SHIELD_MAX, (save.persistentBonus.mythicShieldLevel || 0) + 1);
      } else if (mi.id === 'pet') {
        // 신화 등급 영구템: 펫 1마리 추가(최대 PET_MAX_COUNT마리) — game.js init()의 petCount 참고.
        save.persistentBonus.petCount = Math.min(PET_MAX_COUNT, (save.persistentBonus.petCount || 0) + 1);
      } else if (mi.id === 'petUpgrade') {
        // 신화 등급 영구템: 펫강화 레벨 +1 — game.js의 _getPetPattern 참고.
        save.persistentBonus.petLevel = Math.min(getUpgradeCaps().pet, (save.persistentBonus.petLevel || 0) + 1);
      } else if (mi.id === 'repelCharm') {
        // 신화 등급 영구템: 다음 스테이지 발동 확률 +1%p(최대 100%) — startGame()의 repelChance 참고.
        save.persistentBonus.repelChance = Math.min(REPEL_FREEZE_CHANCE_MAX, (save.persistentBonus.repelChance || 0) + 1);
      } else if (mi.id === 'freezeCharm') {
        // 신화 등급 영구템: 다음 스테이지 발동 확률 +1%p(최대 100%) — startGame()의 freezeChance 참고.
        save.persistentBonus.freezeChance = Math.min(REPEL_FREEZE_CHANCE_MAX, (save.persistentBonus.freezeChance || 0) + 1);
      } else if (mi.id === 'gatherCharm') {
        // 신화 등급 영구템: 다음 스테이지 발동 확률 +1%p(최대 100%) — startGame()의 gatherChance 참고.
        save.persistentBonus.gatherChance = Math.min(REPEL_FREEZE_CHANCE_MAX, (save.persistentBonus.gatherChance || 0) + 1);
      } else if (mi.id === 'diceOfFate') {
        // 소모템: 구매 즉시 결과가 나오는 도박성 아이템 — 별도 토스트로 결과를 안내한다.
        diceToastMsg = _rollDiceOfFate();
      } else if (mi.id === 'swordUpgrade') {
        const ex = save.heldItems.find(h => h.type === 'sword');
        if (ex) ex.count = 2;
      } else if (mi.id === 'ammo') {
        save.heldItems = _mergeHeldItem(save.heldItems, { type: 'gun', ammo: 5 });
      } else if (mi.id === 'speed') {
        save.heldItems = _mergeHeldItem(save.heldItems, { type: 'speed', level: 1, singleUse: true });
      } else if (mi.id === 'gunUpgrade') {
        if (!save.persistentBonus) save.persistentBonus = { extraLives:0, extraTime:0, speedLevel:0, gunLevel:0, swordLevel:0, bulletLevel:0 };
        save.persistentBonus.gunLevel = Math.min(getUpgradeCaps().gun, (save.persistentBonus.gunLevel||0) + 1);
        save.heldItems = _mergeHeldItem(save.heldItems, { type:'gun', ammo:10 });
      } else if (mi.id === 'bulletUpgrade') {
        if (!save.persistentBonus) save.persistentBonus = { extraLives:0, extraTime:0, speedLevel:0, gunLevel:0, swordLevel:0, bulletLevel:0 };
        save.persistentBonus.bulletLevel = Math.min(getUpgradeCaps().bullet, (save.persistentBonus.bulletLevel||0) + 1);
      } else if (mi.id === 'swordLevelUp') {
        if (!save.persistentBonus) save.persistentBonus = { extraLives:0, extraTime:0, speedLevel:0, gunLevel:0, swordLevel:0 };
        save.persistentBonus.swordLevel = Math.min(getUpgradeCaps().sword, (save.persistentBonus.swordLevel||0) + 1);
        save.heldItems = _mergeHeldItem(save.heldItems, { type:'sword', count:1 });
      } else {
        save.heldItems = _mergeHeldItem(save.heldItems, { type: mi.id });
      }
      Storage.save(save);
      updateMainStats();
      showMarket();
      _showMarketToast(diceToastMsg || t('market.buyToast', { icon: mi.icon, name: mi.name }));
    });
    list.appendChild(card);
  }
  _switchMarketTab(_marketActiveTab);
  show('market');
}

// ── 악세사리 탭 (코스메틱 전용, 레벨 50 이상 해금) ───────────────
// 카테고리(모자/옷/악세사리/신발)당 하나만 착용 가능. 구매하려면 포인트뿐 아니라
// 아이템마다 정해진 횟수만큼 광고도 봐야 한다(accessories.js의 ads 필드) — 진행도는
// save.accessoryAdProgress[아이템id]에 개별로 쌓인다(카테고리 공용이 아님).
let _marketActiveTab = 'items';
function _switchMarketTab(tab) {
  _marketActiveTab = tab;
  $('market-tab-items').classList.toggle('active', tab === 'items');
  $('market-tab-accessories').classList.toggle('active', tab === 'accessories');
  $('market-item-list').classList.toggle('hidden', tab !== 'items');
  $('market-accessory-list').classList.toggle('hidden', tab !== 'accessories');
  if (tab === 'accessories') renderAccessoryTab();
}
$('market-tab-items').onclick       = () => _switchMarketTab('items');
$('market-tab-accessories').onclick = () => _switchMarketTab('accessories');

function renderAccessoryTab() {
  const list = $('market-accessory-list');
  list.innerHTML = '';
  const level = save.bestStage || 0;
  if (level < ACCESSORY_LEVEL_REQUIREMENT) {
    const note = document.createElement('div');
    note.className = 'accessory-locked-note';
    note.textContent = t('accessory.locked', { level: ACCESSORY_LEVEL_REQUIREMENT });
    list.appendChild(note);
    return;
  }
  if (!save.accessoryOwned) save.accessoryOwned = [];
  if (!save.accessoryEquipped) save.accessoryEquipped = {};
  if (!save.accessoryAdProgress) save.accessoryAdProgress = {};

  for (const category of ACCESSORY_CATEGORIES) {
    const catLabel = document.createElement('div');
    catLabel.className = 'accessory-category-label';
    catLabel.textContent = t(`accessory.category.${category}`);
    list.appendChild(catLabel);

    for (const item of ACCESSORIES.filter(a => a.category === category)) {
      const owned    = save.accessoryOwned.includes(item.id);
      const equipped = save.accessoryEquipped[category] === item.id;
      const adProgress = Math.min(item.ads, save.accessoryAdProgress[item.id] || 0);
      const adsReady  = adProgress >= item.ads;
      const canAfford = save.totalScore >= item.cost;

      const card = document.createElement('div');
      card.className = `market-card market-mythic accessory-card${equipped ? ' equipped' : ''}`;
      card.innerHTML = `
        <span class="market-icon">${item.icon}</span>
        <div class="market-info">
          <b class="market-name">${t(`accessory.item.${item.id}.name`)}</b>
          <span class="market-desc">${t(`accessory.item.${item.id}.desc`)}</span>
          ${owned ? '' : `<div class="accessory-req-row">📺 ${adProgress}/${item.ads}${adsReady ? ' ✅' : ''}</div>`}
        </div>
        <div class="accessory-buy-col"></div>`;

      const buyCol = card.querySelector('.accessory-buy-col');
      if (owned) {
        const btn = document.createElement('button');
        btn.className = `market-buy-btn ${equipped ? 'btn-secondary' : 'btn-primary'}`;
        btn.textContent = equipped ? t('accessory.btnUnequip') : t('accessory.btnEquip');
        btn.addEventListener('click', () => {
          save.accessoryEquipped[category] = equipped ? null : item.id;
          if (game) game.equippedAccessories = save.accessoryEquipped;
          Storage.save(save);
          renderAccessoryTab();
        });
        buyCol.appendChild(btn);
      } else {
        if (!adsReady) {
          const adBtn = document.createElement('button');
          adBtn.className = 'accessory-ad-btn';
          adBtn.textContent = t('accessory.btnWatchAd');
          adBtn.addEventListener('click', () => _requestAccessoryAd(item));
          buyCol.appendChild(adBtn);
        }
        const buyBtn = document.createElement('button');
        buyBtn.className = 'market-buy-btn btn-primary';
        buyBtn.textContent = `${item.cost.toLocaleString()}pt`;
        buyBtn.disabled = !(adsReady && canAfford);
        buyBtn.addEventListener('click', () => {
          if (!(adsReady && canAfford)) return;
          save.totalScore -= item.cost;
          save.accessoryOwned.push(item.id);
          save.accessoryEquipped[category] = item.id; // 구매 즉시 장착
          if (game) game.equippedAccessories = save.accessoryEquipped;
          Storage.save(save);
          updateMainStats();
          renderAccessoryTab();
          _showMarketToast(t('market.buyToast', { icon: item.icon, name: t(`accessory.item.${item.id}.name`) }));
        });
        buyCol.appendChild(buyBtn);
      }
      list.appendChild(card);
    }
  }
}

let _accessoryAdInFlight = false;
function _requestAccessoryAd(item) {
  if (_accessoryAdInFlight) return;
  _accessoryAdInFlight = true;
  watchRewardAd({
    onReward: () => {
      const reward = computeNextAdReward(save.lastAdReward || 0);
      save.totalScore   = (save.totalScore || 0) + reward;
      save.lastAdReward = reward;
      // 이 광고도 "성공 시청"이므로 보관함 팩 해금용 누적 시청 횟수에도 함께 잡힌다.
      save.adWatchCount = (save.adWatchCount || 0) + 1;
      if (!save.accessoryAdProgress) save.accessoryAdProgress = {};
      save.accessoryAdProgress[item.id] = Math.min(item.ads, (save.accessoryAdProgress[item.id] || 0) + 1);
      Storage.save(save);
      updateMainStats();
      _accessoryAdInFlight = false;
      renderAccessoryTab();
      _showMarketToast(t('ads.rewardToast', { n: reward.toLocaleString() }));
    },
    onUnavailable: () => {
      _accessoryAdInFlight = false;
      _showMarketToast(t('ads.unavailable'));
    },
  });
}

function _showMarketToast(msg) {
  const toast = document.createElement('div');
  toast.className = 'ad-toast visible';
  toast.textContent = msg;
  document.body.appendChild(toast);
  setTimeout(() => { toast.classList.remove('visible'); setTimeout(() => toast.remove(), 400); }, 2200);
}

$('btn-main-market').onclick  = () => { marketReturnScreen = 'main';        showMarket(); };
$('btn-clear-market').onclick = () => { marketReturnScreen = 'stage-clear'; showMarket(); };
$('btn-main-ad').onclick  = requestRewardAd;
$('btn-clear-ad').onclick = requestRewardAd;
$('btn-back-market').onclick  = () => show(marketReturnScreen);

// ── Boot ─────────────────────────────────────────────────────
// 이동방식 토글 초기화 및 저장
const chkContinuous = $('chk-continuous-move');
const moveModeDesc  = $('move-mode-desc');
function updateMoveDesc() {
  moveModeDesc.textContent = chkContinuous.checked ? t('game.moveModeHold') : t('game.moveModeTap');
}
chkContinuous.addEventListener('change', () => {
  save.continuousMove = chkContinuous.checked;
  Storage.save(save);
  updateMoveDesc();
});

async function boot() {
  show('boot');
  save = Storage.load();
  save.rating = 'g'; // general only
  if (!save.heldItems) save.heldItems = [];
  if (!save.persistentBonus) save.persistentBonus = { extraLives: 0, extraTime: 0, speedLevel: 0, gunLevel: 0, swordLevel: 0 };
  // 스테이지 클리어 직후 특전/소장품 선택 화면으로 넘어가기 전에 모바일 백그라운드
  // 재로드 등으로 앱이 다시 시작된 경우, save에 저장해둔 대기 상태를 복구한다
  // (그렇지 않으면 100단계 특전 화면 등이 조용히 스킵된 것처럼 보임).
  pendingCollectionStage = save.pendingCollectionStage || 0;
  pendingRewardStage     = save.pendingRewardStage || 0;
  pendingGameComplete    = !!save.pendingGameComplete;
  chkContinuous.checked = !!save.continuousMove;
  updateMoveDesc();
  updateMainStats();
  // Warm up batch 0
  api.getBatchStatus(0).catch(() => {});

  await new Promise(r => setTimeout(r, 800));
  // save.pending*은 여기서 지우지 않는다 — 해당 화면을 실제로 완료했을 때만
  // 지워야, 화면에 머무는 동안(예: 특전 이미지 생성 실패) 새로고침해도 같은
  // 화면으로 복귀하며 진행 상황이 유실되지 않는다.
  if (pendingRewardStage > 0) {
    const s = pendingRewardStage;
    pendingRewardStage = 0;
    showRewardScreen(s);
  } else if (pendingCollectionStage > 0) {
    const s = pendingCollectionStage;
    pendingCollectionStage = 0;
    showCollectionPick(s);
  } else if (pendingGameComplete) {
    pendingGameComplete = false;
    show('main');
    showGameCompleteModal();
  } else {
    show('main');
  }
}

window.addEventListener('resize', () => { if (game?.running) resizeCanvas(); });

// 언어 전환 시 이미 렌더링된 동적 화면(마켓/갤러리/이동방식 표시 등)을 다시 그린다.
// data-i18n 정적 텍스트는 i18n.js의 applyI18n()이 자체적으로 처리한다.
onLangChange(() => {
  updateMainStats();
  updateMoveDesc();
  const activeScreen = screens.find(s => $(`screen-${s}`).classList.contains('active'));
  if (activeScreen === 'market') showMarket();
  if (activeScreen === 'gallery') showGallery();
});

boot();

// ── Debug panel (URL에 ?debug=1 포함 시 활성화) ──────────────
if (location.search.includes('debug')) {
  const ITEMS = [
    { type:'clock',     label:'⏰ 시간+20',    item:{ type:'clock',     large:false } },
    { type:'clock_L',   label:'⏰ 시간+40',    item:{ type:'clock',     large:true  } },
    { type:'bottle',    label:'💊 목숨+1',     item:{ type:'bottle',    large:false } },
    { type:'bottle_L',  label:'💊 목숨+2',     item:{ type:'bottle',    large:true  } },
    { type:'hourglass', label:'⏳ 슬로우',     item:{ type:'hourglass', large:false } },
    { type:'bubble',    label:'🫧 버블',       item:{ type:'bubble',    large:false } },
    { type:'shield',    label:'🛡 방패',       item:{ type:'shield',    large:false } },
    { type:'bomb',      label:'💣 폭탄',       item:{ type:'bomb',      large:false } },
    { type:'lightning', label:'⚡ 번개',       item:{ type:'lightning', large:false } },
    { type:'speed',     label:'💨 속도',       item:{ type:'speed',     large:false } },
    { type:'sword',     label:'⚔️ 칼',         item:{ type:'sword',     count:1     } },
    { type:'gun',       label:'🔫 총',         item:{ type:'gun',       ammo:10     } },
  ];

  const panel = document.createElement('div');
  panel.id = 'debug-panel';
  panel.innerHTML = `
    <div id="dbg-title">🛠 디버그</div>
    <div id="dbg-btns"></div>
    <hr style="border-color:#444;margin:6px 0">
    <button class="dbg-util" id="dbg-kill">☠ 적 전멸</button>
    <button class="dbg-util" id="dbg-fill">⬛ 영역 50%</button>
    <button class="dbg-util" id="dbg-stage1">↩ 스테이지 1</button>
  `;
  document.body.appendChild(panel);

  const style = document.createElement('style');
  style.textContent = `
    #debug-panel {
      position: fixed; right: 0; top: 50%; transform: translateY(-50%);
      z-index: 9999; background: rgba(10,5,25,0.92);
      border: 1px solid #c850c0; border-right: none;
      border-radius: 12px 0 0 12px;
      padding: 8px; width: 110px;
      display: flex; flex-direction: column; gap: 4px;
      font-family: 'Segoe UI', sans-serif;
    }
    #dbg-title { color:#c850c0; font-size:0.7rem; font-weight:800;
      text-align:center; letter-spacing:1px; margin-bottom:2px; }
    #dbg-btns { display:flex; flex-direction:column; gap:3px; }
    .dbg-item {
      background:#221545; color:#f0e6ff; border:1px solid #4158d030;
      border-radius:6px; padding:4px 6px; font-size:0.68rem;
      cursor:pointer; text-align:left; transition:background 0.1s;
    }
    .dbg-item:active { background:#c850c0; }
    .dbg-util {
      background:#1a0f35; color:#8a7aaa; border:1px solid #4158d030;
      border-radius:6px; padding:3px 6px; font-size:0.65rem;
      cursor:pointer; text-align:left; transition:color 0.1s;
    }
    .dbg-util:active { color:#ff4060; }
  `;
  document.head.appendChild(style);

  const btnsEl = document.getElementById('dbg-btns');
  for (const def of ITEMS) {
    const btn = document.createElement('button');
    btn.className = 'dbg-item';
    btn.textContent = def.label;
    btn.onclick = () => { if (game?.running) game._applyItem(def.item); };
    btnsEl.appendChild(btn);
  }

  document.getElementById('dbg-kill').onclick = () => {
    if (!game?.running) return;
    game.monsters = [];
    game.bullets  = [];
  };
  document.getElementById('dbg-fill').onclick = () => {
    if (!game?.running) return;
    // 내부 셀의 절반을 CAPTURED로 채움
    const g = game.grid;
    let count = 0;
    const half = Math.floor((g.cols - 2) * (g.rows - 2) * 0.5);
    for (let y = 1; y < g.rows - 1 && count < half; y++)
      for (let x = 1; x < g.cols - 1 && count < half; x++) {
        if (g.get(x, y) === 0) { g._s(x, y, 1); count++; }
      }
    game.fillPct = g.getFillPct();
  };
  document.getElementById('dbg-stage1').onclick = () => {
    save.stage = 1; save.heldItems = [];
    Storage.save(save);
    if (game?.running) { game.stop(); game = null; }
    show('main'); updateMainStats();
  };
}
