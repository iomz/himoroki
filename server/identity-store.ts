import { randomUUID } from 'node:crypto';
import { validateSettings, type Settings } from './settings.js';
import type { Driver, ManagedTransaction } from 'neo4j-driver';
import { int } from 'neo4j-driver';
import { assetCursor, type AssetPageRequest, type AssetScope } from './asset-page.js';
import {
  canonicalClaims, canonicalIdentifier, record, requiredText, ValidationError,
  type AssetIdentifier, type IdentifierClaim,
} from './identity.js';

export class DuplicateIdentityError extends Error {}
export class ReferenceError extends Error {}
export class AdministrationError extends Error {}
export class LastAdministratorError extends Error {}
export type Member = { key: string; name: string; email: string; isAdmin: boolean; createdAt: string | null };
const memberProjection = `u { .key, .name, .email, isAdmin: coalesce(u.isAdmin, false), createdAt: toString(u.createdAt) }`;

// Entity keys are internal references. Assets have no generated application ID.
export type Entity = Readonly<{ key: string; name: string }>;
export type Asset = Readonly<{
  name: string;
  identifier: AssetIdentifier;
  reportedBy: Entity;
  reportedAt: string;
  owner: Entity | null;
  groups: readonly Entity[];
  isPublic: boolean;
  photos: readonly Photo[];
}>;
export type Photo = { key: string; contentType: string; size: number };
export type AssetPage = { assets: Asset[]; total: number; matching: number; scopes: Record<AssetScope, number>; nextCursor: string | null };
export type ReportAsset = {
  name: string;
  identifiers: readonly IdentifierClaim[];
  ownerKey?: string;
};
export type ReportingContext = { actorKey: string; groupKey: string };
export type AssetChanges = { name?: string; ownerKey?: string | null; isPublic?: boolean };

const constraints = [
  'CREATE CONSTRAINT settings_key IF NOT EXISTS FOR (n:Settings) REQUIRE n.key IS UNIQUE',
  'CREATE CONSTRAINT media_key IF NOT EXISTS FOR (n:Media) REQUIRE n.key IS UNIQUE',
  'CREATE CONSTRAINT user_key IF NOT EXISTS FOR (n:User) REQUIRE n.key IS UNIQUE',
  'CREATE CONSTRAINT group_key IF NOT EXISTS FOR (n:Group) REQUIRE n.key IS UNIQUE',
  'CREATE CONSTRAINT owner_key IF NOT EXISTS FOR (n:Owner) REQUIRE n.key IS UNIQUE',
  `CREATE CONSTRAINT identifier_claim IF NOT EXISTS FOR (n:Identifier)
   REQUIRE (n.scheme, n.value, n.serial) IS UNIQUE`,
];

function claimProperties(identifier: AssetIdentifier) {
  return identifier.scheme === 'sgtin'
    ? { scheme: identifier.scheme, value: identifier.gtin, serial: identifier.serial }
    : { scheme: identifier.scheme, value: identifier.grai, serial: '' };
}

const assetMatch = `MATCH (a:Asset)-[:IDENTIFIED_BY]->(i:Identifier {
  scheme: $claim.scheme, value: $claim.value, serial: $claim.serial
})`;
const collaboration = `EXISTS {
  MATCH (:User {key: $actorKey})-[:MEMBER_OF]->(:Group)-[:CAN_COLLABORATE]->(a)
}`;
const assetProjection = `
  MATCH (a)-[:REPORTED_BY]->(u:User)
  MATCH (g:Group)-[:CAN_COLLABORATE]->(a)
  OPTIONAL MATCH (a)-[:OWNED_BY]->(o:Owner)
  WITH a, u, o, collect(g { .key, .name }) AS groups
  RETURN a { .name, .isPublic, reportedAt: toString(a.reportedAt),
    reportedBy: u { .key, .name }, owner: o { .key, .name },
    groups: groups, photos: [(a)-[:HAS_PHOTO]->(m:Media) | m { .key, .contentType, size: toFloat(m.size) }] } AS asset`;

