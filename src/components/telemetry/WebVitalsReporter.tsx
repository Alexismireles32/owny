'use client';

import * as Sentry from '@sentry/nextjs';
import { useReportWebVitals } from 'next/web-vitals';

function clampSampleRate(value: number): number {
  if (!Number.isFinite(value)) return 0.2;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

function ratingFromInp(value: number): 'good' | 'needs_improvement' | 'poor' {
  if (value <= 200) return 'good';
  if (value <= 500) return 'needs_improvement';
  return 'poor';
}

export function WebVitalsReporter() {
  const configuredSampleRate = clampSampleRate(
    Number.parseFloat(process.env.NEXT_PUBLIC_WEB_VITALS_SAMPLE_RATE || '0.2')
  );

  useReportWebVitals((metric) => {
    // Focus on real-user INP as the primary interaction metric.
    if (metric.name !== 'INP') return;
    if (Math.random() > configuredSampleRate) return;

    const rating = ratingFromInp(metric.value);

    Sentry.captureEvent({
      level: 'info',
      message: 'web-vitals.inp',
      tags: {
        source: 'web-vitals',
        metric: 'INP',
        rating,
        navigation_type: metric.navigationType,
      },
      contexts: {
        web_vital: {
          name: metric.name,
          id: metric.id,
          value: metric.value,
          delta: metric.delta,
          rating,
          navigationType: metric.navigationType,
        },
      },
      extra: {
        pathname:
          typeof window !== 'undefined' ? window.location.pathname : undefined,
      },
      fingerprint: ['web-vitals', 'INP', rating],
    });
  });

  return null;
}
