import { Buffer } from "buffer";
import { Address } from "@stellar/stellar-sdk";
import {
  AssembledTransaction,
  Client as ContractClient,
  ClientOptions as ContractClientOptions,
  MethodOptions,
  Result,
  Spec as ContractSpec,
} from "@stellar/stellar-sdk/contract";
import type {
  u32,
  i32,
  u64,
  i64,
  u128,
  i128,
  u256,
  i256,
  Option,
  Timepoint,
  Duration,
} from "@stellar/stellar-sdk/contract";
export * from "@stellar/stellar-sdk";
export * as contract from "@stellar/stellar-sdk/contract";
export * as rpc from "@stellar/stellar-sdk/rpc";

if (typeof window !== "undefined") {
  //@ts-ignore Buffer exists
  window.Buffer = window.Buffer || Buffer;
}

export interface Game {
  player1: string;
  player1_points: i128;
  proof_submitted: boolean;
}

export const Errors = {
  1: { message: "GameNotFound" },
  2: { message: "SessionAlreadyExists" },
  3: { message: "NotSessionPlayer" },
  4: { message: "MissingCommitment" },
  5: { message: "CommitmentAlreadySubmitted" },
  6: { message: "ProofAlreadySubmitted" },
  7: { message: "CommitmentMismatch" },
  8: { message: "VerifierNotSet" },
  9: { message: "InvalidProof" },
  10: { message: "InvalidPublicOutputs" },
  11: { message: "InvalidOutcome" },
  12: { message: "InvalidEvacIntensity" },
};

export type DataKey =
  | { tag: "Game"; values: readonly [u32] }
  | { tag: "Commitment"; values: readonly [u32, string] }
  | { tag: "Result"; values: readonly [u32, string] }
  | { tag: "GameHubAddress"; values: void }
  | { tag: "VerifierAddress"; values: void }
  | { tag: "Admin"; values: void }
  | { tag: "PlanetSeed"; values: void };

export interface ProofOutputs {
  evac_intensity: u32;
  final_fuel: u32;
  final_hull: u32;
  move_sequence: Array<u32>;
  outcome: u32;
  resources_per_node: Array<u32>;
  total_resources: u32;
}

