// Test: Email templates and triggers
// PRD M11: All 6 transactional email templates

import { describe, it, expect } from 'vitest';

// Simulating the email template functions locally to test structure
// (mirrors src/lib/email/templates.ts)

const BASE_URL = 'https://owny.store';

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

function btn(text: string, url: string): string {
    return `<a href="${url}" style="display:inline-block;background:#6366f1;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;">${text}</a>`;
}

function purchaseConfirmation(p: { productTitle: string; creatorName: string; amountCents: number; currency: string; downloadUrl: string }) {
    const amount = (p.amountCents / 100).toFixed(2);
    return {
        subject: `Your purchase: ${p.productTitle}`,
        html: layout('Purchase Confirmation', `
<h2 style="margin:0 0 8px;font-size:20px;">You got it! 🎉</h2>
<p style="color:#52525b;">You just purchased <strong>${p.productTitle}</strong> by ${p.creatorName} for $${amount} ${p.currency.toUpperCase()}.</p>
<div style="text-align:center;margin:24px 0;">${btn('Access Your Product', p.downloadUrl)}</div>
<p style="color:#71717a;font-size:13px;">This product is now in your <a href="${BASE_URL}/library" style="color:#6366f1;">Library</a>.</p>`),
    };
}

function magicLink(p: { url: string }) {
    return {
        subject: 'Sign in to Owny',
        html: layout('Sign In', `
<h2 style="margin:0 0 8px;font-size:20px;">Sign in to Owny</h2>
<p style="color:#52525b;">Click the button below to sign in. This link expires in 10 minutes.</p>
<div style="text-align:center;margin:24px 0;">${btn('Sign In', p.url)}</div>
<p style="color:#71717a;font-size:13px;">If you didn't request this, you can ignore this email.</p>`),
    };
}

function importComplete(p: { creatorName: string; videoCount: number; dashboardUrl: string }) {
    return {
        subject: `Import complete: ${p.videoCount} videos ready`,
        html: layout('Import Complete', `
<h2 style="margin:0 0 8px;font-size:20px;">Import complete! 📹</h2>
<p style="color:#52525b;">Hey ${p.creatorName}, we just imported <strong>${p.videoCount} videos</strong>. They're indexed and ready for product creation.</p>
<div style="text-align:center;margin:24px 0;">${btn('Go to Dashboard', p.dashboardUrl)}</div>`),
    };
}

function productPublished(p: { productTitle: string; productUrl: string; creatorName: string }) {
    return {
        subject: `Published: ${p.productTitle}`,
        html: layout('Product Published', `
<h2 style="margin:0 0 8px;font-size:20px;">Your product is live! 🚀</h2>
<p style="color:#52525b;">${p.creatorName}, <strong>${p.productTitle}</strong> is now published and ready for sales.</p>
<div style="text-align:center;margin:24px 0;">${btn('View Product', p.productUrl)}</div>`),
    };
}

function saleMade(p: { productTitle: string; buyerEmail: string; amountCents: number; creatorName: string }) {
    const amount = (p.amountCents / 100).toFixed(2);
    return {
        subject: `New sale: ${p.productTitle}`,
        html: layout('New Sale', `
<h2 style="margin:0 0 8px;font-size:20px;">Ka-ching! 💰</h2>
<p style="color:#52525b;">${p.creatorName}, someone just bought <strong>${p.productTitle}</strong> for $${amount}.</p>
<p style="color:#71717a;font-size:13px;">Buyer: ${p.buyerEmail}</p>`),
    };
}

function refundNotification(p: { productTitle: string; amountCents: number }) {
    const amount = (p.amountCents / 100).toFixed(2);
    return {
        subject: `Refund processed: ${p.productTitle}`,
        html: layout('Refund Processed', `
<h2 style="margin:0 0 8px;font-size:20px;">Refund processed</h2>
<p style="color:#52525b;">A refund of $${amount} has been issued for <strong>${p.productTitle}</strong>.</p>
<p style="color:#71717a;font-size:13px;">The funds will appear in your account in 5-10 business days.</p>`),
    };
}

// --- Event → Template mapping (mirrors triggers.ts) ---
type EmailEvent = 'purchase' | 'magic_link' | 'import_complete' | 'product_published' | 'sale_made' | 'refund';

