import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import connectToMongoDB from '@/lib/mongodb';
import { WatchlistModel } from '@/lib/models/WatchlistModel';
import tmdbClient, { TMDBDetails } from '@/lib/tmdb';

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    console.log('Session user email:', session.user.email);
    await connectToMongoDB();
    const watchlistItems = await WatchlistModel.find({ userId: session.user.email });

    // Process watchlist items in batches to avoid overwhelming the network
    const BATCH_SIZE = 5;
    const results = [];

    // Process in batches with retry logic for each item
    for (let i = 0; i < watchlistItems.length; i += BATCH_SIZE) {
      const batch = watchlistItems.slice(i, i + BATCH_SIZE);
      
      // Process this batch in parallel
      const batchResults = await Promise.allSettled(
        batch.map(async (item) => {
          const baseItem = item.toObject();
          
          if (!item.itemId || !item.type || !['movie', 'tv'].includes(item.type)) {
            return baseItem;
          }

          try {
            // Use our TMDB client with built-in retry logic
            const details = await tmdbClient.fetchMediaDetails(
              item.itemId, 
              item.type as 'movie' | 'tv'
            );

            return {
              ...baseItem,
              releaseDate: 'release_date' in details ? details.release_date : 
                          'first_air_date' in details ? details.first_air_date : null,
              popularity: typeof details.popularity === 'number' ? details.popularity : 0,
              runtime: 'runtime' in details && typeof details.runtime === 'number' ? details.runtime : 
                      'episode_run_time' in details && Array.isArray(details.episode_run_time) && details.episode_run_time.length > 0 ? 
                      details.episode_run_time[0] : 0,
              // Add additional details for UI
              title: 'title' in details ? details.title : 'name' in details ? details.name : baseItem.title,
              posterPath: details.poster_path || baseItem.posterPath,
              voteAverage: details.vote_average || 0
            };
          } catch (error) {
            console.error(`Error fetching details for ${item.type} ${item.itemId}:`, error);
            return baseItem; // Return base item on error
          }
        })
      );

      // Handle results from this batch
      for (const result of batchResults) {
        if (result.status === 'fulfilled' && result.value) {
          results.push(result.value);
        }
      }

      // Small delay between batches to prevent network congestion
      if (i + BATCH_SIZE < watchlistItems.length) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }

    return NextResponse.json(results);
  } catch (error) {
    console.error('Watchlist details error:', error);
    return NextResponse.json({ error: 'Failed to fetch watchlist' }, { status: 500 });
  }
}
