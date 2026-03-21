import { raceWithTimeout } from './transitionRuntime';

describe('raceWithTimeout', () => {
  it('resolves with the promise value when it completes before timeout', async () => {
    const result = await raceWithTimeout(Promise.resolve('done'), 5000);
    expect(result).toBe('done');
  });

  it('rejects with timeout error when promise takes too long', async () => {
    const slow = new Promise<string>((resolve) => {
      setTimeout(() => resolve('too late'), 10_000);
    });

    await expect(raceWithTimeout(slow, 50)).rejects.toThrow('timeout');
  });

  it('cleans up the timer when the promise resolves first', async () => {
    const clearSpy = vi.spyOn(globalThis, 'clearTimeout');

    await raceWithTimeout(Promise.resolve('fast'), 60_000);

    expect(clearSpy).toHaveBeenCalled();
    clearSpy.mockRestore();
  });
});
