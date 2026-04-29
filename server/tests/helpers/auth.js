import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret-that-is-at-least-32-chars-long';

export function generateToken(user, options = {}) {
  const payload = {
    userId: user._id.toString(),
    email: user.email,
    role: user.role?.toString?.() || user.role,
  };
  return jwt.sign(payload, JWT_SECRET, {
    expiresIn: options.expiresIn || '1h',
    issuer: 'mb-boiler-api',
  });
}

export function mockReqUser(user) {
  return {
    _id: user._id,
    email: user.email,
    role: user.role,
    status: user.status || 'active',
  };
}
