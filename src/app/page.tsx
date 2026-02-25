// Owny.store — Landing Page
// The first thing a user sees: enter your TikTok username to get started
// Per SCRAPE_CREATORS_FLOW.md: TikTok handle is the SINGLE entry point

import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { HandleInput } from '@/components/landing/HandleInput';
import Link from 'next/link';

export default async function Home() {
  // Redirect signed-in users to dashboard
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
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-indigo-50/30 flex flex-col">
      {/* Nav */}
      <header className="w-full border-b border-slate-100 bg-white/60 backdrop-blur-md">
        <div className="container mx-auto flex h-16 items-center justify-between px-6">
          <div className="flex items-center gap-2">
            <span className="text-2xl font-bold bg-gradient-to-r from-indigo-600 to-violet-600 bg-clip-text text-transparent">
              Owny
            </span>
          </div>
          <div className="flex items-center gap-4">
            <Link
              href="/sign-in"
              className="text-sm font-medium text-slate-600 hover:text-slate-900 transition-colors"
            >
              Sign in
            </Link>
            <Link
              href="/sign-up"
              className="text-sm font-medium px-4 py-2 rounded-xl bg-slate-900 text-white hover:bg-slate-800 transition-colors"
            >
              Sign up
            </Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <main className="flex-1 flex flex-col items-center justify-center px-6 py-20">
        <div className="max-w-2xl w-full text-center space-y-8">
          {/* Badge */}
          <div className="inline-flex items-center gap-2 rounded-full bg-indigo-50 border border-indigo-100 px-4 py-1.5 text-sm font-medium text-indigo-700">
            <span className="text-base">🚀</span>
            Turn your TikTok into a business
          </div>

          {/* Headline */}
          <h1 className="text-5xl sm:text-6xl font-bold leading-tight tracking-tight text-slate-900">
            Your videos.{' '}
            <span className="bg-gradient-to-r from-indigo-600 to-violet-600 bg-clip-text text-transparent">
              Your products.
            </span>
          </h1>

          {/* Subheadline */}
          <p className="text-xl text-slate-500 max-w-lg mx-auto leading-relaxed">
            Enter your TikTok username and we&apos;ll turn your content into sellable digital products — automatically.
          </p>

          {/* Handle Input */}
          <div className="pt-4">
            <HandleInput />
          </div>

          {/* Social proof */}
          <div className="flex items-center justify-center gap-6 pt-8 text-sm text-slate-400">
            <div className="flex items-center gap-1.5">
              <svg className="h-4 w-4 text-emerald-500" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
              </svg>
              Free to start
            </div>
            <div className="flex items-center gap-1.5">
              <svg className="h-4 w-4 text-emerald-500" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
              </svg>
              AI-powered
            </div>
            <div className="flex items-center gap-1.5">
              <svg className="h-4 w-4 text-emerald-500" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
              </svg>
              No coding needed
            </div>
          </div>
        </div>

        {/* How it works */}
        <div className="max-w-3xl w-full mt-24 px-4">
          <h2 className="text-center text-2xl font-bold text-slate-900 mb-12">
            How it works
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-8">
            {[
              {
                step: '1',
                icon: '📱',
                title: 'Enter your TikTok',
                desc: 'Just paste your username — we handle the rest.',
              },
              {
                step: '2',
                icon: '🤖',
                title: 'AI analyzes your content',
                desc: 'We scan your videos, transcripts, and style to understand your brand.',
              },
              {
                step: '3',
                icon: '💰',
                title: 'Sell digital products',
                desc: 'Get a stunning product page ready to sell — courses, guides, toolkits.',
              },
            ].map((item) => (
              <div key={item.step} className="text-center space-y-3">
                <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-indigo-50 text-2xl">
                  {item.icon}
                </div>
                <h3 className="font-semibold text-slate-900">{item.title}</h3>
                <p className="text-sm text-slate-500 leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-100 py-8">
        <div className="container mx-auto px-6 flex items-center justify-between text-sm text-slate-400">
          <span>© {new Date().getFullYear()} Owny</span>
          <div className="flex gap-6">
            <Link href="/legal/privacy" className="hover:text-slate-600 transition-colors">Privacy</Link>
            <Link href="/legal/tos" className="hover:text-slate-600 transition-colors">Terms</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
