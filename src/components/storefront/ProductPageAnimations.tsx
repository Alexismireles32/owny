'use client';

import { motion, useReducedMotion } from 'motion/react';
import type { ReactNode } from 'react';

interface FadeInProps {
    children: ReactNode;
    delay?: number;
    className?: string;
    y?: number;
}

export function FadeIn({ children, delay = 0, className, y = 20 }: FadeInProps) {
    const shouldReduceMotion = useReducedMotion();
    return (
        <motion.div
            initial={shouldReduceMotion ? false : { opacity: 0, y }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-40px' }}
            transition={shouldReduceMotion ? { duration: 0 } : { duration: 0.5, delay, ease: 'easeOut' }}
            className={className}
        >
            {children}
        </motion.div>
    );
}

export function FadeInStagger({ children, className }: { children: ReactNode; className?: string }) {
    const shouldReduceMotion = useReducedMotion();
    return (
        <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: '-40px' }}
            variants={{
                visible: {
                    transition: {
                        staggerChildren: shouldReduceMotion ? 0 : 0.08,
                    },
                },
            }}
            className={className}
        >
            {children}
        </motion.div>
    );
}

export function FadeInStaggerItem({ children, className }: { children: ReactNode; className?: string }) {
    const shouldReduceMotion = useReducedMotion();
    return (
        <motion.div
            variants={
                shouldReduceMotion
                    ? { hidden: {}, visible: {} }
                    : {
                          hidden: { opacity: 0, y: 16 },
                          visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: 'easeOut' } },
                      }
            }
            className={className}
        >
            {children}
        </motion.div>
    );
}
