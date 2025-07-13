import React from "react"
import { Skeleton } from "../components/ui/skeleton"

export function MovieSkeleton() {
  return (
    <div className="flex gap-4 p-4">
      <Skeleton className="h-[180px] w-[120px] rounded-md" />
      <div className="space-y-2 flex-grow">
        <Skeleton className="h-6 w-3/4" />
        <div className="flex gap-2">
          <Skeleton className="h-5 w-16" />
          <Skeleton className="h-5 w-16" />
        </div>
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-full" />
      </div>
    </div>
  )
}
