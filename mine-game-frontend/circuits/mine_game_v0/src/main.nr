use dep::keccak256::keccak256;

// Preimage constants
global MAX_SALT_LEN: u32 = 64;
global LOADOUT_LEN: u32 = 10;
global SEPARATOR: u8 = 0xff;
global MAX_PREIMAGE_LEN: u32 = 75; // 10 + 1 + 64

// -- Game constants (must match frontend domain.ts) --
global MAX_MOVES: u32 = 10;
global MAX_VISITED: u32 = 11; // start node + max moves
global BASE_HULL: u32 = 10;
global BASE_DAMAGE: u32 = 1;
global NODE_COUNT: u32 = 127;
global MAX_WEIGHT: u32 = 20;
global JETTISON_KEEP_PERCENT: u32 = 5;

// -- Loadout array indices --
global IDX_FUEL_TANK: u32 = 0;
global IDX_THERMAL_SHIELD: u32 = 1;
global IDX_CRYO_INSULATION: u32 = 2;
global IDX_BIO_FILTER: u32 = 3;
global IDX_RAD_HARDENING: u32 = 4;
global IDX_THERMAL_EXTRACTOR: u32 = 5;
global IDX_CRYO_EXTRACTOR: u32 = 6;
global IDX_BIO_EXTRACTOR: u32 = 7;
global IDX_RAD_EXTRACTOR: u32 = 8;
global IDX_CARGO_HOLD: u32 = 9;

// -- Stat tables --

fn fuel_by_tier(tier: u8) -> u32 {
    if tier == 0 { 6 } else if tier == 1 { 8 } else { 10 }
}

fn cargo_by_tier(tier: u8) -> u32 {
    if tier == 0 { 100 } else if tier == 1 { 175 } else { 225 }
}

fn extractor_mult(tier: u8) -> u32 {
    if tier == 0 { 10 } else if tier == 1 { 12 } else { 15 }
}

fn resistance_val(tier: u8) -> u32 {
    if tier == 1 { 1 } else { 0 }
}

fn resource_base(intensity: u8) -> u32 {
    if intensity == 1 { 1 } else if intensity == 2 { 3 } else { 5 }
}

fn evac_percent(intensity: u8) -> u32 {
    if intensity == 1 { 25 } else if intensity == 2 { 50 } else { 100 }
}

fn part_weight(tier: u8) -> u32 {
    if tier == 0 { 0 } else if tier == 1 { 2 } else { 5 }
}

fn saturating_sub(a: u32, b: u32) -> u32 {
    if a >= b { a - b } else { 0 }
}

// -- Commitment preimage builder --

fn build_preimage(loadout: [u8; 10], salt: [u8; 64], salt_len: u32) -> [u8; 75] {
    let mut preimage: [u8; MAX_PREIMAGE_LEN] = [0; MAX_PREIMAGE_LEN];
    for i in 0..LOADOUT_LEN {
        preimage[i] = loadout[i];
    }
    preimage[LOADOUT_LEN] = SEPARATOR;
    for i in 0..MAX_SALT_LEN {
        if i < salt_len {
            preimage[LOADOUT_LEN + 1 + i] = salt[i];
        }
    }
    preimage
}

fn compute_commitment(loadout: [u8; 10], salt: [u8; 64], salt_len: u32) -> [u8; 32] {
    let preimage = build_preimage(loadout, salt, salt_len);
    let message_size = LOADOUT_LEN + 1 + salt_len;
    keccak256(preimage, message_size)
}

// -- Damage / resource helpers --

fn lookup_resistance(loadout: [u8; 10], hazard_type: u8) -> u32 {
    if hazard_type == 0 { resistance_val(loadout[IDX_THERMAL_SHIELD]) }
    else if hazard_type == 1 { resistance_val(loadout[IDX_CRYO_INSULATION]) }
    else if hazard_type == 2 { resistance_val(loadout[IDX_BIO_FILTER]) }
    else { resistance_val(loadout[IDX_RAD_HARDENING]) }
}

fn lookup_extractor(loadout: [u8; 10], hazard_type: u8) -> u32 {
    if hazard_type == 0 { extractor_mult(loadout[IDX_THERMAL_EXTRACTOR]) }
    else if hazard_type == 1 { extractor_mult(loadout[IDX_CRYO_EXTRACTOR]) }
    else if hazard_type == 2 { extractor_mult(loadout[IDX_BIO_EXTRACTOR]) }
    else { extractor_mult(loadout[IDX_RAD_EXTRACTOR]) }
}

