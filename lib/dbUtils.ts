import { Movie, Rating, User } from './models';
import type { IMovie } from './models';
import connectDB from "@/lib/db";
import connectToMongoDB from '@/lib/mongodb';

export async function getRecommendedMovies(userId: string, limit: number = 10) {
  try {
    await connectToMongoDB();
    // Get user's ratings
    const userRatings = await Rating.find({ userId });
    
    // Get user's highly rated movies (rating >= 7)
    const likedMovieIds = userRatings
      .filter(r => r.rating >= 7)
      .map(r => r.mediaId);

    // Find movies with similar genres
    const likedMovies = await Movie.find({ tmdbId: { $in: likedMovieIds } });
    const likedGenres = [...new Set(likedMovies.flatMap(m => m.genres))];

    // Get recommendations based on genres and exclude already rated movies
    const ratedMovieIds = userRatings.map(r => r.mediaId);
    
    const recommendations = await Movie.find({
      tmdbId: { $nin: ratedMovieIds },
      genres: { $in: likedGenres },
    })
      .sort({ rating: -1, popularity: -1 })
      .limit(limit);

    return recommendations;
  } catch (error) {
    console.error('Error getting recommendations:', error);
    return [];
  }
}

export async function addMovie(movieData: IMovie) {
  try {
    await connectToMongoDB();
    const movie = new Movie(movieData);
    await movie.save();
    return movie;
  } catch (error) {
    console.error('Error adding movie:', error);
    throw error;
  }
}

export async function addRating(userId: string, mediaId: number, rating: number) {
  try {
    await connectToMongoDB();
    const newRating = new Rating({
      userId,
      mediaId,
      rating,
      createdAt: new Date()
    });
    await newRating.save();
    return newRating;
  } catch (error) {
    console.error('Error adding rating:', error);
    throw error;
  }
}

export async function createOrUpdateUser(userData: {
  email: string;
  name?: string | null;
  image?: string | null;
}) {
  let client;
  try {
    client = await connectDB();
    console.log('Connected to MongoDB successfully');

    const db = client.db();
    const users = db.collection('users');

    const userDoc = {
      email: userData.email,
      name: userData.name || '',
      image: userData.image || '',
      preferences: {
        favoriteGenres: [],
        contentType: ['movie', 'tv']
      },
      updatedAt: new Date()
    };

    const result = await users.findOneAndUpdate(
      { email: userData.email },
      {
        $setOnInsert: {
          createdAt: new Date()
        },
        $set: userDoc
      },
      {
        upsert: true,
        returnDocument: 'after'
      }
    );

    console.log('User saved successfully:', result);
    return result;
  } catch (error) {
    console.error('Error in createOrUpdateUser:', {
      error,
      userData
    });
    throw error;
  }
}