import { Context } from 'hono';
import type { DescribeRepo, DidDoc } from './at-proto';
import { env } from 'hono/adapter';
import { hc } from 'hono/client';

export function findPubkey(didDoc: DidDoc): string | null {
  for (const method of didDoc.verificationMethod) {
    if (method.type === 'Multikey' && method.publicKeyMultibase) {
      return method.publicKeyMultibase;
    }
  }
  return null;
}

export async function savePubkey(
  c: Context,
  target: DidDoc | string,
  key = '',
) {
  const { did_key_store } = env<{ did_key_store: KVNamespace }>(c);
  if (typeof target === 'string') {
    await did_key_store.put(target, key);
  } else {
    const did = target.id;
    const pubkey = findPubkey(target);
    if (pubkey) {
      await did_key_store.put(did, pubkey);
    }
  }
}

export async function getPubkey(c: Context, did: string) {
  const { did_key_store } = env<{ did_key_store: KVNamespace }>(c);
  return did_key_store.get(did);
}

export async function fetchPubkey(did: string) {
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
