import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { randomBytes, scryptSync, timingSafeEqual } from 'crypto';
import { serverDataPath } from '../config/paths';

export type UserRole = 'admin' | 'editor' | 'viewer';
export type User = { id: string; username: string; role: UserRole; createdAt: string };
type StoredUser = User & { passwordHash: string; salt: string };

const AUTH_DIR = serverDataPath('auth');
const USERS_FILE = `${AUTH_DIR}/users.json`;

function readUsers(): StoredUser[] {
  if (!existsSync(USERS_FILE)) return [];
  try { return JSON.parse(readFileSync(USERS_FILE, 'utf8')); } catch { return []; }
}

function writeUsers(users: StoredUser[]) {
  mkdirSync(AUTH_DIR, { recursive: true });
  writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
}

function publicUser(user: StoredUser): User {
  const { passwordHash: _passwordHash, salt: _salt, ...safe } = user;
  return safe;
}

export function listUsers(): User[] { return readUsers().map(publicUser); }
export function findUserById(id: string): User | undefined {
  const user = readUsers().find((entry) => entry.id === id);
  return user ? publicUser(user) : undefined;
}

export function createUser(username: string, password: string, role: UserRole = 'viewer'): User {
  const normalized = username.trim().toLowerCase();
  if (normalized.length < 3) throw new Error('用户名至少需要 3 个字符');
  if (password.length < 8) throw new Error('密码至少需要 8 个字符');
  const users = readUsers();
  if (users.some((entry) => entry.username === normalized)) throw new Error('用户名已存在');
  const salt = randomBytes(16).toString('hex');
  const stored: StoredUser = {
    id: `usr_${Date.now()}_${randomBytes(4).toString('hex')}`,
    username: normalized,
    role: users.length === 0 ? 'admin' : role,
    salt,
    passwordHash: scryptSync(password, salt, 64).toString('hex'),
    createdAt: new Date().toISOString(),
  };
  writeUsers([...users, stored]);
  return publicUser(stored);
}

export function authenticateUser(username: string, password: string): User | undefined {
  const user = readUsers().find((entry) => entry.username === username.trim().toLowerCase());
  if (!user) return undefined;
  const actual = scryptSync(password, user.salt, 64);
  const expected = Buffer.from(user.passwordHash, 'hex');
  return actual.length === expected.length && timingSafeEqual(actual, expected) ? publicUser(user) : undefined;
}

export function updateUserRole(id: string, role: UserRole): User | undefined {
  const users = readUsers();
  const index = users.findIndex((entry) => entry.id === id);
  if (index < 0) return undefined;
  users[index] = { ...users[index], role };
  writeUsers(users);
  return publicUser(users[index]);
}
