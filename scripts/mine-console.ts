#!/usr/bin/env bun

import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import {
  applyEngineAction,
  createEngineSnapshot,
  createInitialEngineState,
  listPartCategories,
  type EngineState,
  type Loadout,
  type MoveDirection,
  type PartTier,
  type ResistancePartTier,
} from '../mine-game-frontend/src/games/mine-game/engine';

const RESISTANCE_CATEGORIES: (keyof Loadout)[] = [
  'thermal_shielding',
  'cryo_insulation',
  'bio_filter',
  'rad_hardening',
];

const ALL_CATEGORIES = listPartCategories();

const HELP_TEXT = [
  '',
  'Stellar Explorer (headless console)',
  'Commands:',
  '  help',
  '  state',
  '  set <category> <tier>',
  '  confirm [salt]',
  '  confirm --auto',
  '  move <left|right|up> [extract|pass]',
  '  evacuate',
  '  proof',
  '  exit',
  '',
  `Categories: ${ALL_CATEGORIES.join(', ')}`,
  'Tiers:',
  '  standard | enhanced | advanced (advanced is invalid for resistance categories)',
  '',
].join('\n');

function printState(state: EngineState) {
  const snapshot = createEngineSnapshot(state);
  console.log('\n=== GAME STATE ===');
  console.log(JSON.stringify(
    {
      snapshot,
      loadout: state.loadout,
      stats: state.stats,
      commitment: state.commitment,
      saltSet: Boolean(state.salt),
      currentNodeId: state.currentNodeId,
      visitedNodeIds: state.visitedNodeIds,
      moveHistory: state.moves,
      moveResults: state.moveResults,
    },
    null,
    2
  ));
  printPlanetNavStrip(state);
  console.log(`available: ${getAvailableCommandsForState(state).join(' | ')}`);
}

function printPlanetNavStrip(state: EngineState) {
  const currentId = state.currentNodeId;
  const backId = currentId > 1 ? Math.floor(currentId / 2) : null;
  const leftId = currentId * 2 <= state.planet.nodes.length ? currentId * 2 : null;
  const rightId = currentId * 2 + 1 <= state.planet.nodes.length ? currentId * 2 + 1 : null;

  const currentDepth = getNodeDepth(currentId);
  const leafSpan = 2 ** Math.max(0, 6 - currentDepth);
  const leafStart = ((currentId - 2 ** currentDepth) * leafSpan) + 1;
  const leafEnd = leafStart + leafSpan - 1;

  console.log('\n=== PLANET NAV ===');
  console.log(
    `position: node=${currentId} depth=${currentDepth} covers_leaves=${leafStart}-${leafEnd} seed=${state.planet.seed}`
  );
  console.log(`back:    ${formatNodeSummary(state, backId)}`);
  console.log(`current: ${formatNodeSummary(state, currentId)}`);
  console.log(`left:    ${formatNodeSummary(state, leftId)}`);
  console.log(`right:   ${formatNodeSummary(state, rightId)}`);
}

function getNodeDepth(nodeId: number): number {
  return Math.floor(Math.log2(nodeId));
}

function formatNodeSummary(state: EngineState, nodeId: number | null): string {
  if (nodeId === null) return '--';
  const node = state.planet.nodes[nodeId - 1];
  if (!node) return '--';
  const visited = state.visitedNodeIds.includes(nodeId) ? 'V' : ' ';
  return `#${node.id} d${node.depth} i${node.intensity} ${shortBiome(node.biomeType)} [${node.hazards[0]}/${node.hazards[1]}] ${visited}`;
}

function shortBiome(biome: string): string {
  return biome
    .replaceAll('_', '-')
    .replace('magma-fields', 'magma')
    .replace('deep-freeze', 'freeze')
    .replace('hive-sprawl', 'hive')
    .replace('alien-ruins', 'ruins')
    .replace('thermal-vents', 'vents')
    .replace('ember-jungle', 'ember')
    .replace('slag-wastes', 'slag')
    .replace('cryo-marsh', 'marsh')
    .replace('fallout-tundra', 'tundra')
    .replace('mutant-thicket', 'thicket');
}

function getAvailableCommandsForState(state: EngineState): string[] {
  const common = ['help', 'state', 'exit'];

  if (state.phase === 'build') {
    return [...common, 'set <category> <tier>', 'confirm [salt|--auto]'];
  }

  if (state.phase === 'explore') {
    return [...common, 'move <left|right|up> [extract|pass]', 'evacuate'];
  }

  if (state.phase === 'prove') {
    return [...common, 'proof'];
  }

  return common;
}

function isPartTier(value: string): value is PartTier {
  return value === 'standard' || value === 'enhanced' || value === 'advanced';
}

