import { config } from '@/config';
import type { ProofPayload } from './engine';
import { Client as MineGameClient, type ProofOutputs } from './bindings';
import { DEFAULT_METHOD_OPTIONS, NETWORK_PASSPHRASE, RPC_URL } from '@/utils/constants';
import { signAndSendViaLaunchtube } from '@/utils/transactionHelper';
import { devWalletService } from '@/services/devWalletService';
import { Buffer } from 'buffer';

export interface ContractActionResult {
  ok: boolean;
  status: 'submitted' | 'skipped' | 'failed';
  message: string;
  txHash?: string;
}

export interface MineGameContractTransport {
  startGame: (args: {
    sessionId: number;
    playerAddress: string;
    playerPoints: bigint;
  }) => Promise<ContractActionResult>;
  commitLoadout: (args: {
    sessionId: number;
    playerAddress: string;
    commitment: string;
  }) => Promise<ContractActionResult>;
  submitProof: (args: {
    sessionId: number;
    playerAddress: string;
    payload: ProofPayload;
  }) => Promise<ContractActionResult>;
}

function hexOrUtf8ToBuffer(value: string): Buffer {
  const hex = value.startsWith('keccak_') ? value.slice('keccak_'.length) : value;
  const isEvenHex = hex.length > 0 && hex.length % 2 === 0 && /^[0-9a-fA-F]+$/.test(hex);
  return isEvenHex ? Buffer.from(hex, 'hex') : Buffer.from(value, 'utf8');
}

function toProofOutputs(payload: ProofPayload): ProofOutputs {
  return {
    move_sequence: payload.publicOutputs.moveSequence,
    resources_per_node: payload.publicOutputs.resourcesPerNode,
    total_resources: payload.publicOutputs.totalResources,
    final_hull: payload.publicOutputs.finalHull,
    final_fuel: payload.publicOutputs.finalFuel,
    outcome: payload.publicOutputs.outcome,
    evac_intensity: payload.publicOutputs.evacIntensity,
  };
}

function extractResultError(result: unknown): string | null {
  const maybeResult = result as
    | { isErr?: () => boolean; unwrapErr?: () => unknown }
    | undefined;
  if (!maybeResult?.isErr || !maybeResult?.isErr()) return null;
  try {
    const err = maybeResult.unwrapErr?.();
    return err === undefined ? 'Contract call failed' : String(err);
  } catch {
    return 'Contract call failed';
  }
}

