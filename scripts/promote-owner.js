/**
 * Script to promote a user to owner role
 * Run with: node scripts/promote-owner.js [email]
 */
const mongoose = require('mongoose');
require('dotenv').config();

// User schema (simplified version of the actual model)
const UserSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true },
  name: String,
  image: String,
  role: { type: String, enum: ['user', 'admin', 'owner'], default: 'user' },
  preferences: {
    favorite_genres: [String],
    selected_moods: [String]
  },
  created_at: { type: Date, default: Date.now }
});

// If the User model is already defined, use it; otherwise, define it
const User = mongoose.models.User || mongoose.model('User', UserSchema);

async function promoteToOwner() {
  try {
    const email = process.argv[2];
    
    if (!email) {
      console.error('Please provide an email address');
      console.log('Usage: node scripts/promote-owner.js [email]');
      process.exit(1);
    }
    
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');
    
    // Check if an owner already exists
    const existingOwner = await User.findOne({ role: 'owner' });
    if (existingOwner) {
      console.log(`An owner already exists: ${existingOwner.email}`);
      process.exit(1);
    }
    
    // Find the user to promote
    const user = await User.findOne({ email });
    if (!user) {
      console.error(`User not found: ${email}`);
      process.exit(1);
    }
    
    // Promote the user to owner
    user.role = 'owner';
    await user.save();
    
    console.log(`User ${email} has been promoted to owner`);
    console.log('Owner details:');
    console.log(`  Name: ${user.name}`);
    console.log(`  Email: ${user.email}`);
    console.log(`  Role: ${user.role}`);
  } catch (error) {
    console.error('Error:', error);
  } finally {
    // Close the MongoDB connection
    await mongoose.connection.close();
    console.log('MongoDB connection closed');
  }
}

promoteToOwner(); 