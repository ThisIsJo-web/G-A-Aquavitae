export function HealthSkeleton() {
  return (
    <div className="min-h-screen bg-[#EFEFF2] p-2 sm:p-4 lg:p-6">
      <div className="mx-auto flex min-h-[calc(100vh-3rem)] max-w-[1440px] overflow-hidden rounded-[28px] border border-[#E5E5EA] bg-[#F7F7F9]">
        <aside className="hidden w-[264px] shrink-0 border-r border-[#EAEAEF] bg-white p-6 lg:block">
          <div className="h-10 w-36 animate-pulse rounded-full bg-[#EFEFF2]" />
          <div className="mt-8 space-y-3">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="h-11 w-full animate-pulse rounded-full bg-[#F4F4F6]"
              />
            ))}
          </div>
        </aside>
        <div className="flex-1 p-6 lg:p-8">
          <div className="h-8 w-56 animate-pulse rounded-full bg-[#E8E8EC]" />
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[0, 1, 2, 3].map((item) => (
              <div
                key={item}
                className="h-36 animate-pulse rounded-[24px] border border-[#E8E8EC] bg-white"
              />
            ))}
          </div>
          <div className="mt-6 grid gap-4 lg:grid-cols-3">
            {[0, 1, 2].map((item) => (
              <div
                key={item}
                className="h-72 animate-pulse rounded-[24px] border border-[#E8E8EC] bg-white"
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
