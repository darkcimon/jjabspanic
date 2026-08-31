// i18n.js — Language detection + translation for the whole web frontend.
//
// Rule: Korea (browser language starts with "ko") shows Korean, everyone
// else sees English. The user can override this from the main-screen
// language toggle; the override is remembered in localStorage.
//
// Usage:
//   import { t, getLang, setLang, applyI18n, onLangChange } from './i18n.js';
//   el.textContent = t('some.key');
//   el.textContent = t('some.key.withVar', { n: 5 });   // "{n}" placeholders
//   applyI18n(container);  // re-scan a subtree after inserting new DOM nodes

const STORAGE_KEY = 'de_lang';

const dict = {
  ko: {
    'brand.name': '짭스패닉',

    'common.stage': '스테이지',
    'common.back': '← 뒤로',
    'common.cancel': '취소',
    'common.confirm': '확인',
    'common.yes': '확인',
    'common.no': '아니오',
    'common.reset': '초기화',
    'common.skip': '건너뛰기',
    'common.nextStage': '다음 스테이지 →',
    'common.mainMenu': '메인 메뉴',
    'common.unlockAll': '전체 즉시 해금',
    'common.characterAlt': '캐릭터',

    'main.stageLabel': '현재 스테이지',
    'main.bestLabel': '최고',
    'main.totalScoreLabel': '누적 점수',
    'main.btnStart': '게임 시작',
    'main.btnMarket': '🛒 마켓',
    'main.btnGallery': '갤러리',
    'main.btnHelp': '도움말 / 조작법',
    'main.privacyLink': '개인정보처리방침',

    'game.moveModeLabel': '이동<br>방식',
    'game.moveModeTap': '탭',
    'game.moveModeHold': '유지',
    'game.bubbleTag': '🫧 버블',
    'game.rareBubbleTag': '🫧✨ 황금버블',

    'clear.complete': '완료',
    'clear.score': '점수',
    'clear.totalScore': '💰 누적 점수',
    'clear.fillRate': '점령률',
    'clear.timeLeft': '남은 시간',
    'clear.stageBonus': '🏆 스테이지 보너스',
    'clear.fillBonus': '📐 점령률 보너스',
    'clear.timeBonus': '⏱ 시간 보너스',
    'clear.allClearBonus': '💥 전멸 보너스',
    'clear.btnMarket': '🛒 마켓 (3,000pt~)',
    'clear.timeUnit': '초',

    'over.btnRetry': '다시 시도',
    'over.weaponWarning': '⚠️ 총·칼을 모두 잃었습니다',
    'over.weaponWarningText': '보유 중인 <strong>{parts}</strong> 장비 단계가 3단계 낮아졌습니다 ㅠ',
    'over.gunLevelPart': '🔫 총 {n}단',
    'over.bulletLevelPart': '🔵 총탄 {n}단',
    'over.swordLevelPart': '⚔️ 칼 {n}단',

    'reward.title': '특전 이미지',
    'reward.desc': '원하는 캐릭터를 자유롭게 묘사해 주세요<br><span class="reward-desc-sub">예) 파란 눈, 흰 드레스, 해변</span>',
    'reward.placeholder': '캐릭터 특징을 입력하세요 (최대 200자)',
    'reward.btnGenerate': '✨ 이미지 생성',
    'reward.loading': '이미지를 생성하는 중입니다…<br><span style="font-size:0.8rem;opacity:0.6">최대 30초 소요</span>',
    'reward.btnSave': '📥 갤러리에 저장',
    'reward.badge': '🎉 {n}스테이지 달성!',
    'reward.saved': '갤러리에 저장되었습니다',
    'reward.savedBtn': '✔ 저장됨',
    'reward.genError': '이미지 생성에 실패했습니다. 다시 시도해 주세요.',
    'reward.genUnavailable': '⚠️ 이미지 생성 불가',

    'help.title': '도움말',
    'help.tabs.how': '게임 방법',
    'help.tabs.tips': '공략',
    'help.tabs.items': '아이템',
    'help.tabs.enemies': '적',
    'help.tabs.market': '마켓',

    'help.how.goal.title': '🎯 목표',
    'help.how.goal.body': '제한 시간 안에 보드의 <b>75% 이상</b>을 점령하면 스테이지 클리어!',
    'help.how.controls.title': '🕹 조작',
    'help.how.controls.body': '<li><b>이동</b> — 방향 버튼 또는 화면 스와이프</li><li><b>칼 사용</b> — Z키 또는 아이템 버튼 탭</li><li><b>총 사용</b> — X키/스페이스바 또는 아이템 버튼 탭</li><li><b>번개</b> — 번개 버튼 탭 후 화면 터치</li>',
    'help.how.area.title': '📐 영역 점령',
    'help.how.area.body': '<li>경계선(흰 테두리)에서 출발해 이동하면 선이 그려집니다</li><li>다시 경계선에 닿으면 둘러싼 영역이 <b>한 번에 점령</b>됩니다</li><li>적이 없는 쪽이 점령 대상, 더 작은 쪽을 채우는 게 유리합니다</li>',
    'help.how.danger.title': '💀 위험 상황',
    'help.how.danger.body': '<li>선 위에 있을 때 <b>적 또는 탄환에 닿으면</b> 목숨 1 감소</li><li>경계·점령 영역 위에서는 적이 닿아도 안전합니다</li><li>목숨이 0이 되면 게임 오버</li><li>제한 시간이 0이 되면 게임 오버</li>',
    'help.how.tips.title': '⭐ 기타 팁',
    'help.how.tips.body': '<li>스테이지가 높아질수록 적이 많아지고 제한 시간이 줄어듭니다</li><li>10스테이지마다 <b>보스</b>가 등장합니다</li><li>10스테이지 클리어 시 <b>소장품</b> 이미지를 1장 선택할 수 있습니다</li>',

    'help.tips.summary.title': '🏆 핵심 공략 요약',
    'help.tips.summary.body': '스테이지를 클리어해 포인트를 모아 <b>총을 먼저 구입</b>하고, 장비를 업그레이드하면 훨씬 수월하게 진행할 수 있습니다!',
    'help.tips.step1.title': '💰 Step 1 — 포인트 모으기',
    'help.tips.step1.body': '<li>스테이지 클리어마다 <b>스테이지·시간·점령률 보너스</b>로 포인트 획득</li><li>스테이지가 높아질수록 <b>보너스 배율이 증가</b>해 포인트도 함께 늘어납니다</li><li>살아있는 적을 모두 없애고 클리어하면 <b>전멸 보너스</b>가 추가 지급됩니다</li>',
    'help.tips.step2.title': '🔫 Step 2 — 총 구입 (최우선)',
    'help.tips.step2.body': '<li>마켓에서 <b>총 (30,000pt)</b>을 가장 먼저 구입하는 것을 추천</li><li>총이 있으면 선을 긋지 않아도 적을 처치할 수 있어 <b>생존력이 크게 상승</b></li><li>총알 5발로 적 5마리를 처치하면 <b>탄약 5발 자동 충전</b> (빛나는 효과로 표시)</li><li>총탄 업그레이드 10단 초과 시 <b>적을 뚫고 지나가는 관통 효과</b> 발동</li>',
    'help.tips.step3.title': '⬆️ Step 3 — 장비 업그레이드 순서',
    'help.tips.step3.body': '<li><b>① 총 강화</b> — 데미지와 탄환 패턴이 강화됩니다. 단계가 높을수록 한 번에 여러 발</li><li><b>② 총탄 강화</b> — 총알 크기가 커져 적을 더 쉽게 맞출 수 있습니다</li><li><b>③ 칼 구입 / 칼 강화</b> — 칼로 5마리 처치 시 <b>"검사의 영혼"</b> 원형 범위 공격 발동</li><li><b>④ 생명의 정수 / 시간의 정수</b> — 매 스테이지 목숨·시간이 늘어 장기 생존에 유리</li>',
    'help.tips.region.title': '🗺️ 구간별 전략',
    'help.tips.region.body': '<li><b>1~9스테이지</b> — 기본기 연습. 작은 영역을 빠르게 여러 번 점령하는 것이 안전</li><li><b>10~29스테이지</b> — 슈터 등장. 선을 짧게 그어 탄환에 노출되는 시간을 줄이세요</li><li><b>30~49스테이지</b> — 미드보스 등장. 미드보스가 일반 몬스터를 흡수하기 전에 먼저 처리</li><li><b>50스테이지 이상</b> — 총·칼 없이는 점점 어려워집니다. 마켓 투자가 핵심</li><li><b>10단위 스테이지</b> — 보스 등장! 보스를 영역 안에 가두거나 총으로 집중 공격</li>',
    'help.tips.survival.title': '💡 생존 팁',
    'help.tips.survival.body': '<li>경계선(하얀 테두리)에 있으면 적에게 닿아도 안전 — 무리하지 말고 기다리세요</li><li>선을 짧게 여러 번 그으면 리스크가 줄어듭니다</li><li>💥 <b>분열 아이템</b>은 적이 적을 때 사용해야 유리합니다 (많아지면 역효과)</li><li>⬆️ <b>적 업그레이드 아이템</b>(빨간 화살표)은 절대 밟지 마세요!</li><li>모래시계(⏳)를 획득하면 느려진 틈에 대량 점령!</li>',
    'help.tips.allclear.title': '💥 전멸 보너스 — 적을 모두 없애면 대박!',
    'help.tips.allclear.body': '<li>스테이지 클리어 시 <b>살아있는 적이 0마리</b>이면 <b>전멸 보너스</b>가 추가 지급됩니다</li><li>보너스는 스테이지가 높아질수록 크게 증가 — 고스테이지에서 수만 pt 이상!</li><li>적이 없으면 어디든 자유롭게 점령 가능 → <b>점령률도 자연스럽게 올라갑니다</b></li><li>총·칼·번개 등 장비를 업그레이드해서 먼저 적을 처치한 뒤 영역을 넓히세요</li>',
    'help.tips.multiplier.title': '📈 스테이지별 보너스 배율',
    'help.tips.multiplier.body': '<li>스테이지 보너스 · 시간 보너스 · 점령률 보너스 모두 <b>10스테이지마다 +30%씩 증가</b> (기본 2배 지급 적용)</li><li>스테이지 10: 2.6배 / 스테이지 20: 3.2배 / 스테이지 50: 5.0배 / 스테이지 100: 8.0배</li><li>고스테이지에서 남은 시간이 많을수록 시간 보너스가 폭발적으로 커집니다</li><li>점령률 75% 초과분은 1%당 추가 pt, 94% 초과분은 더 높은 배율로 계산됩니다</li>',
    'help.tips.note': '💰 스테이지 클리어 → 포인트 → 총 구입 → 업그레이드 → 전멸 후 점령 → 고스테이지 도전!',

    'help.items.intro': '필드에 아이템이 등장합니다. 선 위에서 닿으면 획득!',
    'help.items.clock.name': '시계',
    'help.items.clock.desc': '남은 시간 +20초 / 대형 +40초',
    'help.items.potion.name': '회복약',
    'help.items.potion.desc': '목숨 +1 / 대형 +2',
    'help.items.hourglass.name': '모래시계',
    'help.items.hourglass.desc': '모든 적의 이동 속도 대폭 감소',
    'help.items.bubble.name': '버블',
    'help.items.bubble.desc': '선 위에 있어도 적에게 닿지 않음. 경계에 닿을 때까지 지속',
    'help.items.shield.name': '방패',
    'help.items.shield.desc': '무적 상태. 선 위에서 적에게 닿아도 목숨이 줄지 않음',
    'help.items.bomb.name': '폭탄',
    'help.items.bomb.desc': '화면 내 모든 적을 즉시 제거',
    'help.items.lightning.name': '번개',
    'help.items.lightning.desc': '번개 버튼 탭 후 화면을 터치한 위치에 번개 공격 (1회)',
    'help.items.speed.name': '스피드',
    'help.items.speed.desc': '이동 속도 3배. 아이템 버튼 탭으로 발동',
    'help.items.sword.name': '칼',
    'help.items.sword.desc': 'Z키 또는 탭으로 발동. <b>목숨 1 소모</b>하고 선 위 적 전부 제거',
    'help.items.gun.name': '총',
    'help.items.gun.desc': 'X키/스페이스바 또는 탭으로 발동. 탄환 10발 (중첩 시 최대 30발). 진행 방향으로 발사',
    'help.items.note': '💡 번개·스피드·칼·총은 획득 후 하단 슬롯에 보관 (최대 3개)',

    'help.tag.instant': '즉시',
    'help.tag.timed15': '15초',
    'help.tag.special': '특수',
    'help.tag.held': '보유',

    'help.enemies.intro': '적은 영역 안을 자유롭게 이동합니다. 선 위의 플레이어에게 닿으면 위험!',
    'help.enemies.normal.name': '일반 몬스터',
    'help.enemies.normal.desc': '기본 이동. 스테이지가 높아질수록 개수와 속도가 증가합니다',
    'help.enemies.shooter.name': '슈터 몬스터',
    'help.enemies.shooter.desc': '이동하면서 <b>탄환을 발사</b>합니다. 탄환에 선 위에서 맞아도 목숨이 감소합니다',
    'help.enemies.midboss.name': '미드보스',
    'help.enemies.midboss.desc': '일반 몬스터에 닿으면 <b>흡수해 덩치가 커집니다</b>. 합체할수록 강해지니 빨리 처리해야 합니다',
    'help.enemies.boss.name': '보스',
    'help.enemies.boss.desc': '<b>10스테이지마다</b> 등장. 거대한 무지개 블랙홀 형태로 빠르게 회전합니다. 100·200·300 스테이지의 보스는 더욱 거대합니다',
    'help.enemies.kill.title': '🗡 적 처치 방법',
    'help.enemies.kill.body': '<li><b>영역으로 가두기</b> — 적을 안에 넣고 점령하면 제거됩니다</li><li><b>폭탄 💣</b> — 화면 전체 적 즉시 제거</li><li><b>번개 ⚡</b> — 터치한 위치에 번개로 공격</li><li><b>칼 ⚔️</b> — 선 위 적 전체 제거 (목숨 1 소모)</li><li><b>총 🔫</b> — 진행 방향으로 탄환 발사</li>',

    'help.market.intro': '스테이지 점수를 누적해 마켓에서 아이템을 구입할 수 있습니다. 스테이지 클리어 화면 또는 메인 화면 → 🛒 마켓',
    'help.market.normal.body': '<li>⏱️ <b>시간 연장</b> — 다음 스테이지 시작 시 +20초 (중첩 가능)</li><li>💊 <b>회복약</b> — 다음 스테이지 시작 시 목숨 +1</li><li>💨 <b>스피드</b> — 다음 스테이지 1회 한정 2배 속도</li>',
    'help.market.rare.body': '<li>❤️‍🔥 <b>생명의 정수</b> (12,000pt) — 매 스테이지 목숨 +1 <b>영구</b>. 단, 목숨이 3 이상일 때만 발동. 목숨이 2가 되면 효과가 다음 스테이지까지 일시 중단. 중첩 구매 시 추가 목숨 증가 (2개 구매 → 매 스테이지 5목숨 시작)</li><li>🕰️ <b>시간의 정수</b> (10,000pt) — 매 스테이지 +20초 <b>영구</b>. 중첩 가능</li><li>💫 <b>인내의 속도</b> (15,000pt) — 매 스테이지 시작 시 2배 속도 <b>영구</b>. 목숨을 잃으면 해당 스테이지 해제, 다음 스테이지 재발동</li><li>🌀 <b>초월의 속도</b> (20,000pt) — 3배 속도 <b>완전 영구</b>. 목숨을 잃어도 유지</li>',
    'help.market.legend.body': '<li>⚔️ <b>칼</b> (30,000pt) — Z키/탭으로 선 위 적 처치 (목숨 2 이상 필요)</li><li>🗡️ <b>신검</b> (30,000pt) — 칼 강화: 사정거리·공격력 증가 (칼 보유 시 표시)</li><li>🔫 <b>총</b> (30,000pt) — X키/스페이스바/탭으로 탄환 5발 발사</li><li>🔫 <b>탄약 ×5</b> (10,000pt) — 총알 5발 추가 (총 보유 시 표시)</li><li>⚡ <b>번개</b> (10,000pt) — 번개 버튼 탭 후 화면 터치로 3×3 범위 공격. 중첩 가능</li><li>🌩️ <b>제우스의 번개</b> (15,000pt) — 5×5 초광역 번개. 번개보다 넓은 범위 파괴. 중첩 가능</li>',
    'help.market.note': '💡 레어·전설 아이템은 누적 점수로 구입하므로 고득점 플레이가 중요합니다!',

    'collection.title': '⭐ 소장품 선택',
    'collection.desc': '하나를 골라 소장하세요',
    'collection.btnConfirm': '소장하기',

    'gallery.title': '갤러리',
    'gallery.rewardBannerTitle': '🎁 특전 이미지',
    'gallery.rewardBannerDesc': '100/200/300스테이지 달성 특전',
    'gallery.myCollectionTitle': '⭐ 내 소장품',
    'gallery.myCollectionDesc': '10스테이지마다 직접 고른 이미지',
    'gallery.packATitle': '팩 A — 스테이지 1~100',
    'gallery.packBTitle': '팩 B — 스테이지 101~200',
    'gallery.packCTitle': '팩 C — 스테이지 201~300',
    'gallery.packAllTitle': '완전판 팩 — 전 스테이지',
    'gallery.packAllDesc': '팩 A+B+C 통합 할인',
    'gallery.unlockAllStagesBtn': '전 스테이지 즉시 해금',
    'gallery.btnBackMain': '← 메인',
    'gallery.locked': '🔒 잠김',
    'gallery.unlocked': '✅ 해금됨',
    'gallery.empty': '아직 해금된 이미지가 없습니다',
    'gallery.packUnlocked': '✔ 해금 완료',
    'gallery.packComingSoon': '준비중 (추후 광고로 해금 예정)',
    'gallery.rewardAlt': '특전 {n}스테이지',
    'gallery.rewardLabel': '{n}스테이지 특전',
    'gallery.collectionEmpty': '10스테이지를 클리어하면 소장품을 선택할 수 있습니다',
    'gallery.packEmpty': '스테이지 {from}~{to} 중 클리어한 스테이지가 없습니다',

    'collection.pickDesc': '스테이지 {from}~{to} 완료! 하나를 골라 소장하세요',
    'collection.unlimitedNote': '팩 구매자 — 무제한 소장',
    'collection.slotCount': '소장 {count} / {limit}',
    'collection.fullNote': '소장 공간이 가득 찼습니다 (최대 {limit}개). 새로 선택하면 가장 오래된 소장품을 덮어씁니다.',
    'collection.alreadyCollected': '✔ 소장 중',

    'payment.genericError': '결제 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.',
    'payment.failedOrCanceled': '결제가 취소되었거나 실패했습니다.',

    'modalReset.title': '진행 상황 초기화',
    'modalReset.desc': '모든 스테이지 진행, 포인트, 장비 업그레이드가<br><strong>완전히 삭제</strong>됩니다.<br>정말 초기화하시겠습니까?',

    'modalComplete.title': '🎉 게임 클리어!',
    'modalComplete.desc': '축하드립니다! 게임을 모두 클리어 하셨습니다.<br>게임을 계속 하시겠습니까?<br><span class="reward-desc-sub">아니오 선택 시 스테이지 1부터 새로 시작하며 갤러리·소장품·무기 정보가 초기화됩니다 (누적 점수는 유지)</span>',

    'market.title': '🛒 마켓',
    'market.scoreLabel': '보유 점수',
    'market.tierNormal': '일반',
    'market.tierRare': '레어',
    'market.tierLegend': '전설',
    'market.buy': '구입',
    'market.owned': '보유중',
    'market.notEnough': '포인트가 부족합니다',
    'market.buyConfirm': '{name}을(를) {cost}pt에 구입할까요?',
    'market.buySuccess': '{name} 구입 완료!',
    'market.buyToast': '{icon} {name} 구입!',

    'ads.btnLabel': '광고 보고 포인트 받기',
    'ads.rewardToast': '📺 광고 시청 완료! +{n}pt 획득',
    'ads.unavailable': '지금은 광고를 불러올 수 없어요. 잠시 후 다시 시도해주세요.',

    'market.pbTitle': '영구 효과',
    'market.pbExtraLives': '❤️‍🔥 매 스테이지 +{n} 목숨',
    'market.pbSuspended': ' ⚠️ 일시 중단 (목숨 부족)',
    'market.pbExtraTime': '🕰️ 매 스테이지 +{n}초',
    'market.pbEndureSpeed': '💫 인내의 속도 (2배) 보유',
    'market.pbTranscendSpeed': '🌀 초월의 속도 (3배) 보유',
    'market.pbGunLevel': '🔫 총 {n}단',
    'market.pbBulletLevel': '🔵 총탄 {n}단',
    'market.pbSwordLevel': '⚔️ 칼 {n}단',

    'market.item.timeboost.name': '시간 연장',
    'market.item.timeboost.desc': '+20초 (다음 스테이지 시작 시)',
    'market.item.extraLife.name': '회복약',
    'market.item.extraLife.desc': '목숨 +1 (다음 스테이지 시작 시)',
    'market.item.speed.name': '스피드',
    'market.item.speed.desc': '이동 속도 2배 (1스테이지)',
    'market.item.splitCharge.name': '분열 아이템',
    'market.item.splitCharge.desc': '게임 중 사용 시 현재 모든 적을 복제 (중첩 구매 가능)',
    'market.item.rareLife.name': '생명의 정수',
    'market.item.rareLife.desc': '매 스테이지 목숨 +1 (목숨 3 이상일 때만 발동, 누적 가능)',
    'market.item.rareClock.name': '시간의 정수',
    'market.item.rareClock.desc': '매 스테이지 +20초 (영구 축적)',
    'market.item.endureSpeed.name': '인내의 속도',
    'market.item.endureSpeed.desc': '매 스테이지 2배 속도 부여 (목숨 잃으면 해당 스테이지 해제)',
    'market.item.transcendSpeed.name': '초월의 속도',
    'market.item.transcendSpeed.desc': '3배 속도 영구 부여',
    'market.item.transcendSpeed.replaceNote': ' (인내의 속도 대체)',
    'market.item.sword.name': '칼',
    'market.item.sword.desc': 'Z키로 적 처치 (목숨 2 이상)',
    'market.item.swordUpgrade.name': '신검',
    'market.item.swordUpgrade.desc': '칼 강화: 사정거리·공격력 증가',
    'market.item.swordLevelUp.name': '칼 강화 ({from}→{to})',
    'market.item.swordLevelUp.desc': '칼 단계 업그레이드 ({to}/{max})',
    'market.unitLevel': '{n}단',
    'market.item.gun.name': '총',
    'market.item.gun.desc': 'X키/스페이스바로 총알 5발 발사',
    'market.item.ammo.name': '탄약 ×5',
    'market.item.ammo.desc': '총알 5발 추가',
    'market.item.lightning.name': '번개',
    'market.item.lightning.desc': '화면 탭으로 3×3 범위 번개 공격 (중첩 가능)',
    'market.item.zeusLightning.name': '제우스의 번개',
    'market.item.zeusLightning.desc': '5×5 초광역 번개 공격 (중첩 가능)',
    'market.item.rareBubble.name': '황금 버블',
    'market.item.rareBubble.desc': '피격 1회 방어 (스테이지 클리어 시 유지됨)',
    'market.item.gunUpgrade.name': '총 강화 ({from}→{to})',
    'market.item.gunUpgrade.desc': '{pattern} | 데미지 {dmg}',
    'market.item.gunUpgrade.labelBase': '기본',
    'market.item.bulletUpgrade.name': '총탄 강화 ({from}→{to})',
    'market.item.bulletUpgrade.desc': '총알 크기 {size}블록',

    'market.gunPattern.p2': '2발 연속',
    'market.gunPattern.p3': '3발 연속',
    'market.gunPattern.p3_45': '3발(±45°)',
    'market.gunPattern.p4': '4발(±20°,40°)',
    'market.gunPattern.p5': '5발(±30°,60°)',
    'market.gunPattern.p7': '7발 분산',
    'market.gunPattern.p8': '8발 분산',
    'market.gunPattern.p9': '9발 분산',
    'market.gunPattern.p10': '10발 분산',
    'market.gunPattern.p11': '11발 분산',

    'payment.purchaseCodeTitle': '구매 코드',
    'payment.purchaseCodeDesc': '이 코드를 안전한 곳에 보관하세요. 다른 기기에서 구매를 복구할 때 필요합니다.',
    'payment.restoreTitle': '구매 복구',
    'payment.restorePlaceholder': '구매 코드를 입력하세요',
    'payment.restoreBtn': '복구하기',
    'payment.restoreSuccess': '구매가 복구되었습니다!',
    'payment.restoreFail': '유효하지 않은 구매 코드입니다',
    'payment.paymentFail': '결제에 실패했습니다',
    'payment.paymentCanceled': '결제가 취소되었습니다',
    'payment.processing': '결제 처리 중입니다…',
    'payment.copy': '복사',
    'payment.copied': '복사되었습니다',
    'payment.redeemFailed': '복구에 실패했습니다.',
    'payment.serverUnreachable': '서버에 연결할 수 없습니다.',
    'payment.configLoadFailed': '결제 설정을 불러오지 못했습니다. 잠시 후 다시 시도해주세요.',
    'payment.prepFailed': '결제 준비 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.',

    'game.soulSword': '검사의 영혼',
    'game.ammoRecharge': '+5 탄약',
    'game.imageLoading': '이미지 로딩 중…',

    'toast.saved': '저장되었습니다',
    'toast.error': '오류가 발생했습니다',
    'toast.adNotReady': '광고를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요',
    'toast.adBlocked': '광고 차단 프로그램이 감지되었습니다',
    'toast.dailyLimitReached': '오늘의 광고 시청 횟수를 모두 사용했습니다',
  },

  en: {
    'brand.name': 'GalsPanic',

    'common.stage': 'Stage',
    'common.back': '← Back',
    'common.cancel': 'Cancel',
    'common.confirm': 'OK',
    'common.yes': 'Yes',
    'common.no': 'No',
    'common.reset': 'Reset',
    'common.skip': 'Skip',
    'common.nextStage': 'Next Stage →',
    'common.mainMenu': 'Main Menu',
    'common.unlockAll': 'Unlock All Now',
    'common.characterAlt': 'Character',

    'main.stageLabel': 'Current Stage',
    'main.bestLabel': 'Best',
    'main.totalScoreLabel': 'Total Score',
    'main.btnStart': 'Start Game',
    'main.btnMarket': '🛒 Market',
    'main.btnGallery': 'Gallery',
    'main.btnHelp': 'Help / Controls',
    'main.privacyLink': 'Privacy Policy',

    'game.moveModeLabel': 'Move<br>Mode',
    'game.moveModeTap': 'Tap',
    'game.moveModeHold': 'Hold',
    'game.bubbleTag': '🫧 Bubble',
    'game.rareBubbleTag': '🫧✨ Golden Bubble',

    'clear.complete': 'Complete',
    'clear.score': 'Score',
    'clear.totalScore': '💰 Total Score',
    'clear.fillRate': 'Capture Rate',
    'clear.timeLeft': 'Time Left',
    'clear.stageBonus': '🏆 Stage Bonus',
    'clear.fillBonus': '📐 Capture Bonus',
    'clear.timeBonus': '⏱ Time Bonus',
    'clear.allClearBonus': '💥 Annihilation Bonus',
    'clear.btnMarket': '🛒 Market (3,000pt~)',
    'clear.timeUnit': 's',

    'over.btnRetry': 'Retry',
    'over.weaponWarning': '⚠️ You lost your gun and sword',
    'over.weaponWarningText': 'Your <strong>{parts}</strong> gear dropped by 3 levels ㅠ',
    'over.gunLevelPart': '🔫 Gun Lv.{n}',
    'over.bulletLevelPart': '🔵 Bullet Lv.{n}',
    'over.swordLevelPart': '⚔️ Sword Lv.{n}',

    'reward.title': 'Bonus Image',
    'reward.desc': 'Describe the character however you like<br><span class="reward-desc-sub">e.g. blue eyes, white dress, beach</span>',
    'reward.placeholder': 'Describe the character (max 200 characters)',
    'reward.btnGenerate': '✨ Generate Image',
    'reward.loading': 'Generating your image…<br><span style="font-size:0.8rem;opacity:0.6">Takes up to 30 seconds</span>',
    'reward.btnSave': '📥 Save to Gallery',
    'reward.badge': '🎉 Reached Stage {n}!',
    'reward.saved': 'Saved to gallery',
    'reward.savedBtn': '✔ Saved',
    'reward.genError': 'Image generation failed. Please try again.',
    'reward.genUnavailable': '⚠️ Image generation unavailable',

    'help.title': 'Help',
    'help.tabs.how': 'How to Play',
    'help.tabs.tips': 'Strategy',
    'help.tabs.items': 'Items',
    'help.tabs.enemies': 'Enemies',
    'help.tabs.market': 'Market',

    'help.how.goal.title': '🎯 Goal',
    'help.how.goal.body': 'Capture <b>75% or more</b> of the board before time runs out to clear the stage!',
    'help.how.controls.title': '🕹 Controls',
    'help.how.controls.body': '<li><b>Move</b> — D-pad or swipe the screen</li><li><b>Use sword</b> — Z key or tap the item button</li><li><b>Use gun</b> — X key, Space, or tap the item button</li><li><b>Lightning</b> — tap the lightning button, then touch the screen</li>',
    'help.how.area.title': '📐 Capturing Area',
    'help.how.area.body': '<li>Move out from the boundary (white border) to draw a line</li><li>Touch the boundary again and the enclosed area is <b>captured all at once</b></li><li>The side without enemies is the one to capture — filling the smaller side is safer</li>',
    'help.how.danger.title': '💀 Danger',
    'help.how.danger.body': '<li>While on your line, <b>touching an enemy or a bullet</b> costs 1 life</li><li>On the boundary or captured area, touching an enemy is safe</li><li>Game over when lives reach 0</li><li>Game over when the timer reaches 0</li>',
    'help.how.tips.title': '⭐ Other Tips',
    'help.how.tips.body': '<li>Higher stages have more enemies and less time</li><li>A <b>boss</b> appears every 10 stages</li><li>Clearing every 10th stage lets you pick 1 <b>keepsake</b> image</li>',

    'help.tips.summary.title': '🏆 Quick Strategy Summary',
    'help.tips.summary.body': 'Clear stages to earn points, <b>buy the gun first</b>, then upgrade your gear — it makes everything much easier!',
    'help.tips.step1.title': '💰 Step 1 — Earn Points',
    'help.tips.step1.body': '<li>Every stage clear earns points from <b>stage, time, and capture-rate bonuses</b></li><li>Higher stages mean <b>bigger bonus multipliers</b>, so points scale up too</li><li>Clearing with zero enemies left alive grants an extra <b>Annihilation Bonus</b></li>',
    'help.tips.step2.title': '🔫 Step 2 — Buy the Gun (Top Priority)',
    'help.tips.step2.body': '<li>Buying the <b>Gun (30,000pt)</b> first is highly recommended</li><li>With a gun you can kill enemies without drawing a line — <b>survivability jumps massively</b></li><li>Kill 5 enemies with 5 bullets and you get <b>5 free bullets</b> auto-recharged (shown with a glow effect)</li><li>Upgrade the bullet past level 10 for a <b>piercing effect</b> that passes through enemies</li>',
    'help.tips.step3.title': '⬆️ Step 3 — Upgrade Order',
    'help.tips.step3.body': '<li><b>① Gun upgrade</b> — boosts damage and bullet pattern; higher levels fire multiple shots at once</li><li><b>② Bullet upgrade</b> — bigger bullets make it easier to hit enemies</li><li><b>③ Buy / upgrade Sword</b> — killing 5 enemies with the sword triggers <b>"Swordsman\'s Soul"</b>, a circular area attack</li><li><b>④ Essence of Life / Time</b> — more lives/time every stage, great for long-term survival</li>',
    'help.tips.region.title': '🗺️ Stage-Range Strategy',
    'help.tips.region.body': '<li><b>Stages 1–9</b> — practice the basics; capturing small areas quickly and repeatedly is safest</li><li><b>Stages 10–29</b> — shooters appear; keep lines short to reduce bullet exposure</li><li><b>Stages 30–49</b> — mid-bosses appear; take them down before they absorb regular monsters</li><li><b>Stage 50+</b> — gets much harder without a gun and sword; investing in the market is key</li><li><b>Every 10th stage</b> — a boss appears! Trap it inside a captured area or focus-fire it with the gun</li>',
    'help.tips.survival.title': '💡 Survival Tips',
    'help.tips.survival.body': '<li>Standing on the boundary (white border) is safe even if touched by an enemy — no need to rush</li><li>Drawing short lines repeatedly lowers risk</li><li>💥 The <b>split item</b> is best used when there are few enemies (it backfires if there are many)</li><li>⬆️ Never touch the <b>enemy-upgrade item</b> (red arrow)!</li><li>Grab an hourglass (⏳) and capture a big area while enemies are slowed!</li>',
    'help.tips.allclear.title': '💥 Annihilation Bonus — Wipe Them All for a Jackpot!',
    'help.tips.allclear.body': '<li>Clearing a stage with <b>0 enemies alive</b> grants an extra <b>Annihilation Bonus</b></li><li>The bonus grows sharply at higher stages — tens of thousands of points or more!</li><li>With no enemies left you can capture freely anywhere → <b>capture rate rises naturally too</b></li><li>Upgrade your gun, sword, and lightning to clear enemies first, then expand your territory</li>',
    'help.tips.multiplier.title': '📈 Bonus Multiplier by Stage',
    'help.tips.multiplier.body': '<li>Stage, time, and capture-rate bonuses all <b>increase by +30% every 10 stages</b> (base payout is already ×2)</li><li>Stage 10: ×2.6 / Stage 20: ×3.2 / Stage 50: ×5.0 / Stage 100: ×8.0</li><li>At high stages, more remaining time means an explosively bigger time bonus</li><li>Capture rate above 75% earns extra pt per 1%, and above 94% the rate is even higher</li>',
    'help.tips.note': '💰 Clear stage → earn points → buy gun → upgrade → annihilate & capture → push higher stages!',

    'help.items.intro': 'Items appear on the field. Touch one while on your line to pick it up!',
    'help.items.clock.name': 'Clock',
    'help.items.clock.desc': '+20s time / large: +40s',
    'help.items.potion.name': 'Potion',
    'help.items.potion.desc': '+1 life / large: +2',
    'help.items.hourglass.name': 'Hourglass',
    'help.items.hourglass.desc': 'Sharply slows all enemies\' movement',
    'help.items.bubble.name': 'Bubble',
    'help.items.bubble.desc': "Enemies can't touch you even on your line. Lasts until you reach the boundary",
    'help.items.shield.name': 'Shield',
    'help.items.shield.desc': "Invincible — touching an enemy on your line doesn't cost a life",
    'help.items.bomb.name': 'Bomb',
    'help.items.bomb.desc': 'Instantly removes every enemy on screen',
    'help.items.lightning.name': 'Lightning',
    'help.items.lightning.desc': 'Tap the lightning button, then touch the screen for a lightning strike (1 use)',
    'help.items.speed.name': 'Speed',
    'help.items.speed.desc': '3× move speed. Activate with the item button',
    'help.items.sword.name': 'Sword',
    'help.items.sword.desc': 'Activate with Z or tap. <b>Costs 1 life</b> and removes every enemy on your line',
    'help.items.gun.name': 'Gun',
    'help.items.gun.desc': 'Activate with X, Space, or tap. 10 bullets (up to 30 when stacked), fired in your facing direction',
    'help.items.note': '💡 Lightning, Speed, Sword, and Gun are kept in the bottom slots after pickup (max 3)',

    'help.tag.instant': 'Instant',
    'help.tag.timed15': '15s',
    'help.tag.special': 'Special',
    'help.tag.held': 'Held',

    'help.enemies.intro': 'Enemies roam freely inside the area. Touching a player on their line is dangerous!',
    'help.enemies.normal.name': 'Regular Monster',
    'help.enemies.normal.desc': 'Basic movement. Count and speed increase at higher stages',
    'help.enemies.shooter.name': 'Shooter Monster',
    'help.enemies.shooter.desc': 'Moves around while <b>firing bullets</b>. Getting hit while on your line also costs a life',
    'help.enemies.midboss.name': 'Mid-boss',
    'help.enemies.midboss.desc': 'Touching regular monsters <b>absorbs them and grows bigger</b>. It gets stronger the more it merges, so deal with it quickly',
    'help.enemies.boss.name': 'Boss',
    'help.enemies.boss.desc': 'Appears <b>every 10 stages</b>. A huge, fast-spinning rainbow black hole. Bosses at stage 100/200/300 are even bigger',
    'help.enemies.kill.title': '🗡 How to Defeat Enemies',
    'help.enemies.kill.body': '<li><b>Trap in an area</b> — capturing an area with an enemy inside removes it</li><li><b>Bomb 💣</b> — removes every enemy on screen instantly</li><li><b>Lightning ⚡</b> — strikes the touched location</li><li><b>Sword ⚔️</b> — removes every enemy on your line (costs 1 life)</li><li><b>Gun 🔫</b> — fires bullets in your facing direction</li>',

    'help.market.intro': 'Accumulate stage points to buy items in the market. Available from the Stage Clear screen or Main → 🛒 Market',
    'help.market.normal.body': '<li>⏱️ <b>Time Extension</b> — +20s at the start of the next stage (stackable)</li><li>💊 <b>Potion</b> — +1 life at the start of the next stage</li><li>💨 <b>Speed</b> — 2× speed for one stage</li>',
    'help.market.rare.body': '<li>❤️‍🔥 <b>Essence of Life</b> (12,000pt) — <b>permanent</b> +1 life every stage. Only active while lives are 3 or more; drops to 2 lives pauses the effect until the next stage. Stacks for more lives (buy 2 → start every stage with 5 lives)</li><li>🕰️ <b>Essence of Time</b> (10,000pt) — <b>permanent</b> +20s every stage. Stackable</li><li>💫 <b>Speed of Patience</b> (15,000pt) — <b>permanent</b> 2× speed at the start of every stage. Losing a life disables it for that stage, re-activates next stage</li><li>🌀 <b>Speed of Transcendence</b> (20,000pt) — <b>fully permanent</b> 3× speed, stays active even after losing a life</li>',
    'help.market.legend.body': '<li>⚔️ <b>Sword</b> (30,000pt) — Z/tap to kill enemies on your line (requires 2+ lives)</li><li>🗡️ <b>Divine Sword</b> (30,000pt) — sword upgrade: more range and power (shown once you own a sword)</li><li>🔫 <b>Gun</b> (30,000pt) — X/Space/tap to fire 5 bullets</li><li>🔫 <b>Ammo ×5</b> (10,000pt) — +5 bullets (shown once you own a gun)</li><li>⚡ <b>Lightning</b> (10,000pt) — tap the lightning button then touch the screen for a 3×3 strike. Stackable</li><li>🌩️ <b>Zeus\'s Lightning</b> (15,000pt) — a massive 5×5 lightning strike, wider than regular lightning. Stackable</li>',
    'help.market.note': '💡 Rare and Legendary items cost accumulated score, so high-score runs matter!',

    'collection.title': '⭐ Choose a Keepsake',
    'collection.desc': 'Pick one to keep',
    'collection.btnConfirm': 'Keep This',

    'gallery.title': 'Gallery',
    'gallery.rewardBannerTitle': '🎁 Bonus Images',
    'gallery.rewardBannerDesc': 'Rewards for reaching stage 100/200/300',
    'gallery.myCollectionTitle': '⭐ My Collection',
    'gallery.myCollectionDesc': 'Images you picked every 10 stages',
    'gallery.packATitle': 'Pack A — Stages 1–100',
    'gallery.packBTitle': 'Pack B — Stages 101–200',
    'gallery.packCTitle': 'Pack C — Stages 201–300',
    'gallery.packAllTitle': 'Complete Pack — All Stages',
    'gallery.packAllDesc': 'Bundle discount for Packs A+B+C',
    'gallery.unlockAllStagesBtn': 'Unlock All Stages Now',
    'gallery.btnBackMain': '← Main',
    'gallery.locked': '🔒 Locked',
    'gallery.unlocked': '✅ Unlocked',
    'gallery.empty': 'No images unlocked yet',
    'gallery.packUnlocked': '✔ Unlocked',
    'gallery.packComingSoon': 'Coming soon (will unlock via ads)',
    'gallery.rewardAlt': 'Bonus Stage {n}',
    'gallery.rewardLabel': 'Stage {n} Bonus',
    'gallery.collectionEmpty': 'Clear stage 10 to start picking keepsakes',
    'gallery.packEmpty': 'No cleared stages between {from}–{to} yet',

    'collection.pickDesc': 'Stages {from}–{to} complete! Pick one to keep',
    'collection.unlimitedNote': 'Pack owner — unlimited collection',
    'collection.slotCount': '{count} / {limit} collected',
    'collection.fullNote': 'Your collection is full (max {limit}). Picking a new one overwrites the oldest.',
    'collection.alreadyCollected': '✔ Collected',

    'payment.genericError': 'A payment error occurred. Please try again shortly.',
    'payment.failedOrCanceled': 'Payment was canceled or failed.',

    'modalReset.title': 'Reset Progress',
    'modalReset.desc': 'All stage progress, points, and equipment upgrades will be<br><strong>permanently deleted</strong>.<br>Are you sure you want to reset?',

    'modalComplete.title': '🎉 Game Cleared!',
    'modalComplete.desc': 'Congratulations! You\'ve cleared the entire game.<br>Would you like to continue playing?<br><span class="reward-desc-sub">Choosing No restarts from stage 1 and clears your gallery, collection, and equipment (your total points are kept)</span>',

    'market.title': '🛒 Market',
    'market.scoreLabel': 'Points',
    'market.tierNormal': 'Normal',
    'market.tierRare': 'Rare',
    'market.tierLegend': 'Legendary',
    'market.buy': 'Buy',
    'market.owned': 'Owned',
    'market.notEnough': 'Not enough points',
    'market.buyConfirm': 'Buy {name} for {cost}pt?',
    'market.buySuccess': '{name} purchased!',
    'market.buyToast': '{icon} {name} purchased!',

    'ads.btnLabel': 'Watch Ad for Points',
    'ads.rewardToast': '📺 Ad watched! +{n}pt earned',
    'ads.unavailable': "Couldn't load an ad right now. Please try again later.",

    'market.pbTitle': 'Permanent Effects',
    'market.pbExtraLives': '❤️‍🔥 +{n} life every stage',
    'market.pbSuspended': ' ⚠️ Paused (not enough lives)',
    'market.pbExtraTime': '🕰️ +{n}s every stage',
    'market.pbEndureSpeed': '💫 Speed of Patience (2×) owned',
    'market.pbTranscendSpeed': '🌀 Speed of Transcendence (3×) owned',
    'market.pbGunLevel': '🔫 Gun Lv.{n}',
    'market.pbBulletLevel': '🔵 Bullet Lv.{n}',
    'market.pbSwordLevel': '⚔️ Sword Lv.{n}',

    'market.item.timeboost.name': 'Time Extension',
    'market.item.timeboost.desc': '+20s (at the start of the next stage)',
    'market.item.extraLife.name': 'Potion',
    'market.item.extraLife.desc': '+1 life (at the start of the next stage)',
    'market.item.speed.name': 'Speed',
    'market.item.speed.desc': '2× move speed (1 stage)',
    'market.item.splitCharge.name': 'Split Item',
    'market.item.splitCharge.desc': 'Duplicates every current enemy when used in-game (stackable)',
    'market.item.rareLife.name': 'Essence of Life',
    'market.item.rareLife.desc': '+1 life every stage (only while lives are 3+, stackable)',
    'market.item.rareClock.name': 'Essence of Time',
    'market.item.rareClock.desc': '+20s every stage (permanent, stacks)',
    'market.item.endureSpeed.name': 'Speed of Patience',
    'market.item.endureSpeed.desc': '2× speed every stage (disabled for the stage if you lose a life)',
    'market.item.transcendSpeed.name': 'Speed of Transcendence',
    'market.item.transcendSpeed.desc': 'Permanent 3× speed',
    'market.item.transcendSpeed.replaceNote': ' (replaces Speed of Patience)',
    'market.item.sword.name': 'Sword',
    'market.item.sword.desc': 'Kill enemies with Z (requires 2+ lives)',
    'market.item.swordUpgrade.name': 'Divine Sword',
    'market.item.swordUpgrade.desc': 'Sword upgrade: increased range and power',
    'market.item.swordLevelUp.name': 'Sword Upgrade ({from}→{to})',
    'market.item.swordLevelUp.desc': 'Sword level up ({to}/{max})',
    'market.unitLevel': 'Lv.{n}',
    'market.item.gun.name': 'Gun',
    'market.item.gun.desc': 'Fire 5 bullets with X or Space',
    'market.item.ammo.name': 'Ammo ×5',
    'market.item.ammo.desc': '+5 bullets',
    'market.item.lightning.name': 'Lightning',
    'market.item.lightning.desc': '3×3 lightning strike on tap (stackable)',
    'market.item.zeusLightning.name': "Zeus's Lightning",
    'market.item.zeusLightning.desc': '5×5 mega lightning strike (stackable)',
    'market.item.rareBubble.name': 'Golden Bubble',
    'market.item.rareBubble.desc': 'Blocks 1 hit (carries over on stage clear)',
    'market.item.gunUpgrade.name': 'Gun Upgrade ({from}→{to})',
    'market.item.gunUpgrade.desc': '{pattern} | Damage {dmg}',
    'market.item.gunUpgrade.labelBase': 'Base',
    'market.item.bulletUpgrade.name': 'Bullet Upgrade ({from}→{to})',
    'market.item.bulletUpgrade.desc': 'Bullet size {size} blocks',

    'market.gunPattern.p2': '2-shot burst',
    'market.gunPattern.p3': '3-shot burst',
    'market.gunPattern.p3_45': '3-shot (±45°)',
    'market.gunPattern.p4': '4-shot (±20°,40°)',
    'market.gunPattern.p5': '5-shot (±30°,60°)',
    'market.gunPattern.p7': '7-shot spread',
    'market.gunPattern.p8': '8-shot spread',
    'market.gunPattern.p9': '9-shot spread',
    'market.gunPattern.p10': '10-shot spread',
    'market.gunPattern.p11': '11-shot spread',

    'payment.purchaseCodeTitle': 'Purchase Code',
    'payment.purchaseCodeDesc': 'Keep this code somewhere safe — you\'ll need it to restore your purchase on another device.',
    'payment.restoreTitle': 'Restore Purchase',
    'payment.restorePlaceholder': 'Enter your purchase code',
    'payment.restoreBtn': 'Restore',
    'payment.restoreSuccess': 'Purchase restored!',
    'payment.restoreFail': 'Invalid purchase code',
    'payment.paymentFail': 'Payment failed',
    'payment.paymentCanceled': 'Payment was canceled',
    'payment.processing': 'Processing payment…',
    'payment.copy': 'Copy',
    'payment.copied': 'Copied',
    'payment.redeemFailed': 'Restore failed.',
    'payment.serverUnreachable': 'Could not connect to the server.',
    'payment.configLoadFailed': 'Could not load payment settings. Please try again shortly.',
    'payment.prepFailed': 'An error occurred while preparing the payment. Please try again shortly.',

    'game.soulSword': "Swordsman's Soul",
    'game.ammoRecharge': '+5 Ammo',
    'game.imageLoading': 'Loading image…',

    'toast.saved': 'Saved',
    'toast.error': 'Something went wrong',
    'toast.adNotReady': 'Could not load the ad. Please try again shortly',
    'toast.adBlocked': 'Ad blocker detected',
    'toast.dailyLimitReached': "You've used all of today's ad views",
  },
};

