// Legal pages: Terms of Service
import { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
    title: 'Terms of Service — Owny',
    description: 'Owny Terms of Service',
};

export default function TermsOfService() {
    return (
        <div className="min-h-screen bg-slate-50 py-16 px-4">
            <div className="max-w-3xl mx-auto">
                <Link href="/" className="text-indigo-500 hover:text-indigo-600 text-sm mb-8 block">← Back to Owny</Link>
                <h1 className="text-3xl font-bold mb-2">Terms of Service</h1>
                <p className="text-sm text-muted-foreground mb-8">Last updated: February 2026</p>

                <div className="prose prose-slate max-w-none space-y-6">
                    <section>
                        <h2 className="text-xl font-semibold">1. Acceptance of Terms</h2>
                        <p>By accessing or using Owny (&quot;the Platform&quot;), you agree to be bound by these Terms of Service. If you do not agree, you may not use the Platform.</p>
                    </section>

                    <section>
                        <h2 className="text-xl font-semibold">2. Description of Service</h2>
                        <p>Owny enables social media creators to transform their existing video content into digital products (guides, courses, checklists, challenges) using AI, and sell them to buyers through the Platform.</p>
                    </section>

                    <section>
                        <h2 className="text-xl font-semibold">3. Creator Responsibilities</h2>
                        <p>Creators are responsible for ensuring they own or have rights to all content imported to the Platform. Creators must comply with all applicable laws regarding their content and products.</p>
                    </section>

                    <section>
                        <h2 className="text-xl font-semibold">4. Buyer Rights</h2>
                        <p>Upon purchase, buyers receive a non-transferable, non-exclusive license to access the digital product for personal use. Products may not be redistributed, resold, or shared.</p>
                    </section>

                    <section>
                        <h2 className="text-xl font-semibold">5. Payments and Fees</h2>
                        <p>Payments are processed through Stripe. The Platform charges a 10% service fee on each transaction. Creators receive the remaining 90% through Stripe Connect.</p>
                    </section>

                    <section>
                        <h2 className="text-xl font-semibold">6. Intellectual Property</h2>
                        <p>Creators retain ownership of their content. By using the Platform, creators grant Owny a limited license to display, distribute, and process their content as necessary to provide the service.</p>
                    </section>

                    <section>
                        <h2 className="text-xl font-semibold">7. Prohibited Content</h2>
                        <p>Content that is illegal, harmful, threatening, defamatory, infringing, or otherwise objectionable is prohibited and may be removed without notice.</p>
                    </section>

                    <section>
                        <h2 className="text-xl font-semibold">8. Limitation of Liability</h2>
                        <p>The Platform is provided &quot;as is&quot; without warranties of any kind. Owny shall not be liable for any indirect, incidental, or consequential damages.</p>
                    </section>

                    <section>
                        <h2 className="text-xl font-semibold">9. Contact</h2>
                        <p>For questions about these Terms, contact us at <a href="mailto:legal@owny.store" className="text-indigo-500">legal@owny.store</a>.</p>
                    </section>
                </div>
            </div>
        </div>
    );
}
