import { describe, expect, it } from 'bun:test';
import { DEFAULT_PLANET_HASH, NODE_COUNT } from './domain';
import { generatePlanet } from './planet';

describe('planet generation', () => {
  it('is deterministic for the same seed', () => {
    const a = generatePlanet('abc123');
    const b = generatePlanet('abc123');
    expect(a).toEqual(b);
  });

  it('normalizes empty seed to default hash for stable tests', () => {
    const fromEmpty = generatePlanet('');
    const fromDefault = generatePlanet(DEFAULT_PLANET_HASH);
    expect(fromEmpty.seed).toBe(DEFAULT_PLANET_HASH);
    expect(fromEmpty).toEqual(fromDefault);
  });

  it('creates 127 nodes with expected root and leaf intensities', () => {
    const planet = generatePlanet('depth-check');
    expect(planet.nodes).toHaveLength(NODE_COUNT);

    const root = planet.nodes[0];
    const last = planet.nodes[planet.nodes.length - 1];
    expect(root.id).toBe(1);
    expect(root.depth).toBe(0);
    expect(root.intensity).toBe(1);
    expect(last.id).toBe(127);
    expect(last.depth).toBe(6);
    expect(last.intensity).toBe(3);
  });
});
