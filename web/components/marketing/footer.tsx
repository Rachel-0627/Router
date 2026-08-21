import Link from 'next/link'
import { site } from '@/lib/site'

export function Footer() {
  return (
    <footer className="mt-24 border-t border-[var(--border)]">
      <div className="mx-auto max-w-5xl px-5 py-10">
        <div className="flex flex-wrap items-center justify-between gap-4 text-sm">
          <span className="font-mono font-semibold">{site.name}</span>
          <nav className="flex flex-wrap gap-x-5 gap-y-2 text-[var(--muted)]">
            {[...site.nav, ...site.legalNav].map((i) => (
              <Link key={i.href} href={i.href} className="hover:text-[var(--fg)]">
                {i.label}
              </Link>
            ))}
            <a href={`mailto:${site.supportEmail}`} className="hover:text-[var(--fg)]">
              Contact
            </a>
          </nav>
        </div>

        <p className="mt-6 max-w-3xl text-xs leading-6 text-[var(--muted)]">
          {site.disclosure}
        </p>
        <p className="mt-3 text-xs text-[var(--muted)]">
          © {new Date().getFullYear()} {site.legalEntity}. All rights reserved.
        </p>
      </div>
    </footer>
  )
}
