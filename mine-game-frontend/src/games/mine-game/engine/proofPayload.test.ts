import { describe, expect, it } from 'bun:test';
import { MAX_MOVES } from './domain';
import { applyEngineAction, createInitialEngineState } from './headlessEngine';
import { buildProofPayload } from './proofPayload';

function createProveState(seed = 'proof-payload-seed') {
  const initial = createInitialEngineState({
    sessionId: 77,
    playerAddress: 'TEST',
    planetSeed: seed,
  });
  const confirmed = applyEngineAction(initial, {
    type: 'confirm_build',
    salt: 'salt-proof',
  }).state;
  const afterMove = applyEngineAction(confirmed, {
    type: 'move',
    direction: 'left',
    extract: true,
  }).state;
  return applyEngineAction(afterMove, { type: 'evacuate' }).state;
}

describe('proof payload builder', () => {
  it('builds deterministic payload with fixed-size arrays', () => {
    const proveState = createProveState();
    const a = buildProofPayload(proveState);
    const b = buildProofPayload(proveState);

    expect(a).toEqual(b);
    expect(a.publicInputs.moves).toHaveLength(MAX_MOVES);
    expect(a.publicOutputs.moveSequence).toHaveLength(MAX_MOVES);
    expect(a.publicOutputs.resourcesPerNode).toHaveLength(MAX_MOVES);
    expect(a.publicInputs.biomes).toHaveLength(127);
    expect(a.privateInputs.loadout).toHaveLength(10);
  });

  it('pads unused move slots with no-op values', () => {
    const proveState = createProveState();
    const payload = buildProofPayload(proveState);
    const moveCount = payload.publicInputs.numMoves;

    for (let i = moveCount; i < MAX_MOVES; i += 1) {
      expect(payload.publicInputs.moves[i]).toEqual([0, 0]);
      expect(payload.publicOutputs.moveSequence[i]).toBe(0);
      expect(payload.publicOutputs.resourcesPerNode[i]).toBe(0);
    }
  });

  it('encodes jettison outcome as 1 and evac intensity as 0', () => {
    let state = createInitialEngineState({
      sessionId: 88,
      playerAddress: 'TEST',
      planetSeed: 'jettison-proof-seed',
    });
    state = applyEngineAction(state, {
      type: 'confirm_build',
      salt: 'salt-proof-j',
    }).state;

    for (let i = 0; i < 6; i += 1) {
      state = applyEngineAction(state, {
        type: 'move',
        direction: i % 2 === 0 ? 'left' : 'up',
        extract: true,
      }).state;
    }

    const payload = buildProofPayload(state);
    expect(state.phase).toBe('prove');
    expect(payload.publicOutputs.outcome).toBe(1);
    expect(payload.publicOutputs.evacIntensity).toBe(0);
  });
});
