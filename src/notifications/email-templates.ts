const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

export interface ReminderItem {
  id: string;
  company: string;
  position: string;
  deadlineLabel: string;
  urgency: 'today' | 'tomorrow' | 'soon' | 'custom';
  whenLabel: string;
  priority: string;
  jobUrl: string | null;
}

/** Badge colours: dark text on a light tint, which every client's dark mode inverts legibly. */
const URGENCY_COLOR: Record<ReminderItem['urgency'], { bg: string; fg: string }> = {
  today: { bg: '#fdecec', fg: '#b91c1c' },
  tomorrow: { bg: '#fff0e6', fg: '#c2410c' },
  soon: { bg: '#fff6e0', fg: '#b45309' },
  custom: { bg: '#eef0ff', fg: '#4338ca' },
};

/**
 * Email layout: dark brand header + white content card.
 *
 * Dark-mode handling:
 * - Gmail (iOS/Android) re-colours text in dark mode and would flip the header's white text to
 *   black on the navy background. Every light-coloured header text is wrapped in Gmail's
 *   blend-mode trick (`u + .body .gmail-screen > .gmail-diff`), which forces it to render white.
 * - `color-scheme` meta + `prefers-color-scheme` / `[data-ogsc]` styles give Apple Mail, iOS Mail
 *   and Outlook a hand-tuned dark palette for the white card instead of automatic inversion.
 */
const lightText = (text: string, style: string) =>
  `<div class="gmail-screen"><div class="gmail-diff" style="${style}">${text}</div></div>`;

