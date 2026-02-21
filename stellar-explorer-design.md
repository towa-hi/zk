# Stellar Explorer — Design Document

## One-Liner

Equip a probe, survive a hostile alien planet, prove your haul — all on-chain with zero-knowledge proofs on Stellar.

---

## Concept

You are a probe deployed by a prospecting company to Planet Alpha — a world with diverse but hostile biomes. Your job is to survey as much of the planet as possible and bring back valuable resources. Before launch, you equip your probe to handle whatever biomes you'll face. But you don't know the planet's layout until after you've committed your loadout.

Async competitive single-player game. Players customize a probe, navigate a procedurally generated binary decision tree representing Planet Alpha's terrain, and submit a ZK proof of their expedition. Probe loadouts are secret — other prospectors can see your path and resource haul but never know what parts you used.

---

## Core Loop

1. **Build** — Equip your probe with parts within weight budget
2. **Explore** — Navigate a binary tree of biomes
3. **Prove** — Submit ZK proof that loadout is valid and resources are correct
4. **Compare** — (Stretch: leaderboard ranks by total resources)

---

## Planet Alpha

- Generated deterministically from an on-chain seed
- Binary tree of depth 6 (6 decisions, 63 internal nodes, 64 leaf nodes, 127 total)
- Each node is a biome with hostile environmental conditions that interact with probe stats
- Tree structure is visible before you build

---

## The Probe

- Fixed parts catalog (same every game)
- **Weight capacity: 20**
- Each part comes in 3 tiers:
  - **Standard** — 0 weight (default/free)
  - **Enhanced** — 2 weight
  - **Advanced** — 5 weight
- You equip one tier per category. Every category defaults to Standard if you skip it.
- **Fuel** — base 6 (one per move). Exactly enough for a straight path to depth 6 with no backtracking. Upgraded via fuel tank parts.
- **Hull** — base 10 HP. Damaged by biome hazards. Different biomes deal different damage types. Reduced by resistance parts.
- **Cargo** — max resources you can carry. Standard: 100, Enhanced: 175, Advanced: 225.
- Either fuel or hull hitting zero triggers jettison
- Loadout committed as hash before exploring
- Never revealed on-chain — only proven via ZK

---

## Exploration

- Probe enters at root and navigates the tree by picking branches
- You can go backwards but you get nothing from revisited biomes
- Revisited biomes still apply damage when entered again
- The starting node is damage-exempt (no damage when on or re-entering it)
- Every move costs 1 fuel
- Entering a new biome makes you endure its conditions (damage is always applied)
- You choose whether to extract resources or pass through without collecting
- Passing through saves cargo space for higher-value biomes deeper in the tree
- Once your cargo is full, you can't collect more

### Damage Formula:
```
for each hazard in biome (2 per biome):
    damage = max(0, base_damage + intensity - resistance_to_hazard_type)
total_damage = sum of both hazard damages
hull -= total_damage
```

- Base HP: 10
- Base damage: 1
- Intensity adds 0/1/2 for intensity levels 1/2/3
- So unresisted hazard deals 1/2/3 per hit
- Same-type biome at intensity 3 = 6 damage unresisted
- All small integers, no division, board-game readable

### Evacuation vs Jettison:
- **Evacuate**: choose to evacuate from any biome. Costs 1 fuel. Resources kept depend on the intensity of the biome you evacuate from:
  - Intensity 1: keep 25% of resources (rounded down)
  - Intensity 2: keep 50% of resources (rounded down)
  - Intensity 3: keep 100% of resources
- **Jettison**: if you run out of fuel or your hull hits zero upon entering a biome, your probe is jettisoned. You only keep 5% of your resources (rounded down).

### Core Tensions:
- Going deeper = more resources but more fuel spent and hull damage taken
- Cargo capacity forces choices — once full you can't collect more, do you push deeper or evacuate now?
- Fuel vs hull: running out of either ends your run — biomes drain hull, movement drains fuel
- Build tradeoffs: fuel tanks, resistance, cargo bays, and extractors all compete for weight
- Backtracking still costs fuel, applies damage on re-entry, and gives no reward
- Every branch choice is: push deeper or retreat toward evacuation?

---

## Discovery System (Stretch Goal)

- Each biome has discovery slots gated by stat thresholds
- Discoveries output from ZK circuit as hashes
- On-chain contract tracks a discovery registry
- First prospector to submit a new discovery gets a bonus
- Repeat discoveries worth less
- Effect: common paths + common builds = depleted discoveries = low scores
- Unusual paths + niche builds = fresh discoveries = high scores
- Meta self-balances as popular routes get strip-mined by other prospectors