/** Internal persistence API. Callers must supply a trusted actor context.
 * No HTTP routes or authentication are provided by this layer.
 * The supplied driver belongs to the caller and is never closed here.
 */
export class IdentityStore {
  private constructor(private readonly driver: Driver) {}

  static async open(driver: Driver): Promise<IdentityStore> {
    const session = driver.session();
    try {
      // Fail closed if constraints cannot be installed, including on dirty data.
      for (const statement of constraints) await session.run(statement);
      await session.run("MERGE (s:Settings {key: 'instance'}) ON CREATE SET s.requirePhoto = false, s.displayTimezone = 'UTC', s.revision = 0");
      const result = await session.run('SHOW CONSTRAINTS YIELD type, labelsOrTypes, properties RETURN *');
      for (const [label, properties] of [
        ['Settings', ['key']], ['Media', ['key']], ['User', ['key']], ['Group', ['key']], ['Owner', ['key']],
        ['Identifier', ['scheme', 'value', 'serial']],
      ] as const) {
        if (!result.records.some((row) => row.get('type') === 'UNIQUENESS'
          && JSON.stringify(row.get('labelsOrTypes')) === JSON.stringify([label])
          && JSON.stringify(row.get('properties')) === JSON.stringify(properties))) {
          throw new Error(`Required uniqueness constraint is missing for ${label}`);
        }
      }
    } finally {
      await session.close();
    }
    return new IdentityStore(driver);
  }

  private async write<T>(work: (tx: ManagedTransaction) => Promise<T>): Promise<T> {
    const session = this.driver.session();
    try { return await session.executeWrite(work); }
    finally { await session.close(); }
  }

  private async createEntity(label: 'User' | 'Group' | 'Owner', value: string): Promise<Entity> {
    const entity = { key: randomUUID(), name: requiredText(value, 'name') };
    await this.write(async (tx) => { await tx.run(`CREATE (n:${label} $entity)`, { entity }); });
    return entity;
  }

  createUser(name: string) { return this.createEntity('User', name); }
  createGroup(name: string) { return this.createEntity('Group', name); }
  createOwner(name: string) { return this.createEntity('Owner', name); }

  async createReportingGroup(name: string, actorKey: string): Promise<Entity> {
    const group = { key: randomUUID(), name: requiredText(name, 'name') };
    return this.write(async (tx) => {
      const result = await tx.run(`MATCH (u:User {key: $actorKey})
        CREATE (g:Group $group), (u)-[:MEMBER_OF]->(g) RETURN g.key`, { actorKey, group });
      if (!result.records.length) throw new ReferenceError('User does not exist');
      return group;
    });
  }

  async listGroups(actorKey: string): Promise<Entity[]> {
    const session = this.driver.session();
    try {
      const result = await session.executeRead((tx) => tx.run(`
        MATCH (:User {key: $actorKey})-[:MEMBER_OF]->(g:Group)
        RETURN DISTINCT g { .key, .name } AS entity ORDER BY entity.name`, { actorKey }));
      return result.records.map((row) => row.get('entity') as Entity);
    } finally { await session.close(); }
  }

  async addGroupMember(actorKey: string, groupKey: string, userKey: string): Promise<void> {
    await this.write(async (tx) => {
      const result = await tx.run(`
        MATCH (:User {key: $actorKey})-[:MEMBER_OF]->(g:Group {key: $groupKey})
        MATCH (u:User {key: $userKey})
        MERGE (u)-[:MEMBER_OF]->(g) RETURN g.key`, { actorKey, groupKey, userKey });
      if (!result.records.length) throw new ReferenceError('Group access or target User not found');
    });
  }

  async leaveGroup(actorKey: string, groupKey: string): Promise<void> {
    await this.write(async (tx) => {
      const result = await tx.run(`
        MATCH (:User {key: $actorKey})-[m:MEMBER_OF]->(g:Group {key: $groupKey})
        DELETE m RETURN g.key`, { actorKey, groupKey });
      if (!result.records.length) throw new ReferenceError('Group membership not found');
    });
  }

