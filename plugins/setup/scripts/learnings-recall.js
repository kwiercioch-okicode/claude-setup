#!/usr/bin/env node

'use strict';

const { parseLog, topActive, countByStatus, LOG_PATH_DEFAULT } = require('./lib/learnings-parser');
const { existsSync } = require('node:fs');
const { join } = require('node:path');

function readStdin() {
  return new Promise((resolve) => {
    let data = '';
    if (process.stdin.isTTY) return resolve('');
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => (data += chunk));
    process.stdin.on('end', () => resolve(data));
  });
}

async function main() {
  if (process.env.CS_AUTOSKILL_ENABLED === 'false') {
    process.exit(0);
  }

  const stdinRaw = await readStdin();
  let payload = {};
  try {
    payload = stdinRaw ? JSON.parse(stdinRaw) : {};
  } catch {
    payload = {};
  }

  const cwd = payload.cwd || process.cwd();
  const logPath = join(cwd, LOG_PATH_DEFAULT);
  if (!existsSync(logPath)) {
    process.exit(0);
  }

  const limit = parseInt(process.env.CS_RECALL_LIMIT || '10', 10);
  const minConfidence = parseInt(process.env.CS_RECALL_MIN_CONFIDENCE || '6', 10);

  let entries;
  try {
    entries = parseLog(logPath);
  } catch (err) {
    process.stderr.write(`[learnings-recall] parse error: ${err.message}\n`);
    process.exit(0);
  }

  if (entries.length === 0) {
    process.exit(0);
  }

  const counts = countByStatus(entries);
  const top = topActive(entries, { limit, minConfidence });

  if (top.length === 0) {
    process.exit(0);
  }

  const lines = [];
  lines.push(`PRIOR LEARNINGS LOADED: ${top.length} of ${counts.ACTIVE} ACTIVE entries (confidence >= ${minConfidence}/10).`);
  lines.push(`These are non-obvious gotchas Claude learned in past sessions. Apply them BEFORE making the same mistake again.`);
  lines.push('');
  for (const e of top) {
    const skillTag = e.skill ? `[${e.skill}]` : '[unclassified]';
    const keyTag = e.key ? ` ${e.key}` : '';
    const conf = `(${e.confidence}/10)`;
    lines.push(`- ${skillTag}${keyTag} ${conf}: ${e.learning || e.title}`);
    if (e.action) lines.push(`  -> Action: ${e.action}`);
  }
  lines.push('');
  if (counts.ACTIVE >= 10) {
    lines.push(`Note: ${counts.ACTIVE} ACTIVE entries in log - run /cs:harvest to promote into skill files.`);
  }

  process.stdout.write(lines.join('\n'));
  process.exit(0);
}

main().catch((err) => {
  process.stderr.write(`[learnings-recall] error: ${err.message}\n`);
  process.exit(0);
});
