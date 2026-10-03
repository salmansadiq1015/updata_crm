/**
 * Premium lead-outreach email templates — data for migration
 * 007_premium_email_templates.
 *
 * Six production-ready templates, each in English (`en`) and German (`de`).
 * Every `bodyHtml` is a self-contained, email-client-safe document: table-based
 * layout, INLINE styles only (no <style> block, no external CSS, no <script>),
 * a centred ~600px container that collapses fluidly on mobile, a bulletproof
 * CTA button, and adequate padding with font sizes >= 14px.
 *
 * Placeholders use ONLY the allowlist resolved by emailTemplate.service.render():
 *   {{businessName}} {{contactName}} {{businessType}} {{city}} {{address}}
 *   {{website}} {{phone}} {{email}}
 *   {{senderName}} {{senderTitle}} {{senderEmail}} {{companyName}}
 * Any unresolved allowlisted token renders as an empty string, so no raw
 * {{var}} ever reaches the recipient.
 */

// CI palette (mirrors ciConfiguration.model.js defaults) — all AA-contrast safe.
const COLORS = {
  primary: '#1B3F8B', // header band + button (white text => ~8:1 contrast)
  accent: '#D4002A', // thin divider + highlight rule
  ink: '#1A1A1A', // body text
  muted: '#6B7280', // secondary / footer text
  border: '#E5E7EB', // card + divider borders
  panel: '#F3F4F6', // highlight box + footer background
  page: '#EEF1F6', // outer page background
};

const FONT = "Arial, 'Helvetica Neue', Helvetica, sans-serif";

function stripTags(value) {
  return String(value || '')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&bull;/g, '-')
    .replace(/&amp;/g, '&')
    .replace(/&copy;/g, '(c)');
}

function renderParagraphs(items = []) {
  return items
    .map(
      (text) => `
              <p style="margin:0 0 16px;font-family:${FONT};font-size:16px;line-height:25px;color:${COLORS.ink};">${text}</p>`,
    )
    .join('');
}

function renderHighlight(box) {
  if (!box || (!box.title && !box.text)) return '';
  const title = box.title
    ? `<p style="margin:0 0 6px;font-family:${FONT};font-size:15px;line-height:22px;font-weight:bold;color:${COLORS.ink};">${box.title}</p>`
    : '';
  return `
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:20px 0;">
                <tr>
                  <td style="background-color:${COLORS.panel};border-left:4px solid ${COLORS.accent};border-radius:4px;padding:18px 20px;">
                    ${title}
                    <p style="margin:0;font-family:${FONT};font-size:15px;line-height:23px;color:${COLORS.muted};">${box.text}</p>
                  </td>
                </tr>
              </table>`;
}

function renderButton(label, href) {
  return `
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:4px auto;">
                <tr>
                  <td align="center" bgcolor="${COLORS.primary}" style="border-radius:6px;">
                    <a href="${href}" target="_blank" style="display:inline-block;padding:14px 34px;font-family:${FONT};font-size:16px;line-height:20px;font-weight:bold;color:#ffffff;text-decoration:none;border-radius:6px;">${label}</a>
                  </td>
                </tr>
              </table>`;
}