---

## Biome Types

Each biome is a combination of two hazard types (can repeat). 10 total biome types:

| Biome | Hazard 1 | Hazard 2 |
|-------|----------|----------|
| Magma Fields | Heat | Heat |
| Deep Freeze | Cold | Cold |
| Hive Sprawl | Bio | Bio |
| Alien Ruins | Rad | Rad |
| Thermal Vents | Heat | Cold |
| Ember Jungle | Heat | Bio |
| Slag Wastes | Heat | Rad |
| Cryo Marsh | Cold | Bio |
| Fallout Tundra | Cold | Rad |
| Mutant Thicket | Bio | Rad |

Same-type biomes stack damage in one category (both hazards hit the same resistance). Mixed biomes spread damage across two categories. Same-type biomes also get a 2x extraction bonus. Each biome is visually readable as two hazard icons/colors in the UI.

---

## Biome Intensity

Biomes have intensity levels based on depth in the tree:

| Depth | Intensity | Nodes |
|-------|-----------|-------|
| 1-3 | Intensity 1 | 7 nodes |
| 4-5 | Intensity 2 | 24 nodes |
| 6 | Intensity 3 | 32 nodes (leaves) |

Higher intensity = more hazard damage AND more/better resources. The safest biomes are near the surface. The richest resources are at the bottom — but you have to survive the journey and have fuel to reach evacuation.

---

## Part Categories

- **Fuel Tanks** — increase fuel capacity
- **Biome Resistance** (typed) — reduce hull damage from specific hazard types. Standard or Enhanced only (no Advanced tier):
  - Thermal Shielding (heat)
  - Cryo Insulation (cold)
  - Bio Filter (biological)
  - Rad Hardening (radiation)
- **Cargo Hold** — increase carry capacity
- **Extractors** (typed) — increase resource extraction from specific hazard types:
  - Thermal Extractor (heat)
  - Cryo Extractor (cold)
  - Bio Extractor (biological)
  - Rad Extractor (radiation)
- (Stretch: **Sensors** — unlock discovery slots at biomes)

All parts come in 3 tiers:

| Tier | Weight | 
|------|--------|
| Standard | 0 |
| Enhanced | 2 |
| Advanced | 5 |

10 part categories × 3 tiers (resistance has 2 tiers only). You pick one tier per category.

### Design Principle:
- **Diminishing returns** on defensive/utility parts (fuel, cargo) — upgrading is always good but increasingly weight-inefficient
- **Accelerating returns** on extractors — bigger investment = disproportionately bigger payoff, rewards specialization

### Fuel Tank Values:
- Standard: 6 fuel (1 fuel per move — exactly enough for a straight path to depth 6, no backtracking)
- Enhanced (+2 weight): 8 fuel
- Advanced (+5 weight): 10 fuel

Maximum move count: 10 (circuit fixed upper bound, matches Advanced fuel tank)

### Resistance Values (2 tiers only):
- Standard: 0 resistance (take full damage)
- Enhanced (+2 weight): blocks 1 damage per hazard of matching type

Survival math (straight path, all matching resistances at 8 weight):
- Intensity 1 biomes: 0 damage each
- Intensity 2 biomes: 2 damage each
- Intensity 3 biomes: 4 damage each
- Total for full run: 8 damage. Survive with 2 HP.
- Without any resistance: 20 damage. Very dead.

### Cargo Hold Values:
- Standard: 100 capacity
- Enhanced (+2 weight): 175 capacity
- Advanced (+5 weight): 225 capacity

### Extraction Formula:
```
for each hazard in biome (2 per biome):
    extraction = base_resource * extractor_multiplier_for_hazard_type
resources = sum of extractions
if both hazards are same type: resources *= 2
```

Base resource per intensity: 1 / 3 / 5

Extractor multipliers by tier:
- Standard: 10x
- Enhanced: 12x
- Advanced: 15x

Base resources scale with intensity. Double hazard biomes (same type twice) get a 2x bonus — rewards specializing your extractors.

---

## Scoring

- **Total resources**: sum of resources extracted across all biomes visited, then multiplied by outcome:
  - Evacuate from intensity 3: 100%
  - Evacuate from intensity 2: 50%
  - Evacuate from intensity 1: 25%
  - Jettisoned: 5%

