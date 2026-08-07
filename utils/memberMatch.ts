/** Expanded before diacritics are stripped, otherwise "ü" would degrade to "u". */
const GERMAN_TRANSLITERATIONS: [RegExp, string][] = [
  [/ä/g, 'ae'],
  [/ö/g, 'oe'],
  [/ü/g, 'ue'],
  [/ß/g, 'ss'],
];

/**
 * A name reduced to a comparable form: lowercased, German characters expanded, remaining
 * diacritics dropped, punctuation treated as a token boundary, and tokens sorted so that
 * "Müller, Thomas" and "Thomas Mueller" come out identical.
 */
export function normalizeName(name: string): string {
  let value = name.toLowerCase().normalize('NFC');

  for (const [pattern, replacement] of GERMAN_TRANSLITERATIONS) {
    value = value.replace(pattern, replacement);
  }

  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .split(' ')
    .filter(Boolean)
    .sort()
    .join(' ');
}

export type MemberCandidate = {
  id: string;
  name: string;
  email: string;
  historical_shifts: number;
  is_admin: boolean;
  auth_id: string | null;
};

export type MatchReason = 'exact-email' | 'exact-name' | 'similar';

export type MatchSuggestion = {
  member: MemberCandidate;
  score: number;
  reason: MatchReason;
};

/**
 * Members who might be the person behind a registration, best first.
 *
 * Exact email or exact normalized name scores 1. Everything else is ranked by character-bigram
 * similarity and only suggested above a threshold, with a nudge for a shared surname. An admin
 * confirms every link, so a surplus suggestion costs a glance while a missing one costs a duplicate.
 */
export function findMemberCandidates(
  claim: { firstName: string; lastName: string; email: string },
  members: MemberCandidate[],
  limit = 3,
): MatchSuggestion[] {
  const claimedName = normalizeName(`${claim.firstName} ${claim.lastName}`);
  const claimedEmail = claim.email.trim().toLowerCase();
  const surnameTokens = normalizeName(claim.lastName).split(' ').filter(Boolean);

  const suggestions: MatchSuggestion[] = [];

  for (const member of members) {
    const memberName = normalizeName(member.name);

    if (claimedEmail.length > 0 && member.email.trim().toLowerCase() === claimedEmail) {
      suggestions.push({ member, score: 1, reason: 'exact-email' });
      continue;
    }

    if (claimedName.length === 0) continue;

    if (memberName === claimedName) {
      suggestions.push({ member, score: 1, reason: 'exact-name' });
      continue;
    }

    const memberTokens = memberName.split(' ');
    const sharesSurname =
      surnameTokens.length > 0 && surnameTokens.every(token => memberTokens.includes(token));

    let score = diceSimilarity(claimedName, memberName);
    // A boost rather than a filter, so a mistyped surname does not hide the right candidate.
    if (sharesSurname) score = Math.min(0.99, score + 0.05);

    // Measured against this member list: a one-letter typo of the same person scores 0.883, a
    // two-error typo scores 0.696, a different person sharing a surname scores 0.512, a different
    // person sharing a given name scores 0.417, and an unrelated name scores 0.000. The
    // discriminating band is therefore 0.51 to 0.70, and 0.6 sits near its center. Lowering it
    // toward 0.5 would start surfacing same-surname strangers, which in a village club means
    // relatives, and a suggestion list padded with relatives trains the admin to click past it.
    if (score >= 0.6) {
      suggestions.push({ member, score, reason: 'similar' });
    }
  }

  return suggestions.sort((a, b) => b.score - a.score).slice(0, limit);
}

/**
 * Dice coefficient over character bigrams, chosen over an edit distance for being short and
 * stable against the transposed letters that make up most registration typos.
 */
function diceSimilarity(left: string, right: string): number {
  if (left === right) return 1;

  const leftPairs = bigrams(left);
  const rightPairs = bigrams(right);
  if (leftPairs.length === 0 || rightPairs.length === 0) return 0;

  const unmatched = [...rightPairs];
  let shared = 0;

  for (const pair of leftPairs) {
    const at = unmatched.indexOf(pair);
    if (at !== -1) {
      unmatched.splice(at, 1);
      shared += 1;
    }
  }

  return (2 * shared) / (leftPairs.length + rightPairs.length);
}

function bigrams(value: string): string[] {
  const compact = value.replace(/ /g, '');
  const pairs: string[] = [];

  for (let index = 0; index < compact.length - 1; index += 1) {
    pairs.push(compact.slice(index, index + 2));
  }

  return pairs;
}
