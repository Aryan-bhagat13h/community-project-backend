import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import { beforeAll, afterAll, beforeEach } from 'vitest';

let mongoServer;

process.env.ACCESS_TOKEN_SECRET = 'test_access_token_secret_1234567890';
process.env.REFRESH_TOKEN_SECRET = 'test_refresh_token_secret_1234567890';
process.env.ACCESS_TOKEN_EXPIRY = '1d';
process.env.REFRESH_TOKEN_EXPIRY = '7d';
process.env.NODE_ENV = 'test';

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create({
    binary: {
      checkMD5: false,
    },
  });
  const uri = mongoServer.getUri();
  await mongoose.connect(uri);
});

afterAll(async () => {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }
  if (mongoServer) {
    await mongoServer.stop();
  }
});

beforeEach(async () => {
  if (mongoose.connection.db) {
    const collections = await mongoose.connection.db.collections();
    for (const collection of collections) {
      await collection.deleteMany({});
    }
  }
});
