import { CID } from "multiformats/cid";
import { create as createDigest } from "multiformats/hashes/digest";
import { bytesToHex, hexToBytes } from "viem";

/// ENSIP-7 contenthash codec: the bytes `PermissionedResolver.setContenthash`/`.contenthash()`
/// actually store are `varint(namespaceCode) ++ <CID bytes>` — never a raw CID string. This is the
/// only place in the app that speaks that binary format, so the records editor (task 35) can let a
/// user type/read a CID and never see the bytes underneath.
///
/// Namespace codes are the multicodec values ENS itself uses (mirrored from `@ensdomains/content-hash`,
/// not invented here): `ipfs-ns` 0xe3, `ipns-ns` 0xe5, `swarm-ns` 0xe4.
const NAMESPACE = { ipfs: 0xe3, ipns: 0xe5, swarm: 0xe4 } as const;

export type ContenthashProtocol = keyof typeof NAMESPACE;

export const CONTENTHASH_PROTOCOLS: readonly ContenthashProtocol[] = ["ipfs", "ipns", "swarm"];

/// Swarm has no native CID text form in the wild (unlike ipfs/ipns) — the convention ENS content-hash
/// tooling settled on is a keccak-256 multihash wrapped in a CIDv1 with the `swarm-manifest` codec
/// (0xfa), so a swarm reference still round-trips through the same CID machinery as the other two.
const KECCAK_256_CODE = 0x1b;
const SWARM_MANIFEST_CODEC = 0xfa;

function encodeVarint(value: number): number[] {
  const out: number[] = [];
  let n = value;
  while (n >= 0x80) {
    out.push((n & 0x7f) | 0x80);
    n >>>= 7;
  }
  out.push(n);
  return out;
}

function decodeVarint(bytes: Uint8Array, offset: number): [value: number, next: number] {
  let result = 0;
  let shift = 0;
  let i = offset;
  for (;;) {
    if (i >= bytes.length) throw new Error("contenthash: truncated varint");
    const byte = bytes[i++];
    result |= (byte & 0x7f) << shift;
    if ((byte & 0x80) === 0) break;
    shift += 7;
  }
  return [result, i];
}

export type DecodedContenthash = { protocol: ContenthashProtocol; value: string };

/// `contenthash()` reads back `0x` (or empty) when unset — that is not an error, just "no website".
export function decodeContenthash(hex: `0x${string}` | null | undefined): DecodedContenthash | null {
  if (!hex || hex === "0x") return null;
  const bytes = hexToBytes(hex);
  if (bytes.length === 0) return null;
  const [code, offset] = decodeVarint(bytes, 0);
  const protocolEntry = (Object.entries(NAMESPACE) as [ContenthashProtocol, number][]).find(
    ([, ns]) => ns === code
  );
  if (!protocolEntry) return null;
  const [protocol] = protocolEntry;
  const payload = bytes.slice(offset);

  if (protocol === "swarm") {
    const cid = CID.decode(payload);
    return { protocol, value: bytesToHex(cid.multihash.digest) };
  }
  const cid = CID.decode(payload);
  return { protocol, value: cid.toString() };
}

/// Throws with a message fit to show next to the input — this is the only validation the website
/// field needs before signing, so a bad paste never reaches the wallet as a doomed transaction.
export function encodeContenthash(protocol: ContenthashProtocol, rawValue: string): `0x${string}` {
  const value = rawValue.trim();
  if (value.length === 0) throw new Error("Enter a CID.");

  let payload: Uint8Array;
  if (protocol === "swarm") {
    const hex = value.startsWith("0x") ? value.slice(2) : value;
    if (!/^[0-9a-fA-F]{64}$/.test(hex)) {
      throw new Error("Swarm reference must be a 32-byte hex hash.");
    }
    const digest = createDigest(KECCAK_256_CODE, hexToBytes(`0x${hex}`));
    payload = CID.createV1(SWARM_MANIFEST_CODEC, digest).bytes;
  } else {
    try {
      payload = CID.parse(value).bytes;
    } catch {
      throw new Error(`Not a valid CID for ${protocol}.`);
    }
  }

  const namespace = Uint8Array.from(encodeVarint(NAMESPACE[protocol]));
  const out = new Uint8Array(namespace.length + payload.length);
  out.set(namespace, 0);
  out.set(payload, namespace.length);
  return bytesToHex(out);
}
