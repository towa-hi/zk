# Mine Game Circom MVP (v2)

This circuit proves the temporary MVP statement:

- all 10 loadout slots contain a valid tier selection (`0`, `1`, or `2`)

Public signals are fixed for forward compatibility with the next statement:

1. `session_id`
2. `statement_version`
3. `all_slots_occupied`
4. `commitment`

## Files

- `loadout_occupied.circom` - MVP circuit

## TODO

Replace the temporary constraint with `sum(weights) <= 20` while keeping the same public signal schema and ordering.
