import { beforeEach, describe, expect, it, vi } from 'vitest';

import { checkMemberAccess } from '@/utils/memberGuard';

// Hoisted so the vi.mock factory below can reach them, since vi.mock is lifted above the imports.
const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  eq: vi.fn(),
  maybeSingle: vi.fn(),
}));

vi.mock('@/utils/supabase', () => ({
  supabase: {
    auth: { getUser: mocks.getUser },
    from: () => ({
      select: () => ({
        eq: (column: string, value: string) => {
          mocks.eq(column, value);
          return { maybeSingle: mocks.maybeSingle };
        },
      }),
    }),
  },
}));

type Profile = { id: string; name: string; is_approved: boolean; is_admin: boolean };

/** A signed-in user, with the members row the guard will find for them. */
function givenSignedInUser(profile: Profile | null): void {
  mocks.getUser.mockResolvedValue({ data: { user: { id: 'auth-1' } } });
  mocks.maybeSingle.mockResolvedValue({ data: profile });
}

describe('checkMemberAccess', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('reports an unauthenticated visitor without looking for a profile', async () => {
    // GIVEN nobody is signed in
    mocks.getUser.mockResolvedValue({ data: { user: null } });

    // WHEN checking access
    const access = await checkMemberAccess();

    // THEN the visitor is unauthenticated, and no members lookup was attempted
    expect(access).toEqual({ state: 'unauthenticated' });
    expect(mocks.maybeSingle).not.toHaveBeenCalled();
  });

  it('reports pending when the account has no members row yet', async () => {
    // GIVEN someone who registered and whose claim an admin has not linked, so no members row
    // exists for them at all
    givenSignedInUser(null);

    // WHEN checking access
    // THEN they are pending rather than an error, because this is the normal post-registration state
    expect(await checkMemberAccess()).toEqual({ state: 'pending' });
  });

  it('reports pending for a linked member who is not approved', async () => {
    // GIVEN a member row that exists but has not been approved
    givenSignedInUser({ id: 'm-1', name: 'Mem Ber', is_approved: false, is_admin: false });

    // WHEN checking access
    // THEN the same pending state, because the difference does not matter to the reader
    expect(await checkMemberAccess()).toEqual({ state: 'pending' });
  });

  it('reports ok with the member identity for an approved member', async () => {
    // GIVEN an approved ordinary member
    givenSignedInUser({ id: 'm-1', name: 'Mem Ber', is_approved: true, is_admin: false });

    // WHEN checking access
    const access = await checkMemberAccess();

    // THEN the caller gets their identity, which the page needs to mark their own duties
    expect(access).toEqual({
      state: 'ok',
      member: { id: 'm-1', name: 'Mem Ber' },
      isAdmin: false,
    });
  });

  it('reports an approved admin as ok and flags them, so one query answers both questions', async () => {
    // GIVEN an approved admin
    givenSignedInUser({ id: 'm-9', name: 'Ada Admin', is_approved: true, is_admin: true });

    // WHEN checking access
    const access = await checkMemberAccess();

    // THEN they are a member like any other, and additionally flagged as an admin
    expect(access).toEqual({
      state: 'ok',
      member: { id: 'm-9', name: 'Ada Admin' },
      isAdmin: true,
    });
  });

  it('matches the members row on auth_id rather than another column', async () => {
    // GIVEN an approved member
    givenSignedInUser({ id: 'm-1', name: 'Mem Ber', is_approved: true, is_admin: false });

    // WHEN checking access
    await checkMemberAccess();

    // THEN the lookup keys on the auth id, so a shared email cannot resolve to the wrong row
    expect(mocks.eq).toHaveBeenCalledWith('auth_id', 'auth-1');
  });
});
