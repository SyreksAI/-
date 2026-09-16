import { describe, expect, it } from 'vitest';
import { getUploadKind } from './uploadLimits';

describe('getUploadKind', () => {
  it('detects video by extension when mime is empty', () => {
    const file = { name: 'clip.mp4', type: '', size: 50 * 1024 * 1024 };
    expect(getUploadKind(file)).toBe('video');
  });

  it('detects video by extension for octet-stream', () => {
    const file = { name: 'clip.mov', type: 'application/octet-stream', size: 1024 };
    expect(getUploadKind(file)).toBe('video');
  });
});
