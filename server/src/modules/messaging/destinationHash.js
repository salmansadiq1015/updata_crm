import crypto from 'node:crypto';

const destinationSecret = () => process.env.MESSAGE_DESTINATION_HASH_SECRET || process.env.JWT_SECRET;

export const destinationHash = (channel, value) => crypto
  .createHmac('sha256', destinationSecret())
  .update(`${channel}:${String(value || '').trim().toLowerCase()}`)
  .digest('hex');

export default destinationHash;