---

## Stretch Goals (design for, don't build yet)

- **Leaderboard**: rank prospectors by total resources per planet
- **Discovery registry**: first-find bonus for unclaimed discoveries, tracked on-chain
- **Path rank bonus**: group prospectors by path taken, bonus for highest resources within group
- **Ghost system**: display dead probes, popular paths, per-biome resource extractions from other prospectors on the tree
- **Ghost modifier scoring**: biomes where previous prospectors extracted poorly are worth more

---

## Architecture

### Transactions per player: 2
1. Commit probe build hash
2. Submit ZK proof with public outputs

### ZK Stack:
- Circom circuits → Groth16 proofs → WASM in-browser proving → Soroban on-chain verification
- Based on Stellar X-Ray upgrade (BN254, Poseidon, Groth16 verifier)
- Reference: Stellar Private Payments PoC from Nethermind

### Circuit outputs (public):
- Full move sequence (path including any backtracking)
- Per-biome resources extracted
- Total resources (adjusted for evacuation vs jettison)
- Final fuel remaining
- Final hull remaining
- Outcome (evacuated vs jettisoned)
- (Stretch: discovery hashes)

### What's secret (ZK-hidden):
- Probe loadout (which parts were equipped)

### On-chain state:
- Planet Alpha seed
- Prospector commitments
- Verified proof results (ProofOutputs)
- (Stretch: discovery registry, leaderboard, ghost data, path groups)

---

## Frontend

- Static site, Tailwind, no backend
- Circom WASM prover in browser (snarkjs)
- Stellar SDK for contract calls
- Dark space theme, neon accents
- Tree visualization of Planet Alpha's biomes is the main visual — no sprites or illustrations needed

---

## Open Questions

- Sensor stat values per tier (stretch goal)

---

## Technical Specification

### Program State

The app has two top-level states: Menu and Game.

```
AppState {
  screen:       Screen           // menu | game
  menu:         MenuState | null // active when screen = menu
  game:         GameState | null // active when screen = game
}
```

```
Screen: menu, game
```

### Menu State

```
MenuState {
  planet:           Planet | null       // generated from current seed
  current_seed:     number | null       // fetched from contract
}
```

**Menu transitions:**
- On load → fetch current seed, generate planet
- "Start Game" → enter Game at BUILD phase

### Game Phases

```
BUILD → EXPLORE → PROVE → DONE
```

- **BUILD**: Player selects parts. Loadout committed as Poseidon hash on-chain.
- **EXPLORE**: Player navigates tree, takes damage, collects resources. All client-side.
- **PROVE**: Client generates ZK proof of the full run. Submitted on-chain.
- **DONE**: Proof verified. Results stored. Player returned to menu.

**Phase transitions:**
- BUILD → EXPLORE: player confirms loadout, commitment tx sent on-chain, derive probe stats, place probe at root
- EXPLORE → PROVE: player evacuates OR jettison triggers, lock move history
- EXPLORE → PROVE (jettison): hull or fuel hits zero, auto-trigger
- PROVE → DONE: proof generated and submitted, contract verifies
- DONE → menu: player clicks "back to menu"

### BuildPhase

```
BuildPhase {
  loadout:        Loadout         // current selections (all start at standard)
  weight_used:    number          // computed from loadout
  weight_remaining: number        // MAX_WEIGHT - weight_used
  valid:          boolean         // weight_used <= MAX_WEIGHT
}
```

The build screen shows the parts catalog, current selections, weight bar, and a preview of derived stats (fuel, hull, cargo, resistances, extractor multipliers).

### ExplorePhase

Exploration is the mutable core of GameState. All fields under "Mutable during exploration" in the GameState object below. The explore screen shows the tree, current position, probe stats, cargo, and move controls (move with/without extract per direction, back, evacuate button).

### ProofPhase

```
ProofPhase {
  generating:     boolean         // proof generation in progress
  proof:          object | null   // snarkjs proof output
  submitting:     boolean         // tx submission in progress
  tx_hash:        string | null   // submitted tx hash
  verified:       boolean         // contract verified the proof
  error:          string | null   // any error message
}
```

### DonePhase

```
DonePhase {
  outcome:          Outcome         // evacuated or jettisoned
  evac_intensity:   number | null   // intensity of node evacuated from (null if jettisoned)
  total_resources:  number          // final score after outcome multiplier
}
```

All other end-of-game data (hull, fuel, moves) is already in GameState.

### Player Actions

