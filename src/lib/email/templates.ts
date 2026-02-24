// src/lib/email/templates.ts
// PRD §10 — 6 transactional email templates (inline HTML)

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://owny.store';

function layout(title: string, body: string): string {
    return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>${title}</title></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:'Inter',system-ui,sans-serif;">
<div style="max-width:560px;margin:0 auto;padding:32px 16px;">
<div style="background:#fff;border-radius:12px;padding:32px;box-shadow:0 1px 3px rgba(0,0,0,0.08);">
<div style="text-align:center;margin-bottom:24px;">
<span style="font-size:24px;font-weight:800;color:#6366f1;">owny</span>
</div>
${body}
</div>
<p style="text-align:center;font-size:12px;color:#9ca3af;margin-top:16px;">
© ${new Date().getFullYear()} Owny · <a href="${BASE_URL}/legal/privacy" style="color:#9ca3af;">Privacy</a> · <a href="${BASE_URL}/legal/tos" style="color:#9ca3af;">Terms</a>
</p>
</div>
</body>
</html>`;
}

function button(text: string, url: string): string {
    return `<div style="text-align:center;margin:24px 0;">
<a href="${url}" style="display:inline-block;background:#6366f1;color:#fff;padding:12px 32px;border-radius:8px;text-decoration:none;font-weight:600;font-size:15px;">${text}</a>
</div>`;
}

// 1. Purchase completed
export function purchaseCompletedEmail(params: {
    buyerName: string;
    productTitle: string;
    creatorName: string;
}) {
    const subject = `Access Your Purchase — ${params.productTitle}`;
    const body = layout(subject, `
<h1 style="font-size:20px;font-weight:700;color:#1f2937;margin:0 0 8px;">You're in! 🎉</h1>
<p style="color:#4b5563;line-height:1.6;margin:0 0 16px;">
Hey ${params.buyerName || 'there'}, your purchase of <strong>${params.productTitle}</strong> by ${params.creatorName} is confirmed.
</p>
<p style="color:#4b5563;line-height:1.6;">Your content is ready in your library. Dive in now!</p>
${button('Go to My Library', `${BASE_URL}/library`)}
<p style="font-size:13px;color:#9ca3af;margin:0;">If you have any questions, reply to this email.</p>
`);
    return { subject, html: body };
}

// 2. Magic link login
export function magicLinkEmail(params: { loginUrl: string }) {
    const subject = 'Your Owny Login Link';
    const body = layout(subject, `
<h1 style="font-size:20px;font-weight:700;color:#1f2937;margin:0 0 8px;">Sign in to Owny</h1>
<p style="color:#4b5563;line-height:1.6;margin:0 0 16px;">
Click the button below to sign in. This link expires in 15 minutes.
</p>
${button('Sign In', params.loginUrl)}
<p style="font-size:13px;color:#9ca3af;margin:0;">If you didn't request this, you can safely ignore this email.</p>
`);
    return { subject, html: body };
}

// 3. Import completed
export function importCompletedEmail(params: {
    creatorName: string;
    videoCount: number;
}) {
    const subject = `Your library is ready! ${params.videoCount} videos imported`;
    const body = layout(subject, `
<h1 style="font-size:20px;font-weight:700;color:#1f2937;margin:0 0 8px;">Import Complete ✅</h1>
<p style="color:#4b5563;line-height:1.6;margin:0 0 16px;">
Hey ${params.creatorName}, we successfully imported <strong>${params.videoCount} videos</strong> from your TikTok library.
</p>
<p style="color:#4b5563;line-height:1.6;">Your content is indexed and ready for AI product creation.</p>
${button('Create Your First Product', `${BASE_URL}/products/new`)}
`);
    return { subject, html: body };
}

// 4. Import failed
export function importFailedEmail(params: {
    creatorName: string;
    errorMessage: string;
}) {
    const subject = 'Import Issue — Action Needed';
    const body = layout(subject, `
<h1 style="font-size:20px;font-weight:700;color:#1f2937;margin:0 0 8px;">Import Issue ⚠️</h1>
<p style="color:#4b5563;line-height:1.6;margin:0 0 16px;">
Hey ${params.creatorName}, we ran into an issue importing your videos:
</p>
<div style="background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:12px;margin:0 0 16px;">
<p style="color:#991b1b;margin:0;font-size:14px;">${params.errorMessage}</p>
</div>
<p style="color:#4b5563;line-height:1.6;">You can retry the import or upload a CSV file instead.</p>
${button('Retry Import', `${BASE_URL}/import`)}
`);
    return { subject, html: body };
}

// 5. Product published
export function productPublishedEmail(params: {
    creatorName: string;
    productTitle: string;
    hubUrl: string;
    productUrl: string;
}) {
    const subject = `Your product is live! — ${params.productTitle}`;
    const body = layout(subject, `
<h1 style="font-size:20px;font-weight:700;color:#1f2937;margin:0 0 8px;">You're Live! 🚀</h1>
<p style="color:#4b5563;line-height:1.6;margin:0 0 16px;">
Hey ${params.creatorName}, <strong>${params.productTitle}</strong> is now published and available for purchase.
</p>
<p style="color:#4b5563;line-height:1.6;">Share it with your audience:</p>
<div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:12px;margin:0 0 16px;">
<p style="margin:0;font-size:14px;"><strong>Product:</strong> <a href="${params.productUrl}" style="color:#6366f1;">${params.productUrl}</a></p>
<p style="margin:4px 0 0;font-size:14px;"><strong>Hub:</strong> <a href="${params.hubUrl}" style="color:#6366f1;">${params.hubUrl}</a></p>
</div>
${button('View Product', params.productUrl)}
`);
    return { subject, html: body };
}

// 6. Refund processed
export function refundProcessedEmail(params: {
    buyerName: string;
    productTitle: string;
    amountFormatted: string;
}) {
    const subject = `Refund Processed — ${params.productTitle}`;
    const body = layout(subject, `
<h1 style="font-size:20px;font-weight:700;color:#1f2937;margin:0 0 8px;">Refund Confirmed</h1>
<p style="color:#4b5563;line-height:1.6;margin:0 0 16px;">
Hey ${params.buyerName || 'there'}, your refund of <strong>${params.amountFormatted}</strong> for <strong>${params.productTitle}</strong> has been processed.
</p>
<p style="color:#4b5563;line-height:1.6;">
The refund should appear in your account within 5-10 business days depending on your bank.
</p>
<p style="font-size:13px;color:#9ca3af;margin:16px 0 0;">If you have questions, reply to this email.</p>
`);
    return { subject, html: body };
}
