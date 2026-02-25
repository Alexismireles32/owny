import { redirect } from 'next/navigation';

export default function LegacyNewProductRedirect() {
    redirect('/dashboard');
}
