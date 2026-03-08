'use client';

import { ArrowRight } from 'lucide-react';
import { CheckoutCtaButton } from '@/components/checkout/checkout-cta-button';

interface StorefrontBuyButtonProps {
    productId: string;
    productSlug: string;
    isFree: boolean;
    primaryColor: string;
    fullWidth?: boolean;
}

/**
 * Wrapper around CheckoutCtaButton for use inside <Link> elements.
 * Calls stopPropagation + preventDefault to prevent the parent Link from
 * triggering navigation when the buy button is clicked.
 */
export function StorefrontBuyButton({
    productId,
    productSlug,
    isFree,
    primaryColor,
    fullWidth = false,
}: StorefrontBuyButtonProps) {
    return (
        <div
            className={fullWidth ? 'mt-3' : 'ml-auto'}
            onClick={(e) => {
                e.stopPropagation();
                e.preventDefault();
            }}
        >
            <CheckoutCtaButton
                productId={productId}
                productSlug={productSlug}
                isFree={isFree}
                size="sm"
                className={`text-white text-xs shadow-[0_18px_36px_-24px_rgba(15,23,42,0.4)] ${fullWidth ? 'w-full rounded-xl py-5' : 'rounded-full px-4'}`}
                style={{ backgroundColor: primaryColor }}
            >
                <span className="inline-flex items-center gap-1.5">
                    {isFree ? 'Get Free Access' : 'Buy Now'}
                    <ArrowRight className="size-3.5" />
                </span>
            </CheckoutCtaButton>
        </div>
    );
}