function isResistanceTier(value: string): value is ResistancePartTier {
  return value === 'standard' || value === 'enhanced';
}

function isMoveDirection(value: string): value is MoveDirection {
  return value === 'left' || value === 'right' || value === 'up';
}

function toCategory(value: string): keyof Loadout | null {
  if (ALL_CATEGORIES.includes(value as keyof Loadout)) {
    return value as keyof Loadout;
  }
  return null;
}

function parseExtractFlag(value?: string): boolean {
  if (!value) return true;
  if (value === 'extract') return true;
  if (value === 'pass') return false;
  throw new Error('Move mode must be "extract" or "pass"');
}

function generateAutoSalt(): string {
  const time = Date.now().toString(36);
  const rand = Math.floor(Math.random() * 0xffffffff)
    .toString(36)
    .padStart(7, '0');
  return `auto_${time}_${rand}`;
}

async function main() {
  const sessionId = Math.floor(Math.random() * 1_000_000) + 1;
  const playerAddress = 'CONSOLE_PLAYER';
  const planetSeed = `seed-${Date.now()}`;

  let state = createInitialEngineState({
    sessionId,
    playerAddress,
    planetSeed,
  });

  console.log(HELP_TEXT);
  printState(state);

  const rl = createInterface({ input, output });

  try {
    while (true) {
      const raw = (await rl.question('\n> ')).trim();
      if (!raw) continue;

      const [command, ...args] = raw.split(/\s+/);

      if (command === 'exit' || command === 'quit') {
        console.log('\nExiting console run.');
        break;
      }

      if (command === 'help') {
        console.log(HELP_TEXT);
        continue;
      }

      if (command === 'state') {
        printState(state);
        continue;
      }

      try {
        if (command === 'set') {
          const [categoryInput, tierInput] = args;
          if (!categoryInput || !tierInput) {
            throw new Error('Usage: set <category> <tier>');
          }
          const category = toCategory(categoryInput);
          if (!category) {
            throw new Error(`Unknown category "${categoryInput}"`);
          }

          const isResistance = RESISTANCE_CATEGORIES.includes(category);
          if (isResistance && !isResistanceTier(tierInput)) {
            throw new Error(`Invalid resistance tier "${tierInput}" (allowed: standard, enhanced)`);
          }
          if (!isResistance && !isPartTier(tierInput)) {
            throw new Error(`Invalid tier "${tierInput}"`);
          }

          const result = applyEngineAction(state, {
            type: 'set_part_tier',
            category,
            tier: tierInput as PartTier | ResistancePartTier,
          });

          if (!result.ok) {
            console.log(`Action rejected: ${result.error?.code} - ${result.error?.message}`);
          }
          state = result.state;
          printState(state);
          continue;
        }

        if (command === 'confirm') {
          const [saltArg] = args;
          const salt = !saltArg || saltArg === '--auto' ? generateAutoSalt() : saltArg;
          if (!saltArg || saltArg === '--auto') {
            console.log(`Auto salt generated: ${salt}`);
          }
          const result = applyEngineAction(state, {
            type: 'confirm_build',
            salt,
          });
          if (!result.ok) {
            console.log(`Action rejected: ${result.error?.code} - ${result.error?.message}`);
          }
          state = result.state;
          printState(state);
          continue;
        }

        if (command === 'move') {
          const [directionInput, mode] = args;
          if (!directionInput || !isMoveDirection(directionInput)) {
            throw new Error('Usage: move <left|right|up> [extract|pass]');
          }
          const extract = parseExtractFlag(mode);
          const result = applyEngineAction(state, {
            type: 'move',
            direction: directionInput,
            extract,
          });
          if (!result.ok) {
            console.log(`Action rejected: ${result.error?.code} - ${result.error?.message}`);
          }
          state = result.state;
          printState(state);
          continue;
        }

        if (command === 'evacuate') {
          const result = applyEngineAction(state, {
            type: 'evacuate',
          });
          if (!result.ok) {
            console.log(`Action rejected: ${result.error?.code} - ${result.error?.message}`);
          }
          state = result.state;
          printState(state);
          continue;
        }

        if (command === 'proof') {
          const result = applyEngineAction(state, {
            type: 'request_proof_payload',
          });
          if (!result.ok) {
            console.log(`Action rejected: ${result.error?.code} - ${result.error?.message}`);
          } else if (result.proofPayload) {
            console.log('\n=== PROOF PAYLOAD ===');
            console.log(JSON.stringify(result.proofPayload, null, 2));
          }
          state = result.state;
          printState(state);
          continue;
        }

        console.log(`Unknown command "${command}". Type "help" for available commands.`);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.log(`Input error: ${message}`);
      }
    }
  } finally {
    rl.close();
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  console.error(message);
  process.exit(1);
});
