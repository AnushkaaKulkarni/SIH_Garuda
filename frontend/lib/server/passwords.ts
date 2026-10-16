import { compare, hash } from 'bcryptjs'

const BCRYPT_ROUNDS = 12

export const hashPassword = (password: string) => hash(password, BCRYPT_ROUNDS)
export const verifyPassword = (password: string, passwordHash: string) => compare(password, passwordHash)
