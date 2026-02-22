#![no_std]

//! # Mine Game
//!
//! Session bootstrap contract for Mine Game.
//!
//! **Game Hub Integration:**
//! This game is Game Hub-aware and starts sessions through the Game Hub contract.

use soroban_sdk::{
    Address, Bytes, BytesN, Env, IntoVal, Vec, contract, contractclient, contracterror, contractimpl,
    contracttype, vec
};

// Import GameHub contract interface
// This allows us to call into the GameHub contract
#[contractclient(name = "GameHubClient")]
pub trait GameHub {
    fn start_game(
        env: Env,
        game_id: Address,
        session_id: u32,
        player1: Address,
        player2: Address,
        player1_points: i128,
        player2_points: i128,
    );

    fn end_game(env: Env, session_id: u32, player1_won: bool);
}

#[contractclient(name = "VerifierClient")]
pub trait Verifier {
    fn verify(
        env: Env,
        session_id: u32,
        player: Address,
        vk_json: Bytes,
        proof_blob: Bytes,
        commitment: Bytes,
        outputs: ProofOutputs,
    ) -> bool;
}

// ============================================================================
// Errors
// ============================================================================

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum Error {
    GameNotFound = 1,
    SessionAlreadyExists = 2,
    NotSessionPlayer = 3,
    MissingCommitment = 4,
    CommitmentAlreadySubmitted = 5,
    ProofAlreadySubmitted = 6,
    CommitmentMismatch = 7,
    VerifierNotSet = 8,
    InvalidProof = 9,
    InvalidPublicOutputs = 10,
    InvalidOutcome = 11,
    InvalidEvacIntensity = 12,
}

