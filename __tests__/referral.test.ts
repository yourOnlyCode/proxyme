import { getReferralShareContent } from '../lib/referral';

describe('referral share content', () => {
  test('returns null when no friend code', () => {
    expect(getReferralShareContent(null)).toBeNull();
  });

  test('includes friend code + deep link + trendsetter wording', () => {
    const c = getReferralShareContent('ABC123');
    expect(c).not.toBeNull();
    expect(c?.friendCode).toBe('ABC123');
    expect(String(c?.deepLink)).toContain('proxybusiness://referral?code=ABC123');
    expect(String(c?.shareText).toLowerCase()).toContain('trendsetter');
  });
});

