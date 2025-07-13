'use client'

import React, { useEffect } from 'react'
import { use } from 'react'
import { useRouter } from 'next/navigation'

interface Props {
  params: Promise<{
    mediaType: string;
    id: string;
  }>
}

const MediaDetailPage: React.FC<Props> = ({ params }) => {
  const router = useRouter()
  const { mediaType, id } = use(params);

  useEffect(() => {
    switch (mediaType) {
      case 'person':
        router.push(`/actor/${id}`);
        break;
      case 'movie':
        router.push(`/movie/${id}`);
        break;
      case 'tv':
        router.push(`/tv/${id}`);
        break;
      default:
        router.push('/');
    }
  }, [mediaType, id, router]);

  // Show loading state while redirecting
  return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-cyan-500"></div>
    </div>
  );
}

export default MediaDetailPage;
