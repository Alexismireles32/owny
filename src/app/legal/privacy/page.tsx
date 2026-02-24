// Legal pages: Privacy Policy
import { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
    title: 'Privacy Policy — Owny',
    description: 'Owny Privacy Policy',
};

export default function PrivacyPolicy() {
    return (
        <div className="min-h-screen bg-slate-50 py-16 px-4">
            <div className="max-w-3xl mx-auto">
                <Link href="/" className="text-indigo-500 hover:text-indigo-600 text-sm mb-8 block">← Back to Owny</Link>
                <h1 className="text-3xl font-bold mb-2">Privacy Policy</h1>
                <p className="text-sm text-muted-foreground mb-8">Last updated: February 2026</p>

                <div className="prose prose-slate max-w-none space-y-6">
                    <section>
                        <h2 className="text-xl font-semibold">1. Information We Collect</h2>
                        <p>We collect information you provide (name, email, payment details), content you import (video metadata, transcripts), and usage data (pages visited, features used).</p>
                    </section>

                    <section>
                        <h2 className="text-xl font-semibold">2. How We Use Your Information</h2>
                        <p>We use your information to provide the service, process payments, generate AI-powered products, communicate with you, and improve the Platform.</p>
                    </section>

                    <section>
                        <h2 className="text-xl font-semibold">3. AI Processing</h2>
                        <p>Your imported video transcripts are processed by AI models (OpenAI, Anthropic, Moonshot) to generate clip cards, embeddings, and product content. This data is processed per the respective AI providers&apos; data processing terms.</p>
                    </section>

                    <section>
                        <h2 className="text-xl font-semibold">4. Data Sharing</h2>
                        <p>We share data with: Stripe (payments), Supabase (database hosting), AI providers (content processing), Resend (email delivery). We do not sell your personal information.</p>
                    </section>

                    <section>
                        <h2 className="text-xl font-semibold">5. Data Retention</h2>
                        <p>We retain your data for as long as your account is active. You may request deletion of your account and associated data at any time.</p>
                    </section>

                    <section>
                        <h2 className="text-xl font-semibold">6. Security</h2>
                        <p>We implement industry-standard security measures including encryption in transit (TLS), row-level security policies, signed URLs for file access, and secure authentication via Supabase Auth.</p>
                    </section>

                    <section>
                        <h2 className="text-xl font-semibold">7. Your Rights</h2>
                        <p>You have the right to access, correct, or delete your personal data. Contact us at <a href="mailto:privacy@owny.store" className="text-indigo-500">privacy@owny.store</a>.</p>
                    </section>
                </div>
            </div>
        </div>
    );
}
