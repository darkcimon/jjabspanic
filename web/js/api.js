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

  async rewardGenerate(userId, keywords) {
    const r = await fetch(`${this.base}/api/reward/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, keywords }),
    });
    if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.error || 'API error'); }
    return r.json();
  }
}
