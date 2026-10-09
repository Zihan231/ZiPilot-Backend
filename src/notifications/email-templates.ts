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

const URGENCY_COLOR: Record<ReminderItem['urgency'], { bg: string; fg: string }> = {
  today: { bg: '#fdecec', fg: '#b91c1c' },
  tomorrow: { bg: '#fff0e6', fg: '#c2410c' },
  soon: { bg: '#fff6e0', fg: '#b45309' },
  custom: { bg: '#eef0ff', fg: '#4338ca' },
};

function shell(title: string, intro: string, body: string, appUrl: string) {
  return `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title></head>
<body style="margin:0;background:#f3f5fa;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#0f172a">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f5fa;padding:24px 12px">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px">
        <tr><td style="background:linear-gradient(120deg,#1e1b4b,#4338ca);background-color:#312e81;border-radius:16px 16px 0 0;padding:24px 28px">
          <div style="font-size:18px;font-weight:800;color:#ffffff;letter-spacing:-0.3px">Zi<span style="color:#a5b4fc">Pilot</span></div>
          <div style="margin-top:14px;font-size:22px;font-weight:700;color:#ffffff">${esc(title)}</div>
          <div style="margin-top:6px;font-size:14px;line-height:1.5;color:#c7d2fe">${intro}</div>
        </td></tr>
        <tr><td style="background:#ffffff;padding:20px 28px 8px;border-left:1px solid #e4e8f0;border-right:1px solid #e4e8f0">${body}</td></tr>
        <tr><td style="background:#ffffff;padding:8px 28px 28px;border:1px solid #e4e8f0;border-top:0;border-radius:0 0 16px 16px">
          <a href="${appUrl}/wishlist" style="display:inline-block;background:#4f46e5;color:#ffffff;text-decoration:none;font-weight:600;font-size:14px;padding:11px 18px;border-radius:10px">Open my wishlist</a>
        </td></tr>
        <tr><td style="padding:16px 8px;text-align:center;font-size:12px;color:#64748b">
          You get this because a wishlist deadline is approaching in ZiPilot. Reminders go out once per job, 3 days and 1 day before the deadline.
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

export function reminderEmail(name: string, items: ReminderItem[], appUrl: string) {
  const urgent = items.filter((i) => i.urgency === 'today' || i.urgency === 'tomorrow').length;
  const subject =
    items.length === 1
      ? `⏰ ${items[0].company} — ${items[0].whenLabel.toLowerCase()}: apply for ${items[0].position}`
      : `⏰ ${items.length} wishlist deadlines coming up${urgent ? ` (${urgent} due within a day)` : ''}`;

  const rows = items
    .map((i) => {
      const c = URGENCY_COLOR[i.urgency];
      return `<tr>
        <td style="padding:14px 0;border-bottom:1px solid #eef1f6">
          <div style="font-size:15px;font-weight:700;color:#0f172a">${esc(i.company)}</div>
          <div style="font-size:13px;color:#475569;margin-top:2px">${esc(i.position)} · ${esc(i.priority)} priority</div>
          <div style="font-size:12px;color:#64748b;margin-top:4px">Deadline: ${esc(i.deadlineLabel)}</div>
        </td>
        <td align="right" style="padding:14px 0;border-bottom:1px solid #eef1f6;white-space:nowrap;vertical-align:top">
          <span style="display:inline-block;background:${c.bg};color:${c.fg};font-size:12px;font-weight:700;padding:4px 10px;border-radius:999px">${esc(i.whenLabel)}</span>
          <div style="margin-top:8px;font-size:12px">
            ${i.jobUrl ? `<a href="${esc(i.jobUrl)}" style="color:#4f46e5;font-weight:600;text-decoration:none">Apply now →</a>` : `<a href="${appUrl}/wishlist/${i.id}" style="color:#4f46e5;font-weight:600;text-decoration:none">View job →</a>`}
          </div>
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

export function testEmail(name: string, appUrl: string, scheduleLabel: string) {
  const body = `<p style="font-size:14px;line-height:1.6;color:#334155;margin:0 0 12px">Email delivery is working. You will receive wishlist deadline reminders <b>${esc(scheduleLabel)}</b>:</p>
  <ul style="font-size:14px;line-height:1.8;color:#334155;margin:0 0 12px;padding-left:20px">
    <li>3 days before a deadline</li>
    <li>1 day before a deadline</li>
    <li>On any “Remind me on” date you set</li>
  </ul>`;
  return {
    subject: '✅ ZiPilot email reminders are set up',
    html: shell('Email reminders are working', `Hi ${esc(name)}, this is a test from ZiPilot.`, body, appUrl),
    text: `Hi ${name}, ZiPilot email delivery works. Wishlist deadline reminders are sent ${scheduleLabel}: 3 days before, 1 day before, and on any custom reminder date.`,
  };
}
