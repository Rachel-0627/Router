'use client'
/**
 * 加密密钥(KEK)状态 + 轮换向导。
 *
 * 平时折叠,只显示一行状态 —— 轮换是几年都碰不到一次的操作,
 * 不该天天占着视线。
 *
 * ⚠️ 为什么还要你去 Vercel 粘一次:钥匙必须待在数据库外面。
 *    存进库就等于钥匙挂在锁上,库被导出时密钥和密文一起泄露。
 *    我们能做的是把这一步变成"复制→粘贴",但消不掉它。
 */
import { useActionState, useState } from 'react'
import { generateKek, rotateReencrypt, type SecretState } from '@/app/actions/ops-secrets'

export type KekStatus = {
  configured: boolean
  fingerprint: string | null
  hasOld: boolean
  staleCount: number
  unreadableCount: number
}

function Copy({ value }: { value: string }) {
  const [done, setDone] = useState(false)
  return (
    <button
      type="button"
      onClick={() => {
        navigator.clipboard.writeText(value).then(() => {
          setDone(true)
          setTimeout(() => setDone(false), 1500)
        })
      }}
      className="shrink-0 rounded border border-[var(--border)] px-2 py-1 font-mono text-[12px] hover:bg-[var(--card)]"
    >
      {done ? '已复制' : '复制'}
    </button>
  )
}

function Row({ name, value }: { name: string; value: string }) {
  return (
    <div className="flex items-center gap-2">
      <code className="w-48 shrink-0 font-mono text-[13px]">{name}</code>
      <code className="flex-1 overflow-x-auto whitespace-nowrap rounded bg-[var(--card)] px-2 py-1 font-mono text-[12px]">
        {value}
      </code>
      <Copy value={value} />
    </div>
  )
}

export function KekPanel({ status }: { status: KekStatus }) {
  const [open, setOpen] = useState(false)
  const [newKek, setNewKek] = useState<string | null>(null)
  const [genBusy, setGenBusy] = useState(false)
  const [reState, reAction, rePending] = useActionState<SecretState, FormData>(rotateReencrypt, undefined)

  const line = !status.configured
    ? { dot: '🔴', text: '未配置加密密钥 —— 现在还不能在后台保存 key' }
    : status.unreadableCount > 0
      ? { dot: '🔴', text: `${status.unreadableCount} 个槽位解不开,手上没有对应的钥匙` }
      : status.staleCount > 0
        ? { dot: '🟡', text: `新钥匙已生效,${status.staleCount} 个槽位还用旧钥匙加密` }
        : { dot: '🟢', text: `加密正常 · 钥匙指纹 ${status.fingerprint}` }

  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="text-[15px]">
          {line.dot} {line.text}
        </span>
        <button type="button" onClick={() => setOpen(!open)} className="text-[13px] text-[var(--muted)] underline underline-offset-2">
          {open ? '收起' : '轮换密钥'}
        </button>
      </div>

      {/* 第 2 步的按钮:检测到有旧密文时才出现,不用展开也能看到 */}
      {status.staleCount > 0 && (
        <form action={reAction} className="mt-4 flex flex-wrap items-center gap-3">
          <button
            type="submit"
            disabled={rePending}
            className="rounded-md bg-[var(--fg)] px-4 py-2 text-sm font-medium text-[var(--bg)] disabled:opacity-50"
          >
            {rePending ? '处理中…' : `用新钥匙重新加密这 ${status.staleCount} 个`}
          </button>
          {reState && (
            <span className={`text-[13px] ${reState.ok ? 'text-emerald-600' : 'text-red-600'}`}>{reState.message}</span>
          )}
        </form>
      )}

      {status.staleCount === 0 && status.hasOld && (
        <p className="mt-3 text-[13px] text-emerald-600">
          ✅ 全部已用新钥匙加密 —— 现在可以去 Vercel 删掉 <code className="font-mono">SECRETS_KEK_OLD</code> 了。
        </p>
      )}

      {open && (
        <div className="mt-5 border-t border-[var(--border)] pt-5">
          <h4 className="font-semibold">轮换加密密钥</h4>
          <p className="mt-2 text-[13px] leading-6 text-[var(--muted)]">
            只在你怀疑 Vercel 环境变量泄露时才需要做。正常运营几年都碰不到一次。
            <br />
            轮换**不需要重填任何 key** —— 旧密文会被自动解开再用新钥匙加密。
          </p>

          <ol className="mt-4 space-y-4 text-[14px]">
            <li>
              <strong>第 1 步</strong> 生成新钥匙
              {!newKek ? (
                <button
                  type="button"
                  disabled={genBusy}
                  onClick={async () => {
                    setGenBusy(true)
                    const r = await generateKek()
                    setGenBusy(false)
                    if (r.ok && r.kek) setNewKek(r.kek)
                  }}
                  className="ml-3 rounded-md border border-[var(--border)] px-3 py-1.5 text-[13px] hover:bg-[var(--bg)] disabled:opacity-50"
                >
                  {genBusy ? '生成中…' : '生成'}
                </button>
              ) : (
                <div className="mt-3 space-y-2">
                  <Row name="SECRETS_KEK" value={newKek} />
                  <p className="text-[12px] text-amber-700">
                    ⚠️ 这个值离开本页就再也看不到了。同时把<strong>当前</strong>那把的值复制到{' '}
                    <code className="font-mono">SECRETS_KEK_OLD</code>(去 Vercel 变量里取)。
                  </p>
                </div>
              )}
            </li>
            <li>
              <strong>第 2 步</strong> 去 Vercel → Settings → Environment Variables,
              设好上面两个变量,然后 <strong>Redeploy</strong>。
            </li>
            <li>
              <strong>第 3 步</strong> 部署完回到本页刷新,点上方出现的
              「用新钥匙重新加密」按钮,然后删掉 <code className="font-mono">SECRETS_KEK_OLD</code>。
            </li>
          </ol>
        </div>
      )}
    </div>
  )
}
