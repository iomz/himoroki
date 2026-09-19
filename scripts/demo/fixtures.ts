import type { AssetIdentifier } from '../../server/identity.js';

export const demoPassword = 'Kannabi-demo-only-2026!';
export const demoAccounts = [
  { name: 'Alex Demo', email: 'evaluator@demo.invalid' },
  { name: 'Morgan Demo', email: 'collaborator@demo.invalid' },
  { name: 'Robin Demo', email: 'outsider@demo.invalid' },
] as const;
export const demoGroups = ['Demo Workshop', 'Shared Studio', 'Field Kits', 'Private Store'] as const;
export const demoOwners = ['Northstar Demo Cooperative', 'Meadow Demo Rentals', 'Workshop Equipment Pool'] as const;
const products = ['Signal generator', 'RFID reader', 'Field laptop', 'Inspection camera',
  'Tool case', 'Portable projector', 'Survey receiver', 'Trail backpack',
  'Bench multimeter', 'Audio recorder', 'Inspection microscope', 'Workshop tablet'];
const places = ['Bench', 'Studio', 'Field', 'Shelf'];

// These are synthetic, checksum-valid values for UI evaluation, not allocated GS1 keys.
// Normal domain reporting still generates internal keys and provenance timestamps.
export function demoAssets() {
  return Array.from({ length: 140 }, (_, index) => {
    const serial = 'DEMO-' + String(index + 1).padStart(3, '0');
    const identifier: AssetIdentifier = index % 2 === 0
      ? { scheme: 'sgtin', gtin: '00614141123452', serial }
      : { scheme: 'grai', grai: '00614141234561' + serial };
    const group = index < 48 ? 0 : index < 88 ? 1 : index < 120 ? 2 : 3;
    const reporter = group === 0 ? 0 : group === 1 ? 1 : group === 2 ? (index % 2) : 2;
    return {
      name: `${products[index % products.length]} · ${places[Math.floor(index / products.length) % places.length]} ${serial.slice(-3)}`,
      identifier, group, reporter,
      isPublic: index < 120 ? index % 4 === 0 : index % 5 === 0,
      owner: index % 4 === 0 ? null : index % demoOwners.length,
      photo: index % 3 === 0 ? ['instrument.png', 'camera.png', 'case.png'][Math.floor(index / 3) % 3] : null,
    };
  });
}
export const evaluatorScopes = { all: 124, mine: 64, group: 120, public: 34 };
