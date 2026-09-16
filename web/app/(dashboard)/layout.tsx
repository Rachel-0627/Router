import Link from 'next/link'
import { redirect } from 'next/navigation'
import { site } from '@/lib/site'
import { getCurrentUser } from '@/lib/auth'
import { signOut } from '@/app/actions/auth'

const NAV = [
  { href: '/dashboard', label: 'Overview' },
  { href: '/dashboard/keys', label: 'API keys' },
  { href: '/dashboard/usage', label: 'Usage' },
  { href: '/dashboard/billing', label: 'Billing' },
]

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  // 鉴权只在这一处做,子页面不用重复判断
  const user = await getCurrentUser()
  if (!user) redirect('/login')

  return (
    <div className="min-h-screen">
      <header className="border-b border-[var(--border)]">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-5 py-4">
          <Link href="/dashboard" className="font-mono text-sm font-medium">
            {site.name}
          </Link>
          <div className="flex items-center gap-4">
            <span className="hidden text-xs text-[var(--muted)] sm:inline">{user.email}</span>
            <form action={signOut}>
              <button className="text-sm text-[var(--muted)] hover:text-[var(--fg)]">Sign out</button>
            </form>
          </div>
        </div>
        <nav className="mx-auto flex max-w-5xl gap-6 px-5">
          {[...NAV, ...(user.role === 'admin' ? [{ href: '/ops-2f8a', label: 'Ops' }] : [])].map((n) => (
            <Link
              key={n.href}
              href={n.href}
              className="-mb-px border-b-2 border-transparent py-2.5 text-sm text-[var(--muted)] hover:border-[var(--border)] hover:text-[var(--fg)]"
            >
              {n.label}
            </Link>
          ))}
        </nav>
      </header>
      <main className="mx-auto max-w-5xl px-5 py-10">{children}</main>
    </div>
  )
}
