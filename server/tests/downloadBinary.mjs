process.env.MONGOMS_VERSION = '6.0.16';
import { MongoMemoryServer } from 'mongodb-memory-server';
console.log('Starting MongoDB binary download...');
const m = await MongoMemoryServer.create();
console.log('Binary ready at:', m.instanceInfo?.mongodPath);
await m.stop();
console.log('Done — binary cached for future runs');