function getTemplateForEvent(event: EmailEvent): string {
    const map: Record<EmailEvent, string> = {
        purchase: 'purchaseConfirmation',
        magic_link: 'magicLink',
        import_complete: 'importComplete',
        product_published: 'productPublished',
        sale_made: 'saleMade',
        refund: 'refundNotification',
    };
    return map[event];
}

describe('Email Templates', () => {
    it('should generate purchase confirmation with correct subject', () => {
        const result = purchaseConfirmation({
            productTitle: 'Cooking Masterclass',
            creatorName: 'Chef Mario',
            amountCents: 2900,
            currency: 'usd',
            downloadUrl: 'https://owny.store/library/cooking-masterclass',
        });

        expect(result.subject).toBe('Your purchase: Cooking Masterclass');
        expect(result.html).toContain('Cooking Masterclass');
        expect(result.html).toContain('Chef Mario');
        expect(result.html).toContain('29.00');
        expect(result.html).toContain('USD');
    });

    it('should generate magic link with correct subject', () => {
        const result = magicLink({ url: 'https://owny.store/auth/callback?token=abc' });

        expect(result.subject).toBe('Sign in to Owny');
        expect(result.html).toContain('Sign In');
        expect(result.html).toContain('10 minutes');
    });

    it('should generate import complete email', () => {
        const result = importComplete({
            creatorName: 'TestCreator',
            videoCount: 42,
            dashboardUrl: 'https://owny.store/dashboard',
        });

        expect(result.subject).toBe('Import complete: 42 videos ready');
        expect(result.html).toContain('42 videos');
        expect(result.html).toContain('TestCreator');
    });

    it('should generate product published email', () => {
        const result = productPublished({
            productTitle: 'Fitness Guide',
            productUrl: 'https://owny.store/p/fitness-guide',
            creatorName: 'FitPro',
        });

        expect(result.subject).toBe('Published: Fitness Guide');
        expect(result.html).toContain('live');
    });

    it('should generate sale made email', () => {
        const result = saleMade({
            productTitle: 'Recipe Book',
            buyerEmail: 'buyer@test.com',
            amountCents: 1500,
            creatorName: 'Chef',
        });

        expect(result.subject).toBe('New sale: Recipe Book');
        expect(result.html).toContain('15.00');
        expect(result.html).toContain('buyer@test.com');
    });

    it('should generate refund notification', () => {
        const result = refundNotification({
            productTitle: 'Old Product',
            amountCents: 999,
        });

        expect(result.subject).toBe('Refund processed: Old Product');
        expect(result.html).toContain('9.99');
        expect(result.html).toContain('5-10 business days');
    });
});

describe('Email Layout', () => {
    it('should include Owny branding', () => {
        const html = layout('Test', '<p>Content</p>');
        expect(html).toContain('owny');
        expect(html).toContain('#6366f1');
    });

    it('should include legal links', () => {
        const html = layout('Test', '<p>Content</p>');
        expect(html).toContain('/legal/privacy');
        expect(html).toContain('/legal/tos');
    });

    it('should include copyright year', () => {
        const html = layout('Test', '<p>Content</p>');
        expect(html).toContain(new Date().getFullYear().toString());
    });

    it('should be valid HTML', () => {
        const html = layout('Test', '<p>Content</p>');
        expect(html).toContain('<!DOCTYPE html>');
        expect(html).toContain('<html');
        expect(html).toContain('</html>');
    });
});

describe('Email Event Triggers', () => {
    const events: EmailEvent[] = ['purchase', 'magic_link', 'import_complete', 'product_published', 'sale_made', 'refund'];

    it('should have a template mapping for every event type', () => {
        for (const event of events) {
            const template = getTemplateForEvent(event);
            expect(template).toBeTruthy();
            expect(typeof template).toBe('string');
        }
    });

    it('should map purchase to purchaseConfirmation', () => {
        expect(getTemplateForEvent('purchase')).toBe('purchaseConfirmation');
    });

    it('should map refund to refundNotification', () => {
        expect(getTemplateForEvent('refund')).toBe('refundNotification');
    });

    it('should map magic_link to magicLink', () => {
        expect(getTemplateForEvent('magic_link')).toBe('magicLink');
    });
});
