import type { Context } from 'hono';
import { env } from 'hono/adapter';
import { hc } from 'hono/client';
import type { DescribeRepo, DidDoc } from './at-proto';
import { getPubkeyFromCache, putPubkeyToCache } from './cache';

export function findPubkey(didDoc: DidDoc): string | null {
  for (const method of didDoc.verificationMethod) {
    if (method.type === 'Multikey' && method.publicKeyMultibase) {
      return method.publicKeyMultibase;
    }
  }
  return null;
}

export async function savePubkey(c: Context, did: string, pubkey: string) {
  if (!did || !pubkey) {
    return;
  }
  await putPubkeyToCache(did, pubkey);
  const { did_key_store } = env<{ did_key_store: KVNamespace }>(c);
  await did_key_store.put(did, pubkey);
}

export async function getPubkey(c: Context, did: string) {
  const { did_key_store } = env<{ did_key_store: KVNamespace }>(c);

  let pubkey = await getPubkeyFromCache(did);
  if (pubkey) {
    return pubkey;
  }
  pubkey = await did_key_store.get(did);
  if (pubkey) {
    await putPubkeyToCache(did, pubkey);
  }
  return pubkey;
}

export async function fetchPubkey(did: string) {
  console.info(`refresh public key for '${did}'`);
  const res = await hc<DescribeRepo>('https://bsky.social').xrpc[
    'com.atproto.repo.describeRepo'
  ].$get({
    query: { repo: did },
  });
  if (!res.ok) {
    return null;
  }
  const { didDoc } = await res.json();
  return findPubkey(didDoc);
}
