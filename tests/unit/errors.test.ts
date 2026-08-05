import { describe, expect, it } from 'vitest';

import { errorMessage } from '@/utils/errors';

describe('errorMessage', () => {
  it('takes the message from a real Error', () => {
    // GIVEN a thrown Error
    const error = new Error('Termin konnte nicht gespeichert werden');

    // WHEN reading its message
    const message = errorMessage(error);

    // THEN the message comes through unchanged
    expect(message).toBe('Termin konnte nicht gespeichert werden');
  });

  it('stringifies anything else rather than rendering undefined', () => {
    // GIVEN values a throw can carry that are not Errors
    // WHEN reading a message from each
    // THEN each is stringified, so an alert never shows "undefined"
    expect(errorMessage('plain string')).toBe('plain string');
    expect(errorMessage(null)).toBe('null');
    expect(errorMessage({ code: 42 })).toBe('[object Object]');
  });
});
