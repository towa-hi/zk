import { describe, expect, it } from 'bun:test';
import { JETTISON_KEEP_PERCENT, type EngineState } from './domain';
import { applyEngineAction, createInitialEngineState } from './headlessEngine';

function createExploreState(seed = 'move-seed'): EngineState {
  const initial = createInitialEngineState({
    sessionId: 1,
    playerAddress: 'TEST',
    planetSeed: seed,
  });
  const confirmed = applyEngineAction(initial, {
    type: 'confirm_build',
    salt: 'salt-1',
  });
  return confirmed.state;
}

describe('headless move resolution', () => {
  it('rejects moves outside explore phase', () => {
    const state = createInitialEngineState({
      sessionId: 1,
      playerAddress: 'TEST',
      planetSeed: 'phase-seed',
    });
    const result = applyEngineAction(state, {
      type: 'move',
      direction: 'left',
      extract: true,
    });
    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe('invalid_phase');
  });

  it('moves to child, spends fuel, and records move', () => {
    const state = createExploreState();
    const result = applyEngineAction(state, {
      type: 'move',
      direction: 'left',
      extract: true,
    });
    expect(result.ok).toBe(true);
    expect(result.state.currentNodeId).toBe(2);
    expect(result.state.fuel).toBe(state.fuel - 1);
    expect(result.state.moveCount).toBe(1);
    expect(result.state.moves).toHaveLength(1);
    expect(result.state.moveResults).toHaveLength(1);
  });

  it('revisit of the start node is damage-exempt and gives no resources', () => {
    const state = createExploreState('revisit-seed');
    const down = applyEngineAction(state, {
      type: 'move',
      direction: 'left',
      extract: true,
    }).state;
    const backUp = applyEngineAction(down, {
      type: 'move',
      direction: 'up',
      extract: true,
    });

    expect(backUp.ok).toBe(true);
    const last = backUp.state.moveResults[backUp.state.moveResults.length - 1];
    expect(last.toNodeId).toBe(1);
    expect(last.damageTaken).toBe(0);
    expect(last.resourcesGained).toBe(0);
  });

  it('revisit of non-start nodes still applies damage and gives no resources', () => {
    const state = createExploreState('non-start-revisit-seed');
    const firstDown = applyEngineAction(state, {
      type: 'move',
      direction: 'left',
      extract: true,
    }).state;
    const secondDown = applyEngineAction(firstDown, {
      type: 'move',
      direction: 'left',
      extract: true,
    }).state;
    const revisitParent = applyEngineAction(secondDown, {
      type: 'move',
      direction: 'up',
      extract: true,
    });

    expect(revisitParent.ok).toBe(true);
    const last = revisitParent.state.moveResults[revisitParent.state.moveResults.length - 1];
    expect(last.toNodeId).toBe(2);
    expect(last.damageTaken).toBeGreaterThan(0);
    expect(last.resourcesGained).toBe(0);
  });

  it('jettisons when fuel reaches zero and applies keep percentage', () => {
    let state = createExploreState('fuel-seed');
    let lastPreJettisonResources = 0;

    for (let i = 0; i < 6; i += 1) {
      const direction = i % 2 === 0 ? 'left' : 'up';
      const res = applyEngineAction(state, {
        type: 'move',
        direction,
        extract: true,
      });
      state = res.state;
      if (i < 5) {
        lastPreJettisonResources = state.resources;
      }
    }

    expect(state.outcome).toBe('jettisoned');
    expect(state.phase).toBe('prove');
    expect(state.fuel).toBe(0);
    expect(state.resources).toBe(
      Math.floor((lastPreJettisonResources + state.moveResults[state.moveResults.length - 1].resourcesGained) * JETTISON_KEEP_PERCENT / 100)
    );
  });

  it('evacuates from current node, applies intensity multiplier, and enters prove phase', () => {
    const state = createExploreState('evacuate-seed');
    const afterMove = applyEngineAction(state, {
      type: 'move',
      direction: 'left',
      extract: true,
    }).state;
    const beforeEvacResources = afterMove.resources;
    const currentIntensity = afterMove.planet.nodes[afterMove.currentNodeId - 1].intensity;
    const keepPercent = currentIntensity === 1 ? 25 : currentIntensity === 2 ? 50 : 100;

    const evacuated = applyEngineAction(afterMove, { type: 'evacuate' });
    expect(evacuated.ok).toBe(true);
    expect(evacuated.state.outcome).toBe('evacuated');
    expect(evacuated.state.phase).toBe('prove');
    expect(evacuated.state.fuel).toBe(afterMove.fuel - 1);
    expect(evacuated.state.resources).toBe(Math.floor((beforeEvacResources * keepPercent) / 100));
  });

  it('returns proof payload in prove phase and transitions to done', () => {
    const state = createExploreState('proof-seed');
    const afterMove = applyEngineAction(state, {
      type: 'move',
      direction: 'left',
      extract: true,
    }).state;
    const evacuated = applyEngineAction(afterMove, { type: 'evacuate' }).state;

    const proof = applyEngineAction(evacuated, { type: 'request_proof_payload' });
    expect(proof.ok).toBe(true);
    expect(proof.proofPayload).toBeDefined();
    expect(proof.proofPayload?.publicInputs.numMoves).toBe(evacuated.moveCount);
    expect(proof.proofPayload?.publicInputs.evacuated).toBe(true);
    expect(proof.proofPayload?.publicInputs.moves).toHaveLength(10);
    expect(proof.proofPayload?.publicOutputs.outcome).toBe(0);
    expect(proof.proofPayload?.publicOutputs.totalResources).toBe(evacuated.resources);
    expect(proof.proofPayload?.publicOutputs.resourcesPerNode).toHaveLength(10);
    expect(proof.state.phase).toBe('done');
  });
});