#### Menu Actions

```
StartGame                  // enter BUILD phase
```

#### Build Actions

```
SetPartTier {
  category: PartCategory
  tier:     Tier
}                          // select a tier for a part category
                           // rejected if: tier=advanced on resistance,
                           //   or new weight total would exceed MAX_WEIGHT

ConfirmLoadout             // finalize build → generate salt, compute commitment,
                           // submit commitment tx on-chain → transition to EXPLORE

BackToMenu                 // abandon build, return to menu (no on-chain action)
```

#### Explore Actions

```
Move {
  direction: left | right | back    // left = 2*node, right = 2*node+1, back = floor(node/2)
  extract:   boolean                // collect resources at destination?
}
  // rejected if: no fuel
  // rejected if: direction=left/right and current node is a leaf
  // rejected if: direction=back and at root (node 1)
  // extract forced false if: direction=back (revisited node)
  // extract forced false if: destination already in visited set
  // extract forced false if: cargo full

Evacuate                            // end run, costs 1 fuel. Resources kept based on current biome intensity.
  // rejected if: no fuel
```

**Auto-triggered events (not player actions):**
- Hull hits 0 on biome entry → Jettison
- Fuel hits 0 after a move → Jettison (can't move or evacuate)

**Jettison**: involuntary end of run. Probe is ejected, you keep 5% of your resources (rounded down).

**Move resolution order:**
1. Deduct 1 fuel
2. Update current_node
3. Check if node is new (not in visited set) → set `is_new = true`
4. If is_new: apply damage → if hull ≤ 0: jettison, transition to PROVE
5. Add node to visited set
6. If extract is ON and is_new and cargo not full: collect resources, add to cargo_used
7. If fuel = 0: jettison, transition to PROVE

#### Prove Actions

```
GenerateProof              // kick off snarkjs WASM proof generation
                           // auto-triggered on entering PROVE phase

SubmitProof                // submit proof tx on-chain
                           // available after proof generation completes
```

#### Done Actions

```
BackToMenu                 // return to menu screen
```

### Constants

```
MAX_DEPTH = 6
MAX_MOVES = 10
MAX_WEIGHT = 20
BASE_HULL = 10
BASE_FUEL = 6
BASE_DAMAGE = 1
NUM_HAZARD_TYPES = 4       // heat=0, cold=1, bio=2, rad=3
NUM_BIOME_TYPES = 10
TOTAL_NODES = 127           // 2^7 - 1
JETTISON_PERCENT = 5            // jettison keeps 5% of resources
EVAC_PERCENT = [0, 25, 50, 100] // index 0 unused, by intensity 1/2/3
```

### Enums

```
HazardType: heat(0), cold(1), bio(2), rad(3)

BiomeType: magma_fields(0), deep_freeze(1), hive_sprawl(2), alien_ruins(3),
           thermal_vents(4), ember_jungle(5), slag_wastes(6),
           cryo_marsh(7), fallout_tundra(8), mutant_thicket(9)

PartCategory: fuel_tank(0),
              resist_heat(1), resist_cold(2), resist_bio(3), resist_rad(4),
              extract_heat(5), extract_cold(6), extract_bio(7), extract_rad(8),
              cargo_hold(9)

Tier: standard(0), enhanced(1), advanced(2)

MoveDirection: left(0), right(1), back(2)

GamePhase: build, explore, prove, done

Outcome: evacuated, jettisoned
```

### Biome Type Definitions

```
BIOME_HAZARDS = [
  [heat, heat],     // 0: magma_fields
  [cold, cold],     // 1: deep_freeze
  [bio,  bio],      // 2: hive_sprawl
  [rad,  rad],      // 3: alien_ruins
  [heat, cold],     // 4: thermal_vents
  [heat, bio],      // 5: ember_jungle
  [heat, rad],      // 6: slag_wastes
  [cold, bio],      // 7: cryo_marsh
  [cold, rad],      // 8: fallout_tundra
  [bio,  rad],      // 9: mutant_thicket
]
```

### Part Stat Tables

```
FUEL_VALUES   = [6, 8, 10]          // standard, enhanced, advanced
RESIST_VALUES = [0, 1]              // standard, enhanced (no advanced)
CARGO_VALUES  = [100, 175, 225]     // standard, enhanced, advanced
EXTRACT_MULT  = [10, 12, 15]        // standard, enhanced, advanced
RESOURCE_BASE = [0, 1, 3, 5]       // index 0 unused, intensity 1/2/3
```

### Weight Costs

```
WEIGHT_COST = [0, 2, 5]            // standard, enhanced, advanced
// Resistance max tier = 1 (enhanced)
```

### Intensity by Depth

```
function intensityForDepth(depth):
  if depth <= 3: return 1
  if depth <= 5: return 2
  return 3
```

### Node (tree element)

```
Node {
  id:         number      // 1-127, root = 1 (binary heap indexing)
  depth:      number      // 1-6
  biome_type: BiomeType   // determined from seed
  intensity:  number      // 1/2/3, derived from depth
  hazards:    [HazardType, HazardType]  // looked up from biome_type
}
```

Binary heap indexing: node `i` has children `2i` (left) and `2i+1` (right), parent `floor(i/2)`.

### Planet (the full tree)

```
Planet {
  seed:   number        // on-chain seed (e.g. block hash)
  nodes:  Node[127]     // indexed 1-127
}
```

Generated deterministically: `seed → Poseidon hash chain → biome assignments per node`.

### Loadout

```
Loadout {
  fuel_tank:    Tier    // 0-2
  resist_heat:  Tier    // 0-1 (max enhanced)
  resist_cold:  Tier    // 0-1
  resist_bio:   Tier    // 0-1
  resist_rad:   Tier    // 0-1
  extract_heat: Tier    // 0-2
  extract_cold: Tier    // 0-2
  extract_bio:  Tier    // 0-2
  extract_rad:  Tier    // 0-2
  cargo_hold:   Tier    // 0-2
}
```

Validation: `sum of WEIGHT_COST[tier] for all categories <= MAX_WEIGHT`

Commitment: `Poseidon(fuel_tank, resist_heat, ..., cargo_hold, salt)`

### Move (single action in sequence)

```
Move {
  direction:  MoveDirection   // left, right, back
  extract:    boolean         // collect resources at this node?
}
```

If `direction = back`, `extract` is always false (revisited node).
Evacuate is a separate action, not part of Move.

### MoveResult (computed per move)

```
MoveResult {
  node_id:          number
  damage_taken:     number
  resources_gained: number
  hull_after:       number
  fuel_after:       number
  cargo_after:      number
}
```

### GameState (live during game)

```
GameState {
  phase:          GamePhase
  planet:         Planet
  loadout:        Loadout
  salt:           number          // random, used in commitment hash
  commitment:     number          // Poseidon hash of loadout + salt

  // Phase sub-states
  build:          BuildPhase | null
  proof:          ProofPhase | null
  done:           DonePhase | null

  // Derived from loadout at start of explore phase
  max_fuel:       number
  max_cargo:      number
  resistances:    number[4]       // indexed by HazardType
  extractors:     number[4]       // extractor multipliers indexed by HazardType

  // Mutable during exploration
  current_node:   number          // node id (1-127)
  hull:           number
  fuel:           number
  cargo_used:     number
  resources:      number          // total collected so far (pre-multiplier, raw extraction total)
  visited:        Set<number>     // node ids already entered
  moves:          Move[]          // full move history
  move_results:   MoveResult[]    // computed result per move
  outcome:        Outcome | null  // null until run ends
}
```

### ProofInputs (what gets fed to the circuit)

```
ProofInputs {
  // Private
  loadout:    number[10]    // tier per category
  salt:       number

  // Public
  seed:       number        // planet seed
  commitment: number        // hash of loadout + salt
  num_moves:  number        // actual moves taken (rest are padded no-ops)
  moves:      number[10][2] // [direction, extract] per move (padded to MAX_MOVES)
                            // no-op padding: [0, 0] for unused slots
  evacuated:  boolean       // did the player evacuate?
  biomes:     number[127]   // full tree biome types (contract verifies independently)
}
```

### ProofOutputs (public outputs from circuit)

```
ProofOutputs {
  move_sequence:      number[10]    // node visited per move (0 = no-op)
  resources_per_node: number[10]    // resources gained per move
  total_resources:    number        // final score after outcome multiplier
  final_hull:         number
  final_fuel:         number
  outcome:            number        // 0 = evacuated, 1 = jettisoned
  evac_intensity:     number        // intensity of evacuation node (0 if jettisoned)
}
```

### OnChainState (Soroban contract storage)

```
OnChainState {
  planet_seed:    number
  commitments:    Map<address, number>      // player → loadout hash
  results:        Map<address, ProofOutputs> // player → verified results
}
```
