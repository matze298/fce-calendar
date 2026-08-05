import { beforeEach, describe, expect, it, vi } from 'vitest';

import { checkAdminAccess } from '@/utils/adminGuard';

// Hoisted so the vi.mock factory below can reach them, since vi.mock is lifted above the imports.
const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  eq: vi.fn(),
  single: vi.fn(),
}));

vi.mock('@/utils/supabase', () => ({
  supabase: {
    auth: { getUser: mocks.getUser },
    from: () => ({
      select: () => ({
        eq: (column: string, value: string) => {
          mocks.eq(column, value);
          return { single: mocks.single };
        },
      }),
    }),
  },
}));

/** A signed-in user, with the members row the guard will find for them. */
function givenSignedInUser(profile: { is_admin: boolean; is_approved: boolean } | null): void {
  mocks.getUser.mockResolvedValue({ data: { user: { id: 'auth-1' } } });
  mocks.single.mockResolvedValue({ data: profile });
}

describe('checkAdminAccess', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('reports an unauthenticated visitor without looking for a profile', async () => {
    // GIVEN nobody is signed in
    mocks.getUser.mockResolvedValue({ data: { user: null } });

    // WHEN checking access
    const access = await checkAdminAccess();

    // THEN the visitor is unauthenticated, and no members lookup was attempted
    expect(access).toBe('unauthenticated');
    expect(mocks.single).not.toHaveBeenCalled();
  });

  it('reports forbidden when the signed-in user has no members row', async () => {
    // GIVEN a signed-in user whose email was never added as a member
    givenSignedInUser(null);

    // WHEN checking access
    // THEN they are forbidden rather than treated as an admin
    expect(await checkAdminAccess()).toBe('forbidden');
  });

  it('reports forbidden for an approved member who is not an admin', async () => {
    // GIVEN an ordinary approved member
    givenSignedInUser({ is_admin: false, is_approved: true });

    // WHEN checking access
    // THEN admin is still required
    expect(await checkAdminAccess()).toBe('forbidden');
  });

  it('reports forbidden for an admin who is not approved yet', async () => {
    // GIVEN an admin whose account is still awaiting approval
    givenSignedInUser({ is_admin: true, is_approved: false });

    // WHEN checking access
    // THEN approval is also required, so both flags have to hold
    expect(await checkAdminAccess()).toBe('forbidden');
  });

  it('reports ok for an approved admin', async () => {
    // GIVEN an approved admin
    givenSignedInUser({ is_admin: true, is_approved: true });

    // WHEN checking access
    // THEN they are allowed in
    expect(await checkAdminAccess()).toBe('ok');
  });

  it('matches the members row on auth_id rather than another column', async () => {
    // GIVEN an approved admin
    givenSignedInUser({ is_admin: true, is_approved: true });

    // WHEN checking access
    await checkAdminAccess();

    // THEN the lookup keys on the auth id, so a shared email cannot resolve to the wrong row
    expect(mocks.eq).toHaveBeenCalledWith('auth_id', 'auth-1');
  });
});
