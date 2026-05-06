#!/usr/bin/env node

'use strict';

const { spawn } = require('node:child_process');
const { existsSync, readFileSync, writeFileSync, mkdirSync, appendFileSync } = require('node:fs');
const { join, dirname } = require('node:path');
const { tmpdir } = require('node:os');
const { appendEntry, LOG_PATH_DEFAULT, timestamp } = require('./lib/learnings-parser');

const JUDGE_PROMPT = `You are a learning-capture judge for an AI coding assistant.

Look at the previous assistant action and the user's response. Decide if the user is CORRECTING the assistant - pointing out a mistake, wrong approach, missed convention, or non-obvious gotcha that future sessions should remember.

Output ONLY a single JSON object on stdout. No markdown, no fences, no commentary.

Schema:
{
  "is_correction": boolean,
  "skill_target": string,    // existing skill name OR "rule:<name>" OR "new:<name>" OR "docs"
  "key": string,             // short kebab-case identifier, e.g. "price-numeric-type"
  "title": string,           // 6-10 word summary
  "context": string,         // what the assistant was doing
  "learning": string,        // the actual lesson - what NOT to do or what TO do
  "action": string,          // concrete next step for future sessions
  "confidence": number       // 1-10, how clear/durable the lesson is
}

Rules:
- is_correction=false for: clarifying questions, scope additions ("also do X"), preferences not corrections, social.
- is_correction=true for: "no, do X instead", "wrong approach", "we always Y", "don't Z", domain rules revealed.
- Reject low-signal corrections (one-time formatting nits): set confidence < 5.
- Skill_target heuristic: backend-patterns, react-components, e2e-test-patterns, selected-photos, database-schema, security, etc. If genuinely new domain, use "new:<name>".

If is_correction=false, set other fields to empty strings and confidence=0.`;

function readStdinAsync() {
  return new Promise((resolve) => {
    let data = '';
    if (process.stdin.isTTY) return resolve('');
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => (data += chunk));
    process.stdin.on('end', () => resolve(data));
  });
}

function lastAssistantFromTranscript(transcriptPath) {
  if (!transcriptPath || !existsSync(transcriptPath)) return '';
  let raw;
  try {
    raw = readFileSync(transcriptPath, 'utf8');
  } catch {
    return '';
  }
  const lines = raw.trim().split('\n');
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i];
    if (!line) continue;
    let obj;
    try {
      obj = JSON.parse(line);
    } catch {
      continue;
    }
    const msg = obj.message || obj;
    const role = msg.role || obj.role;
    if (role !== 'assistant') continue;
    const content = msg.content || obj.content;
    if (typeof content === 'string') return content;
    if (Array.isArray(content)) {
      const text = content
        .filter((c) => c.type === 'text' && c.text)
        .map((c) => c.text)
        .join('\n');
      if (text) return text;
    }
  }
  return '';
}

function trim(s, max) {
  if (!s) return '';
  if (s.length <= max) return s;
  return s.slice(0, max) + '...[truncated]';
}

async function hookMode() {
  if (process.env.CS_AUTOSKILL_ENABLED === 'false') {
    process.exit(0);
  }

  const stdinRaw = await readStdinAsync();
  let payload = {};
  try {
    payload = stdinRaw ? JSON.parse(stdinRaw) : {};
  } catch {
    process.exit(0);
  }

  const prompt = payload.prompt || '';
  const transcriptPath = payload.transcript_path || '';
  const cwd = payload.cwd || process.cwd();
  const sessionId = payload.session_id || '';

  if (!prompt || !transcriptPath) {
    process.exit(0);
  }

  if (prompt.startsWith('/')) {
    process.exit(0);
  }

  const lastAssistant = lastAssistantFromTranscript(transcriptPath);
  if (!lastAssistant) {
    process.exit(0);
  }

  const workerPayload = {
    prompt: trim(prompt, 4000),
    last_assistant: trim(lastAssistant, 8000),
    cwd,
    session_id: sessionId,
  };

  const tmpFile = join(tmpdir(), `cs-judge-${sessionId || Date.now()}-${process.pid}.json`);
  try {
    writeFileSync(tmpFile, JSON.stringify(workerPayload), 'utf8');
  } catch {
    process.exit(0);
  }

  const self = __filename;
  const child = spawn(process.execPath, [self, '--worker', tmpFile], {
    detached: true,
    stdio: 'ignore',
  });
  child.unref();

  process.exit(0);
}

