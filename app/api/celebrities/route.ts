import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const API_KEY = process.env.TMDB_API_KEY;
  const { searchParams } = new URL(request.url);
  const page = searchParams.get('page') || '1';
  
  const response = await fetch(
    `https://api.themoviedb.org/3/person/popular?api_key=${API_KEY}&language=en-US&page=${page}`
  );

  const data = await response.json();
  return NextResponse.json(data);
}