function buildHtml(lang, c) {
  const href = c.ctaHref || 'mailto:{{senderEmail}}';
  const title = c.title || c.subject;
  return `<!doctype html>
<html lang="${lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="X-UA-Compatible" content="IE=edge">
<title>${title}</title>
</head>
<body style="margin:0;padding:0;background-color:${COLORS.page};">
<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;font-size:1px;line-height:1px;color:${COLORS.page};">${c.preheader}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${COLORS.page};">
  <tr>
    <td align="center" style="padding:28px 12px;">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;background-color:#ffffff;border-radius:10px;overflow:hidden;border:1px solid ${COLORS.border};">
        <tr>
          <td style="background-color:${COLORS.primary};padding:26px 28px;">
            <span style="font-family:${FONT};font-size:22px;line-height:26px;font-weight:bold;color:#ffffff;letter-spacing:0.3px;">{{companyName}}</span>
          </td>
        </tr>
        <tr>
          <td style="height:4px;background-color:${COLORS.accent};font-size:0;line-height:0;">&nbsp;</td>
        </tr>
        <tr>
          <td style="padding:34px 28px 8px;">
            <p style="margin:0 0 10px;font-family:${FONT};font-size:14px;line-height:18px;font-weight:bold;letter-spacing:1.5px;text-transform:uppercase;color:${COLORS.primary};">${c.eyebrow}</p>
            <h1 style="margin:0 0 20px;font-family:${FONT};font-size:25px;line-height:32px;font-weight:bold;color:${COLORS.ink};">${c.heading}</h1>
            <p style="margin:0 0 16px;font-family:${FONT};font-size:16px;line-height:25px;color:${COLORS.ink};">${c.greeting}</p>${renderParagraphs(c.body)}${renderHighlight(c.highlightBox)}
          </td>
        </tr>
        <tr>
          <td align="center" style="padding:8px 28px 32px;">${renderButton(c.ctaLabel, href)}
          </td>
        </tr>
        <tr>
          <td style="padding:0 28px 32px;">
            <p style="margin:0 0 4px;font-family:${FONT};font-size:16px;line-height:24px;color:${COLORS.ink};">${c.signoff}</p>
            <p style="margin:0 0 2px;font-family:${FONT};font-size:16px;line-height:24px;font-weight:bold;color:${COLORS.ink};">{{senderName}}</p>
            <p style="margin:0;font-family:${FONT};font-size:14px;line-height:20px;color:${COLORS.muted};">{{senderTitle}}</p>
          </td>
        </tr>
        <tr>
          <td style="background-color:${COLORS.panel};padding:22px 28px;border-top:1px solid ${COLORS.border};">
            <p style="margin:0 0 4px;font-family:${FONT};font-size:15px;line-height:22px;font-weight:bold;color:${COLORS.ink};">{{companyName}}</p>
            <p style="margin:0;font-family:${FONT};font-size:14px;line-height:21px;color:${COLORS.muted};">{{senderName}} &bull; <a href="mailto:{{senderEmail}}" style="color:${COLORS.primary};text-decoration:none;">{{senderEmail}}</a></p>
          </td>
        </tr>
      </table>
      <p style="margin:16px 0 0;font-family:${FONT};font-size:14px;line-height:20px;color:${COLORS.muted};">&copy; {{companyName}}</p>
    </td>
  </tr>
</table>
</body>
</html>`;
}

function buildText(c) {
  const href = c.ctaHref || 'mailto:{{senderEmail}}';
  const lines = [];
  lines.push('{{companyName}}');
  lines.push('');
  lines.push(c.greeting);
  lines.push('');
  (c.body || []).forEach((p) => {
    lines.push(stripTags(p));
    lines.push('');
  });
  if (c.highlightBox && c.highlightBox.text) {
    const prefix = c.highlightBox.title ? `${stripTags(c.highlightBox.title)}: ` : '';
    lines.push(prefix + stripTags(c.highlightBox.text));
    lines.push('');
  }
  lines.push(`${c.ctaLabel}: ${href.replace(/^mailto:/, '')}`);
  lines.push('');
  lines.push(c.signoff);
  lines.push('{{senderName}}');
  lines.push('{{senderTitle}}');
  lines.push('');
  lines.push('--');
  lines.push('{{companyName}}');
  lines.push('{{senderName}} • {{senderEmail}}');
  return lines.join('\n');
}

// ── Template definitions (content only; HTML/text are built below) ───────────────