fn compute_damage(h1: u8, h2: u8, intensity: u8, loadout: [u8; 10]) -> u32 {
    let intensity_delta = (intensity as u32) - 1;
    let r1 = lookup_resistance(loadout, h1);
    let r2 = lookup_resistance(loadout, h2);
    let d1 = saturating_sub(BASE_DAMAGE + intensity_delta, r1);
    let d2 = saturating_sub(BASE_DAMAGE + intensity_delta, r2);
    d1 + d2
}

fn compute_resources(h1: u8, h2: u8, intensity: u8, loadout: [u8; 10]) -> u32 {
    let base = resource_base(intensity);
    let e1 = lookup_extractor(loadout, h1);
    let e2 = lookup_extractor(loadout, h2);
    let first = base * e1;
    let second = base * e2;
    let total = first + second;
    if h1 == h2 { total * 2 } else { total }
}

// -- Move target resolution --

fn resolve_target(current: u32, direction: u8) -> u32 {
    if direction == 1 { current * 2 }         // left
    else if direction == 2 { current * 2 + 1 } // right
    else { current / 2 }                       // up
}

// -- Main circuit --

fn main(
    // Private: player secrets
    loadout: [u8; 10],
    salt: [u8; 64],
    salt_len: u32,

    // Private: exploration data
    num_moves: u32,
    move_directions: [u8; 10],
    move_extracts: [u8; 10],
    move_target_hazard1: [u8; 10],
    move_target_hazard2: [u8; 10],
    move_target_intensity: [u8; 10],
    evacuated: u8,
    evac_node_intensity: u8,

    // Public: commitment + claimed outputs
    commitment: pub [u8; 32],
    pub_outcome: pub u32,
    pub_total_resources: pub u32,
    pub_final_hull: pub u32,
    pub_final_fuel: pub u32,
    pub_evac_intensity: pub u32,
    pub_move_sequence: pub [u32; 10],
    pub_resources_per_node: pub [u32; 10],
) {
    // -- 1. Commitment binding --
    assert(salt_len <= MAX_SALT_LEN);
    let computed = compute_commitment(loadout, salt, salt_len);
    assert(computed == commitment);

    // -- 2. Loadout validity --
    for i in 0..LOADOUT_LEN {
        assert(loadout[i] <= 2);
    }
    // Resistance parts max at enhanced (tier 1)
    assert(loadout[IDX_THERMAL_SHIELD] <= 1);
    assert(loadout[IDX_CRYO_INSULATION] <= 1);
    assert(loadout[IDX_BIO_FILTER] <= 1);
    assert(loadout[IDX_RAD_HARDENING] <= 1);

    let weight = part_weight(loadout[IDX_FUEL_TANK])
        + part_weight(loadout[IDX_THERMAL_SHIELD])
        + part_weight(loadout[IDX_CRYO_INSULATION])
        + part_weight(loadout[IDX_BIO_FILTER])
        + part_weight(loadout[IDX_RAD_HARDENING])
        + part_weight(loadout[IDX_THERMAL_EXTRACTOR])
        + part_weight(loadout[IDX_CRYO_EXTRACTOR])
        + part_weight(loadout[IDX_BIO_EXTRACTOR])
        + part_weight(loadout[IDX_RAD_EXTRACTOR])
        + part_weight(loadout[IDX_CARGO_HOLD]);
    assert(weight <= MAX_WEIGHT);

    // -- 3. Derive probe stats --
    let max_fuel = fuel_by_tier(loadout[IDX_FUEL_TANK]);
    let max_cargo = cargo_by_tier(loadout[IDX_CARGO_HOLD]);

    // -- 4. Input validation --
    assert(num_moves <= MAX_MOVES);
    assert(evacuated <= 1);

    // -- 5. Simulate moves --
    let mut current_node: u32 = 1;
    let mut hull: u32 = BASE_HULL;
    let mut fuel: u32 = max_fuel;
    let mut cargo: u32 = 0;
    let mut resources: u32 = 0;
    let mut jettisoned: bool = false;

    let mut visited: [u32; MAX_VISITED] = [0; MAX_VISITED];
    visited[0] = 1;
    let mut visited_count: u32 = 1;

    let mut sim_move_sequence: [u32; 10] = [0; 10];
    let mut sim_resources_per_node: [u32; 10] = [0; 10];

    for i in 0..MAX_MOVES {
        if (i < num_moves) & (!jettisoned) {
            let dir = move_directions[i];
            let extract = move_extracts[i];
            assert((dir >= 1) & (dir <= 3));
            assert(extract <= 1);

            let target = resolve_target(current_node, dir);
            assert(target >= 1);
            assert(target <= NODE_COUNT);

            // Validate up-move: can't go up from root
            if dir == 3 {
                assert(current_node > 1);
            }
            // Validate left/right: can't exceed node count
            if dir == 1 {
                assert(current_node * 2 <= NODE_COUNT);
            }
            if dir == 2 {
                assert(current_node * 2 + 1 <= NODE_COUNT);
            }

            // Fuel cost
            fuel = saturating_sub(fuel, 1);

            // Check first visit
            let mut is_first_visit: bool = true;
            for v in 0..MAX_VISITED {
                if v < visited_count {
                    if visited[v] == target {
                        is_first_visit = false;
                    }
                }
            }

            // Track visit
            if is_first_visit {
                if visited_count < MAX_VISITED {
                    visited[visited_count] = target;
                    visited_count += 1;
                }
            }

            // Damage (not applied at start node, id=1)
            let is_start = target == 1;
            let h1 = move_target_hazard1[i];
            let h2 = move_target_hazard2[i];
            let intensity = move_target_intensity[i];
            assert((h1 <= 3) & (h2 <= 3));
            assert((intensity >= 1) & (intensity <= 3));

            if !is_start {
                let damage = compute_damage(h1, h2, intensity, loadout);
                hull = saturating_sub(hull, damage);
            }

            // Resources (only on first visit + extract)
            let mut gained: u32 = 0;
            if is_first_visit & (extract == 1) {
                let candidate = compute_resources(h1, h2, intensity, loadout);
                let room = saturating_sub(max_cargo, cargo);
                gained = if candidate < room { candidate } else { room };
                cargo += gained;
                resources += gained;
            }

            sim_move_sequence[i] = target;
            sim_resources_per_node[i] = gained;
            current_node = target;

            // Jettison check
            if (hull == 0) | (fuel == 0) {
                jettisoned = true;
            }
        }
    }

    // -- 6. Handle outcome --
    let mut final_resources = resources;

    if jettisoned {
        final_resources = (resources * JETTISON_KEEP_PERCENT) / 100;
        assert(pub_outcome == 1);
        assert(pub_evac_intensity == 0);
    } else {
        assert(evacuated == 1);
        assert(pub_outcome == 0);
        let keep_pct = evac_percent(evac_node_intensity);
        final_resources = (resources * keep_pct) / 100;
        assert(pub_evac_intensity == evac_node_intensity as u32);
        // Evacuation costs 1 fuel
        fuel = saturating_sub(fuel, 1);
    }

    // -- 7. Assert public outputs match simulation --
    assert(pub_total_resources == final_resources);
    assert(pub_final_hull == hull);
    assert(pub_final_fuel == fuel);

    for i in 0..MAX_MOVES {
        assert(pub_move_sequence[i] == sim_move_sequence[i]);
        assert(pub_resources_per_node[i] == sim_resources_per_node[i]);
    }
}

