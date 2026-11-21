export function OwnerSkeleton() {
  return (
    <div className="min-h-screen bg-[#EFEFF2] p-2 sm:p-4 lg:p-6">
      <div className="mx-auto flex min-h-[calc(100vh-3rem)] max-w-[1440px] overflow-hidden rounded-[28px] border border-[#E5E5EA] bg-[#F7F7F9]">
        {/* Sidebar Skeleton */}
        <aside className="hidden w-[264px] shrink-0 border-r border-[#EAEAEF] bg-white p-5 lg:block">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 animate-pulse rounded-full bg-[#EFEFF2]" />
            <div className="space-y-1.5">
              <div className="h-4 w-24 animate-pulse rounded-full bg-[#EFEFF2]" />
              <div className="h-3 w-14 animate-pulse rounded-full bg-[#F4F4F6]" />
            </div>
          </div>
          <div className="mt-8 space-y-2.5">
            {[0, 1, 2, 3, 4].map((i) => (
              <div
                key={i}
                className="h-11 w-full animate-pulse rounded-full bg-[#F4F4F6]"
              />
            ))}
          </div>
        </aside>

        {/* Main Content Skeleton */}
        <div className="flex-1 p-6 lg:p-8">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="space-y-2">
              <div className="h-7 w-48 animate-pulse rounded-full bg-[#E8E8EC]" />
              <div className="h-4 w-72 animate-pulse rounded-full bg-[#EFEFF2]" />
            </div>
            <div className="flex gap-2">
              <div className="h-9 w-24 animate-pulse rounded-full bg-[#E8E8EC]" />
              <div className="h-9 w-24 animate-pulse rounded-full bg-[#E8E8EC]" />
            </div>
          </div>

          <div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {[0, 1, 2, 3].map((i) => (
              <div
                key={i}
                className={`h-36 animate-pulse rounded-[24px] ${
                  i === 0 ? "bg-[#18181B]" : "bg-white"
                }`}
              />
            ))}
          </div>

          <div className="mt-6 grid gap-6 lg:grid-cols-2">
            <div className="h-72 animate-pulse rounded-[24px] bg-white" />
            <div className="h-72 animate-pulse rounded-[24px] bg-white" />
          </div>

          <div className="mt-6 h-56 animate-pulse rounded-[24px] bg-white" />
        </div>
      </div>
    </div>
  );
}