  async addMember(userKey: string, groupKey: string): Promise<void> {
    const params = {
      userKey: requiredText(userKey, 'userKey'), groupKey: requiredText(groupKey, 'groupKey'),
    };
    await this.write(async (tx) => {
      const result = await tx.run(`MATCH (u:User {key: $userKey}), (g:Group {key: $groupKey})
        MERGE (u)-[:MEMBER_OF]->(g) RETURN g.key`, params);
      if (!result.records.length) throw new ReferenceError('User or Group does not exist');
    });
  }

  async reportAsset(value: ReportAsset, context: ReportingContext, photoKey: string | null = null): Promise<Asset> {
    const input = record(value, ['name', 'identifiers', 'ownerKey']);
    const actor = record(context, ['actorKey', 'groupKey']);
    const identifier = canonicalClaims(input.identifiers);
    const params = {
      name: requiredText(input.name, 'name'),
      actorKey: requiredText(actor.actorKey, 'actorKey'),
      groupKey: requiredText(actor.groupKey, 'groupKey'),
      ownerKey: input.ownerKey === undefined ? null : requiredText(input.ownerKey, 'ownerKey'),
      claim: claimProperties(identifier),
      photoKey,
    };
    try {
      return await this.write(async (tx) => {
        const policy = await tx.run("MATCH (s:Settings {key: 'instance'}) SET s.revision = s.revision + 1 RETURN s.requirePhoto AS required");
        if (!photoKey && policy.records[0].get('required')) throw new ValidationError('A photo is required when reporting an Asset');
        if (photoKey) await this.consumePhoto(tx, photoKey);
        const result = await tx.run(`
          MATCH (u:User {key: $actorKey})-[:MEMBER_OF]->(g:Group {key: $groupKey})
          OPTIONAL MATCH (o:Owner {key: $ownerKey})
          WITH u, g, o WHERE $ownerKey IS NULL OR o IS NOT NULL
          CREATE (i:Identifier $claim)
          CREATE (a:Asset {name: $name, reportedAt: datetime(), isPublic: false})
          CREATE (a)-[:IDENTIFIED_BY]->(i), (a)-[:REPORTED_BY]->(u), (g)-[:CAN_COLLABORATE]->(a)
          FOREACH (owner IN CASE WHEN o IS NULL THEN [] ELSE [o] END |
            CREATE (a)-[:OWNED_BY]->(owner))
          WITH a
          OPTIONAL MATCH (m:Media {key: $photoKey})
          FOREACH (photo IN CASE WHEN m IS NULL THEN [] ELSE [m] END | CREATE (a)-[:HAS_PHOTO]->(photo))
          WITH a ${assetProjection}`, params);
        if (!result.records.length) {
          throw new ReferenceError('Reporter must belong to the selected Group and any Owner must exist');
        }
        return { ...result.records[0].get('asset'), identifier } as Asset;
      });
    } catch (error) {
      // CREATE, rather than MERGE, makes every second claim a conflict.
      // The database constraint arbitrates concurrent transactions atomically.
      if (typeof error === 'object' && error !== null && 'code' in error
          && error.code === 'Neo.ClientError.Schema.ConstraintValidationFailed') {
        throw new DuplicateIdentityError('The individual identifier is already claimed', { cause: error });
      }
      throw error;
    }
  }

  async getAsset(value: AssetIdentifier, actorKey: string | null): Promise<Asset | null> {
    const identifier = canonicalIdentifier(value);
    const session = this.driver.session();
    try {
      const result = await session.executeRead((tx) => tx.run(
        `${assetMatch} WHERE a.isPublic = true OR ${collaboration} ${assetProjection}`,
        { claim: claimProperties(identifier), actorKey },
      ));
      return result.records.length ? { ...result.records[0].get('asset'), identifier } as Asset : null;
    } finally { await session.close(); }
  }

