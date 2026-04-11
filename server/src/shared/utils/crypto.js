import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import config from '../../config/index.js';

const SALT_ROUNDS = 12;

// Pre-computed dummy hash for timing-safe comparison when user not found
const DUMMY_HASH = '$2b$12$LJ3m4ys3Lk0TSwMvkLCPOOmMiKzqDVlXghzEhGgBE/EBBQL/B7vKm';

export async function hashPassword(password) {
  return bcrypt.hash(password, SALT_ROUNDS);
}

export async function comparePassword(password, hash) {
  return bcrypt.compare(password, hash);
}

export async function comparePasswordTimingSafe(password, hash) {
  return bcrypt.compare(password, hash || DUMMY_HASH);
}

export function generateAccessToken(payload) {
  return jwt.sign(payload, config.jwt.secret, {
    expiresIn: config.jwt.accessTtl || config.jwt.accessExpiry,
    issuer: config.jwt.issuer,
  });
}

export function generateRefreshToken(payload) {
  return jwt.sign(payload, config.jwt.secret, {
    expiresIn: config.jwt.refreshTtl || config.jwt.refreshExpiry,
    issuer: config.jwt.issuer,
  });
}

export function generateTokenPair(user, sessionId) {
  const accessPayload = {
    sub: user._id.toString(),
    email: user.email,
    role: user.role?.name || user.role,
    roleId: (user.role?._id || user.role).toString(),
    sid: sessionId,
    jti: crypto.randomUUID(),
  };

  const refreshPayload = {
    sub: user._id.toString(),
    sid: sessionId,
    type: 'refresh',
  };

  return {
    accessToken: generateAccessToken(accessPayload),
    refreshToken: generateRefreshToken(refreshPayload),
  };
}

export function verifyToken(token) {
  return jwt.verify(token, config.jwt.secret, {
    issuer: config.jwt.issuer,
  });
}

export function generateResetToken() {
  const resetToken = crypto.randomBytes(32).toString('hex');
  const hashedToken = crypto.createHash('sha256').update(resetToken).digest('hex');
  const expires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
  return { resetToken, hashedToken, expires };
}

export function generateActivationToken() {
  const token = crypto.randomBytes(32).toString('hex');
  const hashedToken = crypto.createHash('sha256').update(token).digest('hex');
  const expiryHours = config.auth?.activationTokenExpiryHours || 48;
  const expires = new Date(Date.now() + expiryHours * 60 * 60 * 1000);
  return { token, hashedToken, expires };
}

export function hashResetToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export function generateRandomString(bytes = 32) {
  return crypto.randomBytes(bytes).toString('hex');
}

export function generateTempPassword() {
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const lower = 'abcdefghijkmnopqrstuvwxyz';
  const digits = '23456789';
  const special = '!@#$%&*';
  const all = upper + lower + digits + special;

  // Ensure at least one of each category
  let password = '';
  password += upper.charAt(Math.floor(Math.random() * upper.length));
  password += lower.charAt(Math.floor(Math.random() * lower.length));
  password += digits.charAt(Math.floor(Math.random() * digits.length));
  password += special.charAt(Math.floor(Math.random() * special.length));

  // Fill remaining with random chars
  for (let i = 4; i < 14; i++) {
    password += all.charAt(Math.floor(Math.random() * all.length));
  }

  // Shuffle
  return password.split('').sort(() => Math.random() - 0.5).join('');
}

export { DUMMY_HASH };
