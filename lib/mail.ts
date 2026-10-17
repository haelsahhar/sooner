import nodemailer from "nodemailer";

export const siteUrl = () => (process.env.SITE_URL ?? "http://localhost:3000").replace(/\/$/, "");

export async function sendMail(opts: { to: string; subject: string; text: string; html: string }) {
  const user = process.env.GMAIL_USER;
  const pass = process.env.GMAIL_APP_PASSWORD;
  if (!user || !pass) throw new Error("GMAIL_USER / GMAIL_APP_PASSWORD are not set");

  const transport = nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 465,
    secure: true,
    auth: { user, pass },
  });
  await transport.sendMail({ from: `Sooner <${user}>`, ...opts });
}

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export function emailHtml(heading: string, paragraphs: string[], button?: { url: string; label: string }) {
  return `<div style="font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#13201E">
<h2 style="margin:0 0 16px;font-size:20px">${esc(heading)}</h2>
${paragraphs.map((p) => `<p style="margin:0 0 14px;font-size:15px;line-height:1.5">${esc(p)}</p>`).join("\n")}
${
  button
    ? `<p style="margin:22px 0"><a href="${esc(button.url)}" style="background:#0F766E;color:#fff;text-decoration:none;padding:12px 22px;border-radius:999px;font-weight:600;font-size:15px;display:inline-block">${esc(button.label)}</a></p>`
    : ""
}
</div>`;
}
