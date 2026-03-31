#!/usr/bin/env node

/**
 * secrets-guard.js - PreToolUse hook for Read and Bash
 * Blocks LLM from reading secret files or executing commands that expose secrets.
 * Exit 2 = block with message. Exit 0 = allow.
 */

'use strict';

const { basename } = require('node:path');

// File patterns that likely contain secrets
const SECRET_FILE_PATTERNS = [
  /^\.env(\.|$)/i,          // .env, .env.local, .env.production etc.
  /^\.envrc$/i,
  /credentials?(\.json)?$/i,
  /secrets?(\.json|\.yaml|\.yml)?$/i,
  /^id_rsa/,                // SSH private keys
  /^id_ed25519/,
  /^id_ecdsa/,
  /\.pem$/i,
  /\.key$/i,
  /\.p12$/i,
  /\.pfx$/i,
  /\.jks$/i,
  /^\.netrc$/i,
  /^\.pgpass$/i,
  /service[-_]?account.*\.json$/i,
  /auth.*\.json$/i,
];

// Bash command patterns that may expose secrets
const SECRET_BASH_PATTERNS = [
  /cat\s+.*\.env/i,
  /cat\s+.*credentials/i,
  /cat\s+.*secrets/i,
  /cat\s+.*\.pem/i,
  /cat\s+.*\.key/i,
  /cat\s+id_rsa/i,
  /printenv/i,
  /env\s*$/,
  /export\s+\w+_(?:KEY|SECRET|TOKEN|PASSWORD|PASS|PWD|API_KEY)\s*=/i,
];

function isSecretFile(filePath) {
  if (!filePath) return false;
  const name = basename(filePath);
  return SECRET_FILE_PATTERNS.some(p => p.test(name));
}

function isSecretBashCommand(command) {
  if (!command) return false;
  return SECRET_BASH_PATTERNS.some(p => p.test(command));
}

async function main() {
  let input = '';
  for await (const chunk of process.stdin) {
    input += chunk;
  }

  let data;
  try {
    data = JSON.parse(input);
  } catch {
    process.exit(0);
  }

  const toolName = data?.tool_name || '';
  const toolInput = data?.tool_input || {};

  if (toolName === 'Read') {
    const filePath = toolInput.file_path || '';
    if (isSecretFile(filePath)) {
      process.stdout.write(
        `SECRETS GUARD: Blocked reading "${basename(filePath)}" - this file likely contains secrets.\n` +
        `If you need a specific value, ask the user to provide it directly in the conversation.`
      );
      process.exit(2);
    }
  }

  if (toolName === 'Bash') {
    const command = toolInput.command || '';
    if (isSecretBashCommand(command)) {
      process.stdout.write(
        `SECRETS GUARD: Blocked command that may expose secrets.\n` +
        `If you need a specific value, ask the user to provide it directly in the conversation.`
      );
      process.exit(2);
    }
  }

  process.exit(0);
}

main();
