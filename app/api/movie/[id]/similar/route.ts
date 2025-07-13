import { NextResponse } from 'next/server';

const TMDB_API_KEY = process.env.TMDB_API_KEY;
const BASE_URL = 'https://api.themoviedb.org/3';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: movieId } = await params;
    
    // Fetch similar movies from TMDB
    const response = await fetch(
      `${BASE_URL}/movie/${movieId}/similar?api_key=${TMDB_API_KEY}`,
      { next: { revalidate: 3600 } } // Cache for 1 hour
    );
    
    if (!response.ok) {
      return NextResponse.json(
        { error: `TMDB error: ${response.status}` },
        { status: response.status }
      );
    }
    
    const data = await response.json();
    
    return NextResponse.json(data);
  } catch (error) {
    console.error('Error fetching similar movies:', error);
    return NextResponse.json(
      { error: 'Failed to fetch similar movies' },
      { status: 500 }
    );
  }
} 