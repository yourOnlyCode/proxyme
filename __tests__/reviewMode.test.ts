import { isReviewUser } from '../lib/reviewMode';

describe('reviewMode', () => {
  test('defaults to enabling review@proxyme.app when env not set', () => {
    const u = { email: 'review@proxyme.app' } as any;
    expect(isReviewUser(u)).toBe(true);
  });

  test('non-review user is false', () => {
    const u = { email: 'someone@example.com' } as any;
    expect(isReviewUser(u)).toBe(false);
  });
});

