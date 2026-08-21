import { site } from '@/lib/site'
import { LegalPage } from '@/components/marketing/legal-page'

export const metadata = { title: `Acceptable Use Policy — ${site.name}` }

export default function Aup() {
  return (
    <LegalPage title="Acceptable Use Policy" updated="August 20, 2026">
      <p>
        This policy applies to everyone using {site.name}. Breaching it may result in suspension
        or termination without refund of consumed credits.
      </p>

      <h2>What the service is built for</h2>
      <p>
        {site.name} is optimised for <strong>software development and coding agent
        workloads</strong> — writing and reviewing code, debugging, refactoring, documentation,
        and related engineering tasks. Other uses are permitted within this policy, but note that{' '}
        <strong>model behaviour may differ from a first-party API</strong>, particularly for
        role-play, persona, or general-assistant applications. Evaluate before you build on it.
      </p>

      <h2>You may not use the service to</h2>
      <h3>Break the law</h3>
      <ul>
        <li>Violate any applicable law, regulation, or sanctions regime</li>
        <li>Infringe intellectual property or misappropriate trade secrets</li>
        <li>Violate anyone&apos;s privacy or data protection rights</li>
      </ul>

      <h3>Cause harm</h3>
      <ul>
        <li>Generate malware, ransomware, exploits, or tooling intended to compromise systems without authorisation</li>
        <li>Conduct attacks, unauthorised penetration testing, or credential stuffing</li>
        <li>Produce content that sexualises minors, incites violence, or promotes self-harm</li>
        <li>Generate targeted harassment, doxxing, or threats</li>
        <li>Create disinformation, impersonate real people or organisations, or produce fraudulent documents</li>
      </ul>

      <h3>Abuse the platform</h3>
      <ul>
        <li>Resell, sublicense, or re-expose the API to third parties without our written agreement</li>
        <li>Share, publish, or trade API keys</li>
        <li>Create multiple accounts to evade limits, bans, or billing</li>
        <li>Circumvent rate limits, spend caps, or safety filters</li>
        <li>Reverse engineer, scrape, or attempt to extract our infrastructure configuration</li>
        <li>Run load tests or synthetic traffic that degrades service for others</li>
      </ul>

      <h3>High-risk applications</h3>
      <p>
        Do not use the Service as the sole decision-maker in situations where failure could cause
        physical harm or significant legal or financial detriment — including medical diagnosis or
        treatment, legal or financial advice presented as professional advice, critical
        infrastructure control, weapons systems, or automated decisions about employment, credit,
        housing, or benefits. A qualified human must remain accountable.
      </p>

      <h2>Your responsibilities</h2>
      <ul>
        <li>Keep your API keys secret and rotate them if exposed</li>
        <li>Set daily spend caps on keys used by automated systems</li>
        <li>Tell your own users when they are interacting with AI-generated output</li>
        <li>Review output before relying on it — models can be confidently wrong</li>
      </ul>

      <h2>Enforcement</h2>
      <p>
        We investigate reports and may suspend accounts while we do. Serious or repeated breaches
        result in termination. Where a breach is illegal we may report it to the relevant
        authorities. Because we do not retain prompt content, investigations rely on usage
        metadata and on information you or others provide.
      </p>

      <h2>Reporting abuse</h2>
      <p>
        <a href={`mailto:${site.supportEmail}`}>{site.supportEmail}</a>
      </p>
    </LegalPage>
  )
}
