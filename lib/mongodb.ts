import mongoose from 'mongoose';

const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
  throw new Error('Please define the MONGODB_URI environment variable inside .env.local');
}

/**
 * Global is used here to maintain a cached connection across hot reloads
 * in development. This prevents connections growing exponentially
 * during API Route usage.
 */
type MongoConnection = {
  conn: typeof import("mongoose") | null;
  promise: Promise<typeof import("mongoose")> | null;
};

const globalWithMongo = globalThis as typeof globalThis & {
  mongoose?: MongoConnection;
};

const cached: MongoConnection = globalWithMongo.mongoose ?? { conn: null, promise: null };

if (!globalWithMongo.mongoose) {
  globalWithMongo.mongoose = cached;
}

export const connectToMongoDB = async () => {
  if (cached.conn) {
    return cached.conn;
  }

  if (!cached.promise) {
    const opts = {
      bufferCommands: false,
    };

    cached.promise = mongoose.connect(MONGODB_URI!, opts).then((mongoose) => {
      console.log('MongoDB connected successfully.');
      return mongoose;
    });
  }
  
  try {
    cached.conn = await cached.promise;
  } catch (e) {
    cached.promise = null;
    console.error('MongoDB connection error:', e);
    throw e;
  }

  return cached.conn;
};

export default connectToMongoDB;