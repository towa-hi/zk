#![cfg(test)]

use crate::{Error, MineGameContract, MineGameContractClient, ProofOutputs};
use soroban_sdk::testutils::{Address as _, Ledger as _};
use soroban_sdk::{Bytes, BytesN, Env, contract, contractimpl, contracttype, vec, Address};

#[contract]
pub struct MockGameHub;

#[contracttype]
#[derive(Clone)]
enum HubDataKey {
    LastEndSession,
    LastPlayer1Won,
    EndCount,
}

#[contractimpl]
impl MockGameHub {
    pub fn start_game(
        _env: Env,
        _game_id: Address,
        _session_id: u32,
        _player1: Address,
        _player2: Address,
        _player1_points: i128,
        _player2_points: i128,
    ) {
    }

    pub fn end_game(env: Env, session_id: u32, player1_won: bool) {
        env.storage()
            .instance()
            .set(&HubDataKey::LastEndSession, &session_id);
        env.storage()
            .instance()
            .set(&HubDataKey::LastPlayer1Won, &player1_won);
        let current: u32 = env.storage().instance().get(&HubDataKey::EndCount).unwrap_or(0);
        env.storage()
            .instance()
            .set(&HubDataKey::EndCount, &(current + 1));
    }

    pub fn get_last_end_session(env: Env) -> u32 {
        env.storage()
            .instance()
            .get(&HubDataKey::LastEndSession)
            .unwrap_or(0)
    }

    pub fn get_last_player1_won(env: Env) -> bool {
        env.storage()
            .instance()
            .get(&HubDataKey::LastPlayer1Won)
            .unwrap_or(false)
    }

    pub fn get_end_count(env: Env) -> u32 {
        env.storage().instance().get(&HubDataKey::EndCount).unwrap_or(0)
    }

    pub fn add_game(_env: Env, _game_address: Address) {}
}

#[contract]
pub struct MockVerifier;

#[contracttype]
#[derive(Clone)]
enum VerifierDataKey {
    ShouldVerify,
}

#[contractimpl]
impl MockVerifier {
    pub fn set_should_verify(env: Env, should_verify: bool) {
        env.storage()
            .instance()
            .set(&VerifierDataKey::ShouldVerify, &should_verify);
    }

    pub fn verify(
        env: Env,
        _session_id: u32,
        _player: Address,
        _proof_payload: Bytes,
        _commitment: Bytes,
        _outputs: ProofOutputs,
    ) -> bool {
        env.storage()
            .instance()
            .get(&VerifierDataKey::ShouldVerify)
            .unwrap_or(true)
    }
}

fn setup_test() -> (
    Env,
    MineGameContractClient<'static>,
    MockGameHubClient<'static>,
    MockVerifierClient<'static>,
    Address,
    Address,
) {
    let env = Env::default();
    env.mock_all_auths();
    env.ledger().set(soroban_sdk::testutils::LedgerInfo {
        timestamp: 1441065600,
        protocol_version: 25,
        sequence_number: 100,
        network_id: Default::default(),
        base_reserve: 10,
        min_temp_entry_ttl: u32::MAX / 2,
        min_persistent_entry_ttl: u32::MAX / 2,
        max_entry_ttl: u32::MAX / 2,
    });

    let hub_addr = env.register(MockGameHub, ());
    let game_hub = MockGameHubClient::new(&env, &hub_addr);
    let verifier_addr = env.register(MockVerifier, ());
    let verifier = MockVerifierClient::new(&env, &verifier_addr);
    let admin = Address::generate(&env);
    let contract_id = env.register(MineGameContract, (&admin, &hub_addr, &verifier_addr));
    game_hub.add_game(&contract_id);
    let client = MineGameContractClient::new(&env, &contract_id);
    client.set_verifier(&verifier_addr);
    let player = Address::generate(&env);
    (env, client, game_hub, verifier, admin, player)
}

fn assert_contract_error<T, E>(
    result: &Result<Result<T, E>, Result<Error, soroban_sdk::InvokeError>>,
    expected_error: Error,
) {
    match result {
        Err(Ok(actual_error)) => assert_eq!(*actual_error, expected_error),
        _ => panic!("Expected contract error {:?}", expected_error),
    }
}

#[test]
fn test_start_and_get_game_state() {
    let (_env, client, _hub, _verifier, _admin, player) = setup_test();
    let session_id = 1u32;
    let points = 100_0000000i128;
    client.start_game(&session_id, &player, &player, &points, &0i128);

    let game = client.get_game(&session_id);
    assert_eq!(game.player1, player);
    assert_eq!(game.player1_points, points);
    assert!(!game.proof_submitted);
}

#[test]
fn test_get_game_not_found() {
    let (_env, client, _hub, _verifier, _admin, _player) = setup_test();
    let missing_session_id = 999u32;
    let result = client.try_get_game(&missing_session_id);
    assert_contract_error(&result, Error::GameNotFound);
}

#[test]
fn test_set_and_get_admin_hub_and_verifier() {
    let (env, client, _hub, _verifier, _admin, _player) = setup_test();
    let new_admin = Address::generate(&env);
    let new_hub = Address::generate(&env);
    let new_verifier = Address::generate(&env);

    client.set_admin(&new_admin);
    assert_eq!(client.get_admin(), new_admin);

    client.set_hub(&new_hub);
    assert_eq!(client.get_hub(), new_hub);

    client.set_verifier(&new_verifier);
    assert_eq!(client.get_verifier(), new_verifier);
}

