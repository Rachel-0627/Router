import Link from 'next/link'
import { opsAccessState } from '@/lib/auth/ops'

const NAV = [
  { href: '/ops-2f8a', label: '总览' },
  { href: '/ops-2f8a/models', label: '模型目录' },
  { href: '/ops-2f8a/pricing', label: '定价倍率' },
  { href: '/ops-2f8a/users', label: '用户' },
  { href: '/ops-2f8a/credentials', label: '密钥配置' },
]

/** 门禁和导航都收在布局里,子页面不用各自判断 */
export default async function OpsLayout({ children }: { children: React.ReactNode }) {
  const state = await opsAccessState()

  if (state !== 'ok') {
    return (
      <div className="mx-auto max-w-md px-5 py-40 text-center">
        <h1 className="text-xl font-semibold">运营后台</h1>
        {state === 'anonymous' ? (
          <>
            <p className="mt-3 text-[var(--muted)]">请先用管理员账号登录。</p>
            <Link
              href="/login"
              className="mt-6 inline-block rounded-md bg-[var(--accent)] px-5 py-2.5 font-medium text-white"
            >
              去登录
            </Link>
          </>
        ) : (
          <>
            <p className="mt-3 leading-7 text-[var(--muted)]">
              当前账号不是管理员。在项目目录里跑一次授权命令,然后刷新本页:
            </p>
            <code className="mt-4 block rounded-md border border-[var(--border)] bg-[var(--card)] px-4 py-3 text-left font-mono text-[14px]">
              npm run ops:grant 你的邮箱
            </code>
          </>
        )}
      </div>
    )
  }

  return (
    <div className="min-h-screen">
      <header className="border-b border-[var(--border)]">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4">
          <span className="font-mono text-[var(--muted)]">ops console</span>
          <Link href="/dashboard" className="text-[var(--muted)] hover:text-[var(--fg)]">
            ← 回控制台
          </Link>
        </div>
        <nav className="mx-auto flex max-w-6xl gap-6 px-5">
          {NAV.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              className="-mb-px border-b-2 border-transparent py-2.5 text-[var(--muted)] hover:border-[var(--border)] hover:text-[var(--fg)]"
            >
              {n.label}
            </Link>
          ))}
        </nav>
      </header>
      {children}
    </div>
  )
}
