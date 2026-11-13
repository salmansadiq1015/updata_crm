import Image from 'next/image';
import Link from 'next/link';
import { ArrowDown, ArrowRight, BellRing, Check, ChevronDown, CircleCheck, ClipboardCheck, GitBranch, History, Layers3, Mail, MousePointer2, PhoneCall, Play, ShieldCheck, Sparkles, Workflow } from 'lucide-react';
import { getCanonicalUrl } from '@/lib/seo/site-config';
import { AuthAwareLink } from '@/components/landing/auth-aware-link';
import { Reveal } from '@/components/landing/motion-primitives';
import { WorkflowAutomationDemo } from '@/components/landing/workflow-automation-demo';
import { WorkflowEmailPreview } from '@/components/landing/workflow-email-preview';
import { automationFaqs } from '@/components/landing/workflow-marketing-content';
import styles from '@/components/landing/workflow-automation.module.css';

const title = 'Workflow Automation & CRM Email Workflows | Updata';
const description = 'Connect AI calls, email, SMS and CRM actions with Updata workflow automation. Build visual workflows, plan follow-ups and keep your team in control.';
const socialImage = { url: '/landing/workflow/connected-workflows-social.webp', width: 1200, height: 630, alt: 'Connected glass workflow, email and voice blocks representing Updata workflow automation' };

export const metadata = {
  title, description,
  alternates: { canonical: getCanonicalUrl('/workflow-automation') },
  openGraph: { title, description, url: getCanonicalUrl('/workflow-automation'), type: 'website', siteName: 'Updata ERP', images: [socialImage] },
  twitter: { card: 'summary_large_image', title, description, images: [socialImage.url] },
};

const processSteps = [
  [MousePointer2, 'Choose the starting point', 'A new lead. An imported contact. A missed call. Start with the event that signals there is work to do, then decide which contacts should enter the flow.'],
  [GitBranch, 'Connect the right next steps', 'Combine AI calls, emails, SMS, conditions and waiting steps. Give replies, timeouts and different call outcomes their own paths, with a clear ending for each.'],
  [ClipboardCheck, 'Test it. Make it yours.', 'Start with a template or ask the workflow copilot for a first draft. Configure your accounts and agents, check the branches and test before publishing.'],
];
const controls = [
  [ShieldCheck, 'Your rules, built into the process', 'Use workspace permissions, configured channels and messaging consent checks. Review automated content and settings before publishing a workflow.'],
  [BellRing, 'A person at the right moment', 'Notify the assigned teammate, create a task or schedule a callback when the process calls for human attention. Keep the handoff specific and useful.'],
  [History, 'A visible path from start to finish', 'Inspect execution history and recorded outcomes. Understand which branch a contact followed and where a failed or waiting step needs attention.'],
];

