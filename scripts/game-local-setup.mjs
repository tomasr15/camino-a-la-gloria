import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync, appendFileSync } from 'node:fs';
import pg from 'pg';

// This script only configures the already-running local Supabase stack.
const status = JSON.parse(execFileSync(process.execPath,
  ['node_modules/supabase/dist/supabase.js', 'status', '-o', 'json'], { encoding: 'utf8' }));
assert.ok(['127.0.0.1', 'localhost'].includes(new URL(status.DB_URL).hostname));
assert.ok(['127.0.0.1', 'localhost'].includes(new URL(status.API_URL).hostname));
const client = new pg.Client({ connectionString: status.DB_URL });
await client.connect();
let key;
try {
  const result = await client.query('select secret from game_private.signing_key where singleton');
  key = result.rows[0]?.secret;
  if (!key) {
    key = randomBytes(32).toString('hex');
    await client.query('insert into game_private.signing_key(singleton,secret) values (true,$1)', [key]);
  }
} finally {
  await client.end();
}
const envPath = 'supabase/.env.local';
if (existsSync(envPath)) {
  const content = readFileSync(envPath, 'utf8');
  const line = content.split(/\r?\n/).find(x => x.startsWith('GAME_SIGNING_KEY='));
  if (line) assert.equal(line.slice('GAME_SIGNING_KEY='.length), key,
    'The local function signing key differs from the local database key');
  else appendFileSync(envPath, '\nGAME_SIGNING_KEY=' + key + '\n');
} else {
  writeFileSync(envPath,
    'ALLOWED_ORIGINS=http://localhost:3000,http://127.0.0.1:3000\nGAME_SIGNING_KEY=' + key + '\n');
}
console.log('Local game signing key is configured in the ignored env file and local database.');
