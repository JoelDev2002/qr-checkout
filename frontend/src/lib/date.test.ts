import { describe, expect, it } from 'vitest';
import { formatDateLima, formatDateTimeLima } from './date';

describe('formatDateLima', () => {
  it('formats date in Lima timezone', () => {
    const date = new Date('2025-10-09T05:00:00Z');
    expect(formatDateLima(date)).toMatch(/^\d{2}\/\d{2}\/\d{4}$/);
  });
});

describe('formatDateTimeLima', () => {
  it('formats datetime in Lima timezone', () => {
    const date = new Date('2025-10-09T05:00:00Z');
    const formatted = formatDateTimeLima(date);
    expect(formatted).toContain('2025');
    expect(formatted).toContain(':');
  });
});

