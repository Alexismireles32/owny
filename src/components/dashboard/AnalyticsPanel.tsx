'use client';

// AnalyticsPanel — Compact stats view for the dashboard left panel

interface AnalyticsPanelProps {
    stats: {
        revenue: number;
        sales: number;
        pageViews: number;
    };
    handle: string;
}

export function AnalyticsPanel({ stats, handle }: AnalyticsPanelProps) {
    const formatCurrency = (cents: number) => {
        return new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: 'usd',
        }).format(cents / 100);
    };

    return (
        <div className="analytics-panel">
            <style>{`
                .analytics-panel {
                    padding: 1.5rem;
                    display: flex;
                    flex-direction: column;
                    gap: 1rem;
                    overflow-y: auto;
                    flex: 1;
                }
                .analytics-card {
                    background: rgba(255,255,255,0.03);
                    border: 1px solid rgba(255,255,255,0.06);
                    border-radius: 1rem;
                    padding: 1.25rem;
                }
                .analytics-label {
                    font-size: 0.75rem;
                    color: rgba(255,255,255,0.4);
                    text-transform: uppercase;
                    letter-spacing: 0.05em;
                    font-weight: 600;
                }
                .analytics-value {
                    font-size: 2rem;
                    font-weight: 700;
                    color: white;
                    margin-top: 0.25rem;
                }
                .analytics-sub {
                    font-size: 0.75rem;
                    color: rgba(255,255,255,0.3);
                    margin-top: 0.25rem;
                }
                .analytics-link {
                    display: block;
                    text-align: center;
                    padding: 0.75rem;
                    border-radius: 0.75rem;
                    background: rgba(139, 92, 246, 0.1);
                    border: 1px solid rgba(139, 92, 246, 0.2);
                    color: #a78bfa;
                    font-size: 0.8rem;
                    font-weight: 600;
                    text-decoration: none;
                    transition: all 0.2s;
                }
                .analytics-link:hover {
                    background: rgba(139, 92, 246, 0.2);
                }
            `}</style>

            <div className="analytics-card">
                <div className="analytics-label">Revenue</div>
                <div className="analytics-value">{formatCurrency(stats.revenue)}</div>
                <div className="analytics-sub">{stats.sales} {stats.sales === 1 ? 'sale' : 'sales'}</div>
            </div>

            <div className="analytics-card">
                <div className="analytics-label">Page Views</div>
                <div className="analytics-value">{stats.pageViews}</div>
                <div className="analytics-sub">owny.store/c/{handle}</div>
            </div>

            <a href="/analytics" className="analytics-link">
                View Full Analytics →
            </a>

            <a href="/connect-stripe" className="analytics-link">
                ⚡ Stripe Setup
            </a>
        </div>
    );
}
