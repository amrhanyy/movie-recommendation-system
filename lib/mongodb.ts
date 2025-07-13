import mongoose from 'mongoose';

const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
  throw new Error('Please define the MONGODB_URI environment variable inside .env.local');
}

export const connectToMongoDB = async () => {
  try {
    const { connection } = await mongoose.connect(MONGODB_URI);
    
    if (connection.readyState === 1) {
      console.log('Connected to MongoDB');
      return;
    }
  } catch (error) {
    console.error('Error connecting to MongoDB:', error);
    throw error;
  }
};

export default connectToMongoDB;