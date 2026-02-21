import { describe, expect, it } from 'bun:test';
import { createDefaultLoadout } from './domain';
import { computeCommitment } from './commitment';

describe('commitment hashing', () => {
  it('is deterministic for the same loadout and salt', () => {
    const loadout = createDefaultLoadout();
    const a = computeCommitment(loadout, 'salt-1');
    const b = computeCommitment(loadout, 'salt-1');
    expect(a).toBe(b);
    expect(a.startsWith('keccak_')).toBe(true);
  });

  it('changes when salt changes', () => {
    const loadout = createDefaultLoadout();
    const a = computeCommitment(loadout, 'salt-1');
    const b = computeCommitment(loadout, 'salt-2');
    expect(a).not.toBe(b);
  });

  it('changes when loadout changes', () => {
    const loadout = createDefaultLoadout();
    const changed = {
      ...loadout,
      fuel_tank: 'enhanced' as const,
    };
    const a = computeCommitment(loadout, 'salt-1');
    const b = computeCommitment(changed, 'salt-1');
    expect(a).not.toBe(b);
  });
});
