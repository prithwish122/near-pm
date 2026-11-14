/**
 * NEP-413 signing of `token_diff` intents for the NEAR Intents verifier (`intents.near`).
 * Uses node:crypto only (ed25519 + sha256), no extra dependencies.
 */
import { createHash, createPrivateKey, createPublicKey, randomBytes, sign, type KeyObject } from "node:crypto";
import { base58Decode, base58Encode } from "./base58.js";

/** 2^31 + 413: the NEP-413 prefix tag. */
const NEP413_TAG = 2147484061;
const PKCS8_ED25519_PREFIX = Buffer.from("302e020100300506032b657004220420", "hex");

export const VERIFIER_CONTRACT = "intents.near";

export interface Signer {
  accountId: string;
  /** `ed25519:<base58>` */
  publicKey: string;
  privateKey: KeyObject;
}

/** Accepts a NEAR secret key (`ed25519:<base58 of seed‖pub>` or of the 32-byte seed). */
export function signerFromSecretKey(accountId: string, secretKey: string): Signer {
  const [curve, encoded] = secretKey.split(":");
  if (curve !== "ed25519" || !encoded) throw new Error("secret key must look like ed25519:<base58>");
  const raw = base58Decode(encoded);
  if (raw.length !== 64 && raw.length !== 32) throw new Error("ed25519 secret key must be 32 or 64 bytes");
  const seed = Buffer.from(raw.subarray(0, 32));
  const privateKey = createPrivateKey({ key: Buffer.concat([PKCS8_ED25519_PREFIX, seed]), format: "der", type: "pkcs8" });
  const jwk = createPublicKey(privateKey).export({ format: "jwk" });
  const pub = Buffer.from(jwk.x as string, "base64url");
  return { accountId, publicKey: `ed25519:${base58Encode(pub)}`, privateKey };
}

function borshString(s: string): Buffer {
  const b = Buffer.from(s, "utf8");
  const len = Buffer.alloc(4);
  len.writeUInt32LE(b.length);
  return Buffer.concat([len, b]);
}

/** sha256( u32le(tag) ‖ borsh{ message, nonce[32], recipient, callback_url: None } ) */
export function nep413Digest(message: string, nonce: Uint8Array, recipient: string): Buffer {
  if (nonce.length !== 32) throw new Error("nonce must be 32 bytes");
  const tag = Buffer.alloc(4);
  tag.writeUInt32LE(NEP413_TAG);
  const payload = Buffer.concat([tag, borshString(message), Buffer.from(nonce), borshString(recipient), Buffer.from([0])]);
  return createHash("sha256").update(payload).digest();
}

export interface TokenDiffParams {
  /** Asset the solver receives (the user's input). */
  assetIn: string;
  amountIn: bigint;
  /** Asset the solver pays out. */
  assetOut: string;
  amountOut: bigint;
  deadline: Date;
  nonce?: Uint8Array;
}

export interface SignedData {
  standard: "nep413";
  payload: { recipient: string; nonce: string; message: string };
  public_key: string;
  signature: string;
}

export function signTokenDiff(signer: Signer, p: TokenDiffParams): SignedData {
  if (p.amountIn <= 0n || p.amountOut <= 0n) throw new Error("amounts must be positive");
  const nonce = p.nonce ?? randomBytes(32);
  const message = JSON.stringify({
    signer_id: signer.accountId,
    deadline: p.deadline.toISOString(),
    intents: [
      {
        intent: "token_diff",
        diff: { [p.assetIn]: p.amountIn.toString(), [p.assetOut]: `-${p.amountOut}` },
      },
    ],
  });
  const signature = sign(null, nep413Digest(message, nonce, VERIFIER_CONTRACT), signer.privateKey);
  return {
    standard: "nep413",
    payload: { recipient: VERIFIER_CONTRACT, nonce: Buffer.from(nonce).toString("base64"), message },
    public_key: signer.publicKey,
    signature: `ed25519:${base58Encode(signature)}`,
  };
}
