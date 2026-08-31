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
} from './config.js';
import { t, onLangChange } from './i18n.js';
import { computeNextAdReward, watchRewardAd } from './ads.js';

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
    } else if (item.type === 'gun') {
      game.useGun();
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

function updateHeldItemsBar(heldItems) {
  const bar = $('held-items-bar');
  bar.innerHTML = '';
  for (const item of heldItems) {
    if (item.type === 'speed' || item.type === 'timeboost') continue;
    bar.appendChild(makeHeldItemButton(item, game));
  }
}

// ── HUD ──────────────────────────────────────────────────────
function updateHUD({ fill, lives, time, stage, score = 0,
                     slowTimer = 0, shieldTimer = 0, bubbleActive = false,
                     rareBubbleActive = false, heldItems = [] }) {
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

  // Held items (only re-render if counts changed — simple approach: always rebuild)
  updateHeldItemsBar(heldItems);
}

// ── Game lifecycle ───────────────────────────────────────────
async function startGame(stage, rating, resumeState = null) {
  if (game) { game.stop(); game = null; }
  show('game');
  resizeCanvas();

  const canvas = $('game-canvas');
  game = new Game(canvas, { cols: COLS, rows: ROWS, playerSpeed: PLAYER_SPEED,
                             clearThreshold: CLEAR_THRESHOLD, serverUrl: '' });

  game.addEventListener('hud',        e => updateHUD(e.detail));
  game.addEventListener('stageClear', e => onStageClear(e.detail));
  game.addEventListener('gameOver',   e => onGameOver(e.detail));

  const mc = getMonsterCount(stage);
  const ms = getMonsterSpeed(stage);
  const tl = getTimeLimit(stage);
  const heldItems = save.heldItems || [];
  const pb = save.persistentBonus;
  await game.init(stage, rating, mc, ms, tl, heldItems, resumeState,
    { gunLevel: pb?.gunLevel||0, swordLevel: pb?.swordLevel||0, bulletLevel: pb?.bulletLevel||0 });
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
  if (stage % 10 === 0)  { pendingCollectionStage = stage; save.pendingCollectionStage = stage; }
  // 특전 이미지는 100/200/300단계 전용 — 300단계를 넘어 이어서 플레이할 때 400, 500...
  // 에서 다시 트리거되지 않도록 MAX_STAGE 이하일 때만 대기시킨다.
  if (stage % 100 === 0 && stage <= MAX_STAGE) { pendingRewardStage = stage; save.pendingRewardStage = stage; }
  // 300단계를 처음 클리어한 순간에만 "게임 클리어" 안내를 띄운다 (이어서 플레이를
  // 선택하면 스테이지는 계속 증가하므로 이후 루프에서는 다시 뜨지 않음 — 처음부터
  // 다시 시작을 선택해 재도전한 경우에만 재발생).
  if (stage === MAX_STAGE) {
    pendingGameComplete = true;
    save.pendingGameComplete = true;
  }

  if (stage > save.bestStage) save.bestStage = stage;
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

  // Canvas click/touch for lightning mode
  const _lightningFire = (clientX, clientY) => {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width  / rect.width;
    const scaleY = canvas.height / rect.height;
    g.triggerLightning((clientX - rect.left) * scaleX, (clientY - rect.top) * scaleY);
  };
  const onCanvasClick = e => {
    if (!g.lightningMode) return;
    e.preventDefault();
    _lightningFire(e.clientX, e.clientY);
  };
  const onCanvasTouchEnd = e => {
    if (!g.lightningMode) return;
    e.preventDefault();
    const t = e.changedTouches[0];
    _lightningFire(t.clientX, t.clientY);
  };
  canvas.addEventListener('click',    onCanvasClick);
  canvas.addEventListener('touchend', onCanvasTouchEnd, { passive: false });

  // Swipe on canvas
  let tx = 0, ty = 0;
  const onTS = e => { e.preventDefault(); tx = e.touches[0].clientX; ty = e.touches[0].clientY; };
  const onTM = e => {
    e.preventDefault();
    const dx = e.touches[0].clientX - tx, dy = e.touches[0].clientY - ty;
    if (Math.abs(dx) + Math.abs(dy) > 24) {
      if (Math.abs(dx) > Math.abs(dy)) g.setDirection(dx > 0 ? 1 : -1, 0);
      else g.setDirection(0, dy > 0 ? 1 : -1);
      tx = e.touches[0].clientX; ty = e.touches[0].clientY;
    }
  };
  const onTE = e => {
    if (g.lightningMode) return; // lightning touchend는 onCanvasTouchEnd가 처리
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
  if (e.target === $('img-lightbox') || e.target === $('img-lightbox-close')) closeLightbox();
});

/**
 * 팩 배너의 구매 버튼 상태를 갱신한다.
 * 구매 완료 시 버튼을 숨기고 완료 메시지를 표시.
 *
 * [팩 구매 보류] 광고를 통한 팩 해금으로 전환 검토 중이라 실 결제 구매는
 * 일단 막아둔다. 버튼은 항상 숨기고 "준비중" 안내만 보여준다.
 * 재개하려면 아래 else 분기를 원래 구현(주석 처리된 코드)으로 되돌리면 된다.
 */
function updatePackBanner(packId, owned) {
  const suffixMap = { pack_a: 'a', pack_b: 'b', pack_c: 'c', pack_all: 'all' };
  const suffix = suffixMap[packId];
  if (!suffix || suffix === 'all') return;

  const btn    = $(`btn-pack-${suffix}`);
  const status = $(`pack-${suffix}-status`);
  if (!btn || !status) return;

  if (owned) {
    btn.style.display    = 'none';
    status.textContent   = t('gallery.packUnlocked');
    status.classList.add('pack-owned');
  } else {
    // -- 구매 재개 시 아래로 원복 --
    // btn.style.display    = '';
    // status.textContent   = '';
    // status.classList.remove('pack-owned');
    btn.style.display    = 'none';
    status.textContent   = t('gallery.packComingSoon');
    status.classList.remove('pack-owned');
  }
}

// ── Collection Pick ──────────────────────────────────────────
const COLLECTION_LIMIT = 10;

function hasUnlimitedCollection(purchases) {
  return purchases.includes('pack_all') ||
    ['pack_a','pack_b','pack_c'].every(p => purchases.includes(p));
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
  const packOwned = purchases.includes('pack_all') || purchases.includes(packId);
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
    const owned = purchases.includes('pack_all') || purchases.includes(packId);
    updatePackBanner(packId, owned);
  }

  // 완전판 팩 버튼: 전체 구매 완료 시 숨김
  // [팩 구매 보류] 실 결제 구매를 막아두는 동안은 항상 숨김.
  const allOwned = purchases.includes('pack_all') ||
    (['pack_a', 'pack_b', 'pack_c'].every(p => purchases.includes(p)));
  const btnAll = $('btn-pack-all');
  // if (btnAll) btnAll.style.display = allOwned ? 'none' : '';
  if (btnAll) btnAll.style.display = 'none';

  // 팩별 그리드 렌더링
  for (const [packId, range] of Object.entries(PACK_RANGES)) {
    const suffix   = packId.replace('pack_', '');
    const gridEl   = $(`gallery-grid-${suffix}`);
    if (!gridEl) continue;
    gridEl.innerHTML = '';

    const packOwned = purchases.includes('pack_all') || purchases.includes(packId);

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
function proceedAfterReward() {
  if (pendingCollectionStage > 0) {
    const s = pendingCollectionStage;
    pendingCollectionStage = 0;
    save.pendingCollectionStage = 0;
    Storage.save(save);
    showCollectionPick(s);
  } else {
    advanceAfterClear();
  }
}

// 특전/소장품 화면을 모두 거친 뒤 다음 스테이지로 넘어가는 마지막 관문.
// 300단계 클리어 직후라면 다음 스테이지를 시작하는 대신 게임 클리어 안내를 띄운다.
function advanceAfterClear() {
  if (pendingGameComplete) {
    pendingGameComplete = false;
    save.pendingGameComplete = false;
    Storage.save(save);
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

  // 스테이지 클리어 직후 일회용 토큰 발급
  const rewardUserId = `${save.userId}_stage${completedStage}`;
  let rewardToken = null;
  try {
    const tokenData = await api.rewardToken(rewardUserId, completedStage);
    rewardToken = tokenData.token;
  } catch (e) {
    console.warn('[Reward] 토큰 발급 실패:', e.message);
    $('btn-reward-generate').disabled = true;
    $('btn-reward-generate').textContent = t('reward.genUnavailable');
  }

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
    const failGeneration = (msg) => {
      $('reward-loading').classList.add('hidden');
      $('reward-input-area').classList.remove('hidden');
      $('btn-reward-skip').classList.remove('hidden');
      $('btn-reward-generate').disabled = false;
      showAlert(msg || t('reward.genError'));
    };

    try {
      const data = await api.rewardGenerate(rewardUserId, keywords, rewardToken);
      if (!data.imageUrl) { failGeneration(); return; }

      const resultImg = $('reward-result-img');
      resultImg.onload = () => {
        resultImg.onload = null; resultImg.onerror = null;
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
      };
      resultImg.onerror = () => {
        resultImg.onload = null; resultImg.onerror = null;
        failGeneration();
      };
      resultImg.src = data.imageUrl;
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
  if (pendingRewardStage > 0) {
    const s = pendingRewardStage;
    pendingRewardStage = 0;
    save.pendingRewardStage = 0;
    Storage.save(save);
    showRewardScreen(s);
  } else if (pendingCollectionStage > 0) {
    const s = pendingCollectionStage;
    pendingCollectionStage = 0;
    save.pendingCollectionStage = 0;
    Storage.save(save);
    showCollectionPick(s);
  } else {
    advanceAfterClear();
  }
};
$('btn-collection-skip').onclick = () => advanceAfterClear();
$('btn-retry').onclick      = () => { save.heldItems = []; startGame(save.stage, save.rating); };
$('btn-back-menu').onclick  = () => show('main');
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
  save.totalScore = 0; save.bonusLives = 0;
  save.persistentBonus = { extraLives: 0, extraTime: 0, speedLevel: 0, gunLevel: 0, swordLevel: 0 };
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
  // save.stage는 onStageClear에서 이미 301로 증가해둔 상태 — 그대로 이어서 시작.
  startGame(save.stage, save.rating);
};
$('btn-complete-no').onclick = () => {
  $('modal-game-complete').classList.remove('active');
  save.stage = 1;
  save.gallery = [];
  save.collection = [];
  save.rewardImages = [];
  save.heldItems = [];
  save.persistentBonus = { extraLives: 0, extraTime: 0, speedLevel: 0, gunLevel: 0, swordLevel: 0, bulletLevel: 0 };
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

// ── Market ───────────────────────────────────────────────────
// 무기 강화(총/총탄/칼) 상한 — 1회차(1~300단계) 기준치. 300단계를 한 바퀴 돌 때마다
// 몹 체력이 직전 루프보다 2배씩 강해지는 것과 밸런스를 맞추기 위해, 루프마다
// (getLoopMultiplier) 2배씩 계속 풀린다.
const GUN_BASE_CAP = 111, BULLET_BASE_CAP = 100, SWORD_BASE_CAP = 100;
function getUpgradeCaps() {
  const mult = getLoopMultiplier(save.stage);
  return { gun: GUN_BASE_CAP * mult, bullet: BULLET_BASE_CAP * mult, sword: SWORD_BASE_CAP * mult };
}

function getMarketItems() {
  const pb      = save.persistentBonus || {};
  const speedLv = pb.speedLevel || 0;
  const hasSword = save.heldItems.some(h => h.type === 'sword');
  const hasGun   = save.heldItems.some(h => h.type === 'gun');
  // 스피드 부스트·황금버블은 중첩 보유가 안 되고(구매해도 효과가 없음) 스테이지를
  // 넘기거나(스피드) 터지면(황금버블) 소모되므로, 이미 보유 중일 때만 목록에서 숨긴다.
  const hasSpeedItem  = save.heldItems.some(h => h.type === 'speed');
  const hasRareBubble = save.heldItems.some(h => h.type === 'rareBubble');
  const caps = getUpgradeCaps();
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
    // Rare
    { id:'rareLife',       tier:'rare',   cost:12000, icon:'❤️‍🔥', name:t('market.item.rareLife.name'),  desc:t('market.item.rareLife.desc') },
    { id:'rareClock',      tier:'rare',   cost:10000, icon:'🕰️', name:t('market.item.rareClock.name'),  desc:t('market.item.rareClock.desc') },
  ];
  if (speedLv < 1) items.push(
    { id:'endureSpeed',    tier:'rare',   cost:15000, icon:'💫', name:t('market.item.endureSpeed.name'), desc:t('market.item.endureSpeed.desc') }
  );
  if (speedLv < 2) items.push(
    { id:'transcendSpeed', tier:'rare',   cost:20000, icon:'🌀', name:t('market.item.transcendSpeed.name'),
      desc:t('market.item.transcendSpeed.desc') + (speedLv===1 ? t('market.item.transcendSpeed.replaceNote') : '') }
  );
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
    const swCost = 5000 + Math.floor(swordLv / 5) * 1000;
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
    const gunCost = 3000 + Math.floor(gunLv / 5) * 1000;
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
  // Bullet upgrade — 총 보유 시에만 표시
  const bulletLv = (save.persistentBonus?.bulletLevel) || 0;
  if (hasGun && bulletLv < caps.bullet) {
    const bulletCost = 3000 + Math.floor(bulletLv / 5) * 1000;
    const bulletSz = Math.round((0.25 + (Math.min(bulletLv+1,caps.bullet)-1)/99*1.75)*10)/10;
    items.push({id:'bulletUpgrade', tier: bulletLv<10?'normal':bulletLv<50?'rare':'legend', cost:bulletCost, icon:'🔵',
      name: t('market.item.bulletUpgrade.name', { from: t('market.unitLevel', { n: bulletLv }), to: t('market.unitLevel', { n: bulletLv + 1 }) }),
      desc: t('market.item.bulletUpgrade.desc', { size: bulletSz }) });
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
  return { normal: t('market.tierNormal'), rare: t('market.tierRare'), legend: t('market.tierLegend') }[tier] || tier;
}

function showMarket() {
  if (!save.totalScore) save.totalScore = 0;
  if (!save.persistentBonus) save.persistentBonus = { extraLives: 0, extraTime: 0, speedLevel: 0, gunLevel: 0, swordLevel: 0 };
  $('market-total-score').textContent = save.totalScore.toLocaleString();

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
      _showMarketToast(t('market.buyToast', { icon: mi.icon, name: mi.name }));
    });
    list.appendChild(card);
  }
  show('market');
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
  if (pendingRewardStage > 0) {
    const s = pendingRewardStage;
    pendingRewardStage = 0;
    save.pendingRewardStage = 0;
    Storage.save(save);
    showRewardScreen(s);
  } else if (pendingCollectionStage > 0) {
    const s = pendingCollectionStage;
    pendingCollectionStage = 0;
    save.pendingCollectionStage = 0;
    Storage.save(save);
    showCollectionPick(s);
  } else if (pendingGameComplete) {
    pendingGameComplete = false;
    save.pendingGameComplete = false;
    Storage.save(save);
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
