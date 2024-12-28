import { Skeleton } from "@/components/ui/skeleton"

export function UserInfoSkeleton() {
  return (
    <div className="flex items-start justify-between w-full">
      <div className="flex flex-col gap-2">
        <Skeleton className="h-8 w-40 bg-gray-300" />
        <Skeleton className="h-4 w-60 bg-gray-300" />
        <Skeleton className="h-4 w-48 bg-gray-300" />
      </div>
      <Skeleton className="h-16 w-16 rounded-full bg-gray-300" />
    </div>
  )
}

export function TrackSkeleton() {
  return (
    <div className="flex items-center gap-4 p-4">
      <Skeleton className="h-16 w-16 rounded-md bg-gray-300" />
      <div className="flex-grow space-y-2">
        <Skeleton className="h-4 w-3/4 bg-gray-300" />
        <Skeleton className="h-3 w-1/2 bg-gray-300" />
        <Skeleton className="h-3 w-1/4 bg-gray-300" />
      </div>
      <Skeleton className="h-4 w-20 bg-gray-300" />
    </div>
  )
}

export function TopItemSkeleton() {
  return (
    <div className="flex items-center gap-4 p-4">
      <Skeleton className="h-8 w-8 rounded-full bg-gray-300" />
      <div className="flex-grow space-y-2">
        <Skeleton className="h-4 w-3/4 bg-gray-300" />
        <Skeleton className="h-3 w-1/2 bg-gray-300" />
      </div>
      <Skeleton className="h-4 w-16 bg-gray-300" />
    </div>
  )
}

export function BottomNavSkeleton() {
  return (
    <div className="fixed bottom-0 left-0 right-0 h-16 bg-white border-t border-gray-200 flex justify-around items-center">
      {[...Array(4)].map((_, i) => (
        <div key={i} className="flex flex-col items-center justify-center w-1/4 h-full">
          <Skeleton className="w-6 h-6 mb-1 bg-gray-300" />
          <Skeleton className="w-12 h-3 bg-gray-300" />
        </div>
      ))}
    </div>
  )
}