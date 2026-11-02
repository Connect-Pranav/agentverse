// Festive theme calendar checks. Run: node --test scripts/festive.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const file = process.env.FESTIVE_FILE || join(here, '..', 'festive.js');
await import(file);
const F = globalThis.Festive;
const d = (s) => new Date(`${s}T12:00:00`);
const top = (s) => F.active(d(s))[0]?.festival.id ?? null;

test('computed dates', () => {
  assert.equal(F.easter(2027).toDateString(), new Date(2027, 2, 28).toDateString());
  assert.equal(F.easter(2028).toDateString(), new Date(2028, 3, 16).toDateString());
  assert.equal(F.thanksgiving(2026).toDateString(), new Date(2026, 10, 26).toDateString());
  assert.equal(F.thanksgiving(2027).toDateString(), new Date(2027, 10, 25).toDateString());
});

test('decorations start 4 days before and stop after the festival', () => {
  assert.equal(top('2026-11-03'), null); // Diwali 8 Nov 2026: not yet
  assert.equal(top('2026-11-04'), 'diwali'); // 4 days before
  assert.equal(top('2026-11-08'), 'diwali');
  assert.equal(top('2026-11-10'), 'diwali'); // Bhai Dooj tail
  assert.equal(top('2026-11-11'), null);
  assert.equal(top('2026-12-21'), 'christmas');
  assert.equal(top('2026-12-27'), null);
  assert.equal(top('2026-12-28'), 'new_year');
  assert.equal(top('2027-01-01'), 'new_year');
});

test('overlaps pick the right festival', () => {
  // Diwali 29 Oct 2027 overlaps Halloween 31 Oct 2027.
  assert.equal(top('2027-10-28'), 'diwali');
  assert.equal(top('2027-10-31'), 'halloween'); // Diwali is in its tail, Halloween is today
  // Lunar New Year and Republic Day both 26 Jan 2028.
  assert.equal(top('2028-01-26'), 'lunar_new_year');
});

test('every festival has a date for each verified year', () => {
  for (const y of [2027, 2028]) for (const f of F.FESTIVALS) assert.ok(F.dateFor(f, y), `${f.id} ${y}`);
});

test('missing lunar years are skipped, not guessed', () => {
  const warn = console.warn; let msg = '';
  console.warn = (m) => { msg = m; };
  try { assert.equal(F.dateFor(F.FESTIVALS.find((f) => f.id === 'diwali'), 2031), null); } finally { console.warn = warn; }
  assert.match(msg, /no verified 2031 date for Diwali/);
});
