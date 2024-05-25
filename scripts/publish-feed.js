// @ts-check

function checkEnvVars() {
  const pair = [
    ['identifier', 'FEED_OWNER'],
    ['password', 'APP_PASSWORD'],
    ['feedHost', 'FEED_HOST'],
  ];
  const result = /** @type {Object.<string, string>} */ ({});
  for (const [key, env] of pair) {
    const val = process.env[env];
    if (!val) {
      console.error(`Error: ${env} environment variable is missing.`);
      process.exit(1);
    }
    result[key] = val;
  }
  return result;
}

/**
 * Call createSession API
 *
 * @param {string} identifier
 * @param {string} password
 */
function createSession(identifier, password) {
  const req = new Request(
    'https://bsky.social/xrpc/com.atproto.server.createSession',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ identifier, password }),
    },
  );
  return fetch(req).then((res) => {
    if (res.ok) {
      return /** @type {Promise<{accessJwt: string, did: string}>} */ (
        res.json()
      );
    }
    console.error(
      'Login failed. Please check "FEED_OWNER" and "APP_PASSWORD" env vars.',
    );
    process.exit(1);
  });
}

/**
 * Upload image blob to bsky server
 *
 * @param {string} token - accessJwt
 * @param {string} filename
 * @returns
 */
async function uploadBlob(token, filename) {
  if (!filename) {
    console.info('skip upload blob');
    return null;
  }
  const ext = filename.split('.').pop()?.toLowerCase().replace('jpg', 'jpeg');
  const blob = await require('node:fs/promises')
    .readFile(filename)
    .catch((e) => {
      console.log(e.toString());
      process.exit(1);
    });
  const req = new Request(
    'https://bsky.social/xrpc/com.atproto.repo.uploadBlob',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': `image/${ext}`,
      },
      body: blob,
    },
  );
  return fetch(req).then((res) => {
    if (res.ok) {
      return /** @type {Promise<{ blob: undefined }>} */ (res.json());
    }
    console.error('failed to upload image');
    process.exit(1);
  });
}

/**
 * Put Custom Feed record
 *
 * @param {string} token
 * @param {string} did
 * @param {string} feedHost
 * @param {{blob: any} | null} imageRef
 * @returns
 */
async function putRecord(token, did, feedHost, imageRef) {
  const record = {
    repo: did,
    collection: 'app.bsky.feed.generator',
    rkey: 'blue-bookmark',
    record: {
      did: `did:web:${feedHost}`,
      displayName: 'Blue Bookmark',
      description: 'Private Bookmark Feed',
      avatar: imageRef?.blob,
      createdAt: new Date().toISOString(),
    },
  };

  const req = new Request(
    'https://bsky.social/xrpc/com.atproto.repo.putRecord',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(record),
    },
  );
  return fetch(req).then((res) => {
    if (res.ok) {
      return res.json();
    }
    console.error('failed to put record');
    process.exit(1);
  });
}

async function main() {
  console.log('** Create Feed **');
  const { identifier, password, feedHost } = checkEnvVars();
  const { accessJwt, did } = await createSession(identifier, password);
  const imageRef = await uploadBlob(accessJwt, './public/bluebookmark.png');
  await putRecord(accessJwt, did, feedHost, imageRef);
  console.log('Complete!');
}

main();
