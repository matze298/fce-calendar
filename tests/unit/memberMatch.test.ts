import { describe, expect, it } from 'vitest';

import { findMemberCandidates, normalizeName, type MemberCandidate } from '@/utils/memberMatch';

describe('normalizeName', () => {
  it('transliterates German umlauts rather than stripping them', () => {
    // GIVEN the two spellings of the same surname that a German club sees constantly
    // WHEN both are normalized
    // THEN they agree, which only holds if transliteration runs before diacritic stripping
    expect(normalizeName('Müller')).toBe('mueller');
    expect(normalizeName('Mueller')).toBe('mueller');
    expect(normalizeName('Müller')).toBe(normalizeName('Mueller'));
  });

  it('transliterates the remaining German special characters', () => {
    // GIVEN names carrying the other umlauts and an eszett
    // WHEN normalized
    // THEN each expands to its two-letter form
    expect(normalizeName('Bäcker')).toBe('baecker');
    expect(normalizeName('König')).toBe('koenig');
    expect(normalizeName('Weiß')).toBe('weiss');
  });

  it('strips non-German diacritics', () => {
    // GIVEN a name with an acute accent
    // WHEN normalized
    // THEN the bare letter remains
    expect(normalizeName('José')).toBe('jose');
  });

  it('ignores case, punctuation and word order', () => {
    // GIVEN the same person written three ways
    // WHEN each is normalized
    // THEN all three agree
    expect(normalizeName('Thomas Müller')).toBe('mueller thomas');
    expect(normalizeName('MÜLLER, Thomas')).toBe('mueller thomas');
    expect(normalizeName('  thomas   mueller  ')).toBe('mueller thomas');
  });

  it('treats a hyphenated surname as two tokens', () => {
    // GIVEN a double-barrelled surname
    // WHEN normalized
    // THEN the hyphen becomes a token boundary, so spelling it with a space also matches
    expect(normalizeName('Anna Meyer-Schulz')).toBe('anna meyer schulz');
    expect(normalizeName('Anna Meyer Schulz')).toBe('anna meyer schulz');
  });

  it('returns an empty string for empty input', () => {
    // GIVEN nothing, or only whitespace
    // WHEN normalized
    // THEN the result is empty rather than a stray space
    expect(normalizeName('')).toBe('');
    expect(normalizeName('   ')).toBe('');
  });

  it('normalizes a decomposed umlaut the same as its precomposed form', () => {
    // GIVEN the same name once precomposed and once spelled with a combining diaeresis
    // (Latin small letter u followed by U+0308) instead of the single precomposed ü character
    const precomposed = 'Müller';
    const decomposed = 'Müller';
    expect(precomposed).not.toBe(decomposed);

    // WHEN both are normalized
    // THEN they agree, because NFC composes the combining mark before the transliteration table
    // runs, so a decomposed input does not degrade to "muller" and miss the umlaut rule
    expect(normalizeName(decomposed)).toBe(normalizeName(precomposed));
    expect(normalizeName(decomposed)).toBe('mueller');
  });
});

function candidate(
  id: string,
  name: string,
  email: string,
  historical_shifts = 0,
  is_admin = false,
  auth_id: string | null = null,
): MemberCandidate {
  return { id, name, email, historical_shifts, is_admin, auth_id };
}

const MEMBERS: MemberCandidate[] = [
  candidate('1', 'Thomas Müller', 'thomas@mueller.de', 8),
  candidate('2', 'Sabine Schmidt', 'sabine@schmidt.de', 5),
  candidate('3', 'Anna Fischer', 'anna@fischer.de', 0),
];