function detectLang() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'ko' || stored === 'en') return stored;
  } catch (e) { /* localStorage unavailable */ }
  const nav = (navigator.language || navigator.userLanguage || 'en').toLowerCase();
  return nav.startsWith('ko') ? 'ko' : 'en';
}

let currentLang = detectLang();
const listeners = [];

export function getLang() {
  return currentLang;
}

export function setLang(lang) {
  currentLang = lang === 'ko' ? 'ko' : 'en';
  try { localStorage.setItem(STORAGE_KEY, currentLang); } catch (e) { /* ignore */ }
  document.documentElement.lang = currentLang;
  applyI18n();
  listeners.forEach(fn => { try { fn(currentLang); } catch (e) { console.error(e); } });
}

// Called whenever the language changes, so screens holding dynamically
// generated content (gallery grid, market list, etc.) can re-render.
export function onLangChange(fn) {
  listeners.push(fn);
}

export function t(key, vars) {
  const table = dict[currentLang] || dict.en;
  let str = table[key];
  if (str === undefined) str = dict.en[key];
  if (str === undefined) {
    console.warn('[i18n] missing key:', key);
    return key;
  }
  if (vars) {
    Object.keys(vars).forEach(k => {
      str = str.split(`{${k}}`).join(String(vars[k]));
    });
  }
  return str;
}

