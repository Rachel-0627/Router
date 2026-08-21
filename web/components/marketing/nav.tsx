import Link from 'next/link'
import { site } from '@/lib/site'

export function Nav() {
  return (
    <header className="sticky top-0 z-40 border-b border-[var(--border)] bg-[var(--bg)]/85 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-5">
        <Link href="/" className="font-mono text-[15px] font-semibold tracking-tight">
          {site.name}
        </Link>

        <nav className="flex items-center gap-1 text-sm">
          {site.nav.map((i) => (
            <Link
              key={i.href}
              href={i.href}
              className="rounded-md px-3 py-1.5 text-[var(--muted)] transition-colors hover:text-[var(--fg)]"
            >
              {i.label}
            </Link>
          ))}
          <Link
            href="/register"
            className="ml-2 rounded-md bg-[var(--fg)] px-3.5 py-1.5 text-[13px] font-medium text-[var(--bg)] transition-opacity hover:opacity-85"
          >
            Get started
          </Link>
        </nav>
      </div>
    </header>
  )
}
