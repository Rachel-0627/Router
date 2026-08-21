import { site } from '@/lib/site'
import { LegalPage } from '@/components/marketing/legal-page'

export const metadata = { title: `Terms of Service — ${site.name}` }

export default function Terms() {
  return (
    <LegalPage title="Terms of Service" updated="August 20, 2026">
      <h2>1. What this service is</h2>
      <p>
        {site.name} (&ldquo;we&rdquo;, &ldquo;the Service&rdquo;) is an independent third-party API
        gateway. We route your requests to large language models through upstream providers and
        bill you from a prepaid credit balance. <strong>We are not affiliated with, endorsed by,
        or sponsored by Anthropic or any model vendor.</strong> Model names are used descriptively
        to identify which model your request is routed to.
      </p>
      <p>
        By creating an account or sending a request to the Service you agree to these Terms and
        to our <a href="/legal/aup">Acceptable Use Policy</a>.
      </p>

      <h2>2. Accounts</h2>
      <ul>
        <li>You must be at least 18 years old and legally able to enter a contract.</li>
        <li>You are responsible for keeping your API keys secret. Any usage authenticated with your keys is billed to your account.</li>
        <li>One person or organisation per account. Creating multiple accounts to evade limits or obtain repeated promotional benefits is grounds for termination.</li>
      </ul>

      <h2>3. Credits and billing</h2>
      <ul>
        <li>The Service is prepaid. You purchase credits and they are consumed as you make requests.</li>
        <li>Credits are denominated in US dollars and consumed at the rates published on our <a href="/pricing">pricing page</a>.</li>
        <li>Prices may change. We will publish changes on the pricing page before they take effect. Credits already purchased are not repriced.</li>
        <li>Credits carry no cash value beyond the refund rights described in our <a href="/legal/refund">Refund Policy</a>.</li>
        <li>You may set per-key daily spend caps. We are not liable for spend incurred by your own applications, loops, or leaked keys.</li>
      </ul>

      <h2>4. Availability — no SLA</h2>
      <p>
        <strong>The Service is provided without any uptime guarantee.</strong> Capacity depends on
        upstream providers that we do not control and may be reduced, degraded, or interrupted at
        any time without notice. We publish live capacity on our{' '}
        <a href="/status">status page</a>. We may throttle, queue, or temporarily suspend access
        to protect service stability.
      </p>

      <h2>5. Model behaviour</h2>
      <p>
        <strong>Model output through the Service may differ from output obtained directly from a
        model vendor&apos;s first-party API</strong>, including differences in system-level
        instructions, tool availability, and self-description. The Service is optimised for coding
        agent workloads. You should evaluate suitability for your own use case before relying on
        it.
      </p>

      <h2>6. Your content</h2>
      <p>
        You retain all rights to the content you send and receive. You grant us only the limited
        right to transmit it to upstream providers in order to fulfil your requests. We do not
        store the content of your prompts or completions — see our{' '}
        <a href="/legal/privacy">Privacy Policy</a>.
      </p>

      <h2>7. Prohibited use</h2>
      <p>
        You may not use the Service in violation of our <a href="/legal/aup">Acceptable Use
        Policy</a> or of any applicable law. We may suspend or terminate accounts that do.
      </p>

      <h2>8. Termination</h2>
      <ul>
        <li>You may close your account at any time and request a refund of unused credits under the Refund Policy.</li>
        <li>We may suspend or terminate an account for breach of these Terms, suspected fraud, chargeback abuse, or where required by law. Where we terminate without cause, we refund unused credits in full.</li>
      </ul>

      <h2>9. Disclaimers and limitation of liability</h2>
      <p>
        The Service is provided &ldquo;as is&rdquo; and &ldquo;as available&rdquo;, without
        warranties of any kind, express or implied, including merchantability, fitness for a
        particular purpose, and non-infringement.
      </p>
      <p>
        To the maximum extent permitted by law, our total aggregate liability arising out of or
        relating to the Service is limited to the amount you paid us in the three months
        preceding the event giving rise to the claim. We are not liable for indirect,
        incidental, special, consequential, or punitive damages, or for lost profits, revenue,
        or data.
      </p>

      <h2>10. Changes</h2>
      <p>
        We may update these Terms. Material changes will be announced on this page with an
        updated date. Continuing to use the Service after a change means you accept it.
      </p>

      <h2>11. Contact</h2>
      <p>
        Questions about these Terms: <a href={`mailto:${site.supportEmail}`}>{site.supportEmail}</a>
      </p>
    </LegalPage>
  )
}
