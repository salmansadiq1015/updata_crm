import { EventEmitter } from 'node:events';
import { jest } from '@jest/globals';

const connection = new EventEmitter();
connection.readyState = 0;
const mongoose = {
  connection,
  set: jest.fn(),
  connect: jest.fn(),
  disconnect: jest.fn().mockResolvedValue(undefined),
};
const db = {
  uri: 'mongodb+srv://test-user:secret-password@cluster.example.mongodb.net/test',
  serverSelectionTimeoutMS: 10000,
  connectAttempts: 3,
  connectRetryDelayMS: 0,
};
const logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn() };

jest.unstable_mockModule('mongoose', () => ({ default: mongoose }));
jest.unstable_mockModule('../../src/config/index.js', () => ({ default: { db } }));
const { connectDatabase, disconnectDatabase, isDatabaseConnected } = await import('../../src/config/database.js');

function selectionError() {
  const error = new Error(`Could not connect to ${db.uri}`);
  error.name = 'MongooseServerSelectionError';
  error.reason = {
    type: 'ReplicaSetNoPrimary',
    servers: new Map([['db.example:27017', {
      address: 'db.example:27017',
      type: 'Unknown',
      error: Object.assign(new Error('connect ETIMEDOUT'), {
        code: 'ETIMEDOUT', cause: new Error('TCP connection timed out'),
      }),
    }]]),
  };
  return error;
}

beforeEach(() => {
  jest.clearAllMocks();
  mongoose.connect.mockReset();
  connection.readyState = 0;
});

test('recovers from a transient Atlas failure before completing startup', async () => {
  mongoose.connect.mockRejectedValueOnce(selectionError()).mockImplementationOnce(async () => {
    connection.readyState = 1;
    connection.emit('connected');
  });

  await connectDatabase(logger);

  expect(mongoose.connect).toHaveBeenCalledTimes(2);
  expect(mongoose.connect).toHaveBeenLastCalledWith(db.uri, expect.objectContaining({
    serverSelectionTimeoutMS: 10000, family: 4, maxPoolSize: 10,
  }));
  expect(logger.warn).toHaveBeenCalledWith('MongoDB connection failed; retrying', expect.objectContaining({
    attempt: 1, maxAttempts: 3, retryDelayMS: 0,
  }));
  expect(logger.error).not.toHaveBeenCalled();
  expect(isDatabaseConnected()).toBe(true);
  await connectDatabase(logger);
  expect(mongoose.connect).toHaveBeenCalledTimes(2);
});

test('stops after the configured attempt limit, preserving the original error', async () => {
  const error = selectionError();
  mongoose.connect.mockRejectedValue(error);

  await expect(connectDatabase(logger)).rejects.toBe(error);

  expect(mongoose.connect).toHaveBeenCalledTimes(3);
  expect(logger.error).toHaveBeenCalledWith('MongoDB initial connection failed', expect.objectContaining({
    attempt: 3,
    error: expect.objectContaining({
      topology: 'ReplicaSetNoPrimary',
      servers: [expect.objectContaining({
        address: 'db.example:27017',
        error: expect.objectContaining({ code: 'ETIMEDOUT', cause: 'TCP connection timed out' }),
      })],
    }),
  }));
  const output = JSON.stringify([...logger.warn.mock.calls, ...logger.error.mock.calls]);
  expect(output).not.toContain('secret-password');
  expect(output).not.toContain('test-user');
});

test.each([
  Object.assign(new Error('Authentication failed'), { name: 'MongoServerError', code: 18 }),
  Object.assign(new Error('Invalid connection string'), { name: 'MongoParseError' }),
])('fails immediately for permanent errors: $name', async (error) => {
  mongoose.connect.mockRejectedValue(error);
  await expect(connectDatabase(logger)).rejects.toBe(error);
  expect(mongoose.connect).toHaveBeenCalledTimes(1);
  expect(logger.warn).not.toHaveBeenCalled();
});

test('does not retry a selection error containing a per-server authentication failure', async () => {
  const error = selectionError();
  error.reason.servers.get('db.example:27017').error.code = 18;
  mongoose.connect.mockRejectedValue(error);
  await expect(connectDatabase(logger)).rejects.toBe(error);
  expect(mongoose.connect).toHaveBeenCalledTimes(1);
});

test('shares an in-flight connection and avoids accumulating event listeners', async () => {
  let resolve;
  mongoose.connect.mockImplementationOnce(() => new Promise((done) => { resolve = done; }));
  const first = connectDatabase(logger);
  const second = connectDatabase(logger);
  expect(first).toBe(second);
  expect(mongoose.connect).toHaveBeenCalledTimes(1);
  resolve();
  await Promise.all([first, second]);
  for (const event of ['connected', 'error', 'disconnected']) {
    expect(connection.listenerCount(event)).toBe(1);
  }
});

test('disconnects even if a failed connection never reached the connected state', async () => {
  await disconnectDatabase(logger);
  expect(mongoose.disconnect).toHaveBeenCalledTimes(1);
});

test('logs runtime connection failures with server diagnostics', () => {
  connection.emit('connected');
  connection.emit('error', selectionError());
  expect(logger.error).toHaveBeenCalledWith('MongoDB connection error', expect.objectContaining({
    error: expect.objectContaining({ topology: 'ReplicaSetNoPrimary' }),
  }));
});

test('does not log an initial failure twice when Mongoose emits its error after rejection', async () => {
  const error = selectionError();
  mongoose.connect.mockRejectedValue(error);
  await expect(connectDatabase(logger)).rejects.toBe(error);
  connection.emit('error', error);
  expect(logger.error).toHaveBeenCalledTimes(1);
});
