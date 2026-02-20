#![cfg(test)]

use crate::{Error, MineGameContract, MineGameContractClient};
use soroban_sdk::testutils::{Address as _, Ledger as _};
use soroban_sdk::{contract, contractimpl, Address, BytesN, Env};

#[contract]
pub struct MockGameHub;

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

    pub fn end_game(_env: Env, _session_id: u32, _player1_won: bool) {}

    pub fn add_game(_env: Env, _game_address: Address) {}
}

fn setup_test() -> (Env, MineGameContractClient<'static>, Address, Address) {
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
    let admin = Address::generate(&env);
    let contract_id = env.register(MineGameContract, (&admin, &hub_addr));
    game_hub.add_game(&contract_id);
    let client = MineGameContractClient::new(&env, &contract_id);
    let player = Address::generate(&env);
    (env, client, admin, player)
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
fn test_single_player_complete_game() {
    let (_env, client, _admin, player) = setup_test();

    let session_id = 1u32;
    client.start_game(&session_id, &player, &player, &100_0000000, &100_0000000);
    client.make_guess(&session_id, &player, &5);
    let winner = client.reveal_winner(&session_id);

    let game = client.get_game(&session_id);
    assert_eq!(game.player1, player);
    assert!(game.player2 != player);
    assert_eq!(game.player2_points, 0);
    assert_eq!(game.player1_guess, Some(5));
    assert!(game.player2_guess.is_some());
    assert!(game.winning_number.is_some());
    assert_eq!(game.winner, Some(winner));
}

#[test]
fn test_player_cannot_guess_twice() {
    let (_env, client, _admin, player) = setup_test();
    let session_id = 2u32;

    client.start_game(&session_id, &player, &player, &100_0000000, &100_0000000);
    client.make_guess(&session_id, &player, &7);
    let result = client.try_make_guess(&session_id, &player, &8);
    assert_contract_error(&result, Error::AlreadyGuessed);
}

#[test]
fn test_reveal_requires_player_guess() {
    let (_env, client, _admin, player) = setup_test();
    let session_id = 3u32;

    client.start_game(&session_id, &player, &player, &100_0000000, &100_0000000);
    let result = client.try_reveal_winner(&session_id);
    assert_contract_error(&result, Error::PlayerGuessMissing);
}

#[test]
fn test_non_player_cannot_guess() {
    let (env, client, _admin, player) = setup_test();
    let stranger = Address::generate(&env);
    let session_id = 4u32;

    client.start_game(&session_id, &player, &player, &100_0000000, &100_0000000);
    let result = client.try_make_guess(&session_id, &stranger, &5);
    assert_contract_error(&result, Error::NotPlayer);
}

#[test]
fn test_upgrade_function_exists() {
    let env = Env::default();
    env.mock_all_auths();

    let admin = Address::generate(&env);
    let hub_addr = env.register(MockGameHub, ());
    let contract_id = env.register(MineGameContract, (&admin, &hub_addr));
    let client = MineGameContractClient::new(&env, &contract_id);
    let new_wasm_hash = BytesN::from_array(&env, &[1u8; 32]);
    let result = client.try_upgrade(&new_wasm_hash);
    assert!(result.is_err());
}
