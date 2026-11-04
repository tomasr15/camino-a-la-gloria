import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import assert from 'node:assert/strict';

const project = 'gmpjtvxpolmxtqvdxdit';
assert.ok(process.argv.includes('--create-test-accounts'), 'Explicit --create-test-accounts required; creates two retained synthetic accounts in cloud.');
assert.ok(!existsSync('tmp/cloud-fixtures.json') && !existsSync('.env.cloud'), 'Existing fixture files are preserved.');
// Management session is already authorized locally. Never print or persist the service key.
const keys = JSON.parse(execFileSync(process.execPath, ['node_modules/supabase/dist/supabase.js', 'projects', 'api-keys', '--project-ref', project, '-o', 'json'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }));
const publicKey = keys.find(k => k.name === 'anon')?.api_key;
const serviceKey = keys.find(k => k.name === 'service_role')?.api_key;
assert.ok(publicKey && serviceKey, 'Required project keys unavailable');
const url = `https://${project}.supabase.co`;
const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
mkdirSync('tmp', { recursive: true });
const fixtures = [];
for (let i = 0; i < 2; i++) {
  const email = `cp2-cloud-${i}-${randomUUID()}@example.invalid`, password = `${randomUUID()}!Test8`;
  const result = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { purpose: 'CP2 dedicated synthetic test account' } });
  assert.ok(!result.error, `Could not create synthetic account ${i}`);
  fixtures.push({ email, password });
  writeFileSync('tmp/cloud-fixtures.json', JSON.stringify(fixtures, null, 2));
}
writeFileSync('.env.cloud', `NEXT_PUBLIC_SUPABASE_URL=${url}\nNEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=${publicKey}\n`);
console.log('Two confirmed synthetic cloud users provisioned. Local ignored files saved; no credentials logged and no existing data deleted.');
