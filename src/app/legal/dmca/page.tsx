// Legal pages: DMCA Policy
import { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
    title: 'DMCA Policy — Owny',
    description: 'Owny DMCA Takedown Policy',
};

export default function DMCAPolicy() {
    return (
        <div className="min-h-screen bg-slate-50 py-16 px-4">
            <div className="max-w-3xl mx-auto">
                <Link href="/" className="text-indigo-500 hover:text-indigo-600 text-sm mb-8 block">← Back to Owny</Link>
                <h1 className="text-3xl font-bold mb-2">DMCA Takedown Policy</h1>
                <p className="text-sm text-muted-foreground mb-8">Last updated: February 2026</p>

                <div className="prose prose-slate max-w-none space-y-6">
                    <section>
                        <h2 className="text-xl font-semibold">Overview</h2>
                        <p>Owny respects the intellectual property rights of others and complies with the Digital Millennium Copyright Act (DMCA).</p>
                    </section>

                    <section>
                        <h2 className="text-xl font-semibold">Filing a DMCA Notice</h2>
                        <p>If you believe content on Owny infringes your copyright, send a notice to <a href="mailto:dmca@owny.store" className="text-indigo-500">dmca@owny.store</a> including:</p>
                        <ul className="list-disc pl-5 space-y-2">
                            <li>Identification of the copyrighted work</li>
                            <li>Identification of the infringing material with URL</li>
                            <li>Your contact information</li>
                            <li>A statement of good faith belief</li>
                            <li>A statement of accuracy under penalty of perjury</li>
                            <li>Your physical or electronic signature</li>
                        </ul>
                    </section>

                    <section>
                        <h2 className="text-xl font-semibold">Counter-Notice</h2>
                        <p>If you believe your content was wrongly removed, you may file a counter-notice with the same information plus a statement consenting to jurisdiction.</p>
                    </section>

                    <section>
                        <h2 className="text-xl font-semibold">Repeat Infringers</h2>
                        <p>Owny maintains a policy of terminating accounts of users who are repeat infringers.</p>
                    </section>
                </div>
            </div>
        </div>
    );
}
