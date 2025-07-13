import { MongoClient } from 'mongodb';

const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
  throw new Error('Please define the MONGODB_URI environment variable');
}

let cached = global as any;

if (!cached.mongo) {
  cached.mongo = { conn: null, promise: null };
}

async function connectDB() {
  if (cached.mongo.conn) {
    return cached.mongo.conn;
  }

  if (!cached.mongo.promise) {
    const opts = {
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 30000, // Increased timeout to 30 seconds
      socketTimeoutMS: 45000, // Added socket timeout
      connectTimeoutMS: 30000, // Added connect timeout
      waitQueueTimeoutMS: 30000, // Added wait queue timeout
    };

    cached.mongo.promise = MongoClient.connect(MONGODB_URI!, opts).catch(err => {
      console.error('MongoDB connection error:', err);
      cached.mongo.promise = null;
      throw err;
    });
  }

  try {
    const client = await cached.mongo.promise;
    cached.mongo.conn = client;
    return client;
  } catch (e) {
    console.error('Failed to connect to MongoDB:', e);
    cached.mongo.promise = null;
    throw e;
  }
}

export default connectDB;