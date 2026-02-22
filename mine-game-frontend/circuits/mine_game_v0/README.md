# mine_game_v0 circuit

Minimal bootstrap circuit for mine-game proving.

## What it verifies

- Commitment binding only:
  - public `commitment` must equal `dev_commitment(loadout, salt)`.

## What it does not verify yet

- move validity
- fuel/hull/resource transitions
- evacuation/jettison outcome consistency

## Why this exists

This gives us the smallest useful proof target so we can wire frontend proof generation and on-chain verification before adding full game constraints.
