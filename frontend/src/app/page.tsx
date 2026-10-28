import { ApiStatus } from "@/components/api-status";

export default function Home() {
  return (
    <main className="flex min-h-svh items-center px-6 py-16 sm:px-12">
      <div className="mx-auto w-full max-w-2xl">
        <h1 className="text-5xl font-semibold tracking-tight sm:text-6xl">Wangmai</h1>
        <p lang="th" className="mt-3 text-3xl text-muted-foreground">ว่างมั้ย?</p>
        <p className="mt-8 max-w-lg text-lg leading-relaxed text-muted-foreground">
          Make room for time together. Organize your schedule, manage your availability,
          and find people who are free when you are.
        </p>
        <p className="mt-8 text-sm">Project initialization successful.</p>
        <div className="mt-3"><ApiStatus /></div>
      </div>
    </main>
  );
}
