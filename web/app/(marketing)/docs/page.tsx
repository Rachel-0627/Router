import { site } from '@/lib/site'
import { CodeBlock } from '@/components/marketing/code-block'
import { MODELS } from '@/lib/pricing/models'

export const metadata = { title: `Docs — ${site.name}` }

const B = site.apiBaseUrl

export default function Docs() {
  return (
    <div className="mx-auto max-w-3xl px-5 py-16">
      <h1 className="text-3xl font-semibold tracking-tight">Getting started</h1>
      <p className="mt-4 text-[15px] leading-7 text-[var(--muted)]">
        {site.name} speaks the native Anthropic Messages API and an OpenAI-compatible
        endpoint. In most tools you only change a base URL and an API key.
      </p>

      <Section title="1. Create an API key">
        <p className="text-[15px] leading-7 text-[var(--muted)]">
          Sign up, then create a key from your dashboard. You can name each key, set a daily
          spend cap, and disable it at any time.
        </p>
      </Section>

      <Section title="2. Point your tool at us">
        <H3>Claude Code</H3>
        <CodeBlock
          label="~/.zshrc"
          code={`export ANTHROPIC_BASE_URL=${B}\nexport ANTHROPIC_AUTH_TOKEN=sk-your-key`}
        />
        <P>Reload your shell and run <Code>claude</Code> as usual.</P>

        <H3>Cursor</H3>
        <P>
          Settings → Models → Override OpenAI Base URL. Use{' '}
          <Code>{B}/v1</Code> and paste your key.
        </P>

        <H3>Cline / Roo Code</H3>
        <P>
          Choose <em>Anthropic</em> as the provider, set the custom base URL to <Code>{B}</Code>,
          and paste your key.
        </P>

        <H3>Anthropic SDK</H3>
        <CodeBlock
          label="python"
          code={`from anthropic import Anthropic\n\nclient = Anthropic(\n    base_url="${B}",\n    api_key="sk-your-key",\n)\n\nmsg = client.messages.create(\n    model="claude-sonnet-5",\n    max_tokens=1024,\n    messages=[{"role": "user", "content": "Hello"}],\n)\nprint(msg.content[0].text)`}
        />

        <H3>OpenAI SDK</H3>
        <CodeBlock
          label="typescript"
          code={`import OpenAI from "openai"\n\nconst client = new OpenAI({\n  baseURL: "${B}/v1",\n  apiKey: "sk-your-key",\n})\n\nconst r = await client.chat.completions.create({\n  model: "claude-sonnet-5",\n  messages: [{ role: "user", content: "Hello" }],\n})`}
        />
      </Section>

      <Section title="3. Keep prompt caching on">
        <P>
          Caching is supported exactly as upstream: mark a stable prefix with{' '}
          <Code>cache_control</Code> and cache reads bill at one tenth of input. Coding agents
          resend a large system prompt every turn, so this is usually where most of your bill
          goes — and where most of your savings come from.
        </P>
        <CodeBlock
          label="python"
          code={`client.messages.create(\n    model="claude-sonnet-5",\n    max_tokens=1024,\n    system=[{\n        "type": "text",\n        "text": LARGE_STABLE_PROMPT,\n        "cache_control": {"type": "ephemeral"},\n    }],\n    messages=[{"role": "user", "content": question}],\n)`}
        />
        <P>
          Check <Code>usage.cache_read_input_tokens</Code> on the response to confirm you are
          getting hits.
        </P>
      </Section>

      <Section title="Available models">
        <div className="overflow-hidden rounded-lg border border-[var(--border)]">
          <table className="w-full text-sm">
            <tbody>
              {MODELS.map((m) => (
                <tr key={m.id} className="border-b border-[var(--border)] last:border-0">
                  <td className="px-4 py-3 font-mono text-[13px]">{m.id}</td>
                  <td className="px-4 py-3 text-right text-[var(--muted)]">{m.displayName}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <section id="differences" className="mt-12 scroll-mt-20">
        <h2 className="mb-4 text-xl font-semibold">How this differs from a first-party API</h2>
        <div className="space-y-4">
          <P>
            We route your requests through upstream providers rather than holding a direct
            commercial relationship with the model vendor. That has two practical consequences
            worth knowing before you build on it.
          </P>

          <H3>System-level instructions</H3>
          <P>
            Requests carry additional system-level context from the upstream provider. In
            practice the model may describe itself as a coding assistant, and{' '}
            <strong className="text-[var(--fg)]">a custom persona set in your own system prompt
            may not be fully adopted</strong>. If your product depends on a specific persona — or
            on the model denying that it has tools — test that behavior before relying on it.
          </P>

          <H3>What is unaffected</H3>
          <P>
            Tool definitions you send are respected: the model will not invoke tools you did not
            define. Streaming, prompt caching, token accounting, stop reasons, and the Messages
            API surface all behave as documented.
          </P>

          <H3>Who this suits</H3>
          <P>
            <strong className="text-[var(--fg)]">Coding agents</strong> — Claude Code, Cursor,
            Cline — where the model is meant to be a coding assistant anyway, see no practical
            difference. <strong className="text-[var(--fg)]">General-purpose assistants,
            roleplay, and persona-driven products</strong> should evaluate carefully; this is not
            what the service is tuned for.
          </P>
          <P>
            Every account starts with a small balance you control, so you can test your own
            workload before committing. Unused credits are refundable in full within 30 days.
          </P>
        </div>
      </section>

      <Section title="Errors and capacity">
        <P>
          When upstream capacity is constrained we return <Code>503</Code> with a{' '}
          <Code>Retry-After</Code> header rather than failing silently. Rate limits return{' '}
          <Code>429</Code>. If your balance runs out you get <Code>402</Code>. Live capacity is
          published on our <a href="/status" className="underline underline-offset-2 hover:text-[var(--fg)]">status page</a>.
        </P>
      </Section>

      <div className="mt-14 rounded-lg border border-[var(--border)] bg-[var(--card)] p-5">
        <p className="text-sm leading-6 text-[var(--muted)]">{site.disclosure}</p>
      </div>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-12">
      <h2 className="mb-4 text-xl font-semibold">{title}</h2>
      <div className="space-y-4">{children}</div>
    </section>
  )
}
const H3 = ({ children }: { children: React.ReactNode }) => (
  <h3 className="mt-7 mb-2.5 text-[15px] font-semibold">{children}</h3>
)
const P = ({ children }: { children: React.ReactNode }) => (
  <p className="text-[15px] leading-7 text-[var(--muted)]">{children}</p>
)
const Code = ({ children }: { children: React.ReactNode }) => (
  <code className="rounded bg-[var(--card)] px-1.5 py-0.5 font-mono text-[13px] text-[var(--fg)]">
    {children}
  </code>
)