function appendDebug(cwd, msg) {
  if (!process.env.CS_AUTOSKILL_DEBUG) return;
  const path = join(cwd, '.claude', 'learnings', '.judge-debug.log');
  try {
    mkdirSync(dirname(path), { recursive: true });
    appendFileSync(path, `[${new Date().toISOString()}] ${msg}\n`);
  } catch {}
}

function workerMode() {
  const tmpFile = process.argv[3];
  if (!tmpFile || !existsSync(tmpFile)) process.exit(0);

  let payload;
  try {
    payload = JSON.parse(readFileSync(tmpFile, 'utf8'));
  } catch {
    process.exit(0);
  }
  try {
    require('node:fs').unlinkSync(tmpFile);
  } catch {}

  const cwd = payload.cwd || process.cwd();
  const minConfidence = parseInt(process.env.CS_AUTOSKILL_MIN_CONFIDENCE || '6', 10);
  const model = process.env.CS_AUTOSKILL_MODEL || 'claude-haiku-4-5';
  const claudeBin = process.env.CS_AUTOSKILL_CLAUDE_BIN || 'claude';

  const judgeInput = `${JUDGE_PROMPT}

PREVIOUS ASSISTANT ACTION:
${payload.last_assistant}

USER RESPONSE:
${payload.prompt}

Output JSON only.`;

  appendDebug(cwd, `worker start session=${payload.session_id}`);

  const child = spawn(claudeBin, ['-p', '--model', model, '--output-format', 'text'], {
    stdio: ['pipe', 'pipe', 'pipe'],
    timeout: 60000,
  });

  let stdout = '';
  let stderr = '';
  child.stdout.on('data', (d) => (stdout += d.toString()));
  child.stderr.on('data', (d) => (stderr += d.toString()));

  child.on('error', (err) => {
    appendDebug(cwd, `claude spawn error: ${err.message}`);
    process.exit(0);
  });

  child.on('close', (code) => {
    if (code !== 0) {
      appendDebug(cwd, `claude exit ${code} stderr=${trim(stderr, 200)}`);
      process.exit(0);
    }
    let verdict;
    try {
      const jsonText = extractJson(stdout);
      verdict = JSON.parse(jsonText);
    } catch (err) {
      appendDebug(cwd, `parse error: ${err.message} raw=${trim(stdout, 200)}`);
      process.exit(0);
    }
    if (!verdict || !verdict.is_correction) {
      appendDebug(cwd, `no correction (conf=${verdict && verdict.confidence})`);
      process.exit(0);
    }
    const conf = parseInt(verdict.confidence, 10) || 0;
    if (conf < minConfidence) {
      appendDebug(cwd, `low confidence ${conf} < ${minConfidence}`);
      process.exit(0);
    }
    const logPath = join(cwd, LOG_PATH_DEFAULT);
    appendEntry(logPath, {
      date: timestamp(),
      title: verdict.title || 'Auto-detected correction',
      status: 'ACTIVE',
      skill: verdict.skill_target || 'docs',
      key: verdict.key || '',
      context: verdict.context || '',
      learning: verdict.learning || '',
      action: verdict.action || '',
      source: 'auto-detected',
      confidence: conf,
    });
    appendDebug(cwd, `entry appended key=${verdict.key} conf=${conf}`);
    process.exit(0);
  });

  child.stdin.write(judgeInput);
  child.stdin.end();
}

function extractJson(text) {
  if (!text) throw new Error('empty');
  const trimmed = text.trim();
  if (trimmed.startsWith('{')) return trimmed;
  const fenceMatch = trimmed.match(/```(?:json)?\s*\n([\s\S]*?)\n```/);
  if (fenceMatch) return fenceMatch[1].trim();
  const braceStart = trimmed.indexOf('{');
  const braceEnd = trimmed.lastIndexOf('}');
  if (braceStart >= 0 && braceEnd > braceStart) {
    return trimmed.slice(braceStart, braceEnd + 1);
  }
  throw new Error('no json found');
}

if (process.argv[2] === '--worker') {
  workerMode();
} else {
  hookMode().catch((err) => {
    process.stderr.write(`[learnings-judge] error: ${err.message}\n`);
    process.exit(0);
  });
}
