'use client';

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
                className={`text-white text-xs ${fullWidth ? 'w-full' : 'px-4'}`}
                style={{ backgroundColor: primaryColor }}
            >
                {isFree ? 'Get Free Access' : 'Buy Now'}
            </CheckoutCtaButton>
        </div>
    );
}