export default function WorkflowAutomationPage() {
  const url = getCanonicalUrl('/workflow-automation');
  const structuredData = {
    '@context': 'https://schema.org',
    '@graph': [
      { '@type': 'WebPage', '@id': `${url}#page`, url, name: title, description, about: { '@type': 'SoftwareApplication', name: 'Updata ERP Workflow Automation', applicationCategory: 'BusinessApplication', operatingSystem: 'Web', featureList: ['Visual workflow builder', 'AI calling workflows', 'Email and SMS actions', 'Conditional routing and event waits', 'CRM updates and team notifications', 'Workflow testing and execution history'] } },
      { '@type': 'BreadcrumbList', itemListElement: [{ '@type': 'ListItem', position: 1, name: 'Home', item: getCanonicalUrl('/') }, { '@type': 'ListItem', position: 2, name: 'Workflow Automation', item: url }] },
      { '@type': 'FAQPage', '@id': `${url}#questions`, mainEntity: automationFaqs.map(([question, answer]) => ({ '@type': 'Question', name: question, acceptedAnswer: { '@type': 'Answer', text: answer } })) },
    ],
  };

  return <div className={styles.page}>
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData).replace(/</g, '\\u003c') }} />
    <section className={styles.hero} aria-labelledby="workflow-page-title">
      <div className={styles.container}>
        <div className={styles.heroGrid}>
          <div>
            <p className={styles.eyebrow}>CRM WORKFLOW AUTOMATION</p>
            <h1 id="workflow-page-title">Workflow automation.<br /><span className={styles.gradientText}>Made to move.</span></h1>
            <p className={styles.heroDescription}>A new lead arrives. A conversation starts. The right next step follows. Connect AI calls, email and CRM actions in a process that works the way your team thinks.</p>
            <div className={styles.actions}><AuthAwareLink href="/automation/new" className={styles.primary}>Build your first workflow<ArrowRight aria-hidden="true" /></AuthAwareLink><a href="#workflow-preview" className={styles.secondary}><Play aria-hidden="true" />See it in motion</a></div>
            <p className={styles.heroNote}><Check aria-hidden="true" />Visual builder. Connected context. Human control.</p>
          </div>
          <div className={styles.heroArt}>
            <picture>
              <source type="image/avif" srcSet="/landing/workflow/connected-workflows-640.avif 640w, /landing/workflow/connected-workflows-960.avif 960w, /landing/workflow/connected-workflows-1536.avif 1536w" sizes="(max-width: 767px) calc(100vw - 40px), (max-width: 1280px) 48vw, 600px" />
              <source type="image/webp" srcSet="/landing/workflow/connected-workflows-640.webp 640w, /landing/workflow/connected-workflows-960.webp 960w, /landing/workflow/connected-workflows-1536.webp 1536w" sizes="(max-width: 767px) calc(100vw - 40px), (max-width: 1280px) 48vw, 600px" />
              <Image src="/landing/workflow/connected-workflows-1536.webp" alt="Translucent workflow blocks connect email and AI voice actions through glowing cyan paths" width={1536} height={1024} unoptimized loading="eager" fetchPriority="high" />
            </picture>
            <div className={styles.artCaption}><CircleCheck aria-hidden="true" /><span>One process. Every next step connected.</span></div>
          </div>
        </div>
        <div className={styles.heroStrip}>{[[Workflow, 'A visual workflow builder'], [PhoneCall, 'AI calls, email & SMS'], [Layers3, 'Context from your CRM'], [History, 'Execution history & outcomes']].map(([Icon, label]) => <span key={label}><Icon aria-hidden="true" />{label}</span>)}</div>
      </div>
    </section>

    <section id="workflow-preview" className={styles.contentSection} aria-labelledby="workflow-preview-title">
      <div className={styles.container}>
        <div className={styles.introRow}><Reveal className={styles.sectionIntro}><p className={styles.eyebrow}>LESS EXPLAINING. MORE SEEING.</p><h2 id="workflow-preview-title">From a trigger to<br />a thoughtful outcome.</h2><p>Watch a process take shape, one block at a time. Switch between lead qualification, missed-call recovery and email follow-up. Pause anywhere to explore the details.</p></Reveal><p><MousePointer2 aria-hidden="true" />Choose an example. Follow the connections.</p></div>
        <Reveal className={styles.demoWrap}><WorkflowAutomationDemo /></Reveal>
      </div>
    </section>

    <section className={styles.contentSection} aria-labelledby="workflow-builder-title">
      <div className={styles.container}>
        <Reveal className={styles.sectionIntro}><p className={styles.eyebrow}>YOUR PROCESS, MADE VISIBLE</p><h2 id="workflow-builder-title">Think it through.<br /><span className={styles.gradientText}>Then connect the dots.</span></h2><p>Build CRM workflows around real customer moments. Keep the logic understandable, the next action deliberate and the whole team on the same page.</p></Reveal>
        <div className={styles.processGrid}>{processSteps.map(([Icon, heading, body], index) => <article key={heading}><span className={styles.processNumber}><Icon aria-hidden="true" />0{index + 1}</span><h3>{heading}</h3><p>{body}</p></article>)}</div>
        <AuthAwareLink href="/automation/templates" className={styles.textLink}>Find a starting point in templates<ArrowRight aria-hidden="true" /></AuthAwareLink>
      </div>
    </section>

    <section id="email-automation" className={styles.emailSection} aria-labelledby="email-automation-title">
      <div className={`${styles.container} ${styles.emailGrid}`}>
        <Reveal><WorkflowEmailPreview /></Reveal>
        <div className={styles.emailCopy}>
          <p className={styles.eyebrow}>EMAIL, WITH A NEXT CHAPTER</p><h2 id="email-automation-title">The email is just<br /><span className={styles.gradientText}>the beginning.</span></h2>
          <p>Keep the message, the customer and the next action connected. Work from your email workspace, then use workflow automation to give follow-up a clear path.</p>
          <ul className={styles.emailList}>
            <li><Mail aria-hidden="true" /><div><h3>Customer context beside the conversation</h3><p>Connect sending accounts, organize conversations and link email history to CRM records your team can access.</p></div></li>
            <li><Sparkles aria-hidden="true" /><div><h3>AI helps prepare. You decide.</h3><p>Use AI-assisted drafts in the email workspace, with review and approval before an agent-prepared message is sent.</p></div></li>
            <li><GitBranch aria-hidden="true" /><div><h3>Follow-up that follows your rules</h3><p>Route supported replies and open signals into configured workflow branches. Set a timeout, respect consent and keep a person in the loop where needed.</p></div></li>
          </ul>
          <div className={styles.actions}><AuthAwareLink href="/email" className={styles.secondary}>Explore your email workspace<ArrowRight aria-hidden="true" /></AuthAwareLink></div>
        </div>
      </div>
    </section>

    <section className={styles.controlSection} aria-labelledby="automation-control-title">
      <div className={`${styles.container} ${styles.controlGrid}`}>
        <Reveal className={styles.sectionIntro}><p className={styles.eyebrow}>AUTOMATION WITH ACCOUNTABILITY</p><h2 id="automation-control-title">Let the process run.<br /><span className={styles.gradientText}>Keep the decisions clear.</span></h2><p>A useful workflow knows when to continue, when to wait and when to ask a person. Build those choices into the flow from the start.</p><Link href="/calling-engine" className={styles.textLink}>Meet the AI calling engine<ArrowRight aria-hidden="true" /></Link></Reveal>
        <div className={styles.controlList}>{controls.map(([Icon, heading, body]) => <article key={heading}><Icon aria-hidden="true" /><div><h3>{heading}</h3><p>{body}</p></div></article>)}</div>
      </div>
    </section>

    <section id="questions" className={styles.contentSection} aria-labelledby="automation-faq-title">
      <div className={`${styles.container} ${styles.faqGrid}`}>
        <div className={styles.sectionIntro}><p className={styles.eyebrow}>A LITTLE MORE CLARITY</p><h2 id="automation-faq-title">Before your first<br />workflow.</h2><p>Practical answers about visual workflows, email automation and getting your workspace ready.</p><Link href="/contact" className={styles.textLink}>Talk to the Updata team<ArrowRight aria-hidden="true" /></Link></div>
        <div className={styles.faqList}>{automationFaqs.map(([question, answer]) => <details key={question}><summary>{question}<ChevronDown aria-hidden="true" /></summary><p>{answer}</p></details>)}</div>
      </div>
    </section>

    <div className={styles.container}><section className={styles.closing} aria-labelledby="automation-cta-title"><Workflow aria-hidden="true" /><h2 id="automation-cta-title">Give good work<br /><span className={styles.gradientText}>a way to keep moving.</span></h2><p>Start with one process your team knows well. Connect the steps, review the details and make the next move a little easier.</p><div className={styles.actions}><AuthAwareLink href="/automation/new" className={styles.primary}>Create a workflow<ArrowRight aria-hidden="true" /></AuthAwareLink><a href="#workflow-preview" className={styles.secondary}>Explore the examples<ArrowDown aria-hidden="true" /></a></div></section></div>
  </div>;
}
