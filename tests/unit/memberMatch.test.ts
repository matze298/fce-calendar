import { describe, expect, it } from 'vitest';

import { normalizeName } from '@/utils/memberMatch';

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
});
