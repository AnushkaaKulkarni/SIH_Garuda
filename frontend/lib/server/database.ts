import { MongoClient, type Collection, type Db, type Document, type ObjectId } from 'mongodb'
import { requiredEnv } from './env.ts'

export type UserRole = 'SOLDIER' | 'ADMIN'
export type AccountStatus = 'ACTIVE' | 'DISABLED'

export type UserDocument = {
  name: string
  email: string
  passwordHash: string
  role: UserRole
  status: AccountStatus
  createdAt: Date
  updatedAt: Date
}

export type AuthSessionDocument = {
  _id: string
  userId: ObjectId
  expiresAt: Date
  revokedAt: Date | null
  createdAt: Date
}

type TrainingSessionDocument = Document & { _id: string; ownerId: ObjectId; completedAt?: Date; scenario?: string; status?: string; score?: number }
type RateLimitDocument = Document & { _id: string; count?: number; expiresAt: Date }

type GarudaCollections = {
  users: Collection<UserDocument>
  authSessions: Collection<AuthSessionDocument>
  trainingSessions: Collection<TrainingSessionDocument>
  rateLimits: Collection<RateLimitDocument>
  schemaMigrations: Collection<{ _id: string; appliedAt?: Date; description?: string }>
}

declare global {
  var garudaMongoClient: MongoClient | undefined
  var garudaMongoReady: Promise<{ db: Db; collections: GarudaCollections }> | undefined
}

async function connect() {
  const client = globalThis.garudaMongoClient ??= new MongoClient(requiredEnv('MONGO_URI'), {
    serverSelectionTimeoutMS: 8000,
    maxPoolSize: 10,
  })
  await client.connect()
  const dbName = process.env.MONGO_DB_NAME?.trim()
  const db = dbName ? client.db(dbName) : client.db()
  const collections: GarudaCollections = {
    users: db.collection<UserDocument>('users'),
    authSessions: db.collection<AuthSessionDocument>('authSessions'),
    trainingSessions: db.collection<TrainingSessionDocument>('trainingSessions'),
    rateLimits: db.collection<RateLimitDocument>('authRateLimits'),
    schemaMigrations: db.collection('schemaMigrations'),
  }

  await Promise.all([
    collections.users.createIndex({ email: 1 }, { unique: true, name: 'users_email_unique' }),
    collections.users.createIndex({ role: 1, status: 1 }, { name: 'users_role_status' }),
    collections.authSessions.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0, name: 'auth_expiry_ttl' }),
    collections.authSessions.createIndex({ userId: 1, revokedAt: 1 }, { name: 'auth_user_revocation' }),
    collections.trainingSessions.createIndex({ ownerId: 1, completedAt: -1 }, { name: 'sessions_owner_completed' }),
    collections.trainingSessions.createIndex({ ownerId: 1, scenario: 1 }, { name: 'sessions_owner_scenario' }),
    collections.rateLimits.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0, name: 'auth_rate_limit_ttl' }),
  ])
  await Promise.all([
    db.command({ collMod: 'users', validator: { $jsonSchema: { bsonType: 'object', required: ['name', 'email', 'passwordHash', 'role', 'status', 'createdAt', 'updatedAt'], properties: { name: { bsonType: 'string', maxLength: 100 }, email: { bsonType: 'string', maxLength: 254 }, passwordHash: { bsonType: 'string' }, role: { enum: ['SOLDIER', 'ADMIN'] }, status: { enum: ['ACTIVE', 'DISABLED'] }, createdAt: { bsonType: 'date' }, updatedAt: { bsonType: 'date' } } } }, validationLevel: 'moderate' }),
    db.command({ collMod: 'authSessions', validator: { $jsonSchema: { bsonType: 'object', required: ['userId', 'expiresAt', 'revokedAt', 'createdAt'], properties: { userId: { bsonType: 'objectId' }, expiresAt: { bsonType: 'date' }, revokedAt: { bsonType: ['date', 'null'] }, createdAt: { bsonType: 'date' } } } }, validationLevel: 'moderate' }),
    db.command({ collMod: 'trainingSessions', validator: { $jsonSchema: { bsonType: 'object', required: ['ownerId', 'status', 'scenario', 'difficulty', 'startedAt', 'completedAt', 'score', 'scoreVersion', 'data'], properties: { ownerId: { bsonType: 'objectId' }, status: { enum: ['IN_PROGRESS', 'COMPLETED'] }, scenario: { bsonType: 'string' }, difficulty: { enum: ['Easy', 'Medium', 'Hard', 'Expert'] }, startedAt: { bsonType: 'date' }, completedAt: { bsonType: 'date' }, score: { bsonType: ['int', 'long', 'double'], minimum: 0, maximum: 100 }, scoreVersion: { bsonType: 'string' }, data: { bsonType: 'object' } } } }, validationLevel: 'moderate' }),
  ])
  await collections.schemaMigrations.updateOne(
    { _id: '001_initial_garuda_backend' },
    { $setOnInsert: { appliedAt: new Date(), description: 'Initial account, session, ownership, and rate-limit indexes and validators.' } },
    { upsert: true },
  )
  return { db, collections }
}

export async function getDatabase() {
  globalThis.garudaMongoReady ??= connect().catch((error: unknown) => {
    globalThis.garudaMongoReady = undefined
    globalThis.garudaMongoClient = undefined
    throw error
  })
  return globalThis.garudaMongoReady
}
