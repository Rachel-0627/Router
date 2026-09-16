import Link from 'next/link'
import { site } from '@/lib/site'

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-5 py-16">
      <Link href="/" className="mb-8 font-mono text-sm text-[var(--muted)] hover:text-[var(--fg)]">
        ← {site.name}
      </Link>
      {children}
    </div>
  )
}
