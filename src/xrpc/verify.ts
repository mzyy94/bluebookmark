import { verify } from '@noble/secp256k1';
// @ts-expect-error no .d.ts
import { base58_to_binary } from 'base58-js';
import { decode } from 'hono/jwt';

export async function verifyJwt(jwt: string, pubkey: string) {
  if (!pubkey.startsWith('z') || pubkey.length !== 49) {
    // Invalid did key
    return false;
  }
  const { header } = decode(jwt);
  const keybin: Uint8Array = base58_to_binary(pubkey.slice(1));

  if (
    header.alg !== 'ES256K' ||
    !keybin.slice(0, 2).every((v, i) => v === [0xe7, 0x01][i])
  ) {
    // unsupported key
    return false;
  }

  const key = keybin.slice(2);
  const message = jwt.split('.').slice(0, 2).join('.');
  const signature = jwt.split('.').slice(2)[0];

  const msgHash = await crypto.subtle
    .digest('SHA-256', new TextEncoder().encode(message))
    .then((hash) => new Uint8Array(hash));
  const decodedSign = atob(signature.replaceAll('-', '+').replaceAll('_', '/'));
  const sign = Uint8Array.from(decodedSign, (c) => c.charCodeAt(0));

  return verify(sign, msgHash, key);
}
