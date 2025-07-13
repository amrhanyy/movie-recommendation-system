import mongoose, { Schema } from "mongoose";

export interface IMovie {
  title: string;
  overview: string;
  tmdbId: number;
  posterPath: string;
  genres: string[];
  releaseDate: Date;
  rating: number;
  popularity: number;
  type: 'movie' | 'tv';
}

const MovieSchema = new Schema<IMovie>({
  title: { type: String, required: true },
  overview: { type: String, required: true },
  tmdbId: { type: Number, required: true, unique: true },
  posterPath: { type: String },
  genres: [{ type: String }],
  releaseDate: { type: Date },
  rating: { type: Number },
  popularity: { type: Number },
  type: { type: String, enum: ['movie', 'tv'], required: true }
}, {
  timestamps: true
});

export const Movie = mongoose.models.Movie || mongoose.model<IMovie>('Movie', MovieSchema);
