// Legal pages: Refund Policy
import { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
    title: 'Refund Policy — Owny',
    description: 'Owny Refund Policy',
};

export default function RefundPolicy() {
    return (
        <div className="min-h-screen bg-slate-50 py-16 px-4">
            <div className="max-w-3xl mx-auto">
                <Link href="/" className="text-indigo-500 hover:text-indigo-600 text-sm mb-8 block">← Back to Owny</Link>
                <h1 className="text-3xl font-bold mb-2">Refund Policy</h1>
                <p className="text-sm text-muted-foreground mb-8">Last updated: February 2026</p>

                <div className="prose prose-slate max-w-none space-y-6">
                    <section>
                        <h2 className="text-xl font-semibold">Digital Products</h2>
                        <p>Due to the digital nature of products sold on Owny, all sales are generally final. However, we want you to be satisfied with your purchase.</p>
                    </section>

                    <section>
                        <h2 className="text-xl font-semibold">When Refunds Are Available</h2>
                        <ul className="list-disc pl-5 space-y-2">
                            <li>The product is materially different from its description</li>
                            <li>Technical issues prevent you from accessing the content</li>
                            <li>Duplicate or accidental purchases</li>
                        </ul>
                    </section>

                    <section>
                        <h2 className="text-xl font-semibold">Refund Process</h2>
                        <p>Refund requests must be submitted within 14 days of purchase. Upon approval, refunds are processed through Stripe and typically appear within 5-10 business days. Access to the refunded product will be revoked.</p>
                    </section>

                    <section>
                        <h2 className="text-xl font-semibold">Contact</h2>
                        <p>To request a refund, email <a href="mailto:support@owny.store" className="text-indigo-500">support@owny.store</a> with your order details.</p>
                    </section>
                </div>
            </div>
        </div>
    );
}
