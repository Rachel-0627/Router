import { site } from '@/lib/site'
import { LegalPage } from '@/components/marketing/legal-page'

export const metadata = { title: `Refund Policy — ${site.name}` }

export default function Refund() {
  return (
    <LegalPage title="Refund Policy" updated="August 20, 2026">
      <h2>The policy in one line</h2>
      <p>
        <strong>Unused credits are refundable in full within 30 days of purchase. Credits you
        have already consumed are not refundable.</strong>
      </p>
      <p>
        There are no bonus credits, promotional balances, or tiers — you receive exactly the
        amount you pay for, which makes refunds simple to calculate.
      </p>

      <h2>How it works</h2>
      <ul>
        <li>Email <a href={`mailto:${site.supportEmail}`}>{site.supportEmail}</a> from the address on your account, or request a refund from your billing page.</li>
        <li>We refund the unused portion of your balance to the original payment method.</li>
        <li>Refunds are approved within 2 business days. Your bank or card issuer typically takes a further 5–10 business days to post the funds.</li>
        <li>Refunds are issued in the original currency of the purchase.</li>
      </ul>

      <h2>Worked examples</h2>
      <ul>
        <li>You top up ${'$'}50 and use nothing → refund ${'$'}50.</li>
        <li>You top up ${'$'}50 and use ${'$'}12 → refund ${'$'}38.</li>
        <li>You top up ${'$'}50 and use all of it → nothing to refund.</li>
      </ul>

      <h2>If the service does not work for you</h2>
      <p>
        If the Service is unavailable, degraded, or does not behave the way you expected — for
        example because model behaviour differs from a first-party API — tell us. If you have
        consumed credits on requests you could not use, contact us and we will look at your
        account and may issue a discretionary refund of that usage. We would rather refund you
        than have you file a chargeback.
      </p>

      <h2>When we may decline</h2>
      <ul>
        <li>Requests made more than 30 days after the purchase being refunded</li>
        <li>Accounts suspended for breaching our <a href="/legal/aup">Acceptable Use Policy</a></li>
        <li>Repeated purchase-then-refund cycles, or other patterns indicating abuse</li>
        <li>Credits purchased with a payment method that was later reversed or disputed</li>
      </ul>

      <h2>Chargebacks</h2>
      <p>
        Please contact us before disputing a charge with your bank. We can almost always resolve
        it faster directly. Accounts with an unresolved chargeback are suspended until the
        dispute is settled.
      </p>

      <h2>Contact</h2>
      <p>
        <a href={`mailto:${site.supportEmail}`}>{site.supportEmail}</a>
      </p>
    </LegalPage>
  )
}