  async findAssets(actorKey: string, { q: text, scope, limit, after }: AssetPageRequest): Promise<AssetPage> {
    const session = this.driver.session();
    try {
      const result = await session.executeRead((tx) => tx.run(`
        CALL {
          MATCH (a:Asset)-[:IDENTIFIED_BY]->(:Identifier)
          WHERE a.isPublic = true OR ${collaboration}
          WITH a, toLower(a.name) CONTAINS toLower($text) AS matches,
            ${collaboration} AS inGroup,
            EXISTS { MATCH (a)-[:REPORTED_BY]->(:User {key: $actorKey}) } AS mine
          RETURN count(a) AS total,
            {all: count(CASE WHEN matches THEN 1 END),
             mine: count(CASE WHEN matches AND mine THEN 1 END),
             group: count(CASE WHEN matches AND inGroup THEN 1 END),
             public: count(CASE WHEN matches AND a.isPublic = true THEN 1 END)} AS scopes
        }
        CALL {
          MATCH (a:Asset)-[:IDENTIFIED_BY]->(i:Identifier)
          WHERE (a.isPublic = true OR ${collaboration}) AND toLower(a.name) CONTAINS toLower($text)
            AND ($scope = 'all' OR ($scope = 'public' AND a.isPublic = true)
              OR ($scope = 'group' AND ${collaboration})
              OR ($scope = 'mine' AND EXISTS { MATCH (a)-[:REPORTED_BY]->(:User {key: $actorKey}) }))
            AND ($after IS NULL OR a.name > $after.name
              OR (a.name = $after.name AND i.scheme > $after.scheme)
              OR (a.name = $after.name AND i.scheme = $after.scheme AND i.value > $after.value)
              OR (a.name = $after.name AND i.scheme = $after.scheme AND i.value = $after.value AND i.serial > $after.serial))
          WITH a, i ORDER BY a.name, i.scheme, i.value, i.serial LIMIT $fetchSize
          WITH a, i AS identity
          MATCH (a)-[:REPORTED_BY]->(u:User)
          MATCH (g:Group)-[:CAN_COLLABORATE]->(a)
          OPTIONAL MATCH (a)-[:OWNED_BY]->(o:Owner)
          WITH a, identity, u, o, collect(g { .key, .name }) AS groups
          ORDER BY a.name, identity.scheme, identity.value, identity.serial
          RETURN collect({asset: a { .name, .isPublic, reportedAt: toString(a.reportedAt),
            reportedBy: u { .key, .name }, owner: o { .key, .name }, groups: groups, photos: [(a)-[:HAS_PHOTO]->(m:Media) | m { .key, .contentType, size: toFloat(m.size) }] },
            identifier: identity { .scheme, .value, .serial }}) AS rows
        }
        RETURN total, scopes, rows`, { actorKey, text, scope, after, fetchSize: int(limit + 1) }));
      const row = result.records[0];
      const rows = row.get('rows') as { asset: Omit<Asset, 'identifier'>; identifier: { scheme: string; value: string; serial: string } }[];
      const assets = rows.slice(0, limit).map((row) => {
        const i = row.identifier;
        const identifier: AssetIdentifier = i.scheme === 'sgtin'
          ? { scheme: 'sgtin', gtin: i.value, serial: i.serial } : { scheme: 'grai', grai: i.value };
        return { ...row.asset, identifier } as Asset;
      });
      const scopes = Object.fromEntries(Object.entries(row.get('scopes')).map(([key, value]) =>
        [key, (value as { toNumber(): number }).toNumber()])) as Record<AssetScope, number>;
      return { assets, total: row.get('total').toNumber(), scopes, matching: scopes[scope],
        nextCursor: rows.length > limit ? assetCursor(text, assets.at(-1)!, scope) : null };
    } finally { await session.close(); }
  }

  async members(actorKey: string): Promise<Member[]> {
    return this.write(async (tx) => {
      const allowed = await tx.run('MATCH (:User {key: $actorKey, isAdmin: true}) RETURN true', { actorKey });
      if (!allowed.records.length) throw new AdministrationError('Administrator access required');
      const result = await tx.run(`MATCH (u:User) WHERE u.id IS NOT NULL RETURN ${memberProjection} AS member ORDER BY toLower(u.name), u.key`);
      return result.records.map((row) => row.get('member'));
    });
  }

