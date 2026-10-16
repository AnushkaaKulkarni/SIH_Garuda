import { resolve } from 'node:path'
import { createRequire } from 'node:module'
import bcrypt from 'bcryptjs'
import { MongoClient } from 'mongodb'

const { loadEnvConfig } = createRequire(import.meta.url)('@next/env')
loadEnvConfig(resolve(process.cwd(), '../backend'))

const mongoUri = process.env.MONGO_URI?.trim()
const email = process.env.ADMIN_BOOTSTRAP_EMAIL?.trim().toLowerCase()
const password = process.env.ADMIN_BOOTSTRAP_PASSWORD
if (!mongoUri) throw new Error('Missing required environment variable: MONGO_URI')
if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Set a valid ADMIN_BOOTSTRAP_EMAIL in backend/.env.')
if (!password || password.length < 12 || password.length > 128) throw new Error('Set ADMIN_BOOTSTRAP_PASSWORD to 12–128 characters in backend/.env.')

const client = new MongoClient(mongoUri, { serverSelectionTimeoutMS: 8000 })
try {
  await client.connect()
  const databaseName = process.env.MONGO_DB_NAME?.trim()
  const db = databaseName ? client.db(databaseName) : client.db()
  const users = db.collection('users')
  await users.createIndex({ email: 1 }, { unique: true, name: 'users_email_unique' })
  const existing = await users.findOne({ email }, { projection: { role: 1 } })
  if (existing?.role === 'ADMIN') {
    process.stdout.write('The configured administrator account is already provisioned.\n')
  } else if (await users.countDocuments({ role: 'ADMIN' })) {
    throw new Error('An administrator already exists. Ask an authorized administrator to provision another account.')
  } else {
    try {
      await db.collection('adminBootstrapLocks').insertOne({ _id: 'initial-admin', email, createdAt: new Date() })
    } catch (error) {
      if (error && typeof error === 'object' && 'code' in error && error.code === 11000) {
        throw new Error('Initial administrator provisioning has already been used or is in progress.')
      }
      throw error
    }
    try {
      await users.insertOne({
        name: 'GARUDA Administrator', email, passwordHash: await bcrypt.hash(password, 12),
        role: 'ADMIN', status: 'ACTIVE', createdAt: new Date(), updatedAt: new Date(),
      })
      process.stdout.write('Initial administrator account provisioned. Remove the bootstrap password from backend/.env.\n')
    } catch (error) {
      await db.collection('adminBootstrapLocks').deleteOne({ _id: 'initial-admin' })
      throw error
    }
  }
} finally {
  await client.close()
}
