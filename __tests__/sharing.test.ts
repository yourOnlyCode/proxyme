// Note: recordAppShare is best-effort and must never throw.

describe('recordAppShare', () => {
  beforeEach(() => {
    jest.resetModules();
  });

  test('returns null when share_count column missing (42703)', async () => {
    jest.doMock('../lib/supabase', () => ({
      supabase: {
        from: () => ({
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: null, error: { code: '42703' } }),
            }),
          }),
        }),
      },
    }));

    let recordAppShare: any;
    jest.isolateModules(() => {
      recordAppShare = require('../lib/sharing').recordAppShare;
    });
    await expect(recordAppShare({ userId: 'u' })).resolves.toBeNull();
  });

  test('increments share_count and returns next value', async () => {
    const updateMock = jest.fn(async () => ({ error: null }));

    jest.doMock('../lib/supabase', () => ({
      supabase: {
        from: () => ({
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: { share_count: 2 }, error: null }),
            }),
          }),
          update: () => ({
            eq: updateMock,
          }),
        }),
      },
    }));

    let recordAppShare: any;
    jest.isolateModules(() => {
      recordAppShare = require('../lib/sharing').recordAppShare;
    });
    await expect(recordAppShare({ userId: 'u' })).resolves.toBe(3);
    expect(updateMock).toHaveBeenCalled();
  });
});