  async profile(actorKey: string): Promise<Member> {
    const result = await this.write((tx) => tx.run(`MATCH (u:User {key: $actorKey}) WHERE u.id IS NOT NULL RETURN ${memberProjection} AS member`, { actorKey }));
    if (!result.records.length) throw new ReferenceError('User not found');
    return result.records[0].get('member');
  }

  async updateMember(actorKey: string, targetKey: string, value: unknown): Promise<Member> {
    const input = record(value, ['name', 'isAdmin']);
    const name = requiredText(input.name, 'name');
    if (typeof input.isAdmin !== 'boolean') throw new ValidationError('Administrator status must be a boolean');
    return this.write(async (tx) => {
      // Serialize role changes before checking the actor and counting administrators.
      // Reuse the existing instance lock; no separate role or locking framework.
      await tx.run("MATCH (s:Settings {key: 'instance'}) SET s.revision = s.revision + 1 RETURN s.key");
      const allowed = await tx.run('MATCH (:User {key: $actorKey, isAdmin: true}) RETURN true', { actorKey });
      if (!allowed.records.length) throw new AdministrationError('Administrator access required');
      const target = await tx.run('MATCH (u:User {key: $targetKey}) WHERE u.id IS NOT NULL RETURN u.isAdmin AS admin', { targetKey });
      if (!target.records.length) throw new ReferenceError('User not found');
      if (input.isAdmin === false && target.records[0].get('admin') === true) {
        const count = await tx.run('MATCH (u:User {isAdmin: true}) WHERE u.id IS NOT NULL RETURN count(u) AS count');
        if (count.records[0].get('count').toNumber() <= 1) throw new LastAdministratorError('The final system administrator cannot be removed');
      }
      // Better Auth has no arbitrary-user update API in this configuration. Update
      // its User node atomically with the role, without touching authentication data.
      const result = await tx.run(`MATCH (u:User {key: $targetKey})
        SET u.name = $name, u.updatedAt = $updatedAt
        SET u.isAdmin = $isAdmin
        RETURN ${memberProjection} AS member`, { targetKey, name, updatedAt: new Date().toISOString(), isAdmin: input.isAdmin });
      return result.records[0].get('member');
    });
  }

  async settings(): Promise<Settings> {
    const result = await this.write((tx) => tx.run("MATCH (s:Settings {key: 'instance'}) RETURN s { .requirePhoto, .displayTimezone } AS settings"));
    return result.records[0].get('settings');
  }

  async isAdmin(actorKey: string | null): Promise<boolean> {
    const result = await this.write((tx) => tx.run('MATCH (u:User {key: $actorKey}) RETURN u.isAdmin = true AS admin', { actorKey }));
    return result.records[0]?.get('admin') === true;
  }

  async updateSettings(actorKey: string, value: unknown): Promise<Settings> {
    const settings = validateSettings(value);
    return this.write(async (tx) => {
      const result = await tx.run(`MATCH (:User {key: $actorKey, isAdmin: true}), (s:Settings {key: 'instance'})
        SET s.revision = s.revision + 1, s.requirePhoto = $settings.requirePhoto, s.displayTimezone = $settings.displayTimezone
        RETURN s.key`, { actorKey, settings });
      if (!result.records.length) throw new ReferenceError('Administrator access required');
      return settings;
    });
  }

  async assertCanEdit(identifier: AssetIdentifier, actorKey: string) {
    const result = await this.write((tx) => tx.run(`${assetMatch} WHERE ${collaboration} RETURN a.name`, { claim: claimProperties(canonicalIdentifier(identifier)), actorKey }));
    if (!result.records.length) throw new ReferenceError('Asset access not found');
  }

  async reservePhoto(contentType: string, size: number): Promise<string> {
    const key = randomUUID();
    await this.write((tx) => tx.run(`CREATE (:Media {key: $key, contentType: $contentType, size: $size,
      state: 'pending', expiresAt: datetime() + duration('PT10M')})`, { key, contentType, size }));
    return key;
  }

