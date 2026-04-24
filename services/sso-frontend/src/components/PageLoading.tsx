type PageLoadingProps = {
  title: string;
  description: string;
  children: React.ReactNode;
};

export function DashboardPageLoading() {
  return (
    <LoadingFrame
      title="Loading dashboard"
      description="Refreshing users, sessions, and registered apps."
    >
      <div className="grid gap-5 md:grid-cols-3">
        <StatSkeleton />
        <StatSkeleton />
        <StatSkeleton />
      </div>
      <div className="mt-8 rounded-xl border border-line bg-card p-6">
        <SkeletonBar className="h-5 w-32" />
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <LinkSkeleton />
          <LinkSkeleton />
          <LinkSkeleton />
        </div>
      </div>
    </LoadingFrame>
  );
}

export function TablePageLoading(props: { title: string; description: string }) {
  return (
    <LoadingFrame title={props.title} description={props.description}>
      <TableSkeleton />
    </LoadingFrame>
  );
}

export function TableSkeleton() {
  return (
    <div className="overflow-hidden rounded-xl border border-line bg-card">
      <div className="space-y-3 p-5">
        <SkeletonBar className="h-4 w-40" />
        <SkeletonBar className="h-12 w-full" />
        <SkeletonBar className="h-12 w-full" />
        <SkeletonBar className="h-12 w-full" />
        <SkeletonBar className="h-12 w-full" />
      </div>
    </div>
  );
}

export function CardsPageLoading(props: { title: string; description: string }) {
  return (
    <LoadingFrame title={props.title} description={props.description}>
      <CardsSkeleton />
    </LoadingFrame>
  );
}

export function CardsSkeleton() {
  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      <AppCardSkeleton />
      <AppCardSkeleton />
      <AppCardSkeleton />
    </div>
  );
}

export function UserDetailPageLoading() {
  return (
    <LoadingFrame
      title="Loading user details"
      description="Preparing the latest profile and session inventory."
    >
      <UserDetailSkeleton />
    </LoadingFrame>
  );
}

export function UserDetailSkeleton() {
  return (
    <>
      <div className="rounded-xl border border-line bg-card p-5">
        <div className="space-y-3">
          <SkeletonBar className="h-8 w-48" />
          <SkeletonBar className="h-4 w-56" />
          <SkeletonBar className="h-4 w-40" />
        </div>
      </div>
      <div className="mt-6 overflow-hidden rounded-xl border border-line bg-card">
        <div className="space-y-3 p-5">
          <SkeletonBar className="h-4 w-36" />
          <SkeletonBar className="h-12 w-full" />
          <SkeletonBar className="h-12 w-full" />
          <SkeletonBar className="h-12 w-full" />
        </div>
      </div>
    </>
  );
}

function LoadingFrame({ title, description, children }: PageLoadingProps) {
  return (
    <div className="flex min-h-screen">
      <div className="hidden w-60 border-r border-line bg-card md:block" />
      <main className="flex-1 px-4 py-6 md:ml-60 md:px-8 md:py-8">
        <div className="mb-6">
          <SkeletonBar className="h-8 w-48" />
          <p className="mt-3 text-sm text-muted">{description}</p>
          <p className="sr-only">{title}</p>
        </div>
        {children}
      </main>
    </div>
  );
}

function StatSkeleton() {
  return (
    <div className="rounded-xl border border-line bg-card p-6">
      <SkeletonBar className="h-4 w-28" />
      <SkeletonBar className="mt-4 h-10 w-20" />
    </div>
  );
}

function LinkSkeleton() {
  return (
    <div className="rounded-lg bg-card-hover px-4 py-4">
      <SkeletonBar className="h-4 w-32" />
    </div>
  );
}

function AppCardSkeleton() {
  return (
    <div className="rounded-xl border border-line bg-card p-5">
      <SkeletonBar className="h-4 w-32" />
      <SkeletonBar className="mt-6 h-3 w-24" />
      <SkeletonBar className="mt-2 h-4 w-full" />
      <SkeletonBar className="mt-6 h-3 w-24" />
      <SkeletonBar className="mt-2 h-4 w-40" />
    </div>
  );
}

function SkeletonBar(props: { className: string }) {
  return <div className={`animate-pulse rounded-md bg-card-hover ${props.className}`} />;
}
