import React from 'react';

export const Skeleton = ({ className = "" }: { className?: string }) => {
  return (
    <div className={`animate-pulse bg-gray-700/50 rounded-lg ${className}`} />
  );
};

export const MovieCardSkeleton = () => {
  return (
    <div className="relative aspect-[2/3] rounded-xl overflow-hidden">
      <Skeleton className="w-full h-full" />
    </div>
  );
};
