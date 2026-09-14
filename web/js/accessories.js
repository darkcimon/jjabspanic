/**
 * accessories.js — "악세사리" 마켓 탭 카탈로그 (데이터만, 그림은 squirrel.js).
 *
 * 레벨(최고 스테이지) 기준으로 두 단계에 걸쳐 해금된다 — 기본 4종(리본모자/포근한
 * 목도리/멋쟁이 선글라스/깜찍한 운동화)은 50단계부터, 상위 4종(로켓부츠/요정날개/
 * 영웅의 망토/황금왕관)은 100단계부터. 카테고리(모자/옷/악세사리/신발)당 하나만
 * 착용할 수 있고, 구매하려면 포인트와 별개로 광고 시청 횟수(ads)도 그 아이템만큼
 * 채워야 한다 — app.js의 accessoryAdProgress가 카테고리가 아니라 "아이템 id별"로
 * 진행도를 따로 센다(한 아이템의 시청 횟수를 다른 아이템에 재사용할 수 없음).
 *
 * 순수 코스메틱이 아니라 각 아이템마다 작은 상시 스탯(stat)이 붙는다. 기존 신화
 * 등급 영구템(총/총탄/칼/펫/방패)과 역할이 겹치지 않도록 이동속도·아이템 등장
 * 빈도·피격 후 무적시간·최대 목숨·포인트 획득량 쪽을 담당한다 — game.js/app.js가
 * getAccessoryStatBonus()로 착용 중인 아이템의 스탯을 합산해 적용한다.
 */

export const ACCESSORY_LEVEL_REQUIREMENT = 50;
export const ACCESSORY_TIER2_LEVEL_REQUIREMENT = 100;
export const ACCESSORY_CATEGORIES = ['hat', 'outfit', 'accessory', 'shoes'];

// 4종 전부(모자+옷+악세사리+신발) 동시 착용 시 추가로 붙는 포인트 획득 보너스.
export const ACCESSORY_FULL_SET_POINT_BONUS = 0.05;

// stat.type별 의미:
//  - speedBonus:   이동속도 +N% (game.js _basePlayerSpeed)
//  - itemChance:   필드 아이템 등장 빈도 +N% (game.js _itemInterval 단축)
//  - invincibleBonus: 피격 후 무적시간 +N초 (game.js _onLoseLife invTimer)
//  - extraLife:    스테이지 시작 최대 목숨 +N (game.js init lives)
//  - pointBonus:   스테이지 클리어 포인트 획득 +N% (game.js _onStageClear)
//
// cost: 포인트 가격, ads: 구매에 필요한 누적 광고 시청 횟수 (1~10, 화려할수록/
// 비쌀수록 많이 요구), minLevel: 착용 가능한 최소 최고-스테이지.
export const ACCESSORIES = [
  { id: 'hat_bow',         category: 'hat',       cost: 200000,    ads: 1,  icon: '🎀',  minLevel: 50,  stat: { type: 'itemChance',      value: 0.10 } },
  { id: 'outfit_scarf',    category: 'outfit',    cost: 400000,    ads: 2,  icon: '🧣',  minLevel: 50,  stat: { type: 'invincibleBonus', value: 0.5 } },
  { id: 'acc_sunglasses',  category: 'accessory', cost: 600000,    ads: 3,  icon: '🕶️',  minLevel: 50,  stat: { type: 'pointBonus',      value: 0.05 } },
  { id: 'shoes_sneakers',  category: 'shoes',     cost: 800000,    ads: 4,  icon: '👟',  minLevel: 50,  stat: { type: 'speedBonus',      value: 0.05 } },
  { id: 'shoes_rocket',    category: 'shoes',     cost: 11000000,  ads: 7,  icon: '🚀',  minLevel: 100, stat: { type: 'speedBonus',      value: 0.12 } },
  { id: 'acc_wings',       category: 'accessory', cost: 14000000,  ads: 8,  icon: '🧚',  minLevel: 100, stat: { type: 'pointBonus',      value: 0.12 } },
  { id: 'outfit_cape',     category: 'outfit',    cost: 17000000,  ads: 9,  icon: '🦸',  minLevel: 100, stat: { type: 'extraLife',       value: 1 } },
  { id: 'hat_crown',       category: 'hat',       cost: 20000000,  ads: 10, icon: '👑',  minLevel: 100, stat: { type: 'itemChance',      value: 0.25 } },
];

export function getAccessory(id) {
  return ACCESSORIES.find(a => a.id === id) || null;
}

export function getAccessoriesByCategory(category) {
  return ACCESSORIES.filter(a => a.category === category);
}

/**
 * 착용 중인 악세사리들(카테고리별 1개씩) 중 지정한 stat.type을 가진 것들의
 * 값을 모두 합산한다.
 * @param {Record<string,string>} equipped  { hat: itemId, outfit: itemId, ... }
 * @param {string} statType
 * @returns {number}
 */
export function getAccessoryStatBonus(equipped, statType) {
  if (!equipped) return 0;
  let sum = 0;
  for (const category of ACCESSORY_CATEGORIES) {
    const item = getAccessory(equipped[category]);
    if (item && item.stat && item.stat.type === statType) sum += item.stat.value;
  }
  return sum;
}

/** 4개 카테고리 모두 착용했는지(풀세트 보너스 조건). */
export function isAccessoryFullSet(equipped) {
  if (!equipped) return false;
  return ACCESSORY_CATEGORIES.every(c => !!equipped[c]);
}
