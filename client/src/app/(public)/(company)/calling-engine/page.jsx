import { getCanonicalUrl } from '@/lib/seo/site-config';
import Image from 'next/image';
import Link from 'next/link';
import { ArrowDown, ArrowRight, AudioLines, BookOpen, CalendarClock, Check, ChevronDown, CircleUserRound, ClipboardCheck, Globe2, Layers3, MessageSquareText, PhoneCall, PhoneIncoming, Route, UserRoundCheck, BellRing, Settings2, ShieldCheck, Sparkles, Target, UsersRound } from 'lucide-react';
import { AuthAwareLink } from '@/components/landing/auth-aware-link';
import { CallingParticleOrb, IncomingCallPreview } from '@/components/landing/calling-engine-experience';
import styles from '@/components/landing/calling-engine-experience.module.css';

export const metadata = {
  alternates: { canonical: getCanonicalUrl('/calling-engine') },
  title: 'AI Calling Agent & Calling Engine — Updata',
  description: 'Meet the Updata Calling Engine. Answer incoming calls with an AI receptionist, organize outbound outreach and turn every conversation into clear CRM outcomes.',
  openGraph: {
    url: getCanonicalUrl('/calling-engine'),
    title: 'AI Calling Agent & Calling Engine — Updata',
    description: 'A more connected way to manage business conversations. Explore AI calling capabilities and a simple setup overview.',
    images: [{ url: '/landing/calling-engine-hero.webp', width: 1536, height: 1024, alt: 'Updata AI voice engine concept' }],
  },
};

const primary = 'shadow-[0_4px_24px_-8px_#a4baff80] inline-flex min-h-12 items-center justify-center gap-3 rounded-xl bg-[#dce5ff] px-6 text-sm font-semibold text-[#152952] transition hover:bg-white focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-blue-300';
const secondary = 'inline-flex min-h-12 items-center justify-center gap-3 rounded-xl border border-white/15 px-6 text-sm font-medium text-slate-200 transition hover:bg-white/5 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-blue-300';
const container = 'mx-auto max-w-[1280px] px-5 sm:px-8 lg:px-10';
const features = [
  [CircleUserRound, 'A voice that fits your business', 'Give every agent a name, role, language and voice. Set a clear objective and opening introduction so conversations feel consistent with your brand.'],
  [BookOpen, 'Grounded in your knowledge', 'Bring approved business information into the conversation. Keep product details, services and common answers together in your agent’s knowledge base.'],
  [Target, 'Questions with a purpose', 'Build a focused questionnaire, capture the details that matter and define qualification rules that help your team recognize the next opportunity.'],
  [CalendarClock, 'Outreach on your schedule', 'Organize assigned leads into campaigns. Set calling windows, a timezone and retry preferences around the way your team works.'],
  [MessageSquareText, 'Context after every conversation', 'Review call history, transcripts and captured answers. Give your team the context they need to prepare a useful follow-up.'],
  [Layers3, 'Connected to your CRM', 'Keep lead records, qualification and follow-up activity in the same workspace, so your team can move from a conversation to the next action.'],
];
const setup = [
  [CircleUserRound, 'Create your agent', 'Choose a name and role, then select a voice and language. Add your company details, objective and opening disclosure.'],
  [BookOpen, 'Add business context', 'Prepare your knowledge base and conversation questions. Define the information to collect and the rules for qualification.'],
  [UsersRound, 'Connect your calls', 'Connect your phone and set incoming-call rules, or select CRM leads for an outbound campaign. Choose business hours and a timezone.'],
  [ClipboardCheck, 'Review and activate', 'Check the agent configuration and preview the question flow. Confirm workspace readiness, then activate when your team is ready.'],
];
const faqs = [
  ['What is the Updata Calling Engine?', 'It is the AI calling workspace within Updata. Your team can configure voice agents, organize lead outreach and review conversation outcomes alongside the CRM records they belong to.'],
  ['Can the AI agent answer incoming calls?', 'Yes. With a connected phone and an active receptionist configuration, your agent can answer incoming calls according to your rules, identify callers, respond from approved knowledge and capture useful details. Your team can take over on the handset, or follow up using the saved conversation context.'],
  ['What happens to a missed call?', 'Missed calls remain visible in your incoming-call history. Call-waiting events can generate a high-priority alert and return-call task so your team can follow up.'],
  ['Can I control when the AI answers?', 'Yes. Configure business hours, answer delay and routing rules for caller types, numbers, connected phones and SIMs. The incoming-call workspace also provides live monitoring, call history, analytics and cost visibility.'],
  ['What should I prepare before setup?', 'Have your company information, a clear conversation objective, approved business knowledge and a set of relevant questions ready. You will also need suitable CRM contacts and access to AI calling in your organization’s workspace.'],
  ['Can I customize my agent?', 'Yes. Agent settings include identity, language, voice, instructions, opening disclosure and conversation questions. Qualification rules and scheduling preferences help align the agent with your business workflow.'],
  ['Does creating an agent start calls immediately?', 'No. Creating an agent or assigning leads prepares the workspace. Outbound calls start when you launch a campaign. For incoming calls, enable your receptionist and configure answering rules on a connected phone. Review both configurations before activating them.'],
  ['Where can my team review the results?', 'The AI calling workspace brings together call history and conversation details, including available transcripts, captured answers and outcomes. Connected lead records help your team manage the next step.'],
  ['How do we get access?', 'Sign in to your organization’s Updata workspace and open AI Calling. Availability depends on your workspace permissions and configuration. Your administrator or the Updata team can help you get set up.'],
];

