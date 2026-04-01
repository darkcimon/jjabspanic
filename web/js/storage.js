const KEY = 'galspanic_save';

function generateId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  // HTTP(비보안 컨텍스트) 폴백
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });
}

export const Storage = {
  defaults() {
    return { stage: 1, bestStage: 0, rating: 'g', sexyUnlocked: true, gallery: [], heldItems: [], collection: [], continuousMove: false, userId: generateId(), totalScore: 0, bonusLives: 0, persistentBonus: { extraLives: 0, extraTime: 0, speedLevel: 0, gunLevel: 0, swordLevel: 0, bulletLevel: 0 } };
  },
  load() {
    try { return { ...this.defaults(), ...JSON.parse(localStorage.getItem(KEY)) }; }
    catch { return this.defaults(); }
  },
  save(data) { localStorage.setItem(KEY, JSON.stringify(data)); },
};