// -- Tests --

#[test]
fn accepts_matching_commitment_only() {
    // fuel_tank=0, shields=1,1,1,0, extractors=2,1,0,2, cargo=1
    let loadout: [u8; 10] = [0, 1, 1, 1, 0, 2, 1, 0, 2, 1];
    let mut salt: [u8; 64] = [0; 64];
    let salt_bytes: [u8; 9] = [116, 101, 115, 116, 95, 115, 97, 108, 116];
    for i in 0..9 {
        salt[i] = salt_bytes[i];
    }
    let salt_len: u32 = 9;
    let commitment = compute_commitment(loadout, salt, salt_len);

    // No moves, immediate evacuation
    main(
        loadout,
        salt,
        salt_len,
        0,                  // num_moves
        [0; 10],            // move_directions
        [0; 10],            // move_extracts
        [0; 10],            // move_target_hazard1
        [0; 10],            // move_target_hazard2
        [0; 10],            // move_target_intensity
        1,                  // evacuated
        1,                  // evac_node_intensity (intensity 1 at root)
        commitment,
        0,                  // outcome: evacuated
        0,                  // total_resources: 0
        10,                 // final_hull: unchanged
        5,                  // final_fuel: 6 - 1 (evac)
        1,                  // evac_intensity
        [0; 10],            // move_sequence (no moves)
        [0; 10],            // resources_per_node
    );
}

#[test(should_fail)]
fn rejects_wrong_commitment() {
    let loadout: [u8; 10] = [0, 1, 2, 1, 0, 2, 1, 0, 2, 1];
    let mut salt: [u8; 64] = [0; 64];
    let salt_bytes: [u8; 9] = [116, 101, 115, 116, 95, 115, 97, 108, 116];
    for i in 0..9 {
        salt[i] = salt_bytes[i];
    }
    let salt_len: u32 = 9;
    let bad_commitment: [u8; 32] = [0; 32];

    main(
        loadout,
        salt,
        salt_len,
        0,
        [0; 10],
        [0; 10],
        [0; 10],
        [0; 10],
        [0; 10],
        1,
        1,
        bad_commitment,
        0,
        0,
        10,
        5,
        1,
        [0; 10],
        [0; 10],
    );
}

