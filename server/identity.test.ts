import assert from 'node:assert/strict';
import { test } from 'node:test';
import { canonicalClaims, canonicalGtin, canonicalIdentifier, ValidationError } from './identity.js';

const sgtin = { scheme: 'sgtin', gtin: '0614141123452', serial: '001a/A%' } as const;
// GS1 architecture example: AI 8003 payload, including zero filler.
const grai = { scheme: 'grai', grai: '00614141234561789' } as const;

test('GTIN-8, UPC, JAN and GTIN-14 normalize to 14 digits without numeric conversion', () => {
  for (const [input, expected] of [
    ['96385074', '00000096385074'],
    ['036000291452', '00036000291452'],
    ['4901234567894', '04901234567894'],
    ['10614141123459', '10614141123459'],
  ]) assert.equal(canonicalGtin(input), expected);
  for (const input of ['4901234567895', '123', ' 96385074', '96385074\n', '00000000\n', 96385074]) {
    assert.throws(() => canonicalGtin(input), ValidationError);
  }
});

test('SGTIN normalization preserves serial case, leading zeros and literal punctuation', () => {
  assert.deepEqual(canonicalIdentifier(sgtin), { ...sgtin, gtin: '00614141123452' });
  for (const serial of ['0', '00', 'a', 'A', 'A/B', 'A%2FB', '01234567890123456789']) {
    const result = canonicalIdentifier({ ...sgtin, serial });
    assert.equal(result.scheme === 'sgtin' && result.serial, serial);
  }
  for (const serial of ['', ' ', 'A\n', 'A\t', '日本', '#', '$', '@', '[', '\\', '`', '~', 'A'.repeat(21)]) {
    assert.throws(() => canonicalIdentifier({ ...sgtin, serial }), ValidationError);
  }
});

test('GRAI validates zero filler, key check digit and mandatory individual serial', () => {
  assert.deepEqual(canonicalIdentifier(grai), grai);
  assert.deepEqual(canonicalIdentifier({ scheme: 'grai', grai: '00614141234561001a' }),
    { scheme: 'grai', grai: '00614141234561001a' });
  for (const value of ['10614141234561789', '00614141234562789', '00614141234561',
    '00614141234561A\n', '00614141234561' + 'A'.repeat(17)]) {
    assert.throws(() => canonicalIdentifier({ scheme: 'grai', grai: value }), ValidationError);
  }
  assert.doesNotThrow(() => canonicalIdentifier({ scheme: 'grai', grai: '00614141234561' + 'A'.repeat(16) }));
});

test('equivalent claims collapse; GTIN alone never becomes individual identity', () => {
  const expected = canonicalIdentifier(sgtin);
  assert.deepEqual(canonicalClaims([sgtin, expected, { scheme: 'gtin', gtin: sgtin.gtin }]), expected);
  assert.deepEqual(canonicalClaims([grai, grai]), grai);
  for (const claims of [[], [{ scheme: 'gtin', gtin: sgtin.gtin }], null]) {
    assert.throws(() => canonicalClaims(claims), ValidationError);
  }
});

test('mixed schemes, conflicting serials, and mismatched GTIN claims fail closed', () => {
  for (const claims of [
    [sgtin, grai], [grai, sgtin],
    [sgtin, { ...sgtin, serial: 'different' }],
    [sgtin, { ...sgtin, gtin: '4901234567894' }],
    [grai, { scheme: 'gtin', gtin: sgtin.gtin }],
    [sgtin, { scheme: 'gtin', gtin: '4901234567894' }],
    [grai, { ...grai, grai: '00614141234561999' }],
  ]) assert.throws(() => canonicalClaims(claims), ValidationError);
});

test('unsupported schemes, extra fields and URI inputs are not silently accepted', () => {
  for (const value of [null, [], {}, 'urn:epc:id:sgtin:0614141.012345.1',
    { scheme: 'manufacturer', serial: '123' }, { ...sgtin, grai: grai.grai },
    { ...grai, serial: '123' }, { ...sgtin, publicId: '123' }]) {
    assert.throws(() => canonicalIdentifier(value), ValidationError);
  }
});
