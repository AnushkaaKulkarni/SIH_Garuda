import { getDatabase } from '../lib/server/database.ts'

try {
  await getDatabase()
  process.stdout.write('MongoDB connection and GARUDA schema migration completed.\n')
  await globalThis.garudaMongoClient?.close()
} catch {
  process.stderr.write('MongoDB connection or GARUDA schema migration failed. Check MONGO_URI and database permissions.\n')
  process.exitCode = 1
  await globalThis.garudaMongoClient?.close().catch(() => undefined)
}
