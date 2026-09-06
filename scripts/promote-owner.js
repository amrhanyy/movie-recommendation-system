#!/usr/bin/env node
/**
 * promote-owner.js
 *
 * Operational CLI for promoting a user to the owner role.
 * This replaces the disabled HTTP endpoint POST /api/admin/promote (F-002).
 *
 * Requirements:
 *   - Explicit target email
 *   - Existing authenticated Google user record (user must have signed in at least once)
 *   - Proof that no owner exists (or explicit --force to override)
 *   - Never reveals the current owner email through HTTP
 *   - Does not run automatically
 *
 * Usage:
 *   node scripts/promote-owner.js <email>
 *   node scripts/promote-owner.js <email> --force
 *
 * Environment:
 *   MONGODB_URI must be set in .env or environment.
 */

const mongoose = require("mongoose");
require("dotenv").config();

async function promoteOwner() {
  const email = process.argv[2];
  const force = process.argv.includes("--force");

  if (!email) {
    console.error("Usage: node scripts/promote-owner.js <email> [--force]");
    console.error("Error: email argument is required.");
    process.exit(1);
  }

  const mongoUri = process.env.MONGODB_URI;
  if (!mongoUri) {
    console.error("Error: MONGODB_URI environment variable is not set.");
    process.exit(1);
  }

  try {
    await mongoose.connect(mongoUri);
    console.log("Connected to MongoDB.");

    const User = mongoose.models.User || mongoose.model("User", new mongoose.Schema({
      email: { type: String, required: true, unique: true },
      name: String,
      image: String,
      role: { type: String, enum: ["user", "admin", "owner"], default: "user" },
      preferences: Object,
      created_at: Date,
    }));

    // Check if an owner already exists
    const existingOwner = await User.findOne({ role: "owner" });
    if (existingOwner && !force) {
      console.error("Error: An owner already exists.");
      console.error("Use --force to override (this will demote the current owner to admin).");
      process.exit(1);
    }

    if (existingOwner && force) {
      console.log("Warning: --force specified. Demoting current owner to admin.");
      existingOwner.role = "admin";
      await existingOwner.save();
    }

    // Find the target user
    const targetUser = await User.findOne({ email });
    if (!targetUser) {
      console.error(`Error: User with email "${email}" not found.`);
      console.error("The user must sign in via Google at least once before promotion.");
      process.exit(1);
    }

    // Promote to owner
    targetUser.role = "owner";
    await targetUser.save();

    console.log(`Success: User "${email}" has been promoted to owner.`);
    await mongoose.disconnect();
    process.exit(0);
  } catch (error) {
    console.error("Error: Failed to promote user.");
    console.error(error.message);
    await mongoose.disconnect();
    process.exit(1);
  }
}

promoteOwner();
