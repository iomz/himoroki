import { randomUUID } from 'node:crypto';
import type { Driver, ManagedTransaction } from 'neo4j-driver';
import {
  canonicalClaims, canonicalIdentifier, record, requiredText, ValidationError,
  type AssetIdentifier, type IdentifierClaim,
} from './identity.js';

export class DuplicateIdentityError extends Error {}
export class ReferenceError extends Error {}

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
}>;
export type ReportAsset = {
  name: string;
  identifiers: readonly IdentifierClaim[];
  ownerKey?: string;
};
export type ReportingContext = { actorKey: string; groupKey: string };
export type AssetChanges = { name?: string; ownerKey?: string | null; isPublic?: boolean };

const constraints = [
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
    groups: groups } AS asset`;

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
      const result = await session.run('SHOW CONSTRAINTS YIELD type, labelsOrTypes, properties RETURN *');
      for (const [label, properties] of [
        ['User', ['key']], ['Group', ['key']], ['Owner', ['key']],
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

  async reportAsset(value: ReportAsset, context: ReportingContext): Promise<Asset> {
    const input = record(value, ['name', 'identifiers', 'ownerKey']);
    const actor = record(context, ['actorKey', 'groupKey']);
    const identifier = canonicalClaims(input.identifiers);
    const params = {
      name: requiredText(input.name, 'name'),
      actorKey: requiredText(actor.actorKey, 'actorKey'),
      groupKey: requiredText(actor.groupKey, 'groupKey'),
      ownerKey: input.ownerKey === undefined ? null : requiredText(input.ownerKey, 'ownerKey'),
      claim: claimProperties(identifier),
    };
    try {
      return await this.write(async (tx) => {
        const result = await tx.run(`
          MATCH (u:User {key: $actorKey})-[:MEMBER_OF]->(g:Group {key: $groupKey})
          OPTIONAL MATCH (o:Owner {key: $ownerKey})
          WITH u, g, o WHERE $ownerKey IS NULL OR o IS NOT NULL
          CREATE (i:Identifier $claim)
          CREATE (a:Asset {name: $name, reportedAt: datetime(), isPublic: false})
          CREATE (a)-[:IDENTIFIED_BY]->(i), (a)-[:REPORTED_BY]->(u), (g)-[:CAN_COLLABORATE]->(a)
          FOREACH (owner IN CASE WHEN o IS NULL THEN [] ELSE [o] END |
            CREATE (a)-[:OWNED_BY]->(owner))
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

  async findAssets(actorKey: string, text: string): Promise<Asset[]> {
    const session = this.driver.session();
    try {
      const result = await session.executeRead((tx) => tx.run(`
        MATCH (a:Asset)-[:IDENTIFIED_BY]->(i:Identifier)
        WHERE (a.isPublic = true OR ${collaboration}) AND toLower(a.name) CONTAINS toLower($text)
        WITH a, i ORDER BY a.name, i.scheme, i.value, i.serial LIMIT 100
        WITH a, i AS identity
        MATCH (a)-[:REPORTED_BY]->(u:User)
        MATCH (g:Group)-[:CAN_COLLABORATE]->(a)
        OPTIONAL MATCH (a)-[:OWNED_BY]->(o:Owner)
        WITH a, identity, u, o, collect(g { .key, .name }) AS groups
        RETURN a { .name, .isPublic, reportedAt: toString(a.reportedAt),
          reportedBy: u { .key, .name }, owner: o { .key, .name }, groups: groups } AS asset,
          identity { .scheme, .value, .serial } AS identifier`, { actorKey, text }));
      return result.records.map((row) => {
        const i = row.get('identifier');
        const identifier: AssetIdentifier = i.scheme === 'sgtin'
          ? { scheme: 'sgtin', gtin: i.value, serial: i.serial } : { scheme: 'grai', grai: i.value };
        return { ...row.get('asset'), identifier } as Asset;
      });
    } finally { await session.close(); }
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
