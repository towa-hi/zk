# Stellar Explorer

A ZK-verifiable exploration fully-on-chain game deployed on Stellar Testnet. Equip a probe, survive a hostile planet, prove your haul on-chain with zero-knowledge proofs.

## Overview

Stellar Explorer is a ZK-verifiable single-player exploration game built on Stellar. Every player navigates the same procedurally generated planet, a binary tree of hostile biomes, and extracts resources along the way. Before exploring, you equip your probe with parts from a shared catalog. Your loadout is committed as a hash and proven correct via a Groth16 zero-knowledge proof. It is never revealed on-chain. Other prospectors can see your path and resource haul but never know what parts you used. The game is somewhat inspired by the exploration phase in the Civilization series.

## Rationale

The use case for ZK in gaming is actually somewhat limited unless you specifically design your game around the primitives and keep things easy to prove. I could have just gone the obvious route and made battleship or stratego (Go play Warmancer for that) but I decided to do something a little bit more than just a multiplayer commit-reveal setup. 

This time I wanted to design a game from ground up to be something that can actually only exist with ZK, so the core mechanic I built the game around was for users to prove they completed the game without ever actually revealing how they did it. I like singleplayer games where everyone has the same seed of the day, but it's easy to get spoiled and end up doing the same thing as everyone else if you know what actions to take. With ZK, it is possible to have a semi-competitive singleplayer game with a leaderboard that doesn't give away what happened. 

### Architecture

The game has three layers:

- **Circom + Groth16** -- ZK circuit that proves the player's loadout commitment is valid without revealing the loadout. Proofs are generated client-side and submitted on-chain. I chose Circom because it's literally the only thing that seems to work on Testnet as of right now (2/22/2026)
- **Soroban smart contracts** -- Two contracts:
  - `mine-game` manages session lifecycle (start, commit loadout, submit proof, end game via Game Hub)
  - `groth16-verifier` just verifies Groth16 proofs on-chain
- **React frontend** -- Static site with Stellar Wallets Kit. Handles probe building, tree exploration, proof generation, and contract interaction. There is no backend!

Each player makes 3 transactions per session:

1. `start_game` -- open a session on-chain
2. `commit_loadout` -- submit a Poseidon hash of the probe loadout
3. `submit_proof` -- submit the Groth16 proof, public inputs, and run outputs. public inputs are saved to storage.

---

## Gameplay

### Core Loop

1. **Build** -- Equip your probe with parts within a weight budget
2. **Explore** -- Navigate a binary tree of biomes, taking damage and extracting resources
3. **Prove** -- Submit a ZK proof of your loadout commitment along with your run outputs
4. **Compare** -- See how your haul stacks up against other prospectors on the same planet

### The Probe

Every probe has base stats and a weight capacity of 20. You equip parts across 10 categories, each available in up to 3 tiers:

| Tier | Weight |
|------|--------|
| Standard | 0 (free) |
| Enhanced | 2 |
| Advanced | 5 |

**Part categories:**

- **Fuel Tank** -- base 6 fuel (1 per move). Enhanced: 8, Advanced: 10.
- **Biome Resistance** (heat, cold, bio, rad) -- reduces hull damage from matching hazards. Standard or Enhanced only. Enhanced blocks 1 damage per matching hazard.
- **Cargo Hold** -- max resources carried. Standard: 100, Enhanced: 175, Advanced: 225.
- **Extractors** (heat, cold, bio, rad) -- multiply resource extraction from matching hazard types. Standard: 10x, Enhanced: 12x, Advanced: 15x.

Resistance parts have diminishing returns. Extractors have accelerating returns, so specialization is rewarded.

### Planet Alpha

- Generated deterministically from an on-chain seed
- Binary tree of depth 6 (127 nodes total)
- Each node is a biome with two hazard types drawn from: heat, cold, bio, rad
- 10 biome types (e.g. Magma Fields = heat/heat, Cryo Marsh = cold/bio)
- The tree is visible before you build, so you can plan your route

**Biome intensity scales with depth:**

| Depth | Intensity | Nodes |
|-------|-----------|-------|
| 1-3 | Low | 7 |
| 4-5 | Medium | 24 |
| 6 | High | 32 (leaves) |

Deeper biomes deal more damage but yield richer resources.

### Exploration

Your probe enters at the root and navigates by choosing left or right branches. Each move costs 1 fuel. Entering a new biome applies hazard damage to your hull. You choose whether to extract resources at each biome or pass through to save cargo space for richer nodes deeper in the tree.

- Backtracking costs fuel and re-applies damage but yields no resources
- The starting node is damage-exempt
- Cargo has a hard cap. Once full, you can't collect more
- Hull or fuel hitting zero triggers a jettison

**Damage per hazard:** `max(0, base_damage + intensity - resistance)`
Each biome has two hazards, so damage is applied twice.

### Ending a Run

- **Evacuate** -- voluntary exit from any biome. Costs 1 fuel. Resources kept depend on the intensity of the biome you evacuate from:
  - Intensity 1: keep 25%
  - Intensity 2: keep 50%
  - Intensity 3: keep 100%
- **Jettison** -- involuntary. Triggered when hull or fuel hits zero. You keep only 5% of your resources.

Push deeper for richer resources and a better evacuation multiplier, or play it safe and get out before your probe is destroyed.

---

## Technical

### ZK Circuit (Circom)

The Groth16 circuit validates the player's loadout commitment without revealing the loadout.

**Public inputs (4 field elements):**
- `session_id`
- `statement_version`
- `all_slots_occupied`
- `commitment` (Poseidon hash)

**Private inputs (witness):**
- `loadout[10]` -- tier per part category (0/1/2)
- `salt_chunks[2]` -- 32-byte salt split into two field elements

**What the circuit proves:**
1. Each loadout slot is a valid tier (0, 1, or 2)
2. Statement version and occupancy gates pass
3. Poseidon hash of the full statement tuple matches the public `commitment`

**Current MVP limitation:** the circuit does not yet prove move simulation, resource totals, or final outcome. Run outputs are submitted alongside the proof but are not bound by the current circuit statement. A bunch of stuff could be trivially proven with a traditional commit-reveal scheme but I already wrote that in Warmancer so I don't really care tbh.

### Contracts (Soroban)

**mine-game** -- session lifecycle:
- `start_game` -- register a session with Game Hub
- `commit_loadout` -- store the player's Poseidon commitment
- `submit_proof` -- forward proof to the Groth16 verifier, store validated run outputs
- `end_game` -- report results to Game Hub

**groth16-verifier** -- standalone verifier for Groth16 proofs. Called by mine-game during proof submission.

### On-Chain State

```
planet_seed         -- current planet seed (shared by all players)
commitments         -- Map<(session_id, address), Bytes>
results             -- Map<(session_id, address), ProofOutputs>
verifier_address    -- Groth16 verifier contract address
```

### Frontend Stack

- React + Tailwind, static site, no backend
- Circom/Groth16 proof generation in-browser (snarkjs)
- Stellar SDK + Stellar Wallets Kit for wallet connection and contract calls
- Dark space theme with tree visualization of Planet Alpha

### Project Structure

```
contracts/mine-game/         Soroban game contract
contracts/groth16-verifier/  Groth16 proof verifier contract
contracts/mock-game-hub/     Mock Game Hub for testing
mine-game-frontend/          React frontend
scripts/                     Build, deploy, and proof tooling
bindings/                    Generated TypeScript bindings
```

### Deployment

You're just gonna have to ask me because the deploy script is a huge mess that I don't want to entangle. Run bun deploy and update the bindings by hand