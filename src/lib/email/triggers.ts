// src/lib/email/triggers.ts
// PRD §10 — Email trigger functions wired to application events

import { sendEmail } from './client';
import {
    purchaseCompletedEmail,
    importCompletedEmail,
    importFailedEmail,
    productPublishedEmail,
    refundProcessedEmail,
} from './templates';

/**
 * Trigger: Purchase completed
 * Called from Stripe webhook after checkout.session.completed
 */
export async function triggerPurchaseEmail(params: {
    buyerEmail: string;
    buyerName: string;
    productTitle: string;
    creatorName: string;
}) {
    const { subject, html } = purchaseCompletedEmail(params);
    return sendEmail({ to: params.buyerEmail, subject, html });
}

/**
 * Trigger: Import completed
 * Called from import orchestrator on success
 */
export async function triggerImportCompletedEmail(params: {
    creatorEmail: string;
    creatorName: string;
    videoCount: number;
}) {
    const { subject, html } = importCompletedEmail(params);
    return sendEmail({ to: params.creatorEmail, subject, html });
}

/**
 * Trigger: Import failed
 * Called from import orchestrator on error
 */
export async function triggerImportFailedEmail(params: {
    creatorEmail: string;
    creatorName: string;
    errorMessage: string;
}) {
    const { subject, html } = importFailedEmail(params);
    return sendEmail({ to: params.creatorEmail, subject, html });
}

/**
 * Trigger: Product published
 * Called from publish API route
 */
export async function triggerProductPublishedEmail(params: {
    creatorEmail: string;
    creatorName: string;
    productTitle: string;
    hubUrl: string;
    productUrl: string;
}) {
    const { subject, html } = productPublishedEmail(params);
    return sendEmail({ to: params.creatorEmail, subject, html });
}

/**
 * Trigger: Refund processed
 * Called from Stripe webhook after charge.refunded
 */
export async function triggerRefundEmail(params: {
    buyerEmail: string;
    buyerName: string;
    productTitle: string;
    amountFormatted: string;
}) {
    const { subject, html } = refundProcessedEmail(params);
    return sendEmail({ to: params.buyerEmail, subject, html });
}
