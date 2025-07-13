import { MongoClient } from 'mongodb';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables
dotenv.config({ path: '../.env.local' });

const sampleMovies = [
  {
    title: "Inception",
    overview: "A thief who steals corporate secrets through dream-sharing technology.",
    tmdbId: 27205,
    posterPath: "/9gk7adHYeDvHkCSEqAvQNLV5Uge.jpg",
    genres: ["Action", "Science Fiction", "Adventure"],
    releaseDate: new Date("2010-07-16"),
    rating: 8.4,
    popularity: 82.86,
    type: "movie"
  },
  {
    title: "Breaking Bad",
    overview: "A high school chemistry teacher turned methamphetamine manufacturer.",
    tmdbId: 1396,
    posterPath: "/ggFHVNu6YYI5L9pCfOacjizRGt.jpg",
    genres: ["Drama", "Crime"],
    releaseDate: new Date("2008-01-20"),
    rating: 8.7,
    popularity: 75.32,
    type: "tv"
  },
  // Add more sample movies/shows as needed
]

async function setupDatabase() {
  try {
    if (!process.env.MONGODB_URI) {
      throw new Error('MONGODB_URI is not defined in .env')
    }

    const client = await MongoClient.connect(process.env.MONGODB_URI)
    const db = client.db()

    // Drop existing collections if they exist
    try {
      await Promise.all([
        db.collection('media').drop(),
        db.collection('users').drop(),
        db.collection('ratings').drop(),
        db.collection('watchlist').drop()
      ])
    } catch (e) {
      console.log('Collections did not exist, creating new ones...')
    }

    // Create media collection with schema validation
    await db.createCollection('media', {
      validator: {
        $jsonSchema: {
          bsonType: "object",
          required: ["title", "tmdbId", "type", "genres"],
          properties: {
            title: { bsonType: "string" },
            overview: { bsonType: "string" },
            tmdbId: { bsonType: "number" },
            posterPath: { bsonType: "string" },
            genres: { 
              bsonType: "array",
              items: { bsonType: "string" }
            },
            releaseDate: { bsonType: "date" },
            rating: { bsonType: "double" },
            popularity: { bsonType: "double" },
            type: { 
              enum: ["movie", "tv"],
              description: "Must be either 'movie' or 'tv'"
            }
          }
        }
      }
    })

    // Create users collection with schema validation
    await db.createCollection('users', {
      validator: {
        $jsonSchema: {
          bsonType: "object",
          required: ["email", "preferences"],
          properties: {
            email: { bsonType: "string" },
            preferences: {
              bsonType: "object",
              properties: {
                favoriteGenres: { 
                  bsonType: "array",
                  items: { bsonType: "string" }
                },
                contentType: {
                  bsonType: "array",
                  items: { enum: ["movie", "tv"] }
                }
              }
            },
            createdAt: { bsonType: "date" },
            updatedAt: { bsonType: "date" }
          }
        }
      }
    })

    // Create ratings collection with schema validation
    await db.createCollection('ratings', {
      validator: {
        $jsonSchema: {
          bsonType: "object",
          required: ["userId", "mediaId", "rating"],
          properties: {
            userId: { bsonType: "string" },
            mediaId: { bsonType: "number" },
            rating: {
              bsonType: "double",
              minimum: 0,
              maximum: 10
            },
            createdAt: { bsonType: "date" }
          }
        }
      }
    })

    // Create watchlist collection with schema validation
    await db.createCollection('watchlist', {
      validator: {
        $jsonSchema: {
          bsonType: "object",
          required: ["userId", "mediaId", "type"],
          properties: {
            userId: { bsonType: "string" },
            mediaId: { bsonType: "number" },
            type: { enum: ["movie", "tv"] },
            addedAt: { bsonType: "date" }
          }
        }
      }
    })

    // Create indexes
    await Promise.all([
      // Media indexes
      db.collection('media').createIndexes([
        { key: { tmdbId: 1 }, unique: true },
        { key: { type: 1 } },
        { key: { genres: 1 } },
        { key: { popularity: -1 } },
        { key: { rating: -1 } }
      ]),

      // User indexes
      db.collection('users').createIndexes([
        { key: { email: 1 }, unique: true },
        { key: { "preferences.favoriteGenres": 1 } }
      ]),

      // Ratings indexes
      db.collection('ratings').createIndexes([
        { key: { userId: 1, mediaId: 1 }, unique: true },
        { key: { mediaId: 1 } },
        { key: { rating: -1 } }
      ]),

      // Watchlist indexes
      db.collection('watchlist').createIndexes([
        { key: { userId: 1, mediaId: 1 }, unique: true },
        { key: { userId: 1, type: 1 } }
      ])
    ])

    // Insert sample data
    const insertedMedia = await db.collection('media').insertMany(sampleMovies)

    // Create sample user
    const sampleUser = {
      email: "user@example.com",
      preferences: {
        favoriteGenres: ["Action", "Science Fiction", "Drama"],
        contentType: ["movie", "tv"]
      },
      createdAt: new Date(),
      updatedAt: new Date()
    }

    const insertedUser = await db.collection('users').insertOne(sampleUser)

    // Add some sample ratings
    const sampleRatings = sampleMovies.map((movie, index) => ({
      userId: insertedUser.insertedId.toString(),
      mediaId: movie.tmdbId,
      rating: 8.0 + (index * 0.5), // Sample ratings between 8.0 and 9.0
      createdAt: new Date()
    }))

    await db.collection('ratings').insertMany(sampleRatings)

    console.log('Database setup completed successfully!')
    console.log(`Inserted ${sampleMovies.length} media items`)
    console.log('Created sample user and ratings')

    await client.close()
  } catch (error) {
    console.error('Error setting up database:', error)
    process.exit(1)
  }
}

setupDatabase()