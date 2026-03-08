// Owny.store — Landing Page
// Premium redesign with product demo, social proof, pricing, and FAQ

import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { HandleInput } from '@/components/landing/HandleInput';
import Link from 'next/link';

export default async function Home() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (user) {
    const { data: creator } = await supabase
      .from('creators')
      .select('id')
      .eq('profile_id', user.id)
      .maybeSingle();
    if (creator) redirect('/dashboard');
  }

  return (
    <div className="min-h-screen bg-white text-slate-900 antialiased">
      {/* ── Navbar ── */}
      <header className="sticky top-0 z-30 w-full border-b border-slate-100 bg-white/80 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
          <span className="text-xl font-bold tracking-tight bg-gradient-to-r from-slate-900 to-slate-700 bg-clip-text text-transparent">
            Owny
          </span>
          <div className="flex items-center gap-3">
            <Link
              href="#pricing"
              className="hidden text-sm font-medium text-slate-500 hover:text-slate-900 transition-colors sm:inline"
            >
              Pricing
            </Link>
            <Link
              href="#how-it-works"
              className="hidden text-sm font-medium text-slate-500 hover:text-slate-900 transition-colors sm:inline"
            >
              How it works
            </Link>
            <Link href="/sign-in" className="text-sm font-medium text-slate-600 hover:text-slate-900 transition-colors">
              Sign in
            </Link>
            <Link
              href="/sign-up"
              className="text-sm font-medium px-4 py-2 rounded-xl bg-slate-900 text-white hover:bg-slate-800 transition-colors"
            >
              Get started
            </Link>
          </div>
        </div>
      </header>

      {/* ── Hero ── */}
      <section className="relative overflow-hidden">
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute -left-32 -top-32 h-[400px] w-[400px] rounded-full bg-indigo-100 opacity-40 blur-[100px]" />
          <div className="absolute -right-32 top-20 h-[350px] w-[350px] rounded-full bg-violet-100 opacity-40 blur-[100px]" />
        </div>

        <div className="relative mx-auto max-w-3xl px-6 pb-20 pt-20 text-center sm:pt-28">
          <div className="inline-flex items-center gap-2 rounded-full border border-indigo-200 bg-indigo-50 px-4 py-1.5 text-sm font-medium text-indigo-700">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-indigo-500 animate-pulse" />
            AI-powered product builder for TikTok creators
          </div>

          <h1 className="mt-8 text-5xl font-bold leading-[1.08] tracking-tight text-slate-900 sm:text-6xl lg:text-7xl">
            Turn your videos into{' '}
            <span className="bg-gradient-to-r from-indigo-600 via-violet-600 to-purple-600 bg-clip-text text-transparent">
              revenue
            </span>
          </h1>

          <p className="mx-auto mt-6 max-w-xl text-lg leading-relaxed text-slate-500 sm:text-xl">
            Enter your TikTok username. Our AI analyzes your content and builds premium digital products — guides, courses, challenges, toolkits — ready to sell in minutes.
          </p>

          <div className="mt-10">
            <HandleInput />
          </div>

          <div className="mt-8 flex flex-wrap items-center justify-center gap-x-8 gap-y-3 text-sm text-slate-400">
            <span className="flex items-center gap-2">
              <svg className="h-4 w-4 text-emerald-500" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
              </svg>
              Free to start
            </span>
            <span className="flex items-center gap-2">
              <svg className="h-4 w-4 text-emerald-500" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
              </svg>
              No coding needed
            </span>
            <span className="flex items-center gap-2">
              <svg className="h-4 w-4 text-emerald-500" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
              </svg>
              Sell instantly via Stripe
            </span>
          </div>
        </div>
      </section>

      {/* ── Product Preview ── */}
      <section className="relative border-y border-slate-100 bg-gradient-to-b from-slate-50 to-white py-16 sm:py-20">
        <div className="mx-auto max-w-6xl px-6">
          <p className="text-center text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">What you get</p>
          <h2 className="mt-3 text-center text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
            Four product types, built from your content
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-center text-base text-slate-500 leading-relaxed">
            Each one is grounded in your actual videos — real lessons, real voice, real expertise. Not generic AI copy.
          </p>

          <div className="mt-12 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[
              {
                type: 'PDF Guide',
                desc: 'Premium downloadable guides with chapter rhythm and editorial pacing.',
                accent: 'from-amber-500 to-orange-500',
                bg: 'bg-amber-50',
                icon: '📄',
              },
              {
                type: 'Mini Course',
                desc: 'Structured modules with lesson pacing, teaching blocks, and action steps.',
                accent: 'from-blue-500 to-cyan-500',
                bg: 'bg-blue-50',
                icon: '🎓',
              },
              {
                type: '7-Day Challenge',
                desc: 'Progressive daily tasks with momentum, creator tips, and reflection.',
                accent: 'from-emerald-500 to-teal-500',
                bg: 'bg-emerald-50',
                icon: '🔥',
              },
              {
                type: 'Checklist Toolkit',
                desc: 'Interactive checklists with categories, progress tracking, and context.',
                accent: 'from-violet-500 to-purple-500',
                bg: 'bg-violet-50',
                icon: '✅',
              },
            ].map((item) => (
              <div key={item.type} className="group relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-6 transition-all hover:border-slate-300 hover:shadow-lg hover:shadow-slate-200/60">
                <div className={`absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${item.accent}`} />
                <div className={`inline-flex h-12 w-12 items-center justify-center rounded-xl ${item.bg} text-xl`}>{item.icon}</div>
                <h3 className="mt-4 text-base font-semibold text-slate-900">{item.type}</h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-500">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── How it works ── */}
      <section id="how-it-works" className="py-16 sm:py-24">
        <div className="mx-auto max-w-4xl px-6">
          <p className="text-center text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">How it works</p>
          <h2 className="mt-3 text-center text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
            Three steps to your first product
          </h2>

          <div className="mt-14 grid grid-cols-1 gap-y-12 sm:grid-cols-3 sm:gap-x-8 sm:gap-y-0">
            <div className="relative text-center sm:text-left">
              <div className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-50 text-sm font-bold text-indigo-600">01</div>
              <h3 className="mt-4 text-lg font-semibold text-slate-900">Enter your TikTok</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-500">Just paste your username. Our AI scrapes your videos, transcripts, and visual style automatically.</p>
            </div>
            <div className="relative text-center sm:text-left">
              <div className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-violet-50 text-sm font-bold text-violet-600">02</div>
              <h3 className="mt-4 text-lg font-semibold text-slate-900">AI builds your product</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-500">Multi-stage pipeline analyzes your best content, structures it into a premium product, and validates quality.</p>
            </div>
            <div className="relative text-center sm:text-left">
              <div className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-50 text-sm font-bold text-emerald-600">03</div>
              <h3 className="mt-4 text-lg font-semibold text-slate-900">Sell and earn</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-500">Get a branded storefront and product pages ready to share. Customers pay via Stripe directly to you.</p>
            </div>
          </div>
        </div>
      </section>

      {/* ── Social proof ── */}
      <section className="border-y border-slate-100 bg-slate-50 py-16 sm:py-20">
        <div className="mx-auto max-w-4xl px-6">
          <p className="text-center text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">Trusted by creators</p>
          <h2 className="mt-3 text-center text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
            What creators are saying
          </h2>

          <div className="mt-12 grid grid-cols-1 gap-5 sm:grid-cols-3">
            {[
              {
                quote: 'I went from just posting TikToks to having a real product to sell in under 10 minutes. The guide it built actually sounds like me.',
                name: 'Sarah M.',
                role: 'Skincare Creator',
              },
              {
                quote: 'The AI picked out my best lessons and organized them better than I could have. My followers are actually buying it.',
                name: 'Marcus T.',
                role: 'Fitness Coach',
              },
              {
                quote: 'I was skeptical about AI-generated products but the quality blew me away. It pulled real advice from my videos, not generic stuff.',
                name: 'Jade K.',
                role: 'Finance Creator',
              },
            ].map((t) => (
              <div key={t.name} className="rounded-2xl border border-slate-200 bg-white p-6">
                <div className="flex gap-0.5 text-amber-400">
                  {'★★★★★'.split('').map((s, i) => <span key={i}>{s}</span>)}
                </div>
                <p className="mt-4 text-sm leading-relaxed text-slate-600">&ldquo;{t.quote}&rdquo;</p>
                <div className="mt-5 flex items-center gap-3">
                  <div className="h-9 w-9 rounded-full bg-gradient-to-br from-slate-200 to-slate-300" />
                  <div>
                    <p className="text-sm font-semibold text-slate-900">{t.name}</p>
                    <p className="text-xs text-slate-500">{t.role}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Pricing ── */}
      <section id="pricing" className="py-16 sm:py-24">
        <div className="mx-auto max-w-4xl px-6">
          <p className="text-center text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">Pricing</p>
          <h2 className="mt-3 text-center text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
            Free to create. Pay only when you sell.
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-center text-base text-slate-500">
            No subscription. No monthly fees. We take a small cut only when you make money.
          </p>

          <div className="mx-auto mt-12 grid max-w-3xl grid-cols-1 gap-6 sm:grid-cols-2">
            <div className="rounded-2xl border border-slate-200 bg-white p-8">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Create</p>
              <p className="mt-2 text-4xl font-bold text-slate-900">Free</p>
              <p className="mt-2 text-sm text-slate-500">Everything you need to get started</p>
              <ul className="mt-6 space-y-3 text-sm text-slate-600">
                {[
                  'Unlimited product creation',
                  'AI content analysis',
                  'Branded storefront',
                  'Product preview & editing',
                  'Quality validation',
                ].map((f) => (
                  <li key={f} className="flex items-center gap-2">
                    <svg className="h-4 w-4 shrink-0 text-emerald-500" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                    {f}
                  </li>
                ))}
              </ul>
            </div>

            <div className="relative rounded-2xl border-2 border-slate-900 bg-white p-8">
              <div className="absolute -top-3 left-6 rounded-full bg-slate-900 px-3 py-0.5 text-xs font-semibold text-white">
                When you sell
              </div>
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Sell</p>
              <p className="mt-2 text-4xl font-bold text-slate-900">10%<span className="text-lg font-normal text-slate-400"> / sale</span></p>
              <p className="mt-2 text-sm text-slate-500">Only charged when a customer buys</p>
              <ul className="mt-6 space-y-3 text-sm text-slate-600">
                {[
                  'Everything in Create',
                  'Stripe Connect payments',
                  'Customer management',
                  'Order tracking & analytics',
                  'Direct payouts to your bank',
                ].map((f) => (
                  <li key={f} className="flex items-center gap-2">
                    <svg className="h-4 w-4 shrink-0 text-emerald-500" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                    {f}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* ── FAQ ── */}
      <section className="border-t border-slate-100 bg-slate-50 py-16 sm:py-20">
        <div className="mx-auto max-w-2xl px-6">
          <h2 className="text-center text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
            Frequently asked questions
          </h2>
          <div className="mt-12 space-y-6">
            {[
              {
                q: 'How does Owny create products from my TikTok?',
                a: 'We analyze your video transcripts, visual style, and audience topics using multi-stage AI. The system selects your strongest content, structures it into a professional product format, and generates branded HTML pages — grounded in your actual lessons, not generic copy.',
              },
              {
                q: 'Do I need to be a big creator to use this?',
                a: 'Not at all. If you have at least a handful of videos with substantive content (tutorials, tips, advice), our AI can extract value and build a product. Quality matters more than follower count.',
              },
              {
                q: 'How do I get paid?',
                a: 'You connect your Stripe account from the dashboard. When a customer purchases your product, the payment goes directly to your Stripe account minus a 10% platform fee. Payouts happen on Stripe\'s schedule.',
              },
              {
                q: 'Can I edit the products after they\'re generated?',
                a: 'Yes. You can regenerate products with different topics, improve them with our AI critic loop, and build new versions. Each build creates a new version you can preview before publishing.',
              },
              {
                q: 'What does the product look like to buyers?',
                a: 'Buyers see a beautiful, branded storefront at your unique URL (owny.store/c/your-handle) with all your published products. Each product has its own sales page with a Stripe checkout flow. After purchase, buyers access their product in their library.',
              },
              {
                q: 'Is there a monthly fee?',
                a: 'No. Owny is free to create products and set up your storefront. We only take a 10% commission when you make a sale. No hidden fees, no subscriptions.',
              },
            ].map((faq) => (
              <details key={faq.q} className="group rounded-xl border border-slate-200 bg-white transition-all open:shadow-sm">
                <summary className="flex cursor-pointer items-center justify-between px-6 py-4 text-sm font-semibold text-slate-900 [&::-webkit-details-marker]:hidden">
                  {faq.q}
                  <span className="ml-4 text-slate-400 transition-transform group-open:rotate-45">+</span>
                </summary>
                <p className="px-6 pb-4 text-sm leading-relaxed text-slate-500">{faq.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* ── Bottom CTA ── */}
      <section className="py-16 sm:py-24">
        <div className="mx-auto max-w-2xl px-6 text-center">
          <h2 className="text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
            Ready to turn your videos into products?
          </h2>
          <p className="mx-auto mt-4 max-w-lg text-base text-slate-500">
            Join creators who are already selling digital products from their TikTok content.
          </p>
          <div className="mt-8">
            <HandleInput />
          </div>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="border-t border-slate-100 bg-slate-50 py-10">
        <div className="mx-auto max-w-6xl px-6">
          <div className="flex flex-col items-center justify-between gap-4 sm:flex-row">
            <span className="text-sm font-semibold text-slate-900">Owny</span>
            <div className="flex gap-6 text-sm text-slate-400">
              <Link href="/legal/privacy" className="hover:text-slate-600 transition-colors">Privacy</Link>
              <Link href="/legal/tos" className="hover:text-slate-600 transition-colors">Terms</Link>
              <Link href="/legal/refund" className="hover:text-slate-600 transition-colors">Refunds</Link>
              <Link href="/legal/dmca" className="hover:text-slate-600 transition-colors">DMCA</Link>
            </div>
            <span className="text-sm text-slate-400">© {new Date().getFullYear()} Owny</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