#[test]
fn test_commit_then_submit_proof_happy_path() {
    let (env, client, hub, _verifier, _admin, player) = setup_test();
    let session_id = 2u32;
    let points = 250_0000000i128;
    let commitment = Bytes::from_array(&env, &[1, 2, 3, 4]);
    let proof = Bytes::from_array(&env, &[9, 8, 7]);
    let outputs = sample_outputs(&env, 0, 3);

    client.start_game(&session_id, &player, &player, &points, &0i128);
    client.commit_loadout(&session_id, &player, &commitment);
    client.submit_proof(
        &session_id,
        &player,
        &proof,
        &commitment,
        &outputs,
    );

    let stored_commitment = client.get_commitment(&session_id, &player);
    assert_eq!(stored_commitment, commitment);

    let stored_results = client.get_results(&session_id, &player);
    assert_eq!(stored_results.total_resources, outputs.total_resources);
    assert_eq!(stored_results.outcome, 0);

    let game = client.get_game(&session_id);
    assert!(game.proof_submitted);

    assert_eq!(hub.get_end_count(), 1);
    assert_eq!(hub.get_last_end_session(), session_id);
    assert!(hub.get_last_player1_won());
}

#[test]
fn test_submit_proof_without_commitment_rejected() {
    let (env, client, _hub, _verifier, _admin, player) = setup_test();
    let session_id = 3u32;
    let points = 100_0000000i128;
    client.start_game(&session_id, &player, &player, &points, &0i128);

    let result = client.try_submit_proof(
        &session_id,
        &player,
        &Bytes::from_array(&env, &[7]),
        &Bytes::from_array(&env, &[1]),
        &sample_outputs(&env, 0, 2),
    );
    assert_contract_error(&result, Error::MissingCommitment);
}

#[test]
fn test_duplicate_commitment_rejected() {
    let (env, client, _hub, _verifier, _admin, player) = setup_test();
    let session_id = 4u32;
    let commitment = Bytes::from_array(&env, &[11, 22]);
    client.start_game(&session_id, &player, &player, &100_0000000, &0i128);
    client.commit_loadout(&session_id, &player, &commitment);

    let result = client.try_commit_loadout(&session_id, &player, &Bytes::from_array(&env, &[33]));
    assert_contract_error(&result, Error::CommitmentAlreadySubmitted);
}

#[test]
fn test_duplicate_proof_submission_rejected() {
    let (env, client, _hub, _verifier, _admin, player) = setup_test();
    let session_id = 5u32;
    let commitment = Bytes::from_array(&env, &[6, 6, 6]);
    let proof = Bytes::from_array(&env, &[1, 2, 3]);
    let outputs = sample_outputs(&env, 0, 1);

    client.start_game(&session_id, &player, &player, &100_0000000, &0i128);
    client.commit_loadout(&session_id, &player, &commitment);
    client.submit_proof(
        &session_id,
        &player,
        &proof,
        &commitment,
        &outputs,
    );

    let result = client.try_submit_proof(
        &session_id,
        &player,
        &proof,
        &commitment,
        &outputs,
    );
    assert_contract_error(&result, Error::ProofAlreadySubmitted);
}

#[test]
fn test_verifier_failure_rejected_and_hub_not_ended() {
    let (env, client, hub, verifier, _admin, player) = setup_test();
    verifier.set_should_verify(&false);

    let session_id = 6u32;
    let commitment = Bytes::from_array(&env, &[44, 55]);
    client.start_game(&session_id, &player, &player, &100_0000000, &0i128);
    client.commit_loadout(&session_id, &player, &commitment);

    let result = client.try_submit_proof(
        &session_id,
        &player,
        &Bytes::from_array(&env, &[9, 9]),
        &commitment,
        &sample_outputs(&env, 1, 0),
    );
    assert_contract_error(&result, Error::InvalidProof);
    assert_eq!(hub.get_end_count(), 0);
}

#[test]
fn test_invalid_public_outputs_rejected() {
    let (env, client, _hub, _verifier, _admin, player) = setup_test();
    let session_id = 7u32;
    let commitment = Bytes::from_array(&env, &[9, 0]);
    client.start_game(&session_id, &player, &player, &100_0000000, &0i128);
    client.commit_loadout(&session_id, &player, &commitment);

    let bad_outputs = ProofOutputs {
        move_sequence: vec![&env, 1],
        resources_per_node: vec![&env, 2],
        total_resources: 10,
        final_hull: 4,
        final_fuel: 1,
        outcome: 0,
        evac_intensity: 0,
    };
    let result = client.try_submit_proof(
        &session_id,
        &player,
        &Bytes::from_array(&env, &[1]),
        &commitment,
        &bad_outputs,
    );
    assert_contract_error(&result, Error::InvalidEvacIntensity);
}

#[test]
fn test_upgrade_function_exists() {
    let env = Env::default();
    env.mock_all_auths();

    let admin = Address::generate(&env);
    let hub_addr = env.register(MockGameHub, ());
    let verifier_addr = env.register(MockVerifier, ());
    let contract_id = env.register(MineGameContract, (&admin, &hub_addr, &verifier_addr));
    let client = MineGameContractClient::new(&env, &contract_id);
    let new_wasm_hash = BytesN::from_array(&env, &[1u8; 32]);
    let result = client.try_upgrade(&new_wasm_hash);
    assert!(result.is_err());
}

fn sample_outputs(env: &Env, outcome: u32, evac_intensity: u32) -> ProofOutputs {
    ProofOutputs {
        move_sequence: vec![env, 1, 2, 3],
        resources_per_node: vec![env, 10, 20, 30],
        total_resources: 60,
        final_hull: 5,
        final_fuel: 2,
        outcome,
        evac_intensity,
    }
}