function Eyebrow({ children }) {
  return <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#a4baff]">{children}</p>;
}

function SectionHeading({ eyebrow, title, description }) {
  return <div className="mx-auto max-w-2xl text-center"><Eyebrow>{eyebrow}</Eyebrow><h2 className="mt-4 text-3xl font-medium tracking-tight text-white sm:text-4xl lg:text-[44px] lg:leading-[1.15]">{title}</h2><p className="mt-5 text-base leading-7 text-slate-400">{description}</p></div>;
}

function VoiceWave({ small = false }) {
  return <div aria-hidden="true" className={`${styles.wave} flex items-center justify-center gap-1 ${small ? 'h-10' : 'h-20'}`}>{[14, 24, 18, 36, 46, 28, 38, 20, 44, 32, 18, 40, 26, 46, 34, 20, 30, 42, 22, 16].map((height, index) => <span key={index} className="w-1 rounded-full bg-gradient-to-t from-blue-500 to-cyan-200" style={{ height: small ? height / 2 : height }} />)}</div>;
}

export default function CallingEnginePage() {
  return <div className={styles.page}>
    <section className={`${styles.hero} relative overflow-hidden border-b border-white/[.07] pb-16 pt-32 sm:pb-24 sm:pt-40`}>
      <div aria-hidden="true" className="pointer-events-none absolute -top-32 right-0 h-[700px] w-[900px] max-w-full bg-[radial-gradient(ellipse_at_center,rgba(50,80,180,.15),transparent_65%)]" />
      <div className={`${container} relative`}>
        <div className="grid items-center gap-12 lg:grid-cols-[1.1fr_1fr] lg:gap-12">
          <div>
            <span className="inline-flex items-center gap-2 rounded-full border border-blue-200/15 bg-blue-200/5 px-3 py-1.5 text-xs font-medium text-blue-200"><Sparkles className="size-3.5" aria-hidden="true" /> Updata Calling Engine</span>
            <h1 className="mt-7 max-w-2xl text-[clamp(2.8rem,5.1vw,4.6rem)] font-medium leading-[1.06] tracking-[-0.055em]">Every call.<br />A new <span className={styles.gradientText}>possibility.</span></h1>
            <p className="mt-7 max-w-lg text-base leading-8 text-slate-400 sm:text-lg">A warm welcome for every caller. A confident voice for every opportunity. Bring AI reception, outbound calling and customer context together in one intelligent workspace.</p>
            <div className="mt-8 flex flex-wrap gap-3"><AuthAwareLink href="/ai-calling" className={primary}>Set up your agent <ArrowRight className="size-4" aria-hidden="true" /></AuthAwareLink><a href="#incoming" className={secondary}>Meet your AI receptionist <ArrowDown className="size-4" aria-hidden="true" /></a></div>
            <div className={styles.heroTags}><span><Check aria-hidden="true" /> Incoming & outgoing calls</span><span><Check aria-hidden="true" /> Connected to your CRM</span></div><p className="mt-5 flex items-center gap-2 text-xs leading-5 text-slate-500"><ShieldCheck className="size-4 shrink-0 text-blue-300" aria-hidden="true" /> Managed within your organization’s Updata workspace.</p>
          </div>
          <div className="relative min-w-0"><CallingParticleOrb /><p className="mt-4 text-center text-[10px] tracking-wide text-slate-500">Built around your business. Ready for the next hello.</p></div>
        </div>
        <div className="mt-14 grid grid-cols-2 gap-6 border-t border-white/[.08] pt-7 sm:grid-cols-4">{[[PhoneIncoming, 'AI-powered incoming calls'], [BookOpen, 'Business-aware agents'], [Globe2, 'Language & voice choices'], [Layers3, 'One connected workspace']].map(([Icon, label]) => <div key={label} className="flex items-center gap-3 text-xs leading-5 text-slate-400"><Icon className="size-4 shrink-0 text-blue-200" aria-hidden="true" />{label}</div>)}</div>
      </div>
    </section>


    <section id="incoming" className={`${styles.incoming} py-20 sm:py-28`}>
      <div className={`${container} ${styles.incomingGrid}`}>
        <div>
          <span className="mb-5 inline-flex items-center gap-2 rounded-full border border-emerald-200/15 bg-emerald-200/5 px-3 py-1.5 text-[10px] font-medium text-emerald-200"><PhoneIncoming className="size-3" aria-hidden="true" /> MEET YOUR AI RECEPTIONIST</span>
          <h2 className="text-3xl font-medium leading-[1.12] sm:text-4xl lg:text-[44px]">A great first impression.<br /><span className={styles.gradientText}>Before you pick up.</span></h2>
          <p className="mt-5 max-w-xl text-base leading-8 text-slate-400">Let your AI agent welcome incoming callers, understand what they need and keep the conversation moving. Your business knowledge, delivered with a personal touch.</p>
          <div className={styles.featureList}>{[
            [PhoneIncoming, 'Answer on your terms', 'Accept calls automatically with your greeting, answer delay and business-hour rules.'],
            [CircleUserRound, 'Know who is calling', 'Match known callers to CRM records and capture new customer details.'],
            [BookOpen, 'Give informed answers', 'Respond from approved knowledge and collect relevant details with custom questions.'],
            [Globe2, 'Speak their language', 'Use your chosen voice and adapt the conversation to the caller’s language.'],
            [UserRoundCheck, 'Keep a person in reach', 'Alert your team for human takeover, or offer a callback when nobody is available.'],
            [ClipboardCheck, 'Keep every detail useful', 'Save transcripts, questions, intent and qualification alongside the customer record.'],
            [Route, 'Route the next step', 'Assign the right teammate and organize work status and internal follow-up tasks.'],
            [BellRing, 'Stay on top of every call', 'Track live activity, missed calls and call waiting, with history, analytics and cost visibility.'],
          ].map(([Icon, title, body]) => <div key={title} className={styles.incomingFeature}><Icon aria-hidden="true" /><div><h3>{title}</h3><p>{body}</p></div></div>)}</div>
          <AuthAwareLink href="/incoming-calls" className={`${secondary} mt-8`}>Explore incoming calls <ArrowRight className="size-4" aria-hidden="true" /></AuthAwareLink>
          <p className={styles.incomingFootnote}>Available with a connected phone, an active agent and your workspace’s calling configuration.</p>
        </div>
        <IncomingCallPreview />
      </div>
    </section>

    <section id="capabilities" className="py-20 sm:py-28">
      <div className={container}>
        <SectionHeading eyebrow="Built around your business" title="Your knowledge. Your voice. Your AI agent." description="Everything your team needs to shape purposeful conversations, with the context to keep every relationship moving." />
        <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{features.map(([Icon, title, body]) => <article key={title} className="rounded-2xl border border-white/[.08] bg-white/[.02] p-7"><span className="grid size-11 place-items-center rounded-xl border border-blue-200/10 bg-blue-200/5 text-[#aec3ff]"><Icon className="size-5" aria-hidden="true" /></span><h3 className="mt-6 text-lg font-medium tracking-tight">{title}</h3><p className="mt-3 text-sm leading-7 text-slate-400">{body}</p></article>)}</div>
      </div>
    </section>

    <section className="border-y border-white/[.07] bg-[#0a1120] py-20 sm:py-24">
      <div className={container}>
        <div className="grid items-center gap-12 lg:grid-cols-2 lg:gap-20">
          <div><Eyebrow>From conversation to clarity</Eyebrow><h2 className="mt-4 text-3xl font-medium leading-tight tracking-tight sm:text-4xl">A call ends.<br /><span className="text-[#a5bbff]">The relationship continues.</span></h2><p className="mt-5 text-base leading-8 text-slate-400">Bring conversation details back to the people who need them. A shared view of answers, qualification and follow-up helps your team make the next interaction more useful.</p><ul className="mt-7 space-y-4">{['Review the conversation and captured answers', 'Understand the lead’s needs and readiness', 'Keep follow-up connected to the customer record'].map(text => <li key={text} className="flex gap-3 text-sm leading-6 text-slate-300"><Check className="mt-1 size-4 shrink-0 text-blue-300" aria-hidden="true" />{text}</li>)}</ul></div>
          <div className="overflow-hidden rounded-3xl border border-white/10 bg-[#080e1b] shadow-[0_24px_80px_-30px_#000]">
            <div className="flex items-center justify-between border-b border-white/[.07] px-6 py-4"><span className="flex items-center gap-2 text-xs font-medium text-slate-300"><AudioLines className="size-4 text-blue-300" aria-hidden="true" /> Conversation overview</span><span className="rounded-full bg-white/5 px-2 py-1 text-[10px] text-slate-500">Illustrative preview</span></div>
            <div className="p-5 sm:p-7"><div className="flex items-center gap-3"><span className="grid size-11 place-items-center rounded-2xl bg-blue-300/10 text-blue-200"><CircleUserRound className="size-5" aria-hidden="true" /></span><div><p className="text-sm font-medium">Your business agent</p><p className="mt-1 text-xs text-slate-500">Lead qualification · Customer outreach</p></div></div><VoiceWave /><div className="rounded-xl border border-white/[.07] bg-white/[.025] p-5"><p className="text-[10px] uppercase tracking-[.15em] text-slate-500">Conversation summary</p><p className="mt-3 text-sm leading-7 text-slate-300">The prospect is interested in learning more and would like a member of the team to follow up.</p><div className="mt-5 flex flex-wrap gap-2">{['Interest captured', 'Needs recorded', 'Follow-up requested'].map(label => <span key={label} className="rounded-md bg-blue-300/[.07] px-2 py-1.5 text-[10px] text-blue-200">{label}</span>)}</div></div><div className="mt-4 flex items-center gap-3 rounded-xl border border-emerald-300/10 bg-emerald-300/[.04] p-4"><ClipboardCheck className="size-5 shrink-0 text-emerald-300" aria-hidden="true" /><div><p className="text-xs font-medium text-emerald-200">Ready for the next step</p><p className="mt-1 text-xs text-slate-400">Useful context for your team’s next conversation.</p></div></div></div>
          </div>
        </div>
      </div>
    </section>

    <section className="py-20 sm:py-28">
      <div className={container}>
        <SectionHeading eyebrow="Purpose in every conversation" title="Made for the moments that matter." description="Shape an agent around a clear business objective, and give each conversation a useful destination." />
        <div className="mt-12 grid gap-5 md:grid-cols-3">{[['qualification', 'Lead qualification', 'Understand interest, capture requirements and help your team focus on the right opportunities.', 'Know who is ready for the next step.'], ['followup', 'Follow-up coordination', 'Capture preferred times and next steps so your team can continue the relationship with context.', 'Keep momentum after the first hello.'], ['customer', 'Customer information', 'Collect structured answers and share approved business information in a consistent voice.', 'Turn conversations into useful context.']].map(([image, title, body, note]) => <article key={title} className="overflow-hidden rounded-2xl border border-white/10"><div className="border-b border-white/[.07] bg-[#080e1d]"><Image src={`/landing/calling-engine-${image}.webp`} alt={`${title} illustrated with luminous glass customer and conversation elements`} width={1536} height={1024} sizes="(min-width: 1280px) 387px, (min-width: 768px) 33vw, 100vw" className="block h-auto w-full object-contain" /></div><div className="p-6"><h3 className="text-lg font-medium">{title}</h3><p className="mt-3 text-sm leading-7 text-slate-400">{body}</p><p className="mt-6 border-t border-white/[.07] pt-4 text-xs text-blue-200">{note}</p></div></article>)}</div>
      </div>
    </section>

    <section id="setup" className="border-y border-white/[.07] bg-[#0a1120] py-20 sm:py-28">
      <div className={container}>
        <SectionHeading eyebrow="A clear path to getting started" title="Set up with purpose. Start with confidence." description="Bring your business context, agent preferences and call settings together in four straightforward steps." />
        <div className="relative mt-12 overflow-hidden rounded-2xl border border-blue-200/10 bg-[#080e1d]"><Image src="/landing/calling-engine-setup.webp" alt="Glass voice, knowledge and customer cards illustrate the foundations of a prepared AI calling agent" width={1536} height={1024} sizes="(min-width: 1280px) 1200px, 100vw" className={`${styles.setupImage} block h-auto w-full object-contain`} /><div className="border-t border-blue-200/10 px-6 py-5"><p className="text-xs tracking-wide text-blue-100">A familiar voice. Approved knowledge. The right context.</p></div></div>
        <ol className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{setup.map(([Icon, title, body], index) => <li key={title} className="relative rounded-2xl border border-white/[.09] bg-[#0d1628] p-6"><div className="flex items-center justify-between"><span className="text-xs font-medium tracking-[.14em] text-blue-300">0{index + 1}</span><Icon className="size-5 text-blue-200/70" aria-hidden="true" /></div><h3 className="mt-8 text-lg font-medium tracking-tight">{title}</h3><p className="mt-3 text-sm leading-7 text-slate-400">{body}</p></li>)}</ol>
        <div className="mt-6 flex flex-col items-start gap-5 rounded-2xl border border-blue-200/10 bg-blue-200/[.035] p-6 sm:flex-row sm:items-center sm:justify-between"><div className="flex items-start gap-3"><Settings2 className="mt-1 size-5 shrink-0 text-blue-200" aria-hidden="true" /><div><p className="text-sm font-medium text-slate-200">Your workspace, ready for your team.</p><p className="mt-2 max-w-2xl text-xs leading-6 text-slate-400">Your administrator manages access and calling availability. Keep company details, approved knowledge and CRM contacts ready before you begin.</p></div></div><AuthAwareLink href="/ai-calling" className={`${secondary} shrink-0`}>Open AI Calling <ArrowRight className="size-4" aria-hidden="true" /></AuthAwareLink></div>
      </div>
    </section>

    <section className="py-20 sm:py-28">
      <div className={`${container} grid gap-10 lg:grid-cols-[.8fr_1.2fr] lg:gap-24`}>
        <div><Eyebrow>A little more clarity</Eyebrow><h2 className="mt-4 text-3xl font-medium tracking-tight sm:text-4xl">Questions before<br />your first conversation?</h2><p className="mt-5 text-sm leading-7 text-slate-400">A few things to know about your AI calling workspace.</p><Link href="/contact" className="mt-6 inline-flex min-h-11 items-center gap-2 text-sm text-blue-200 hover:text-white">Talk to the Updata team <ArrowRight className="size-4" aria-hidden="true" /></Link></div>
        <div>{faqs.map(([question, answer]) => <details key={question} className="group border-b border-white/10 first:border-t"><summary className="flex cursor-pointer list-none items-center justify-between gap-5 py-6 text-sm font-medium text-slate-200 focus-visible:outline-2 focus-visible:outline-blue-300 [&::-webkit-details-marker]:hidden">{question}<ChevronDown className="size-4 shrink-0 text-slate-500 transition-transform group-open:rotate-180" aria-hidden="true" /></summary><p className="pb-6 pe-7 text-sm leading-7 text-slate-400">{answer}</p></details>)}</div>
      </div>
    </section>

    <section className="px-5 pb-20 sm:px-8 sm:pb-28">
      <div className="relative mx-auto max-w-[1200px] overflow-hidden rounded-[28px] border border-blue-200/15 bg-[radial-gradient(ellipse_at_top,#1a2a50_0%,#0d1628_70%)] px-6 py-16 text-center sm:px-12 sm:py-20"><span className="mx-auto grid size-12 place-items-center rounded-2xl border border-blue-200/20 bg-blue-200/10 text-blue-200"><PhoneCall className="size-5" aria-hidden="true" /></span><h2 className="mx-auto mt-7 max-w-2xl text-3xl font-medium leading-tight tracking-tight sm:text-5xl">Your next great relationship<br /><span className="text-[#a5bbff]">starts with a conversation.</span></h2><p className="mx-auto mt-5 max-w-lg text-sm leading-7 text-slate-400">Give your business a voice that stays connected to your team, your knowledge and your customers.</p><div className="mt-8 flex flex-wrap justify-center gap-3"><AuthAwareLink href="/ai-calling" className={primary}>Get started <ArrowRight className="size-4" aria-hidden="true" /></AuthAwareLink><Link href="/contact" className={secondary}>Contact our team</Link></div></div>
    </section>
  </div>;
}
