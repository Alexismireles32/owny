import Link from 'next/link';

export function PublicFooter() {
    return (
        <footer className="mt-auto border-t border-slate-200/80 bg-white/80 backdrop-blur">
            <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
                <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
                    <div>
                        <p className="text-sm font-semibold text-slate-950">
                            © {new Date().getFullYear()} Owny
                        </p>
                        <p className="mt-1 text-sm text-slate-500">
                            Premium creator commerce, instant access, and digital products that feel intentional.
                        </p>
                    </div>
                    <nav className="flex flex-wrap items-center gap-4 text-xs text-slate-500">
                        <Link href="/legal/tos" className="hover:text-foreground transition-colors">
                            Terms of Service
                        </Link>
                        <Link href="/legal/privacy" className="hover:text-foreground transition-colors">
                            Privacy Policy
                        </Link>
                        <Link href="/legal/refund" className="hover:text-foreground transition-colors">
                            Refund Policy
                        </Link>
                        <Link href="/legal/dmca" className="hover:text-foreground transition-colors">
                            DMCA
                        </Link>
                    </nav>
                </div>
            </div>
        </footer>
    );
}
