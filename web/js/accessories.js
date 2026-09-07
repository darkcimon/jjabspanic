/**
 * accessories.js — "악세사리" 마켓 탭 카탈로그 (데이터만, 그림은 squirrel.js).
 *
 * 레벨(최고 스테이지) 50 이상부터 해금되는 코스메틱 전용 아이템. 카테고리당
 * 하나만 착용할 수 있고(모자/옷/악세사리/신발), 구매하려면 포인트와 별개로
 * 광고 시청 횟수(ads)도 그 아이템만큼 채워야 한다 — app.js의
 * accessoryAdProgress가 카테고리가 아니라 "아이템 id별"로 진행도를 따로 센다
 * (한 아이템의 시청 횟수를 다른 아이템에 재사용할 수 없음).
 */

export const ACCESSORY_LEVEL_REQUIREMENT = 50;
export const ACCESSORY_CATEGORIES = ['hat', 'outfit', 'accessory', 'shoes'];

// cost: 포인트 가격, ads: 구매에 필요한 누적 광고 시청 횟수 (1~10, 화려할수록/
// 비쌀수록 많이 요구).
export const ACCESSORIES = [
  { id: 'hat_bow',         category: 'hat',       cost: 200000,    ads: 1,  icon: '🎀' },
  { id: 'outfit_scarf',    category: 'outfit',    cost: 400000,    ads: 2,  icon: '🧣' },
  { id: 'acc_sunglasses',  category: 'accessory', cost: 600000,    ads: 3,  icon: '🕶️' },
  { id: 'shoes_sneakers',  category: 'shoes',     cost: 800000,    ads: 4,  icon: '👟' },
  { id: 'shoes_rocket',    category: 'shoes',     cost: 11000000,  ads: 7,  icon: '🚀' },
  { id: 'acc_wings',       category: 'accessory', cost: 14000000,  ads: 8,  icon: '🧚' },
  { id: 'outfit_cape',     category: 'outfit',    cost: 17000000,  ads: 9,  icon: '🦸' },
  { id: 'hat_crown',       category: 'hat',       cost: 20000000,  ads: 10, icon: '👑' },
];

export function getAccessory(id) {
  return ACCESSORIES.find(a => a.id === id) || null;
}

export function getAccessoriesByCategory(category) {
  return ACCESSORIES.filter(a => a.category === category);
}
