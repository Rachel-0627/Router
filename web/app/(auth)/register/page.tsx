import Link from 'next/link'
import { site } from '@/lib/site'
import { signUp } from '@/app/actions/auth'
import { CredentialsForm } from '@/components/auth/credentials-form'

export const metadata = { title: `Create account — ${site.name}` }

export default function Register() {
  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">Create your account</h1>
      <p className="mt-2 mb-7 text-sm leading-6 text-[var(--muted)]">
        Prepaid credits, no subscription. You only pay for what you use.
      </p>
      <CredentialsForm action={signUp} submitLabel="Create account" passwordHint="At least 8 characters." />
      <p className="mt-6 text-sm text-[var(--muted)]">
        Already have an account?{' '}
        <Link href="/login" className="underline underline-offset-2 hover:text-[var(--fg)]">
          Sign in
        </Link>
      </p>
    </>
  )
}
