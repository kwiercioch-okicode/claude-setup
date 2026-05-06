'use strict';

const { existsSync, readFileSync, writeFileSync, appendFileSync, mkdirSync } = require('node:fs');
const { dirname } = require('node:path');

const LOG_PATH_DEFAULT = '.claude/learnings/log.md';

const ENTRY_HEADER_RE = /^##\s+(\d{4}-\d{2}-\d{2}(?:\s+\d{2}:\d{2})?)\s+-\s+(.+)$/;
const FIELD_RE = /^\*\*([A-Z][A-Za-z]+):\*\*\s*(.+)$/;

function parseLog(path = LOG_PATH_DEFAULT) {
  if (!existsSync(path)) return [];
  const text = readFileSync(path, 'utf8');
  const lines = text.split('\n');
  const entries = [];
  let current = null;
  let inEntry = false;

  for (const line of lines) {
    const headerMatch = line.match(ENTRY_HEADER_RE);
    if (headerMatch) {
      if (current) entries.push(current);
      current = {
        date: headerMatch[1],
        title: headerMatch[2].trim(),
        fields: {},
        rawLine: line,
      };
      inEntry = true;
      continue;
    }
    if (!inEntry) continue;
    const fieldMatch = line.match(FIELD_RE);
    if (fieldMatch) {
      const key = fieldMatch[1].toLowerCase();
      current.fields[key] = fieldMatch[2].trim();
    }
  }
  if (current) entries.push(current);

  return entries.map(normalizeEntry);
}

function normalizeEntry(e) {
  const status = (e.fields.status || 'ACTIVE').split(':')[0].toUpperCase();
  const confidenceRaw = e.fields.confidence || '';
  const confidence = parseConfidence(confidenceRaw);
  return {
    date: e.date,
    title: e.title,
    status,
    statusFull: e.fields.status || 'ACTIVE',
    skill: e.fields.skill || '',
    key: e.fields.key || slugify(e.title),
    context: e.fields.context || '',
    learning: e.fields.learning || '',
    action: e.fields.action || '',
    source: e.fields.source || 'manual',
    confidence,
  };
}

function parseConfidence(raw) {
  if (!raw) return 5;
  const match = raw.match(/(\d+)/);
  if (!match) return 5;
  const n = parseInt(match[1], 10);
  if (n >= 1 && n <= 10) return n;
  return 5;
}

function slugify(s) {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

function countByStatus(entries) {
  const counts = { ACTIVE: 0, PROMOTED: 0, STALE: 0 };
  for (const e of entries) {
    counts[e.status] = (counts[e.status] || 0) + 1;
  }
  return counts;
}

function topActive(entries, { limit = 10, minConfidence = 0, dedupByKey = true } = {}) {
  const active = entries.filter((e) => e.status === 'ACTIVE' && e.confidence >= minConfidence);
  active.sort((a, b) => {
    if (b.confidence !== a.confidence) return b.confidence - a.confidence;
    return b.date.localeCompare(a.date);
  });
  if (!dedupByKey) return active.slice(0, limit);
  const seen = new Set();
  const result = [];
  for (const e of active) {
    if (seen.has(e.key)) continue;
    seen.add(e.key);
    result.push(e);
    if (result.length >= limit) break;
  }
  return result;
}

function appendEntry(path, entry) {
  const dir = dirname(path);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  if (!existsSync(path)) {
    writeFileSync(path, '# Learnings Log\n\n');
  }
  const block = renderEntry(entry);
  appendFileSync(path, '\n' + block + '\n');
}

function renderEntry(e) {
  const date = e.date || timestamp();
  const lines = [`## ${date} - ${e.title}`];
  lines.push(`**Status:** ${e.status || 'ACTIVE'}`);
  if (e.skill) lines.push(`**Skill:** ${e.skill}`);
  if (e.key) lines.push(`**Key:** ${e.key}`);
  if (e.context) lines.push(`**Context:** ${e.context}`);
  if (e.learning) lines.push(`**Learning:** ${e.learning}`);
  if (e.action) lines.push(`**Action:** ${e.action}`);
  if (e.source) lines.push(`**Source:** ${e.source}`);
  if (e.confidence !== undefined) lines.push(`**Confidence:** ${e.confidence}/10`);
  return lines.join('\n');
}

function timestamp() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

module.exports = {
  LOG_PATH_DEFAULT,
  parseLog,
  countByStatus,
  topActive,
  appendEntry,
  renderEntry,
  slugify,
  timestamp,
};
