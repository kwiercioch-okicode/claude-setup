#!/usr/bin/env node

/**
 * E2E scenario tests for jira-relay.js
 *
 * Tests the relay server by starting it on a random port with mocked
 * Claude binary and Jira API, then exercising scenarios via HTTP.
 *
 * Output: SCENARIOS_PASSED: X/Y (metric for autoresearch)
 *
 * THIS FILE IS THE VERIFY HARNESS - DO NOT MODIFY DURING AUTORESEARCH.
 */

'use strict';

const http = require('node:http');
const { spawn, execSync } = require('node:child_process');
const { join } = require('node:path');
const { mkdirSync, writeFileSync, rmSync, existsSync } = require('node:fs');
const os = require('node:os');

// --- Test infrastructure ---

const RELAY_SCRIPT = join(__dirname, 'jira-relay.js');
const TEST_CWD = join(os.tmpdir(), `jira-relay-test-${Date.now()}`);
const MOCK_CLAUDE = join(TEST_CWD, 'mock-claude.sh');
const PORT = 13333 + Math.floor(Math.random() * 1000);

let relayProcess = null;
const results = [];

function setup() {
  mkdirSync(join(TEST_CWD, '.devflow'), { recursive: true });
  mkdirSync(join(TEST_CWD, '.git'), { recursive: true }); // fake git repo

  // Write relay-config.json
  writeFileSync(join(TEST_CWD, '.devflow', 'relay-config.json'), JSON.stringify({
    baseBranch: 'staging',
    repos: 'test-repo',
    testCommand: 'echo ok',
    prBase: 'staging',
  }));

  // Mock claude binary that just exits 0 and outputs JSON
  writeFileSync(MOCK_CLAUDE, '#!/bin/bash\nsleep 0.3\necho \'{"result":"done","session_id":"test-session-123"}\'\nexit 0\n');
  execSync(`chmod +x "${MOCK_CLAUDE}"`);

  // Write a fake plan file for impl phase outcome validation
  writeFileSync(join(TEST_CWD, '.devflow', 'plan-test-1.md'), '# Test plan');
}

function cleanup() {
  if (relayProcess) {
    relayProcess.kill('SIGTERM');
    relayProcess = null;
  }
  try { rmSync(TEST_CWD, { recursive: true, force: true }); } catch {}
}

function startRelay(extraEnv = {}) {
  return new Promise((resolve, reject) => {
    const env = {
      ...process.env,
      CLAUDE_BIN: MOCK_CLAUDE,
      JIRA_URL: 'https://test.atlassian.net',
      JIRA_EMAIL: 'test@test.com',
      JIRA_API_TOKEN: 'fake-token',
      ...extraEnv,
    };

    relayProcess = spawn('node', [RELAY_SCRIPT, '--port', String(PORT), '--cwd', TEST_CWD], {
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let started = false;
    const timeout = setTimeout(() => {
      if (!started) reject(new Error('Relay startup timeout'));
    }, 5000);

    relayProcess.stdout.on('data', (chunk) => {
      if (!started && chunk.toString().includes('Waiting for webhooks')) {
        started = true;
        clearTimeout(timeout);
        // Give it a moment to bind
        setTimeout(() => resolve(), 100);
      }
    });

    relayProcess.on('error', reject);
    relayProcess.on('exit', (code) => {
      if (!started) {
        clearTimeout(timeout);
        reject(new Error(`Relay exited with code ${code}`));
      }
    });
  });
}

function stopRelay() {
  return new Promise((resolve) => {
    if (!relayProcess) return resolve();
    relayProcess.on('exit', () => resolve());
    relayProcess.kill('SIGTERM');
    relayProcess = null;
    setTimeout(resolve, 500); // fallback
  });
}

function httpRequest(method, path, body = null, headers = {}) {
  return new Promise((resolve, reject) => {
    const opts = {
      hostname: '127.0.0.1',
      port: PORT,
      path,
      method,
      headers: { 'Content-Type': 'application/json', ...headers },
      timeout: 3000,
    };

    const req = http.request(opts, (res) => {
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end', () => {
        let parsed = null;
        try { parsed = JSON.parse(data); } catch {}
        resolve({ status: res.statusCode, body: data, json: parsed });
      });
    });

    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
    if (body) req.write(typeof body === 'string' ? body : JSON.stringify(body));
    req.end();
  });
}

async function scenario(name, fn) {
  try {
    await fn();
    results.push({ name, pass: true });
  } catch (err) {
    results.push({ name, pass: false, error: err.message });
  }
}

function assert(condition, msg) {
  if (!condition) throw new Error(`Assertion failed: ${msg}`);
}

// --- Scenarios ---

