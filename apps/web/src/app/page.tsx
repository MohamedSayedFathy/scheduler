import Link from 'next/link';

export default function HomePage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-8">
      <div className="mx-auto max-w-2xl text-center">
        <h1 className="text-4xl font-bold tracking-tight sm:text-6xl">Scheduler</h1>
        <p className="mt-6 text-lg text-muted-foreground">
          Multi-tenant university timetabling, powered by constraint optimization.
        </p>
        <div className="mt-10 flex items-center justify-center gap-4">
          <Link
            href="/sign-in"
            className="rounded-md bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm hover:bg-primary/90"
          >
            Sign in
          </Link>
          <Link
            href="/sign-up"
            className="rounded-md border border-border px-5 py-2.5 text-sm font-semibold hover:bg-accent"
          >
            Get started
          </Link>
        </div>
      </div>
    </main>
  );
}