  private async consumePhoto(tx: ManagedTransaction, key: string) {
    // The write acquires a node lock before checking state and the upload lease.
    const result = await tx.run(`MATCH (m:Media {key: $key}) SET m.lock = true
      WITH m WHERE m.state = 'pending' AND m.expiresAt > datetime()
      SET m.state = 'attached' REMOVE m.expiresAt RETURN m.key`, { key });
    if (!result.records.length) throw new ValidationError('Photo upload expired or unavailable');
  }

  async attachPhoto(identifier: AssetIdentifier, actorKey: string, photoKey: string): Promise<Asset> {
    return this.write(async (tx) => {
      await this.consumePhoto(tx, photoKey);
      const result = await tx.run(`${assetMatch} WHERE ${collaboration}
        MATCH (m:Media {key: $photoKey}) CREATE (a)-[:HAS_PHOTO]->(m)
        WITH a ${assetProjection}`, { claim: claimProperties(canonicalIdentifier(identifier)), actorKey, photoKey });
      if (!result.records.length) throw new ReferenceError('Asset access not found');
      return { ...result.records[0].get('asset'), identifier };
    });
  }

  async getPhoto(identifier: AssetIdentifier, key: string, actorKey: string | null): Promise<Photo> {
    const asset = await this.getAsset(identifier, actorKey);
    const photo = asset?.photos.find((p) => p.key === key);
    if (!photo) throw new ReferenceError('Photo not found');
    return photo;
  }

  async claimPhotoCleanup(key?: string): Promise<string[]> {
    const result = await this.write((tx) => tx.run(`MATCH (m:Media)
      WHERE ($key IS NULL AND (m.state = 'deleting' OR (m.state = 'pending' AND m.expiresAt <= datetime()))) OR m.key = $key
      SET m.lock = true
      WITH m WHERE m.state IN ['pending', 'deleting']
      SET m.state = 'deleting' RETURN m.key AS key`, { key: key ?? null }));
    return result.records.map((r) => r.get('key'));
  }

  async finishPhotoCleanup(key: string) {
    await this.write((tx) => tx.run("MATCH (m:Media {key: $key, state: 'deleting'}) WHERE m.expiresAt <= datetime() DELETE m", { key }));
  }

  async updateAsset(value: AssetIdentifier, changes: AssetChanges, actorKey: string): Promise<Asset> {
    const identifier = canonicalIdentifier(value);
    const input = record(changes, ['name', 'ownerKey', 'isPublic']);
    if (Object.hasOwn(input, 'isPublic') && typeof input.isPublic !== 'boolean') {
      throw new ValidationError('isPublic must be a boolean');
    }
    if (!Object.keys(input).length) throw new ValidationError('At least one change is required');
    const params = {
      claim: claimProperties(identifier),
      actorKey,
      isPublic: input.isPublic ?? null,
      name: Object.hasOwn(input, 'name') ? requiredText(input.name, 'name') : null,
      changeOwner: Object.hasOwn(input, 'ownerKey'),
      ownerKey: input.ownerKey === null || !Object.hasOwn(input, 'ownerKey')
        ? null : requiredText(input.ownerKey, 'ownerKey'),
    };
    return this.write(async (tx) => {
      const result = await tx.run(`${assetMatch} WHERE ${collaboration}
        OPTIONAL MATCH (owner:Owner {key: $ownerKey})
        WITH a, owner WHERE $ownerKey IS NULL OR owner IS NOT NULL
        // Lock the Asset before changing its single Owner relationship.
        SET a.name = coalesce($name, a.name), a.isPublic = coalesce($isPublic, a.isPublic)
        WITH a, owner
        OPTIONAL MATCH (a)-[old:OWNED_BY]->(:Owner)
        FOREACH (r IN CASE WHEN $changeOwner THEN [old] ELSE [] END | DELETE r)
        WITH DISTINCT a, owner
        FOREACH (o IN CASE WHEN $changeOwner AND owner IS NOT NULL THEN [owner] ELSE [] END |
          CREATE (a)-[:OWNED_BY]->(o))
        WITH a ${assetProjection}`, params);
      if (!result.records.length) throw new ReferenceError('Asset or Owner does not exist');
      return { ...result.records[0].get('asset'), identifier } as Asset;
    });
  }
}
