import Link from 'next/link'
import { site } from '@/lib/site'
import { signIn } from '@/app/actions/auth'
import { CredentialsForm } from '@/components/auth/credentials-form'

export const metadata = { title: `Sign in — ${site.name}` }

export default function Login() {
  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">Sign in</h1>
      <p className="mt-2 mb-7 text-sm leading-6 text-[var(--muted)]">
        Welcome back.
      </p>
      <CredentialsForm action={signIn} submitLabel="Sign in" />
      <p className="mt-6 text-sm text-[var(--muted)]">
        Need an account?{' '}
        <Link href="/register" className="underline underline-offset-2 hover:text-[var(--fg)]">
          Create one
        </Link>
      </p>
    </>
  )
}
