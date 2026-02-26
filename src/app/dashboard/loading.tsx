// Loading skeleton for dashboard
export default function DashboardLoading() {
    return (
        <div className="min-h-screen" style={{ background: '#060d18' }}>
            <header
                style={{
                    height: '64px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '0 1.2rem',
                    borderBottom: '1px solid rgba(226,232,240,0.14)',
                    background: 'linear-gradient(100deg, rgba(7,18,32,0.95), rgba(9,21,35,0.9) 42%, rgba(8,21,35,0.9))',
                }}
            >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.7rem' }}>
                    <span style={{ fontSize: '1.05rem', fontWeight: 800, letterSpacing: '0.03em', color: '#e2e8f0' }}>OWNY</span>
                    <span style={{ border: '1px solid rgba(34,211,238,0.35)', borderRadius: '999px', padding: '0.2rem 0.5rem', fontSize: '0.6rem', letterSpacing: '0.08em', textTransform: 'uppercase' as const, color: '#67e8f9', background: 'rgba(34,211,238,0.1)', fontWeight: 700 }}>Studio</span>
                </div>
                <div style={{ width: '120px', height: '16px', borderRadius: '8px', background: 'rgba(226,232,240,0.08)' }} />
            </header>
            <div style={{ display: 'flex', height: 'calc(100vh - 64px)' }}>
                <div style={{ width: '50%', borderRight: '1px solid rgba(226,232,240,0.1)', display: 'flex', flexDirection: 'column' as const, alignItems: 'center', justifyContent: 'center', gap: '1rem' }}>
                    <div style={{ width: '200px', height: '360px', borderRadius: '1.5rem', background: 'rgba(226,232,240,0.06)', border: '1px solid rgba(226,232,240,0.1)' }} />
                    <div style={{ width: '160px', height: '12px', borderRadius: '6px', background: 'rgba(226,232,240,0.06)' }} />
                </div>
                <div style={{ width: '50%', display: 'flex', flexDirection: 'column' as const, alignItems: 'center', justifyContent: 'center', gap: '1.5rem', padding: '2rem' }}>
                    <div style={{ width: '280px', height: '24px', borderRadius: '8px', background: 'rgba(226,232,240,0.06)' }} />
                    <div style={{ width: '200px', height: '16px', borderRadius: '8px', background: 'rgba(226,232,240,0.04)' }} />
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', width: '100%', maxWidth: '400px' }}>
                        {[1, 2, 3, 4].map((i) => (
                            <div key={i} style={{ height: '64px', borderRadius: '12px', background: 'rgba(226,232,240,0.05)', border: '1px solid rgba(226,232,240,0.08)' }} />
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}
