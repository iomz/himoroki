export class ValidationError extends Error {}

export type AssetIdentifier =
  | Readonly<{ scheme: 'sgtin'; gtin: string; serial: string }>
  | Readonly<{ scheme: 'grai'; grai: string }>;

// Structured AI values, not barcode syntax, EPC URIs, or Digital Link URLs.
// A GTIN claim can accompany SGTIN but cannot identify an individual by itself.
export type IdentifierClaim = AssetIdentifier | Readonly<{ scheme: 'gtin'; gtin: string }>;

export function record(value: unknown, fields: readonly string[]): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new ValidationError('Expected an object');
  }
  for (const key of Object.keys(value)) {
    if (!fields.includes(key)) throw new ValidationError(`Unsupported field: ${key}`);
  }
  return value as Record<string, unknown>;
}

export function requiredText(value: unknown, field: string): string {
  if (typeof value !== 'string' || !value.trim() || /[\u0000-\u001f\u007f]/.test(value)) {
    throw new ValidationError(`${field} is required`);
  }
  return value.trim();
}

function checkDigit(value: string): boolean {
  let sum = 0;
  for (let i = value.length - 2, weight = 3; i >= 0; i--, weight = 4 - weight) {
    sum += Number(value[i]) * weight;
  }
  return (10 - sum % 10) % 10 === Number(value.at(-1));
}

export function canonicalGtin(value: unknown): string {
  if (typeof value !== 'string' || ![8, 12, 13, 14].includes(value.length) || /\D/.test(value)
      || !checkDigit(value)) {
    throw new ValidationError('GTIN/JAN must contain 8, 12, 13, or 14 digits with a valid check digit');
  }
  return value.padStart(14, '0');
}

// GS1 AI encodable character set 82. Preserve case, punctuation, and leading zeros.
// GS1 TDS 2.3 §5 and GS1 Syntax Dictionary AI 21 / 8003.
const invalidSerialCharacter = /[^A-Za-z0-9!"%&'()*+,\-./:;<=>?_]/;

function serial(value: unknown, max: number): string {
  if (typeof value !== 'string' || !value.length || value.length > max || invalidSerialCharacter.test(value)) {
    throw new ValidationError(`Serial must contain 1–${max} GS1 characters`);
  }
  return value;
}

export function canonicalIdentifier(value: unknown): AssetIdentifier {
  const input = record(value, ['scheme', 'gtin', 'serial', 'grai']);
  if (input.scheme === 'sgtin') {
    record(input, ['scheme', 'gtin', 'serial']);
    return Object.freeze({ scheme: 'sgtin', gtin: canonicalGtin(input.gtin), serial: serial(input.serial, 20) });
  }
  if (input.scheme === 'grai') {
    record(input, ['scheme', 'grai']);
    // AI 8003 payload: zero filler + 13-digit key (including check digit) + serial.
    // GS1 permits an absent serial in general; individual Asset identity requires it.
    if (typeof input.grai !== 'string' || !/^0\d{13}/.test(input.grai)
        || !checkDigit(input.grai.slice(1, 14))) {
      throw new ValidationError('GRAI requires zero filler and a 13-digit key with a valid check digit');
    }
    serial(input.grai.slice(14), 16);
    return Object.freeze({ scheme: 'grai', grai: input.grai });
  }
  throw new ValidationError('Supported individual identity schemes are sgtin and grai');
}

export function canonicalClaims(value: unknown): AssetIdentifier {
  if (!Array.isArray(value) || value.length === 0) {
    throw new ValidationError('At least one individual identifier is required');
  }
  let identity: AssetIdentifier | undefined;
  const gtins: string[] = [];
  for (const claim of value) {
    const input = record(claim, ['scheme', 'gtin', 'serial', 'grai']);
    if (input.scheme === 'gtin') {
      record(input, ['scheme', 'gtin']);
      gtins.push(canonicalGtin(input.gtin));
      continue;
    }
    const next = canonicalIdentifier(input);
    if (identity && JSON.stringify(identity) !== JSON.stringify(next)) {
      throw new ValidationError('An Asset cannot claim conflicting individual identifiers or mix SGTIN and GRAI');
    }
    identity = next;
  }
  if (!identity) throw new ValidationError('GTIN/JAN alone does not identify an individual Asset');
  if (gtins.some((gtin) => identity.scheme !== 'sgtin' || identity.gtin !== gtin)) {
    throw new ValidationError('GTIN/JAN claim conflicts with the individual identifier');
  }
  return identity;
}