function createStellarTransport(contractId: string): MineGameContractTransport {
  return {
    startGame: async ({ sessionId, playerAddress, playerPoints }) => {
      try {
        const signer = devWalletService.getSigner();
        const client = new MineGameClient({
          contractId,
          rpcUrl: RPC_URL,
          networkPassphrase: NETWORK_PASSPHRASE,
          publicKey: playerAddress,
          signTransaction: signer.signTransaction,
          signAuthEntry: signer.signAuthEntry,
        });

        const tx = await client.start_game(
          {
            session_id: sessionId,
            player1: playerAddress,
            // Single-player mode: player2/points are placeholders for ABI compatibility.
            player2: playerAddress,
            player1_points: playerPoints,
            player2_points: 0n,
          },
          DEFAULT_METHOD_OPTIONS
        );
        const sent = await signAndSendViaLaunchtube(tx, DEFAULT_METHOD_OPTIONS.timeoutInSeconds);
        const txError = extractResultError(sent.result);
        if (txError) {
          return {
            ok: false,
            status: 'failed',
            message: `start_game failed: ${txError}`,
          };
        }

        return {
          ok: true,
          status: 'submitted',
          message: 'start_game submitted',
        };
      } catch (error) {
        return {
          ok: false,
          status: 'failed',
          message: error instanceof Error ? error.message : 'Failed to submit start_game',
        };
      }
    },
    commitLoadout: async ({ sessionId, playerAddress, commitment }) => {
      try {
        const signer = devWalletService.getSigner();
        const client = new MineGameClient({
          contractId,
          rpcUrl: RPC_URL,
          networkPassphrase: NETWORK_PASSPHRASE,
          publicKey: playerAddress,
          signTransaction: signer.signTransaction,
          signAuthEntry: signer.signAuthEntry,
        });

        const tx = await client.commit_loadout(
          {
            session_id: sessionId,
            player: playerAddress,
            commitment: hexOrUtf8ToBuffer(commitment),
          },
          DEFAULT_METHOD_OPTIONS
        );
        const sent = await signAndSendViaLaunchtube(tx, DEFAULT_METHOD_OPTIONS.timeoutInSeconds);
        const txError = extractResultError(sent.result);
        if (txError) {
          return {
            ok: false,
            status: 'failed',
            message: `commit_loadout failed: ${txError}`,
          };
        }

        return {
          ok: true,
          status: 'submitted',
          message: 'commit_loadout submitted',
        };
      } catch (error) {
        return {
          ok: false,
          status: 'failed',
          message: error instanceof Error ? error.message : 'Failed to submit commit_loadout',
        };
      }
    },
    submitProof: async ({ sessionId, playerAddress, payload }) => {
      try {
        const signer = devWalletService.getSigner();
        const client = new MineGameClient({
          contractId,
          rpcUrl: RPC_URL,
          networkPassphrase: NETWORK_PASSPHRASE,
          publicKey: playerAddress,
          signTransaction: signer.signTransaction,
          signAuthEntry: signer.signAuthEntry,
        });

        const commitment = hexOrUtf8ToBuffer(payload.publicInputs.commitment);
        const tx = await client.submit_proof(
          {
            session_id: sessionId,
            player: playerAddress,
            proof_payload: Buffer.from(JSON.stringify(payload), 'utf8'),
            submitted_commitment: commitment,
            public_outputs: toProofOutputs(payload),
          },
          DEFAULT_METHOD_OPTIONS
        );
        const sent = await signAndSendViaLaunchtube(tx, DEFAULT_METHOD_OPTIONS.timeoutInSeconds);
        const txError = extractResultError(sent.result);
        if (txError) {
          return {
            ok: false,
            status: 'failed',
            message: `submit_proof failed: ${txError}`,
          };
        }

        return {
          ok: true,
          status: 'submitted',
          message: 'submit_proof submitted',
        };
      } catch (error) {
        return {
          ok: false,
          status: 'failed',
          message: error instanceof Error ? error.message : 'Failed to submit submit_proof',
        };
      }
    },
  };
}

export interface CreateMineGameContractAdapterInput {
  contractId?: string;
  transport?: MineGameContractTransport;
}

export interface MineGameContractAdapter {
  getContractId: () => string;
  startGame: (args: {
    sessionId: number;
    playerAddress: string;
    playerPoints?: bigint;
  }) => Promise<ContractActionResult>;
  commitLoadout: (args: {
    sessionId: number;
    playerAddress: string;
    commitment: string | null;
  }) => Promise<ContractActionResult>;
  submitProof: (args: {
    sessionId: number;
    playerAddress: string;
    payload: ProofPayload | null;
  }) => Promise<ContractActionResult>;
}

export function createMineGameContractAdapter(
  input: CreateMineGameContractAdapterInput = {}
): MineGameContractAdapter {
  const contractId = input.contractId ?? config.mineGameId ?? '';
  const transport = input.transport ?? createStellarTransport(contractId);

  return {
    getContractId: () => contractId,
    startGame: async ({ sessionId, playerAddress, playerPoints = 0n }) => {
      if (!contractId) {
        return {
          ok: true,
          status: 'skipped',
          message: 'No mine-game contract configured; skipping start_game',
        };
      }

      return transport.startGame({
        sessionId,
        playerAddress,
        playerPoints,
      });
    },
    commitLoadout: async ({ sessionId, playerAddress, commitment }) => {
      if (!contractId) {
        return {
          ok: true,
          status: 'skipped',
          message: 'No mine-game contract configured; skipping commit',
        };
      }
      if (!commitment) {
        return {
          ok: false,
          status: 'failed',
          message: 'Missing commitment',
        };
      }
      return transport.commitLoadout({
        sessionId,
        playerAddress,
        commitment,
      });
    },
    submitProof: async ({ sessionId, playerAddress, payload }) => {
      if (!contractId) {
        return {
          ok: true,
          status: 'skipped',
          message: 'No mine-game contract configured; skipping proof submit',
        };
      }
      if (!payload) {
        return {
          ok: false,
          status: 'failed',
          message: 'Missing proof payload',
        };
      }
      return transport.submitProof({
        sessionId,
        playerAddress,
        payload,
      });
    },
  };
}
