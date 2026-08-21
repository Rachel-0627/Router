import { site } from '@/lib/site'
import { LegalPage } from '@/components/marketing/legal-page'

export const metadata = { title: `Privacy Policy — ${site.name}` }

export default function Privacy() {
  return (
    <LegalPage title="Privacy Policy" updated="August 20, 2026">
      <h2>The short version</h2>
      <p>
        <strong>We do not store the content of your prompts or the model&apos;s responses.</strong>{' '}
        Request bodies pass through our gateway to the upstream provider and are not written to
        our database or logs. We record only metadata needed to bill you and keep the service
        running: token counts, model name, timing, and status.
      </p>

      <h2>What we collect</h2>
      <h3>Account data</h3>
      <ul>
        <li>Email address (and name, if you sign in with Google)</li>
        <li>A hashed password, if you register with email and password</li>
        <li>Account status and creation date</li>
      </ul>

      <h3>Usage metadata</h3>
      <ul>
        <li>Per request: model, token counts (input, output, cache read, cache write), latency, HTTP status, and which API key was used</li>
        <li>Aggregated daily totals per model</li>
      </ul>
      <p>
        <strong>Not collected:</strong> prompt text, system prompts, completions, file contents,
        tool inputs, or tool results.
      </p>

      <h3>Payment data</h3>
      <p>
        Payments are processed by our payment provider acting as merchant of record. We never see
        or store your full card number. We receive only the transaction amount, currency, status,
        and an order reference.
      </p>

      <h3>Technical data</h3>
      <ul>
        <li>IP address and user agent, retained briefly for abuse prevention and rate limiting</li>
        <li>Essential cookies for keeping you signed in. We do not use advertising or cross-site tracking cookies.</li>
      </ul>

      <h2>How we use it</h2>
      <ul>
        <li>To operate the Service, authenticate requests, and meter usage</li>
        <li>To bill you accurately and show you your own usage</li>
        <li>To detect fraud, abuse, and runaway spend</li>
        <li>To send transactional email (verification, receipts, balance and service alerts)</li>
      </ul>
      <p>We do not sell your data, and we do not use your data to train models.</p>

      <h2>Who we share it with</h2>
      <ul>
        <li><strong>Upstream model providers</strong> — your request content is transmitted to them to fulfil the request, subject to their own terms and privacy practices.</li>
        <li><strong>Payment provider</strong> — to process payments and refunds.</li>
        <li><strong>Infrastructure providers</strong> — hosting, database, and email delivery.</li>
        <li><strong>Legal</strong> — where required by valid legal process.</li>
      </ul>

      <h2>Retention</h2>
      <ul>
        <li>Usage metadata: 12 months, then aggregated or deleted</li>
        <li>Billing records: as required by tax and accounting law</li>
        <li>Account data: until you delete your account</li>
        <li>Prompt and completion content: not retained</li>
      </ul>

      <h2>Your rights</h2>
      <p>
        Depending on where you live (including under the GDPR and CCPA) you may have the right to
        access, correct, export, or delete your personal data, and to object to or restrict
        certain processing. Email{' '}
        <a href={`mailto:${site.supportEmail}`}>{site.supportEmail}</a> and we will respond within
        30 days. You can delete your account at any time from your dashboard; unused credits are
        refunded under our <a href="/legal/refund">Refund Policy</a>.
      </p>

      <h2>International transfers</h2>
      <p>
        The Service is operated internationally and your data may be processed outside your
        country of residence, including in jurisdictions with different data protection laws.
      </p>

      <h2>Children</h2>
      <p>The Service is not directed to anyone under 18 and we do not knowingly collect their data.</p>

      <h2>Changes</h2>
      <p>Material changes will be posted here with an updated date.</p>

      <h2>Contact</h2>
      <p>
        <a href={`mailto:${site.supportEmail}`}>{site.supportEmail}</a>
      </p>
    </LegalPage>
  )
}