const DEFINITIONS = [
  {
    templateType: 'lead-introduction',
    display: 'Professional Introduction',
    en: {
      subject: 'An introduction from {{companyName}}',
      preheader: 'A quick, personal hello from {{companyName}} to {{businessName}}.',
      eyebrow: 'Introduction',
      heading: 'Great to connect with {{businessName}}',
      greeting: 'Hello {{businessName}},',
      body: [
        "My name is {{senderName}}, and I'm reaching out from {{companyName}}. We've been following businesses like yours in {{city}} and are genuinely impressed by your work.",
        'I wanted to introduce myself personally rather than through a generic message. At {{companyName}}, we help organisations in the {{businessType}} space work more efficiently and grow with confidence.',
        "I'd welcome the chance to learn more about {{businessName}} and share how we might support your goals - no pressure, just a short conversation.",
      ],
      highlightBox: {
        title: 'Why reach out now?',
        text: 'A brief, no-obligation chat is often all it takes to uncover where we can add real value for {{businessName}}.',
      },
      ctaLabel: 'Start the conversation',
      signoff: 'Looking forward to connecting,',
    },
    de: {
      subject: 'Eine Vorstellung von {{companyName}}',
      preheader: 'Ein kurzes, persönliches Hallo von {{companyName}} an {{businessName}}.',
      eyebrow: 'Vorstellung',
      heading: 'Schön, {{businessName}} kennenzulernen',
      greeting: 'Guten Tag {{businessName}},',
      body: [
        'Mein Name ist {{senderName}} und ich melde mich von {{companyName}}. Wir verfolgen die Entwicklung von Unternehmen wie Ihrem in {{city}} mit grossem Interesse und sind von Ihrer Arbeit beeindruckt.',
        'Ich wollte mich persönlich vorstellen - nicht über eine Standardnachricht. Bei {{companyName}} unterstützen wir Betriebe im Bereich {{businessType}} dabei, effizienter zu arbeiten und sicher zu wachsen.',
        'Gerne würde ich {{businessName}} näher kennenlernen und aufzeigen, wie wir Ihre Ziele unterstützen können - unverbindlich, in einem kurzen Gespräch.',
      ],
      highlightBox: {
        title: 'Warum jetzt?',
        text: 'Oft genügt ein kurzes, unverbindliches Gespräch, um zu erkennen, wo wir für {{businessName}} echten Mehrwert schaffen können.',
      },
      ctaLabel: 'Gespräch beginnen',
      signoff: 'Mit freundlichen Grüssen,',
    },
  },
  {
    templateType: 'lead-business-proposal',
    display: 'Business Proposal',
    en: {
      subject: 'A tailored proposal for {{businessName}}',
      preheader: 'A clear, tailored proposal for {{businessName}} from {{companyName}}.',
      eyebrow: 'Proposal',
      heading: 'A proposal built around {{businessName}}',
      greeting: 'Hello {{businessName}},',
      body: [
        "Thank you for your interest in working with {{companyName}}. Based on what we understand about {{businessName}} and the {{businessType}} sector, we've outlined how a partnership could deliver measurable results.",
        'Our approach is practical and transparent: clear deliverables, predictable costs, and a dedicated point of contact throughout. We tailor every engagement to the realities of your business - not a one-size-fits-all package.',
        "I'd be glad to walk you through the full proposal and answer any questions. We can adapt the scope and timing to fit your priorities in {{city}}.",
      ],
      highlightBox: {
        title: 'What you can expect',
        text: "A defined plan, honest timelines, and a team that treats {{businessName}}'s success as the measure of our own.",
      },
      ctaLabel: 'Review the proposal',
      signoff: 'Thank you for your consideration,',
    },
    de: {
      subject: 'Ein massgeschneidertes Angebot für {{businessName}}',
      preheader: 'Ein klares, massgeschneidertes Angebot für {{businessName}} von {{companyName}}.',
      eyebrow: 'Angebot',
      heading: 'Ein Vorschlag, zugeschnitten auf {{businessName}}',
      greeting: 'Guten Tag {{businessName}},',
      body: [
        'Vielen Dank für Ihr Interesse an einer Zusammenarbeit mit {{companyName}}. Auf Basis unseres Verständnisses von {{businessName}} und der Branche {{businessType}} haben wir skizziert, wie eine Partnerschaft messbare Ergebnisse bringen kann.',
        'Unser Ansatz ist praxisnah und transparent: klare Leistungen, planbare Kosten und eine feste Ansprechperson. Wir richten jede Zusammenarbeit an den tatsächlichen Bedürfnissen Ihres Unternehmens aus - keine Standardlösung von der Stange.',
        'Gerne erläutere ich Ihnen das vollständige Angebot und beantworte Ihre Fragen. Umfang und Zeitplan passen wir an Ihre Prioritäten in {{city}} an.',
      ],
      highlightBox: {
        title: 'Das dürfen Sie erwarten',
        text: 'Einen klaren Plan, ehrliche Zeitpläne und ein Team, das den Erfolg von {{businessName}} zum eigenen Massstab macht.',
      },
      ctaLabel: 'Angebot ansehen',
      signoff: 'Besten Dank für Ihr Interesse,',
    },
  },
  {
    templateType: 'lead-partnership',
    display: 'Partnership Opportunity',
    en: {
      subject: 'A partnership opportunity for {{businessName}}',
      preheader: 'A genuine partnership opportunity for {{businessName}} from {{companyName}}.',
      eyebrow: 'Partnership',
      heading: "Let's build something together",
      greeting: 'Hello {{businessName}},',
      body: [
        'At {{companyName}}, we believe the best results come from genuine partnerships. We see real potential in working alongside {{businessName}} to serve the {{businessType}} market in {{city}} and beyond.',
        'A partnership with us means shared goals, open communication, and mutual growth. We bring the resources and expertise; you bring the local insight and relationships that make the difference.',
        "I'd love to explore what a collaboration could look like and where our strengths align. Even a short conversation could open up new opportunities for both of us.",
      ],
      highlightBox: {
        title: 'A partnership of equals',
        text: 'We succeed when {{businessName}} succeeds - that principle guides every partnership we build.',
      },
      ctaLabel: 'Explore the partnership',
      signoff: "Here's to what we can build together,",
    },
    de: {
      subject: 'Eine Partnerschaft für {{businessName}}',
      preheader: 'Eine echte Partnerschaft für {{businessName}} von {{companyName}}.',
      eyebrow: 'Partnerschaft',
      heading: 'Lassen Sie uns gemeinsam etwas aufbauen',
      greeting: 'Guten Tag {{businessName}},',
      body: [
        'Bei {{companyName}} sind wir überzeugt: Die besten Ergebnisse entstehen aus echten Partnerschaften. Wir sehen grosses Potenzial in einer Zusammenarbeit mit {{businessName}}, um den Markt {{businessType}} in {{city}} und darüber hinaus zu bedienen.',
        'Eine Partnerschaft mit uns bedeutet gemeinsame Ziele, offene Kommunikation und beidseitiges Wachstum. Wir bringen Ressourcen und Know-how ein; Sie das lokale Wissen und die Beziehungen, die den Unterschied machen.',
        'Gerne möchte ich ausloten, wie eine Zusammenarbeit aussehen könnte und wo sich unsere Stärken ergänzen. Schon ein kurzes Gespräch kann für beide Seiten neue Möglichkeiten eröffnen.',
      ],
      highlightBox: {
        title: 'Partnerschaft auf Augenhöhe',
        text: 'Wir sind erfolgreich, wenn {{businessName}} erfolgreich ist - dieser Grundsatz leitet jede Partnerschaft, die wir eingehen.',
      },
      ctaLabel: 'Partnerschaft entdecken',
      signoff: 'Auf eine erfolgreiche Zusammenarbeit,',
    },
  },
  {
    templateType: 'lead-follow-up',
    display: 'Follow-Up',
    en: {
      subject: 'Following up with {{businessName}}',
      preheader: 'A friendly follow-up from {{companyName}} to {{businessName}}.',
      eyebrow: 'Follow-up',
      heading: 'Just checking back in',
      greeting: 'Hello {{businessName}},',
      body: [
        "I wanted to follow up on my previous message to {{businessName}}. I know how busy things can get, so I'll keep this brief.",
        "I still believe there's a strong fit between what {{companyName}} offers and the goals of a {{businessType}} business like yours in {{city}}. If the timing wasn't right before, I'd be happy to reconnect whenever it suits you.",
        "If you have just a few minutes, I'd welcome the chance to answer any questions and see whether it makes sense to take a next step together.",
      ],
      highlightBox: {
        title: 'No rush',
        text: "Whenever the moment is right for {{businessName}}, I'm only a short reply away.",
      },
      ctaLabel: 'Pick up the conversation',
      signoff: 'Thanks again for your time,',
    },
    de: {
      subject: 'Rückmeldung an {{businessName}}',
      preheader: 'Eine freundliche Rückmeldung von {{companyName}} an {{businessName}}.',
      eyebrow: 'Nachfassen',
      heading: 'Eine kurze Rückmeldung',
      greeting: 'Guten Tag {{businessName}},',
      body: [
        'Ich wollte mich nochmals auf meine frühere Nachricht an {{businessName}} beziehen. Ich weiss, wie viel im Alltag zu tun ist, daher fasse ich mich kurz.',
        'Ich bin weiterhin überzeugt, dass das Angebot von {{companyName}} und die Ziele eines Unternehmens im Bereich {{businessType}} wie dem Ihren in {{city}} gut zusammenpassen. Falls der Zeitpunkt zuvor nicht gepasst hat, melde ich mich gerne wieder, wann immer es Ihnen passt.',
        'Wenn Sie ein paar Minuten Zeit haben, beantworte ich gerne Ihre Fragen und wir sehen, ob ein nächster Schritt gemeinsam Sinn ergibt.',
      ],
      highlightBox: {
        title: 'Ganz ohne Eile',
        text: 'Wann immer der Zeitpunkt für {{businessName}} passt - eine kurze Antwort genügt.',
      },
      ctaLabel: 'Gespräch fortsetzen',
      signoff: 'Besten Dank für Ihre Zeit,',
    },
  },
  {
    templateType: 'lead-meeting-request',
    display: 'Meeting Request',
    en: {
      subject: 'Could we find 20 minutes, {{businessName}}?',
      preheader: 'A quick meeting request from {{companyName}} for {{businessName}}.',
      eyebrow: 'Meeting request',
      heading: "Let's find a time to talk",
      greeting: 'Hello {{businessName}},',
      body: [
        "I'd like to request a short meeting with {{businessName}} - around 20 minutes is usually all we need to cover the essentials and see if there's a good fit.",
        "We can meet however suits you best: a quick call, a video session, or in person if you're near {{city}}. I'm happy to work around your schedule.",
        'During our conversation, I will share how {{companyName}} supports businesses in the {{businessType}} sector and listen to what matters most to you right now.',
      ],
      highlightBox: {
        title: 'Flexible and easy',
        text: "Reply with a couple of times that work for {{businessName}}, and I'll confirm right away.",
      },
      ctaLabel: 'Suggest a time',
      signoff: 'Looking forward to speaking,',
    },
    de: {
      subject: 'Finden wir 20 Minuten, {{businessName}}?',
      preheader: 'Eine kurze Terminanfrage von {{companyName}} für {{businessName}}.',
      eyebrow: 'Terminanfrage',
      heading: 'Finden wir einen passenden Termin',
      greeting: 'Guten Tag {{businessName}},',
      body: [
        'Ich möchte gerne einen kurzen Termin mit {{businessName}} vorschlagen - rund 20 Minuten genügen meist, um das Wesentliche zu besprechen und zu sehen, ob es passt.',
        'Wir treffen uns ganz nach Ihrem Wunsch: ein kurzes Telefonat, eine Videokonferenz oder persönlich, falls Sie in der Nähe von {{city}} sind. Ich richte mich gerne nach Ihrem Kalender.',
        'Im Gespräch zeige ich Ihnen, wie {{companyName}} Unternehmen im Bereich {{businessType}} unterstützt - und höre, was Ihnen aktuell am wichtigsten ist.',
      ],
      highlightBox: {
        title: 'Flexibel und unkompliziert',
        text: 'Antworten Sie einfach mit zwei, drei möglichen Zeiten für {{businessName}} - ich bestätige umgehend.',
      },
      ctaLabel: 'Termin vorschlagen',
      signoff: 'Ich freue mich auf das Gespräch,',
    },
  },
  {
    templateType: 'lead-service-introduction',
    display: 'Service Introduction',
    en: {
      subject: 'How {{companyName}} can support {{businessName}}',
      preheader: 'A short introduction to how {{companyName}} can support {{businessName}}.',
      eyebrow: 'Our services',
      heading: 'Services designed for businesses like yours',
      greeting: 'Hello {{businessName}},',
      body: [
        'I wanted to briefly introduce what {{companyName}} does and how it could benefit {{businessName}}. We specialise in helping {{businessType}} businesses run more smoothly and serve their customers better.',
        'From day-to-day efficiency to longer-term growth, our services are built to remove friction and give you more time for what you do best. Everything is tailored to your size, your sector, and your market in {{city}}.',
        "If any of this sounds relevant, I'd be glad to share a few concrete examples of how we've helped similar businesses succeed.",
      ],
      highlightBox: {
        title: 'Built around your needs',
        text: "No bloated packages - just the support {{businessName}} actually needs, when it needs it.",
      },
      ctaLabel: 'See how we can help',
      signoff: 'Warm regards,',
    },
    de: {
      subject: 'Wie {{companyName}} {{businessName}} unterstützen kann',
      preheader: 'Eine kurze Einführung, wie {{companyName}} {{businessName}} unterstützen kann.',
      eyebrow: 'Unsere Leistungen',
      heading: 'Leistungen für Unternehmen wie Ihres',
      greeting: 'Guten Tag {{businessName}},',
      body: [
        'Gerne stelle ich Ihnen kurz vor, was {{companyName}} tut und wie {{businessName}} davon profitieren kann. Wir sind darauf spezialisiert, Unternehmen im Bereich {{businessType}} zu einem reibungsloseren Betrieb und besserem Kundenservice zu verhelfen.',
        'Von der täglichen Effizienz bis zum langfristigen Wachstum: Unsere Leistungen nehmen Ihnen Reibungsverluste ab und schaffen mehr Zeit für das, was Sie am besten können. Alles abgestimmt auf Ihre Grösse, Ihre Branche und Ihren Markt in {{city}}.',
        'Wenn das für Sie relevant klingt, zeige ich Ihnen gerne einige konkrete Beispiele, wie wir ähnlichen Unternehmen zum Erfolg verholfen haben.',
      ],
      highlightBox: {
        title: 'Auf Ihre Bedürfnisse zugeschnitten',
        text: 'Keine überladenen Pakete - nur die Unterstützung, die {{businessName}} wirklich braucht, genau dann, wenn sie gebraucht wird.',
      },
      ctaLabel: 'Erfahren, wie wir helfen',
      signoff: 'Mit freundlichen Grüssen,',
    },
  },
];

// Build the final en/de records (subject + bodyHtml + bodyText) for each template.
const premiumEmailTemplates = DEFINITIONS.map((def) => ({
  templateType: def.templateType,
  display: def.display,
  en: {
    subject: def.en.subject,
    bodyHtml: buildHtml('en', def.en),
    bodyText: buildText(def.en),
  },
  de: {
    subject: def.de.subject,
    bodyHtml: buildHtml('de', def.de),
    bodyText: buildText(def.de),
  },
}));

export default premiumEmailTemplates;