async function runScenarios() {
  // --- HTTP endpoint tests ---

  await scenario('GET /health returns 200 with status ok', async () => {
    const res = await httpRequest('GET', '/health');
    assert(res.status === 200, `status ${res.status}`);
    assert(res.json?.status === 'ok', `body: ${res.body}`);
    assert(typeof res.json?.uptime === 'number', 'no uptime');
  });

  await scenario('GET /status returns 200 with activeJobs structure', async () => {
    const res = await httpRequest('GET', '/status');
    assert(res.status === 200, `status ${res.status}`);
    assert(typeof res.json?.totalActive === 'number', `no totalActive: ${res.body}`);
    assert(typeof res.json?.active === 'object', 'no active object');
  });

  await scenario('GET /unknown returns 404', async () => {
    const res = await httpRequest('GET', '/unknown');
    assert(res.status === 404, `status ${res.status}`);
  });

  await scenario('POST /unknown returns 404', async () => {
    const res = await httpRequest('POST', '/unknown', { test: true });
    assert(res.status === 404, `status ${res.status}`);
  });

  // --- Webhook payload parsing ---

  await scenario('POST /webhook with valid plan status returns spawned', async () => {
    const res = await httpRequest('POST', '/webhook', {
      issue: { key: 'TEST-1' },
      transition: { to_status: 'Do realizacji' },
    });
    assert(res.status === 200, `status ${res.status}`);
    assert(res.json?.status === 'spawned', `not spawned: ${res.body}`);
    assert(res.json?.phase === 'plan', `wrong phase: ${res.json?.phase}`);
    // Wait for mock claude to finish
    await new Promise(r => setTimeout(r, 1000));
  });

  await scenario('POST /webhook with valid impl status returns spawned', async () => {
    const res = await httpRequest('POST', '/webhook', {
      issue: { key: 'TEST-2' },
      transition: { to_status: 'Zaakceptowany' },
    });
    assert(res.status === 200, `status ${res.status}`);
    assert(res.json?.status === 'spawned', `not spawned: ${res.body}`);
    assert(res.json?.phase === 'impl', `wrong phase: ${res.json?.phase}`);
    await new Promise(r => setTimeout(r, 1000));
  });

  await scenario('POST /webhook with Jira standard format (changelog)', async () => {
    const res = await httpRequest('POST', '/webhook', {
      issue: { key: 'TEST-3', fields: { status: { name: 'Do realizacji' } } },
      changelog: { items: [{ field: 'status', toString: 'Do realizacji' }] },
    });
    assert(res.status === 200, `status ${res.status}`);
    assert(res.json?.status === 'spawned', `not spawned: ${res.body}`);
    assert(res.json?.phase === 'plan', `wrong phase: ${res.json?.phase}`);
    await new Promise(r => setTimeout(r, 1000));
  });

  await scenario('POST /webhook with status from fields fallback', async () => {
    const res = await httpRequest('POST', '/webhook', {
      issue: { key: 'TEST-4', fields: { status: { name: 'Zaakceptowany' } } },
    });
    assert(res.status === 200, `status ${res.status}`);
    assert(res.json?.status === 'spawned', `not spawned: ${res.body}`);
    assert(res.json?.phase === 'impl', `wrong phase: ${res.json?.phase}`);
    await new Promise(r => setTimeout(r, 1000));
  });

  await scenario('POST /webhook with invalid JSON returns 400', async () => {
    const res = await httpRequest('POST', '/webhook', 'not json{{{');
    assert(res.status === 400, `status ${res.status}`);
  });

  await scenario('POST /webhook with no issue key returns 400', async () => {
    const res = await httpRequest('POST', '/webhook', { foo: 'bar' });
    assert(res.status === 400, `status ${res.status}`);
  });

  await scenario('POST /webhook with unknown status returns 200 ignored', async () => {
    const res = await httpRequest('POST', '/webhook', {
      issue: { key: 'TEST-5' },
      transition: { to_status: 'Nieznany Status' },
    });
    assert(res.status === 200, `status ${res.status}`);
    assert(res.json?.status === 'ignored', `not ignored: ${res.body}`);
  });

  await scenario('POST /webhook duplicate job returns already_running', async () => {
    // Spawn a job that takes a while
    const res1 = await httpRequest('POST', '/webhook', {
      issue: { key: 'TEST-DUP' },
      transition: { to_status: 'Do realizacji' },
    });
    assert(res1.json?.status === 'spawned', `first not spawned: ${res1.body}`);

    // Immediately try same ticket
    const res2 = await httpRequest('POST', '/webhook', {
      issue: { key: 'TEST-DUP' },
      transition: { to_status: 'Do realizacji' },
    });
    assert(res2.json?.status === 'already_running', `second not blocked: ${res2.body}`);

    await new Promise(r => setTimeout(r, 1000));
  });

  await scenario('GET /status shows active job during execution', async () => {
    const res = await httpRequest('POST', '/webhook', {
      issue: { key: 'TEST-STATUS' },
      transition: { to_status: 'Do realizacji' },
    });
    assert(res.json?.status === 'spawned', `not spawned: ${res.body}`);

    // Immediately check status
    const status = await httpRequest('GET', '/status');
    assert(status.json?.totalActive >= 1, `no active jobs: ${status.body}`);

    await new Promise(r => setTimeout(r, 1000));
  });

  // --- Prompt quality checks ---

  await scenario('Plan prompt includes Polish characters instruction', async () => {
    const src = require('node:fs').readFileSync(RELAY_SCRIPT, 'utf8');
    assert(src.includes('Polish') || src.includes('polsk'), 'no Polish instruction in plan prompt');
    assert(src.includes('Diagnoza'), 'no Diagnoza section in plan template');
    assert(src.includes('Taski'), 'no Taski section');
    assert(src.includes('E2E Test Plan') || src.includes('E2E'), 'no E2E section');
    assert(src.includes('Ryzyka'), 'no Ryzyka section');
    assert(src.includes('Environment'), 'no Environment section');
  });

  await scenario('Impl prompt includes review step', async () => {
    const src = require('node:fs').readFileSync(RELAY_SCRIPT, 'utf8');
    assert(src.includes('CODE REVIEW') || src.includes('review'), 'no review step in impl prompt');
    assert(src.includes('Security') || src.includes('security'), 'no security in review');
    assert(src.includes('review-verdict') || src.includes('verdict'), 'no verdict file');
  });

  await scenario('Impl prompt has resume logic for existing worktrees', async () => {
    const src = require('node:fs').readFileSync(RELAY_SCRIPT, 'utf8');
    assert(src.includes('worktree already has commits') || src.includes('previous run'), 'no resume logic');
    assert(src.includes('gh pr list'), 'no PR check in resume');
  });

  await scenario('Status mapping covers all expected Jira statuses', async () => {
    const src = require('node:fs').readFileSync(RELAY_SCRIPT, 'utf8');
    assert(src.includes("'do realizacji'"), 'missing do realizacji mapping');
    assert(src.includes("'zaakceptowany'"), 'missing zaakceptowany mapping');
  });

  await scenario('Triage routes to correct models by complexity', async () => {
    const src = require('node:fs').readFileSync(RELAY_SCRIPT, 'utf8');
    assert(src.includes('trivial'), 'no trivial routing');
    assert(src.includes('simple'), 'no simple routing');
    assert(src.includes('moderate'), 'no moderate routing');
    assert(src.includes('complex'), 'no complex routing');
    assert(src.includes('haiku'), 'no haiku for triage');
  });

  await scenario('Outcome validation posts PR link on success', async () => {
    const src = require('node:fs').readFileSync(RELAY_SCRIPT, 'utf8');
    assert(src.includes('PR:') || src.includes('prUrl'), 'no PR link posting');
    assert(src.includes("'PR gotowy'") || src.includes('PR gotowy'), 'no PR gotowy transition');
  });

  await scenario('Failure outcome transitions to Wymaga uwagi', async () => {
    const src = require('node:fs').readFileSync(RELAY_SCRIPT, 'utf8');
    assert(src.includes('Wymaga uwagi'), 'no Wymaga uwagi transition');
  });

  await scenario('Session ID extracted and posted in Jira comment', async () => {
    const src = require('node:fs').readFileSync(RELAY_SCRIPT, 'utf8');
    assert(src.includes('session_id'), 'no session_id extraction');
    assert(src.includes('resume'), 'no resume command in comment');
  });

  await scenario('macOS notification sent on completion', async () => {
    const src = require('node:fs').readFileSync(RELAY_SCRIPT, 'utf8');
    assert(src.includes('osascript') || src.includes('notification'), 'no macOS notification');
  });
}

// --- Main ---

async function main() {
  setup();

  try {
    await startRelay();
    await runScenarios();
  } catch (err) {
    console.error(`FATAL: ${err.message}`);
  } finally {
    await stopRelay();
    cleanup();
  }

  // Print results
  const passed = results.filter(r => r.pass).length;
  const total = results.length;

  console.log('\n=== Jira Relay E2E Scenarios ===');
  for (const r of results) {
    const icon = r.pass ? 'PASS' : 'FAIL';
    console.log(`  [${icon}] ${r.name}${r.error ? ` - ${r.error}` : ''}`);
  }
  console.log(`\nSCENARIOS_PASSED: ${passed}/${total}`);
  console.log(passed); // raw metric for autoresearch
}

main();
