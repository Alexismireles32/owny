// src/lib/email/client.ts
// PRD §10 — Resend email client + sender utility

import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY || '');

const FROM_EMAIL = process.env.EMAIL_FROM || 'Owny <noreply@owny.store>';

interface SendEmailOptions {
    to: string;
    subject: string;
    html: string;
    replyTo?: string;
}

export async function sendEmail({ to, subject, html, replyTo }: SendEmailOptions) {
    try {
        const { data, error } = await resend.emails.send({
            from: FROM_EMAIL,
            to,
            subject,
            html,
            replyTo,
        });

        if (error) {
            console.error('Email send error:', error);
            return { success: false, error };
        }

        return { success: true, id: data?.id };
    } catch (err) {
        console.error('Email exception:', err);
        return { success: false, error: err };
    }
}
