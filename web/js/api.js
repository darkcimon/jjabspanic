export class API {
  constructor(base = '') { this.base = base; }

  async getImage(stage, rating) {
    const r = await fetch(`${this.base}/api/image?stage=${stage}&rating=${rating}`);
    if (!r.ok) throw new Error('API error');
    return r.json();
  }

  async triggerBatch(batchIndex) {
    const r = await fetch(`${this.base}/api/batch/trigger`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ batchIndex }),
    });
    return r.json();
  }

  async getBatchStatus(batchIndex) {
    const r = await fetch(`${this.base}/api/batch/status?batchIndex=${batchIndex}`);
    return r.json();
  }

  async rewardToken(userId, stage) {
    const r = await fetch(`${this.base}/api/reward/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, stage }),
    });
    if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.error || 'API error'); }
    return r.json(); // { token }
  }

  async rewardGenerate(userId, keywords, token) {
    const r = await fetch(`${this.base}/api/reward/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, keywords, token }),
    });
    if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.error || 'API error'); }
    return r.json();
  }

  /**
   * "내 캐릭터 자랑하기" 랭킹 — 현재 통계를 보내고 세 지표(포인트/스테이지/점령율)의
   * 순위 + 표시용 전체 인원수를 돌려받는다.
   * @returns {Promise<{ totalUsers:number, score:{value,rank}, stage:{value,rank}, fillPct:{value,rank} }>}
   */
  async submitRank(userId, stats) {
    const r = await fetch(`${this.base}/api/rank`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, ...stats }),
    });
    if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.error || 'API error'); }
    return r.json();
  }
}
