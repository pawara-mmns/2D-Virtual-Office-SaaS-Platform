import { randomBytes, createHash, createHmac, createCipheriv, createDecipheriv, timingSafeEqual } from 'node:crypto';
import { hash, verify } from '@node-rs/argon2';

export const randomToken = () => randomBytes(32).toString('base64url');
export const digest = (value: string) => createHash('sha256').update(value).digest('hex');
export function equal(a: string, b: string) {
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}
export function passwordPolicy(password: unknown): asserts password is string {
  if (typeof password !== 'string' || password.length < 15 || password.length > 128 || /[\u0000-\u001f]/u.test(password)
    || new Set(password.toLowerCase()).size < 8 || /^(password|letmein|administrator|qwerty)/i.test(password))
    throw new Error('Use a unique password of 15–128 characters with at least 8 distinct characters.');
}
export async function hashPassword(password: string) {
  passwordPolicy(password);
  // Algorithm 2 is Argon2id (the package exposes an ambient const enum).
  return hash(password, { algorithm: 2, memoryCost: 65536, timeCost: 3, parallelism: 1 });
}
export async function verifyPassword(encoded: string, password: unknown) {
  if (typeof password !== 'string' || password.length > 128) return false;
  try { return await verify(encoded, password); } catch { return false; }
}
function encryptionKey(key: string) {
  if (!/^[a-f0-9]{64}$/i.test(key)) throw new Error('Administrator encryption is not configured.');
  return Buffer.from(key, 'hex');
}
export function encryptSecret(secret: string, key: string, adminId: string) {
  const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', encryptionKey(key), iv);
  cipher.setAAD(Buffer.from(adminId));
  const data = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), data].map(x => x.toString('base64url')).join('.');
}
export function decryptSecret(value: string, key: string, adminId: string) {
  const [iv, tag, data] = value.split('.').map(x => Buffer.from(x, 'base64url'));
  const cipher = createDecipheriv('aes-256-gcm', encryptionKey(key), iv!);
  cipher.setAAD(Buffer.from(adminId)); cipher.setAuthTag(tag!);
  return Buffer.concat([cipher.update(data!), cipher.final()]).toString('utf8');
}
const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
export function createTotpSecret() {
  let bits = '', output = '';
  for (const byte of randomBytes(20)) bits += byte.toString(2).padStart(8, '0');
  for (let i = 0; i < bits.length; i += 5) output += alphabet[parseInt(bits.slice(i, i + 5), 2)];
  return output;
}
export function totp(secret: string, step: number, digits = 6) {
  let bits = '';
  for (const char of secret) { const i = alphabet.indexOf(char); if (i < 0) throw new Error('Invalid MFA secret'); bits += i.toString(2).padStart(5, '0'); }
  const key = Buffer.from(bits.match(/.{8}/g)!.map(x => parseInt(x, 2)));
  const counter = Buffer.alloc(8); counter.writeBigUInt64BE(BigInt(step));
  const h = createHmac('sha1', key).update(counter).digest(), offset = h[19]! & 15;
  return ((h.readUInt32BE(offset) & 0x7fffffff) % 10 ** digits).toString().padStart(digits, '0');
}
export function verifyTotp(secret: string, code: unknown, lastStep: number, now = Date.now()) {
  if (typeof code !== 'string' || !/^\d{6}$/.test(code)) return null;
  const current = Math.floor(now / 30000);
  for (const step of [current, current - 1, current + 1])
    if (step > lastStep && equal(totp(secret, step), code)) return step;
  return null;
}