describe('findMemberCandidates', () => {
  it('ranks an exact email match top and labels it as such', () => {
    // GIVEN a claim whose email matches a member exactly, but whose name does not
    const claim = { firstName: 'Tom', lastName: 'Miller', email: 'thomas@mueller.de' };

    // WHEN looking for candidates
    const [top] = findMemberCandidates(claim, MEMBERS);

    // THEN the email match wins, because it is the strongest signal available
    expect(top.member.id).toBe('1');
    expect(top.reason).toBe('exact-email');
    expect(top.score).toBe(1);
  });

  it('matches a name spelled with ue against the umlaut on file', () => {
    // GIVEN someone typing their own name without the umlaut
    const claim = { firstName: 'Thomas', lastName: 'Mueller', email: 'neu@example.de' };

    // WHEN looking for candidates
    const [top] = findMemberCandidates(claim, MEMBERS);

    // THEN it is recognized as an exact name match
    expect(top.member.id).toBe('1');
    expect(top.reason).toBe('exact-name');
    expect(top.score).toBe(1);
  });

  it('prefers the email label when name and email both match', () => {
    // GIVEN a claim matching one member on both signals
    const claim = { firstName: 'Thomas', lastName: 'Müller', email: 'thomas@mueller.de' };

    // WHEN looking for candidates
    const [top] = findMemberCandidates(claim, MEMBERS);

    // THEN the reason reports the stronger of the two
    expect(top.reason).toBe('exact-email');
  });

  it('surfaces a typo through similarity', () => {
    // GIVEN a claim with two transposed letters
    const claim = { firstName: 'Thoams', lastName: 'Mueler', email: 'neu@example.de' };

    // WHEN looking for candidates
    const suggestions = findMemberCandidates(claim, MEMBERS);

    // THEN the right member still appears, flagged as a near rather than exact match
    expect(suggestions[0].member.id).toBe('1');
    expect(suggestions[0].reason).toBe('similar');
    expect(suggestions[0].score).toBeLessThan(1);
  });

  it('suggests nobody for an unrelated name', () => {
    // GIVEN a claim resembling no member on file
    const claim = { firstName: 'Wolfgang', lastName: 'Habicht', email: 'neu@example.de' };

    // WHEN looking for candidates
    // THEN the threshold keeps the list empty rather than offering noise
    expect(findMemberCandidates(claim, MEMBERS)).toEqual([]);
  });

  it('boosts a shared surname over a shared given name', () => {
    // GIVEN two members each one letter away from the claim, mirrored: one mistypes the surname,
    // the other the given name. Both score 0.8333 on raw similarity, so the boost is the only
    // thing that can separate them.
    const members = [
      candidate('surname-typo', 'Thomas Muelier', 'a@example.de'),
      candidate('given-typo', 'Thomes Mueller', 'b@example.de'),
    ];

    const claim = { firstName: 'Thomas', lastName: 'Mueller', email: 'neu@example.de' };

    // WHEN looking for candidates
    const suggestions = findMemberCandidates(claim, members);

    // THEN the one whose surname matches exactly ranks first, because a shared surname carries
    // more signal than a shared given name
    expect(suggestions[0].member.id).toBe('given-typo');
    expect(suggestions[1].member.id).toBe('surname-typo');
  });

  it('honors the limit', () => {
    // GIVEN four members who all resemble the claim
    const members = [
      candidate('1', 'Thomas Mueller', 'a@example.de'),
      candidate('2', 'Thomas Muellar', 'b@example.de'),
      candidate('3', 'Thomas Mueler', 'c@example.de'),
      candidate('4', 'Thomas Muelller', 'd@example.de'),
    ];
    const claim = { firstName: 'Thomas', lastName: 'Mueller', email: 'neu@example.de' };

    // WHEN asking for two
    // THEN exactly two come back
    expect(findMemberCandidates(claim, members, 2)).toHaveLength(2);
  });

  it('returns nothing for an empty claim or an empty member list', () => {
    // GIVEN an empty claim, and separately an empty member list
    // WHEN looking for candidates
    // THEN neither produces a suggestion, and neither throws
    expect(findMemberCandidates({ firstName: '', lastName: '', email: '' }, MEMBERS)).toEqual([]);
    expect(
      findMemberCandidates({ firstName: 'Thomas', lastName: 'Mueller', email: 'a@b.de' }, []),
    ).toEqual([]);
  });
});
