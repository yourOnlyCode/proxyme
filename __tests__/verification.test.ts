import {
  REQUIRED_REFERRALS_FOR_TRENDSETTER,
  REQUIRED_SHARES_FOR_SUPER_USER,
  computeIsVerifiedFromAuthUser,
  isSuperUserByShareCount,
  isTrendsetterByReferralCount,
} from '../lib/verification';

describe('verification + social status helpers', () => {
  test('isSuperUserByShareCount', () => {
    expect(isSuperUserByShareCount(null)).toBe(false);
    expect(isSuperUserByShareCount(0)).toBe(false);
    expect(isSuperUserByShareCount(REQUIRED_SHARES_FOR_SUPER_USER - 1)).toBe(false);
    expect(isSuperUserByShareCount(REQUIRED_SHARES_FOR_SUPER_USER)).toBe(true);
    expect(isSuperUserByShareCount(REQUIRED_SHARES_FOR_SUPER_USER + 10)).toBe(true);
  });

  test('isTrendsetterByReferralCount', () => {
    expect(isTrendsetterByReferralCount(null)).toBe(false);
    expect(isTrendsetterByReferralCount(0)).toBe(false);
    expect(isTrendsetterByReferralCount(REQUIRED_REFERRALS_FOR_TRENDSETTER - 1)).toBe(false);
    expect(isTrendsetterByReferralCount(REQUIRED_REFERRALS_FOR_TRENDSETTER)).toBe(true);
    expect(isTrendsetterByReferralCount(REQUIRED_REFERRALS_FOR_TRENDSETTER + 10)).toBe(true);
  });

  test('computeIsVerifiedFromAuthUser: true for google/apple providers', () => {
    const google = {
      app_metadata: { provider: 'google', providers: ['email', 'google'] },
      identities: [{ provider: 'google' }],
    } as any;
    expect(computeIsVerifiedFromAuthUser(google)).toBe(true);

    const apple = {
      app_metadata: { provider: 'apple', providers: ['apple'] },
      identities: [{ provider: 'apple' }],
    } as any;
    expect(computeIsVerifiedFromAuthUser(apple)).toBe(true);
  });

  test('computeIsVerifiedFromAuthUser: false for email-only', () => {
    const emailOnly = {
      app_metadata: { provider: 'email', providers: ['email'] },
      identities: [{ provider: 'email' }],
    } as any;
    expect(computeIsVerifiedFromAuthUser(emailOnly)).toBe(false);
  });
});

