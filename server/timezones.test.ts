import assert from 'node:assert/strict';
import { test } from 'node:test';
import { filterTimezones, supportedTimezones } from '../web/timezones.js';

test('timezone selector uses deterministic supported identifiers and case-insensitive search', () => {
  assert.equal(supportedTimezones[0], 'UTC');
  assert.ok(supportedTimezones.includes('Asia/Tokyo'));
  assert.equal(new Set(supportedTimezones).size, supportedTimezones.length);
  assert.deepEqual(filterTimezones('  asia/TOKYO  '), ['Asia/Tokyo']);
  assert.deepEqual(filterTimezones('not-a-timezone'), []);
  assert.equal(filterTimezones(''), supportedTimezones);
});
