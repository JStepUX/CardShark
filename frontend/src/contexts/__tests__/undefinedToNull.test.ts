import { describe, it, expect } from 'vitest';
import { undefinedToNull } from '../SettingsContext';

describe('undefinedToNull', () => {
  it('converts undefined values to null', () => {
    expect(undefinedToNull({ a: 1, b: undefined })).toEqual({ a: 1, b: null });
  });

  it('preserves null, strings, numbers, and booleans', () => {
    const input = { a: null, b: 'hello', c: 42, d: true };
    expect(undefinedToNull(input)).toEqual(input);
  });

  it('preserves arrays as-is', () => {
    const input = { arr: [1, 2, 3] };
    expect(undefinedToNull(input)).toEqual(input);
  });

  it('recurses into nested objects', () => {
    const input = { outer: { inner: undefined, keep: 'yes' } };
    expect(undefinedToNull(input)).toEqual({ outer: { inner: null, keep: 'yes' } });
  });

  it('returns empty object for empty input', () => {
    expect(undefinedToNull({})).toEqual({});
  });

  it('survives JSON.stringify round-trip with null intact', () => {
    const converted = undefinedToNull({ templateId: undefined, provider: 'KoboldCPP' });
    const json = JSON.parse(JSON.stringify(converted));
    expect(json.templateId).toBeNull();
    expect(json.provider).toBe('KoboldCPP');
  });
});
