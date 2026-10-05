import { site } from '@/lib/site'
import { getCurrentUser } from '@/lib/auth'
import { listKeys } from '@/lib/db/queries/keys'
import { CreateKey } from '@/components/dashboard/create-key'
import { deleteKey, toggleKey } from '@/app/actions/keys'
import { getGroups } from '@/lib/pricing/groups'
import type { ProductGroupId } from '@/lib/pricing/types'

export const metadata = { title: `API keys — ${site.name}` }

const fmtDate = (d: Date | null) =>
  d ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'

export default async function Keys() {
  const user = await getCurrentUser()
  if (!user) return null
  const keys = await listKeys(user.id)
  const allGroups = await getGroups()
  const groups = allGroups
    .filter((g) => g.status === 'live')
    .map((g) => ({ id: g.id, displayName: g.displayName, blurb: g.blurb }))
  const nameOf = (id: string) => allGroups.find((g) => g.id === id)?.displayName ?? id

  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">API keys</h1>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--muted)]">
        Use a key as <code className="font-mono text-[14px]">ANTHROPIC_AUTH_TOKEN</code> with{' '}
        <code className="font-mono text-[14px]">{site.apiBaseUrl}</code> as the base URL.
      </p>

      <div className="mt-8">
        <CreateKey groups={groups} />
      </div>

      {keys.length === 0 ? (
        <p className="mt-10 text-sm text-[var(--muted)]">No keys yet. Create one above to get started.</p>
      ) : (
        <div className="mt-10 overflow-x-auto rounded-lg border border-[var(--border)]">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="bg-[var(--card)] text-left text-xs tracking-wide text-[var(--muted)]">
              <tr>
                <th className="px-4 py-3 font-medium">NAME</th>
                <th className="px-4 py-3 font-medium">GROUP</th>
                <th className="px-4 py-3 font-medium">KEY</th>
                <th className="px-4 py-3 font-medium">CREATED</th>
                <th className="px-4 py-3 font-medium">LAST USED</th>
                <th className="px-4 py-3 text-right font-medium">ACTIONS</th>
              </tr>
            </thead>
            <tbody>
              {keys.map((k) => (
                <tr key={k.id} className="border-t border-[var(--border)]">
                  <td className="px-4 py-3">
                    <span className="font-medium">{k.name}</span>
                    {k.status !== 'active' && (
                      <span className="ml-2 rounded bg-[var(--muted)]/15 px-1.5 py-0.5 font-mono text-[12px] text-[var(--muted)]">
                        DISABLED
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className="rounded bg-[var(--accent)]/12 px-1.5 py-0.5 font-mono text-[12px] text-[var(--accent)]">
                      {nameOf(k.productGroup)}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-[var(--muted)]">{k.keyPrefix}</td>
                  <td className="px-4 py-3 text-[var(--muted)]">{fmtDate(k.createdAt)}</td>
                  <td className="px-4 py-3 text-[var(--muted)]">{fmtDate(k.lastUsedAt)}</td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-3">
                      <form action={toggleKey}>
                        <input type="hidden" name="id" value={k.id} />
                        <input type="hidden" name="next" value={k.status === 'active' ? 'disabled' : 'active'} />
                        <button className="text-xs text-[var(--muted)] underline underline-offset-2 hover:text-[var(--fg)]">
                          {k.status === 'active' ? 'Disable' : 'Enable'}
                        </button>
                      </form>
                      <form action={deleteKey}>
                        <input type="hidden" name="id" value={k.id} />
                        <button className="text-xs text-red-500 underline underline-offset-2">Delete</button>
                      </form>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  )
}