export function applyI18n(root) {
  const scope = root || document;
  scope.querySelectorAll('[data-i18n]').forEach(el => {
    el.textContent = t(el.getAttribute('data-i18n'));
  });
  scope.querySelectorAll('[data-i18n-html]').forEach(el => {
    el.innerHTML = t(el.getAttribute('data-i18n-html'));
  });
  scope.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
    el.setAttribute('placeholder', t(el.getAttribute('data-i18n-placeholder')));
  });
  scope.querySelectorAll('[data-i18n-alt]').forEach(el => {
    el.setAttribute('alt', t(el.getAttribute('data-i18n-alt')));
  });
  scope.querySelectorAll('[data-i18n-title]').forEach(el => {
    el.setAttribute('title', t(el.getAttribute('data-i18n-title')));
  });
}

document.documentElement.lang = currentLang;

document.addEventListener('DOMContentLoaded', () => {
  applyI18n();

  const toggleBtn = document.getElementById('btn-lang-toggle');
  const toggleLabel = document.getElementById('lang-toggle-label');
  const syncToggleLabel = () => {
    if (toggleLabel) toggleLabel.textContent = currentLang === 'ko' ? 'EN' : '한국어';
  };
  syncToggleLabel();
  onLangChange(syncToggleLabel);

  if (toggleBtn) {
    toggleBtn.addEventListener('click', () => {
      setLang(currentLang === 'ko' ? 'en' : 'ko');
    });
  }
});