// ============================================================================
// Data Types
// ============================================================================

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Game {
    pub player1: Address,
    pub player1_points: i128,
    pub proof_submitted: bool,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ProofOutputs {
    pub move_sequence: Vec<u32>,
    pub resources_per_node: Vec<u32>,
    pub total_resources: u32,
    pub final_hull: u32,
    pub final_fuel: u32,
    pub outcome: u32,
    pub evac_intensity: u32,
}

#[contracttype]
#[derive(Clone)]
pub enum DataKey {
    Game(u32),
    Commitment(u32, Address),
    Result(u32, Address),
    ActiveSession(Address),
    GameHubAddress,
    VerifierAddress,
    Admin,
    PlanetSeed,
}

// ============================================================================
// Storage TTL Management
// ============================================================================
// TTL (Time To Live) ensures game data doesn't expire unexpectedly
// Games are stored in temporary storage with a minimum 30-day retention

/// TTL for game storage (30 days in ledgers, ~5 seconds per ledger)
/// 30 days = 30 * 24 * 60 * 60 / 5 = 518,400 ledgers
const GAME_TTL_LEDGERS: u32 = 518_400;

// ============================================================================
// Contract Definition
// ============================================================================

#[contract]
pub struct MineGameContract;

#[contractimpl]
impl MineGameContract {
    /// Initialize the contract with GameHub address and admin
    ///
    /// # Arguments
    /// * `admin` - Admin address (can upgrade contract)
    /// * `game_hub` - Address of the GameHub contract
    pub fn __constructor(env: Env, admin: Address, game_hub: Address, verifier: Address) {
        // Store admin and GameHub address
        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage()
            .instance()
            .set(&DataKey::GameHubAddress, &game_hub);
        env.storage()
            .instance()
            .set(&DataKey::VerifierAddress, &verifier);
        env.storage()
            .instance()
            .set(&DataKey::PlanetSeed, &(env.ledger().sequence() as u64));
    }

    /// Start a new single-player game with points.
    /// This creates a session in the Game Hub and locks points before starting the game.
    ///
    /// **CRITICAL:** This method requires authorization from THIS contract (not players).
    /// The Game Hub will call `game_id.require_auth()` which checks this contract's address.
    ///
    /// # Arguments
    /// * `session_id` - Unique session identifier (u32)
    /// * `player1` - Address of first player
    /// * `player2` - Ignored for single-player mode (kept for ABI compatibility)
    /// * `player1_points` - Points amount committed by player
    /// * `player2_points` - Ignored for single-player mode (kept for ABI compatibility)
    pub fn start_game(
        env: Env,
        session_id: u32,
        player1: Address,
        _player2: Address,
        player1_points: i128,
        _player2_points: i128,
    ) -> Result<(), Error> {
        // Single-player mode only needs player auth.
        player1.require_auth_for_args(vec![&env, session_id.into_val(&env), player1_points.into_val(&env)]);

        let active_session_key = DataKey::ActiveSession(player1.clone());
        let active_session: Option<u32> = env.storage().temporary().get(&active_session_key);
        if let Some(existing_session_id) = active_session {
            reset_player_session_state(&env, existing_session_id, &player1);
        }

        let game_key = DataKey::Game(session_id);
        if env.storage().temporary().has(&game_key) {
            let existing_game: Game = env
                .storage()
                .temporary()
                .get(&game_key)
                .ok_or(Error::GameNotFound)?;
            if existing_game.player1 != player1 {
                return Err(Error::SessionAlreadyExists);
            }
            reset_player_session_state(&env, session_id, &player1);
        }

        // Represent the house as this contract address in the game and hub session.
        let house_player = env.current_contract_address();
        let house_points = 0i128;

        // Get GameHub address
        let game_hub_addr: Address = env
            .storage()
            .instance()
            .get(&DataKey::GameHubAddress)
            .expect("GameHub address not set");

        // Create GameHub client
        let game_hub = GameHubClient::new(&env, &game_hub_addr);

        // Call Game Hub to start the session and lock points
        // This requires THIS contract's authorization (env.current_contract_address())
        game_hub.start_game(
            &env.current_contract_address(),
            &session_id,
            &player1,
            &house_player,
            &player1_points,
            &house_points,
        );

        // Persist the minimal session context for this phase.
        let game = Game {
            player1: player1.clone(),
            player1_points,
            proof_submitted: false,
        };

        // Store game in temporary storage with 30-day TTL
        env.storage().temporary().set(&game_key, &game);
        env.storage()
            .temporary()
            .set(&active_session_key, &session_id);
        extend_temp_ttl(&env, &game_key);
        extend_temp_ttl(&env, &active_session_key);

        // Event emitted by the Game Hub contract (GameStarted)

        Ok(())
    }

    pub fn commit_loadout(
        env: Env,
        session_id: u32,
        player: Address,
        commitment: Bytes,
    ) -> Result<(), Error> {
        player.require_auth();

        let game_key = DataKey::Game(session_id);
        let game = get_game_for_player(&env, session_id, &player)?;
        let result_key = DataKey::Result(session_id, player.clone());
        if game.proof_submitted || env.storage().temporary().has(&result_key) {
            return Err(Error::ProofAlreadySubmitted);
        }

        let commitment_key = DataKey::Commitment(session_id, player);
        if env.storage().temporary().has(&commitment_key) {
            return Err(Error::CommitmentAlreadySubmitted);
        }

        env.storage().temporary().set(&commitment_key, &commitment);
        extend_temp_ttl(&env, &commitment_key);
        extend_temp_ttl(&env, &game_key);

        Ok(())
    }

    pub fn submit_proof(
        env: Env,
        session_id: u32,
        player: Address,
        vk_json: Bytes,
        proof_blob: Bytes,
        submitted_commitment: Bytes,
        public_outputs: ProofOutputs,
    ) -> Result<(), Error> {
        player.require_auth();
        validate_outputs(&public_outputs)?;

        let mut game = get_game_for_player(&env, session_id, &player)?;
        if game.proof_submitted {
            return Err(Error::ProofAlreadySubmitted);
        }

        let commitment_key = DataKey::Commitment(session_id, player.clone());
        let stored_commitment: Bytes = env
            .storage()
            .temporary()
            .get(&commitment_key)
            .ok_or(Error::MissingCommitment)?;
        if stored_commitment != submitted_commitment {
            return Err(Error::CommitmentMismatch);
        }

        let result_key = DataKey::Result(session_id, player.clone());
        if env.storage().temporary().has(&result_key) {
            return Err(Error::ProofAlreadySubmitted);
        }

        let verifier_addr: Address = env
            .storage()
            .instance()
            .get(&DataKey::VerifierAddress)
            .ok_or(Error::VerifierNotSet)?;
        let verifier = VerifierClient::new(&env, &verifier_addr);
        let proof_ok = verifier.verify(
            &session_id,
            &player,
            &vk_json,
            &proof_blob,
            &submitted_commitment,
            &public_outputs,
        );
        if !proof_ok {
            return Err(Error::InvalidProof);
        }

        env.storage().temporary().set(&result_key, &public_outputs);
        extend_temp_ttl(&env, &result_key);
        extend_temp_ttl(&env, &commitment_key);

        game.proof_submitted = true;
        let game_key = DataKey::Game(session_id);
        env.storage().temporary().set(&game_key, &game);
        extend_temp_ttl(&env, &game_key);

        let game_hub_addr: Address = env
            .storage()
            .instance()
            .get(&DataKey::GameHubAddress)
            .expect("GameHub address not set");
        let game_hub = GameHubClient::new(&env, &game_hub_addr);

        // Milestone 1 single-player semantics:
        // outcome=0 (evacuated) counts as player1_won=true, outcome=1 as false.
        let player1_won = public_outputs.outcome == 0;
        game_hub.end_game(&session_id, &player1_won);

        Ok(())
    }

    /// Get game information.
    ///
    /// # Arguments
    /// * `session_id` - The session ID of the game
    ///
    /// # Returns
    /// * `Game` - The stored session context
    pub fn get_game(env: Env, session_id: u32) -> Result<Game, Error> {
        let key = DataKey::Game(session_id);
        env.storage()
            .temporary()
            .get(&key)
            .ok_or(Error::GameNotFound)
    }

    pub fn get_commitment(env: Env, session_id: u32, player: Address) -> Result<Bytes, Error> {
        let key = DataKey::Commitment(session_id, player);
        env.storage()
            .temporary()
            .get(&key)
            .ok_or(Error::MissingCommitment)
    }

    pub fn get_results(env: Env, session_id: u32, player: Address) -> Result<ProofOutputs, Error> {
        let key = DataKey::Result(session_id, player);
        env.storage()
            .temporary()
            .get(&key)
            .ok_or(Error::GameNotFound)
    }

    pub fn get_planet_seed(env: Env) -> u64 {
        env.storage()
            .instance()
            .get(&DataKey::PlanetSeed)
            .expect("Planet seed not set")
    }

    // ========================================================================
    // Admin Functions
    // ========================================================================

    /// Get the current admin address
    ///
    /// # Returns
    /// * `Address` - The admin address
    pub fn get_admin(env: Env) -> Address {
        env.storage()
            .instance()
            .get(&DataKey::Admin)
            .expect("Admin not set")
    }

    /// Set a new admin address
    ///
    /// # Arguments
    /// * `new_admin` - The new admin address
    pub fn set_admin(env: Env, new_admin: Address) {
        let admin: Address = env
            .storage()
            .instance()
            .get(&DataKey::Admin)
            .expect("Admin not set");
        admin.require_auth();

        env.storage().instance().set(&DataKey::Admin, &new_admin);
    }

    /// Get the current GameHub contract address
    ///
    /// # Returns
    /// * `Address` - The GameHub contract address
    pub fn get_hub(env: Env) -> Address {
        env.storage()
            .instance()
            .get(&DataKey::GameHubAddress)
            .expect("GameHub address not set")
    }

    /// Set a new GameHub contract address
    ///
    /// # Arguments
    /// * `new_hub` - The new GameHub contract address
    pub fn set_hub(env: Env, new_hub: Address) {
        require_admin(&env);

        env.storage()
            .instance()
            .set(&DataKey::GameHubAddress, &new_hub);
    }

    pub fn get_verifier(env: Env) -> Result<Address, Error> {
        env.storage()
            .instance()
            .get(&DataKey::VerifierAddress)
            .ok_or(Error::VerifierNotSet)
    }

    pub fn set_verifier(env: Env, verifier: Address) {
        require_admin(&env);
        env.storage()
            .instance()
            .set(&DataKey::VerifierAddress, &verifier);
    }

    pub fn set_planet_seed(env: Env, planet_seed: u64) {
        require_admin(&env);
        env.storage().instance().set(&DataKey::PlanetSeed, &planet_seed);
    }

    /// Update the contract WASM hash (upgrade contract)
    ///
    /// # Arguments
    /// * `new_wasm_hash` - The hash of the new WASM binary
    pub fn upgrade(env: Env, new_wasm_hash: BytesN<32>) {
        require_admin(&env);

        env.deployer().update_current_contract_wasm(new_wasm_hash);
    }
}

fn get_game_for_player(env: &Env, session_id: u32, player: &Address) -> Result<Game, Error> {
    let game_key = DataKey::Game(session_id);
    let game: Game = env
        .storage()
        .temporary()
        .get(&game_key)
        .ok_or(Error::GameNotFound)?;
    if &game.player1 != player {
        return Err(Error::NotSessionPlayer);
    }
    Ok(game)
}

fn require_admin(env: &Env) {
    let admin: Address = env
        .storage()
        .instance()
        .get(&DataKey::Admin)
        .expect("Admin not set");
    admin.require_auth();
}

fn extend_temp_ttl(env: &Env, key: &DataKey) {
    env.storage()
        .temporary()
        .extend_ttl(key, GAME_TTL_LEDGERS, GAME_TTL_LEDGERS);
}

fn reset_player_session_state(env: &Env, session_id: u32, player: &Address) {
    let game_key = DataKey::Game(session_id);
    let stored_game: Option<Game> = env.storage().temporary().get(&game_key);
    if let Some(game) = stored_game {
        if &game.player1 == player {
            env.storage().temporary().remove(&game_key);
        }
    }

    let commitment_key = DataKey::Commitment(session_id, player.clone());
    env.storage().temporary().remove(&commitment_key);

    let result_key = DataKey::Result(session_id, player.clone());
    env.storage().temporary().remove(&result_key);

    let active_session_key = DataKey::ActiveSession(player.clone());
    let active_session: Option<u32> = env.storage().temporary().get(&active_session_key);
    if active_session == Some(session_id) {
        env.storage().temporary().remove(&active_session_key);
    }
}

fn validate_outputs(outputs: &ProofOutputs) -> Result<(), Error> {
    if outputs.move_sequence.len() > 10 || outputs.resources_per_node.len() > 10 {
        return Err(Error::InvalidPublicOutputs);
    }
    if outputs.move_sequence.len() != outputs.resources_per_node.len() {
        return Err(Error::InvalidPublicOutputs);
    }
    if outputs.outcome > 1 {
        return Err(Error::InvalidOutcome);
    }
    if outputs.outcome == 1 && outputs.evac_intensity != 0 {
        return Err(Error::InvalidEvacIntensity);
    }
    if outputs.outcome == 0 && (outputs.evac_intensity == 0 || outputs.evac_intensity > 3) {
        return Err(Error::InvalidEvacIntensity);
    }
    Ok(())
}

// ============================================================================
// Tests
// ============================================================================

#[cfg(test)]
mod test;
