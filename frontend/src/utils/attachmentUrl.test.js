import { afterEach, describe, expect, it } from 'vitest';
import { withAuthToken } from './attachmentUrl';

describe('attachmentUrl', () => {
  afterEach(() => {
    sessionStorage.clear();
  });

  it('adds sessionStorage token to protected file URLs', () => {
    sessionStorage.setItem('token', 'session-token');

    expect(withAuthToken('/api/files/abc')).toBe('/api/files/abc?token=session-token');
  });

  it('leaves public URLs unchanged without token', () => {
    expect(withAuthToken('/api/files/abc')).toBe('/api/files/abc');
  });
});