export interface Client {
  get_hub: (options?: MethodOptions) => Promise<AssembledTransaction<string>>;
  set_hub: (
    { new_hub }: { new_hub: string },
    options?: MethodOptions
  ) => Promise<AssembledTransaction<null>>;
  upgrade: (
    { new_wasm_hash }: { new_wasm_hash: Buffer },
    options?: MethodOptions
  ) => Promise<AssembledTransaction<null>>;
  get_game: (
    { session_id }: { session_id: u32 },
    options?: MethodOptions
  ) => Promise<AssembledTransaction<Result<Game>>>;
  get_admin: (options?: MethodOptions) => Promise<AssembledTransaction<string>>;
  set_admin: (
    { new_admin }: { new_admin: string },
    options?: MethodOptions
  ) => Promise<AssembledTransaction<null>>;
  start_game: (
    {
      session_id,
      player1,
      player2,
      player1_points,
      player2_points,
    }: {
      session_id: u32;
      player1: string;
      player2: string;
      player1_points: i128;
      player2_points: i128;
    },
    options?: MethodOptions
  ) => Promise<AssembledTransaction<Result<void>>>;
  get_results: (
    { session_id, player }: { session_id: u32; player: string },
    options?: MethodOptions
  ) => Promise<AssembledTransaction<Result<ProofOutputs>>>;
  get_verifier: (
    options?: MethodOptions
  ) => Promise<AssembledTransaction<Result<string>>>;
  set_verifier: (
    { verifier }: { verifier: string },
    options?: MethodOptions
  ) => Promise<AssembledTransaction<null>>;
  submit_proof: (
    {
      session_id,
      player,
      proof_payload,
      submitted_commitment,
      public_outputs,
    }: {
      session_id: u32;
      player: string;
      proof_payload: Buffer;
      submitted_commitment: Buffer;
      public_outputs: ProofOutputs;
    },
    options?: MethodOptions
  ) => Promise<AssembledTransaction<Result<void>>>;
  commit_loadout: (
    { session_id, player, commitment }: { session_id: u32; player: string; commitment: Buffer },
    options?: MethodOptions
  ) => Promise<AssembledTransaction<Result<void>>>;
  get_commitment: (
    { session_id, player }: { session_id: u32; player: string },
    options?: MethodOptions
  ) => Promise<AssembledTransaction<Result<Buffer>>>;
  get_planet_seed: (options?: MethodOptions) => Promise<AssembledTransaction<u64>>;
  set_planet_seed: (
    { planet_seed }: { planet_seed: u64 },
    options?: MethodOptions
  ) => Promise<AssembledTransaction<null>>;
}
export class Client extends ContractClient {
  static async deploy<T = Client>(
    { admin, game_hub }: { admin: string; game_hub: string },
    options: MethodOptions &
      Omit<ContractClientOptions, "contractId"> & {
        wasmHash: Buffer | string;
        salt?: Buffer | Uint8Array;
        format?: "hex" | "base64";
      }
  ): Promise<AssembledTransaction<T>> {
    return ContractClient.deploy({ admin, game_hub }, options);
  }
  constructor(public readonly options: ContractClientOptions) {
    super(
      new ContractSpec([
        "AAAAAQAAAAAAAAAAAAAABEdhbWUAAAADAAAAAAAAAAdwbGF5ZXIxAAAAABMAAAAAAAAADnBsYXllcjFfcG9pbnRzAAAAAAALAAAAAAAAAA9wcm9vZl9zdWJtaXR0ZWQAAAAAAQ==",
        "AAAABAAAAAAAAAAAAAAABUVycm9yAAAAAAAADAAAAAAAAAAMR2FtZU5vdEZvdW5kAAAAAQAAAAAAAAAUU2Vzc2lvbkFscmVhZHlFeGlzdHMAAAACAAAAAAAAABBOb3RTZXNzaW9uUGxheWVyAAAAAwAAAAAAAAARTWlzc2luZ0NvbW1pdG1lbnQAAAAAAAAEAAAAAAAAABpDb21taXRtZW50QWxyZWFkeVN1Ym1pdHRlZAAAAAAABQAAAAAAAAAVUHJvb2ZBbHJlYWR5U3VibWl0dGVkAAAAAAAABgAAAAAAAAASQ29tbWl0bWVudE1pc21hdGNoAAAAAAAHAAAAAAAAAA5WZXJpZmllck5vdFNldAAAAAAACAAAAAAAAAAMSW52YWxpZFByb29mAAAACQAAAAAAAAAUSW52YWxpZFB1YmxpY091dHB1dHMAAAAKAAAAAAAAAA5JbnZhbGlkT3V0Y29tZQAAAAAACwAAAAAAAAAUSW52YWxpZEV2YWNJbnRlbnNpdHkAAAAM",
        "AAAAAgAAAAAAAAAAAAAAB0RhdGFLZXkAAAAABwAAAAEAAAAAAAAABEdhbWUAAAABAAAABAAAAAEAAAAAAAAACkNvbW1pdG1lbnQAAAAAAAIAAAAEAAAAEwAAAAEAAAAAAAAABlJlc3VsdAAAAAAAAgAAAAQAAAATAAAAAAAAAAAAAAAOR2FtZUh1YkFkZHJlc3MAAAAAAAAAAAAAAAAAD1ZlcmlmaWVyQWRkcmVzcwAAAAAAAAAAAAAAAAVBZG1pbgAAAAAAAAAAAAAAAAAAClBsYW5ldFNlZWQAAA==",
        "AAAAAQAAAAAAAAAAAAAADFByb29mT3V0cHV0cwAAAAcAAAAAAAAADmV2YWNfaW50ZW5zaXR5AAAAAAAEAAAAAAAAAApmaW5hbF9mdWVsAAAAAAAEAAAAAAAAAApmaW5hbF9odWxsAAAAAAAEAAAAAAAAAA1tb3ZlX3NlcXVlbmNlAAAAAAAD6gAAAAQAAAAAAAAAB291dGNvbWUAAAAABAAAAAAAAAAScmVzb3VyY2VzX3Blcl9ub2RlAAAAAAPqAAAABAAAAAAAAAAPdG90YWxfcmVzb3VyY2VzAAAAAAQ=",
        "AAAAAAAAAF5HZXQgdGhlIGN1cnJlbnQgR2FtZUh1YiBjb250cmFjdCBhZGRyZXNzCgojIFJldHVybnMKKiBgQWRkcmVzc2AgLSBUaGUgR2FtZUh1YiBjb250cmFjdCBhZGRyZXNzAAAAAAAHZ2V0X2h1YgAAAAAAAAAAAQAAABM=",
        "AAAAAAAAAF5TZXQgYSBuZXcgR2FtZUh1YiBjb250cmFjdCBhZGRyZXNzCgojIEFyZ3VtZW50cwoqIGBuZXdfaHViYCAtIFRoZSBuZXcgR2FtZUh1YiBjb250cmFjdCBhZGRyZXNzAAAAAAAHc2V0X2h1YgAAAAABAAAAAAAAAAduZXdfaHViAAAAABMAAAAA",
        "AAAAAAAAAHFVcGRhdGUgdGhlIGNvbnRyYWN0IFdBU00gaGFzaCAodXBncmFkZSBjb250cmFjdCkKCiMgQXJndW1lbnRzCiogYG5ld193YXNtX2hhc2hgIC0gVGhlIGhhc2ggb2YgdGhlIG5ldyBXQVNNIGJpbmFyeQAAAAAAAAd1cGdyYWRlAAAAAAEAAAAAAAAADW5ld193YXNtX2hhc2gAAAAAAAPuAAAAIAAAAAA=",
        "AAAAAAAAAH9HZXQgZ2FtZSBpbmZvcm1hdGlvbi4KCiMgQXJndW1lbnRzCiogYHNlc3Npb25faWRgIC0gVGhlIHNlc3Npb24gSUQgb2YgdGhlIGdhbWUKCiMgUmV0dXJucwoqIGBHYW1lYCAtIFRoZSBzdG9yZWQgc2Vzc2lvbiBjb250ZXh0AAAAAAhnZXRfZ2FtZQAAAAEAAAAAAAAACnNlc3Npb25faWQAAAAAAAQAAAABAAAD6QAAB9AAAAAER2FtZQAAAAM=",
        "AAAAAAAAAEhHZXQgdGhlIGN1cnJlbnQgYWRtaW4gYWRkcmVzcwoKIyBSZXR1cm5zCiogYEFkZHJlc3NgIC0gVGhlIGFkbWluIGFkZHJlc3MAAAAJZ2V0X2FkbWluAAAAAAAAAAAAAAEAAAAT",
        "AAAAAAAAAEpTZXQgYSBuZXcgYWRtaW4gYWRkcmVzcwoKIyBBcmd1bWVudHMKKiBgbmV3X2FkbWluYCAtIFRoZSBuZXcgYWRtaW4gYWRkcmVzcwAAAAAACXNldF9hZG1pbgAAAAAAAAEAAAAAAAAACW5ld19hZG1pbgAAAAAAABMAAAAA",
        "AAAAAAAAAl1TdGFydCBhIG5ldyBzaW5nbGUtcGxheWVyIGdhbWUgd2l0aCBwb2ludHMuClRoaXMgY3JlYXRlcyBhIHNlc3Npb24gaW4gdGhlIEdhbWUgSHViIGFuZCBsb2NrcyBwb2ludHMgYmVmb3JlIHN0YXJ0aW5nIHRoZSBnYW1lLgoKKipDUklUSUNBTDoqKiBUaGlzIG1ldGhvZCByZXF1aXJlcyBhdXRob3JpemF0aW9uIGZyb20gVEhJUyBjb250cmFjdCAobm90IHBsYXllcnMpLgpUaGUgR2FtZSBIdWIgd2lsbCBjYWxsIGBnYW1lX2lkLnJlcXVpcmVfYXV0aCgpYCB3aGljaCBjaGVja3MgdGhpcyBjb250cmFjdCdzIGFkZHJlc3MuCgojIEFyZ3VtZW50cwoqIGBzZXNzaW9uX2lkYCAtIFVuaXF1ZSBzZXNzaW9uIGlkZW50aWZpZXIgKHUzMikKKiBgcGxheWVyMWAgLSBBZGRyZXNzIG9mIGZpcnN0IHBsYXllcgoqIGBwbGF5ZXIyYCAtIElnbm9yZWQgZm9yIHNpbmdsZS1wbGF5ZXIgbW9kZSAoa2VwdCBmb3IgQUJJIGNvbXBhdGliaWxpdHkpCiogYHBsYXllcjFfcG9pbnRzYCAtIFBvaW50cyBhbW91bnQgY29tbWl0dGVkIGJ5IHBsYXllcgoqIGBwbGF5ZXIyX3BvaW50c2AgLSBJZ25vcmVkIGZvciBzaW5nbGUtcGxheWVyIG1vZGUgKGtlcHQgZm9yIEFCSSBjb21wYXRpYmlsaXR5KQAAAAAAAApzdGFydF9nYW1lAAAAAAAFAAAAAAAAAApzZXNzaW9uX2lkAAAAAAAEAAAAAAAAAAdwbGF5ZXIxAAAAABMAAAAAAAAAB3BsYXllcjIAAAAAEwAAAAAAAAAOcGxheWVyMV9wb2ludHMAAAAAAAsAAAAAAAAADnBsYXllcjJfcG9pbnRzAAAAAAALAAAAAQAAA+kAAAACAAAAAw==",
        "AAAAAAAAAAAAAAALZ2V0X3Jlc3VsdHMAAAAAAgAAAAAAAAAKc2Vzc2lvbl9pZAAAAAAABAAAAAAAAAAGcGxheWVyAAAAAAATAAAAAQAAA+kAAAfQAAAADFByb29mT3V0cHV0cwAAAAM=",
        "AAAAAAAAAAAAAAAMZ2V0X3ZlcmlmaWVyAAAAAAAAAAEAAAPpAAAAEwAAAAM=",
        "AAAAAAAAAAAAAAAMc2V0X3ZlcmlmaWVyAAAAAQAAAAAAAAAIdmVyaWZpZXIAAAATAAAAAA==",
        "AAAAAAAAAAAAAAAMc3VibWl0X3Byb29mAAAABQAAAAAAAAAKc2Vzc2lvbl9pZAAAAAAABAAAAAAAAAAGcGxheWVyAAAAAAATAAAAAAAAAA1wcm9vZl9wYXlsb2FkAAAAAAAADgAAAAAAAAAUc3VibWl0dGVkX2NvbW1pdG1lbnQAAAAOAAAAAAAAAA5wdWJsaWNfb3V0cHV0cwAAAAAH0AAAAAxQcm9vZk91dHB1dHMAAAABAAAD6QAAAAIAAAAD",
        "AAAAAAAAAKNJbml0aWFsaXplIHRoZSBjb250cmFjdCB3aXRoIEdhbWVIdWIgYWRkcmVzcyBhbmQgYWRtaW4KCiMgQXJndW1lbnRzCiogYGFkbWluYCAtIEFkbWluIGFkZHJlc3MgKGNhbiB1cGdyYWRlIGNvbnRyYWN0KQoqIGBnYW1lX2h1YmAgLSBBZGRyZXNzIG9mIHRoZSBHYW1lSHViIGNvbnRyYWN0AAAAAA1fX2NvbnN0cnVjdG9yAAAAAAAAAgAAAAAAAAAFYWRtaW4AAAAAAAATAAAAAAAAAAhnYW1lX2h1YgAAABMAAAAA",
        "AAAAAAAAAAAAAAAOY29tbWl0X2xvYWRvdXQAAAAAAAMAAAAAAAAACnNlc3Npb25faWQAAAAAAAQAAAAAAAAABnBsYXllcgAAAAAAEwAAAAAAAAAKY29tbWl0bWVudAAAAAAADgAAAAEAAAPpAAAAAgAAAAM=",
        "AAAAAAAAAAAAAAAOZ2V0X2NvbW1pdG1lbnQAAAAAAAIAAAAAAAAACnNlc3Npb25faWQAAAAAAAQAAAAAAAAABnBsYXllcgAAAAAAEwAAAAEAAAPpAAAADgAAAAM=",
        "AAAAAAAAAAAAAAAPZ2V0X3BsYW5ldF9zZWVkAAAAAAAAAAABAAAABg==",
        "AAAAAAAAAAAAAAAPc2V0X3BsYW5ldF9zZWVkAAAAAAEAAAAAAAAAC3BsYW5ldF9zZWVkAAAAAAYAAAAA",
      ]),
      options
    );
  }
  public readonly fromJSON = {
    get_hub: this.txFromJSON<string>,
    set_hub: this.txFromJSON<null>,
    upgrade: this.txFromJSON<null>,
    get_game: this.txFromJSON<Result<Game>>,
    get_admin: this.txFromJSON<string>,
    set_admin: this.txFromJSON<null>,
    start_game: this.txFromJSON<Result<void>>,
    get_results: this.txFromJSON<Result<ProofOutputs>>,
    get_verifier: this.txFromJSON<Result<string>>,
    set_verifier: this.txFromJSON<null>,
    submit_proof: this.txFromJSON<Result<void>>,
    commit_loadout: this.txFromJSON<Result<void>>,
    get_commitment: this.txFromJSON<Result<Buffer>>,
    get_planet_seed: this.txFromJSON<u64>,
    set_planet_seed: this.txFromJSON<null>,
  };
}