function shell(title: string, intro: string, body: string, appUrl: string) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light dark">
<meta name="supported-color-schemes" content="light dark">
<title>${esc(title)}</title>
<style>
  :root { color-scheme: light dark; supported-color-schemes: light dark; }
  /* Gmail dark mode: keep light text light (screen + difference blend undoes Gmail's inversion) */
  u + .body .gmail-screen { background: #000; mix-blend-mode: screen; }
  u + .body .gmail-diff { background: #000; mix-blend-mode: difference; }
  @media (prefers-color-scheme: dark) {
    .bg-page { background: #0b1020 !important; }
    .bg-card { background: #121a2e !important; border-color: #26304d !important; }
    .t-strong { color: #eef1f8 !important; }
    .t-body { color: #b6c0d6 !important; }
    .t-muted { color: #8b97b0 !important; }
    .t-brand { color: #a5b4fc !important; }
    .divider { border-color: #26304d !important; }
    .b-today { background: #3a1518 !important; color: #fca5a5 !important; }
    .b-tomorrow { background: #3a2010 !important; color: #fdba74 !important; }
    .b-soon { background: #33270e !important; color: #fcd34d !important; }
    .b-custom { background: #1f1d4a !important; color: #a5b4fc !important; }
  }
  [data-ogsc] .t-strong { color: #eef1f8 !important; }
  [data-ogsc] .t-body { color: #b6c0d6 !important; }
  [data-ogsc] .t-muted { color: #8b97b0 !important; }
  [data-ogsc] .t-brand { color: #a5b4fc !important; }
</style>
</head>
<body class="body bg-page" style="margin:0;padding:0;background:#f3f5fa;font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#0f172a">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" class="bg-page" bgcolor="#f3f5fa" style="background:#f3f5fa;padding:24px 12px">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px">
        <tr><td bgcolor="#312e81" style="background-color:#312e81;background-image:linear-gradient(120deg,#1e1b4b,#4338ca);border-radius:16px 16px 0 0;padding:24px 28px">
          <table role="presentation" cellpadding="0" cellspacing="0"><tr>
            <td>${lightText('Zi', 'color:#ffffff;font-size:18px;font-weight:800;letter-spacing:-0.3px')}</td>
            <td>${lightText('Pilot', 'color:#c7d2fe;font-size:18px;font-weight:800;letter-spacing:-0.3px')}</td>
          </tr></table>
          <div style="margin-top:14px">${lightText(esc(title), 'color:#ffffff;font-size:22px;line-height:1.3;font-weight:700')}</div>
          <div style="margin-top:6px">${lightText(intro, 'color:#e0e7ff;font-size:14px;line-height:1.5')}</div>
        </td></tr>
        <tr><td class="bg-card" bgcolor="#ffffff" style="background:#ffffff;padding:20px 28px 8px;border-left:1px solid #e4e8f0;border-right:1px solid #e4e8f0">${body}</td></tr>
        <tr><td class="bg-card" bgcolor="#ffffff" style="background:#ffffff;padding:8px 28px 28px;border:1px solid #e4e8f0;border-top:0;border-radius:0 0 16px 16px">
          <table role="presentation" cellpadding="0" cellspacing="0"><tr>
            <td bgcolor="#4f46e5" style="background:#4f46e5;border-radius:10px">
              <a href="${appUrl}/wishlist" style="display:inline-block;padding:11px 18px;text-decoration:none;font-weight:600;font-size:14px">
                <span class="gmail-screen"><span class="gmail-diff" style="color:#ffffff">Open my wishlist</span></span>
              </a>
            </td>
          </tr></table>
        </td></tr>
        <tr><td class="t-muted" style="padding:16px 8px;text-align:center;font-size:12px;line-height:1.5;color:#64748b">
          You get this because a wishlist deadline is approaching in ZiPilot. Reminders go out once per job, 3 days and 1 day before the deadline.
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

export function reminderEmail(name: string, items: ReminderItem[], appUrl: string) {
  const urgent = items.filter((i) => i.urgency === 'today' || i.urgency === 'tomorrow').length;
  const subject =
    items.length === 1
      ? `${items[0].company} — ${items[0].whenLabel.toLowerCase()}: apply for ${items[0].position}`
      : `${items.length} wishlist deadlines coming up${urgent ? ` (${urgent} due within a day)` : ''}`;

  const rows = items
    .map((i, idx) => {
      const c = URGENCY_COLOR[i.urgency];
      const border = idx === items.length - 1 ? '' : 'border-bottom:1px solid #eef1f6;';
      const link = i.jobUrl
        ? `<a href="${esc(i.jobUrl)}" class="t-brand" style="color:#4f46e5;font-weight:600;text-decoration:none">Apply now &rarr;</a>`
        : `<a href="${appUrl}/wishlist/${i.id}" class="t-brand" style="color:#4f46e5;font-weight:600;text-decoration:none">View job &rarr;</a>`;
      return `<tr>
        <td class="divider" style="padding:14px 0;${border}vertical-align:top">
          <div class="t-strong" style="font-size:15px;font-weight:700;color:#0f172a">${esc(i.company)}</div>
          <div class="t-body" style="font-size:13px;color:#475569;margin-top:2px">${esc(i.position)} &middot; ${esc(i.priority)} priority</div>
          <div class="t-muted" style="font-size:12px;color:#64748b;margin-top:4px">Deadline: ${esc(i.deadlineLabel)}</div>
        </td>
        <td class="divider" align="right" style="padding:14px 0;${border}white-space:nowrap;vertical-align:top">
          <span class="b-${i.urgency}" style="display:inline-block;background:${c.bg};color:${c.fg};font-size:12px;font-weight:700;padding:4px 10px;border-radius:999px">${esc(i.whenLabel)}</span>
          <div style="margin-top:8px;font-size:12px">${link}</div>
        </td>
      </tr>`;
    })
    .join('');

  const intro = `Hi ${esc(name)}, ${items.length === 1 ? 'a job on your wishlist is' : `${items.length} jobs on your wishlist are`} closing soon. Apply before the deadline passes.`;
  const html = shell('Wishlist deadlines approaching', intro, `<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rows}</table>`, appUrl);
  const text = [
    `Hi ${name}, these wishlist deadlines are approaching:`,
    '',
    ...items.map((i) => `• ${i.company} — ${i.position} (${i.whenLabel}, deadline ${i.deadlineLabel})${i.jobUrl ? `\n  ${i.jobUrl}` : ''}`),
    '',
    `Open your wishlist: ${appUrl}/wishlist`,
  ].join('\n');
  return { subject, html, text };
}
