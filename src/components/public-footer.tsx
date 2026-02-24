import Link from 'next/link';

export function PublicFooter() {
    return (
        <footer className="border-t bg-white/50 mt-auto">
            <div className="container mx-auto px-4 py-8">
                <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                    <p className="text-sm text-muted-foreground">
                        © {new Date().getFullYear()} <span className="font-semibold">Owny</span>
                    </p>
                    <nav className="flex items-center gap-4 text-xs text-muted-foreground">
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