#[test]
fn validates_one_move_with_damage_and_resources() {
    // Default loadout: all standard
    let loadout: [u8; 10] = [0; 10];
    let mut salt: [u8; 64] = [0; 64];
    salt[0] = 65; // "A"
    let salt_len: u32 = 1;
    let commitment = compute_commitment(loadout, salt, salt_len);

    // One move: left from root (node 1 -> node 2)
    // Node 2: heat/heat, intensity 1
    // Damage = max(0, 1+0-0) + max(0, 1+0-0) = 2
    // Resources (extract=1): resource_base(1)=1, extractor(0)=10, both heat -> (1*10 + 1*10)*2 = 40
    // Cargo room: 100 (standard), so gained = 40
    // Then evacuate at node 2 (intensity 1 -> keep 25%)
    // final_resources = floor(40 * 25 / 100) = 10
    let mut dirs: [u8; 10] = [0; 10];
    dirs[0] = 1; // left
    let mut extracts: [u8; 10] = [0; 10];
    extracts[0] = 1;
    let mut h1: [u8; 10] = [0; 10];
    h1[0] = 0; // heat
    let mut h2: [u8; 10] = [0; 10];
    h2[0] = 0; // heat
    let mut intensity: [u8; 10] = [0; 10];
    intensity[0] = 1;

    let mut seq: [u32; 10] = [0; 10];
    seq[0] = 2;
    let mut res: [u32; 10] = [0; 10];
    res[0] = 40;

    main(
        loadout,
        salt,
        salt_len,
        1,          // num_moves
        dirs,
        extracts,
        h1,
        h2,
        intensity,
        1,          // evacuated
        1,          // evac at intensity 1
        commitment,
        0,          // outcome: evacuated
        10,         // total_resources: floor(40 * 25 / 100)
        8,          // hull: 10 - 2
        4,          // fuel: 6 - 1 (move) - 1 (evac)
        1,          // evac_intensity
        seq,
        res,
    );
}

#[test]
fn validates_jettison_on_fuel_exhaustion() {
    // Default loadout: fuel = 6
    let loadout: [u8; 10] = [0; 10];
    let mut salt: [u8; 64] = [0; 64];
    salt[0] = 66; // "B"
    let salt_len: u32 = 1;
    let commitment = compute_commitment(loadout, salt, salt_len);

    // 6 moves left-left-left-left-left-left, all no extract
    // Each at intensity 1, heat/cold (damage = 1+1=2 per node)
    // After 6 moves: fuel = 0, hull = 10 - 2*6 = -2 -> 0 (saturated)
    // Actually hull hits 0 on move 5 (10-2*5=0), so jettison at move 5
    // Let me recalculate:
    // Move 1: node 2, fuel 5, hull 10-2=8
    // Move 2: node 4, fuel 4, hull 8-2=6
    // Move 3: node 8, fuel 3, hull 6-2=4
    // Move 4: node 16, fuel 2, hull 4-2=2
    // Move 5: node 32, fuel 1, hull 2-2=0 -> jettison!
    // After jettison: resources * 5% -> 0
    let mut dirs: [u8; 10] = [0; 10];
    let mut h1: [u8; 10] = [0; 10];
    let mut h2: [u8; 10] = [0; 10];
    let mut intensity: [u8; 10] = [0; 10];
    for i in 0..5 {
        dirs[i] = 1; // left
        h1[i] = 0;   // heat
        h2[i] = 1;   // cold
        intensity[i] = 1;
    }

    let mut seq: [u32; 10] = [0; 10];
    seq[0] = 2;
    seq[1] = 4;
    seq[2] = 8;
    seq[3] = 16;
    seq[4] = 32;

    main(
        loadout,
        salt,
        salt_len,
        5,          // num_moves
        dirs,
        [0; 10],    // no extracts
        h1,
        h2,
        intensity,
        0,          // not evacuated (jettisoned)
        0,          // evac_node_intensity irrelevant
        commitment,
        1,          // outcome: jettisoned
        0,          // total_resources: 0 * 5% = 0
        0,          // hull: 0
        1,          // fuel: 6 - 5 = 1
        0,          // evac_intensity: 0 (jettisoned)
        seq,
        [0; 10],    // resources_per_node: 0 (no extracts)
    );
}
