import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import pg from 'pg';

// Explicit read-only reporting; local by default. Production requires the
// operator to supply NARRATIVE_REPORT_DB_URL, never a frontend credential.
const url = process.env.NARRATIVE_REPORT_DB_URL ?? JSON.parse(execFileSync(process.execPath,
  ['node_modules/supabase/dist/supabase.js', 'status', '-o', 'json'], { encoding: 'utf8' })).DB_URL;
assert.ok(url);
const client = new pg.Client({ connectionString: url }); await client.connect();
try {
  await client.query('begin read only');
  const config = (await client.query('select enabled,daily_limit,minute_limit from narrative_private.config')).rows[0];
  const days = (await client.query(`select day::text as day,attempts,reported_tokens,unknown_usage from narrative_private.usage order by day desc limit 30`)).rows;
  const outcomes = (await client.query(`select entry->>'source' as source, entry->>'reason' as reason, count(*) as count
    from narrative_private.events group by 1,2 order by 1,2`)).rows;
  await client.query('commit');
  console.log(JSON.stringify({ generatedAt: new Date().toISOString(), quotaTimezone: 'UTC', config, days, outcomes }, null, 2));
} finally { await client.end(); }
