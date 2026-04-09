import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { STATS, MOCK_ACTIVITY } from '../data/mock'

function StatCard({ label, value, sub, color, onClick }) {
  return (
    <div className="stat-card" style={{ '--stat-color': color }} onClick={onClick} role="button" tabIndex={0}>
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
      {sub && <div className="stat-sub">{sub}</div>}
    </div>
  )
}

function AlertBanner({ type, title, desc }) {
  return (
    <div className={`alert alert-${type}`}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" style={{width:15,height:15,flexShrink:0,marginTop:1}}>
        <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
        <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
      </svg>
      <div className="alert-body">
        <div className="alert-title">{title}</div>
        <div className="alert-desc">{desc}</div>
      </div>
    </div>
  )
}

export default function Dashboard() {
  const navigate = useNavigate()
  const [lastRefresh, setLastRefresh] = useState(STATS.lastRefresh)
  const [refreshing, setRefreshing] = useState(false)

  const handleRefresh = () => {
    setRefreshing(true)
    setTimeout(() => {
      const now = new Date()
      setLastRefresh(now.toLocaleTimeString('en-US', { hour12: false }))
      setRefreshing(false)
    }, 1200)
  }

  useEffect(() => {
    const interval = setInterval(handleRefresh, 5 * 60 * 1000)
    return () => clearInterval(interval)
  }, [])

  return (
    <>
      <div className="topbar">
        <span className="topbar-title">Dashboard</span>
        <div className="topbar-right">
          <div className="refresh-info">
            <div className={`refresh-dot${refreshing ? '' : ''}`} />
            Last refresh: {lastRefresh}
          </div>
          <button className="btn btn-ghost btn-sm" onClick={handleRefresh} disabled={refreshing}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{width:13,height:13,animation:refreshing?'spin 0.7s linear infinite':'none'}}>
              <polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/>
              <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
            </svg>
            {refreshing ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>
      </div>

      <div className="page-body">
        {/* Alert Banners */}
        <div className="mb-16">
          <AlertBanner type="red"   title="3 tenants offline"   desc="Blackrock Government IT, Omega Clearance Services — transitioned offline within the last 24 hours" />
          <AlertBanner type="amber" title="3 tenants degraded"  desc="Meridian DoD Solutions (2 unhealthy VAs), Delta Force Technologies, Keystone Federal Group — health degraded" />
        </div>

        {/* Stats */}
        <div className="stat-grid">
          <StatCard
            label="Total Tenants"
            value={STATS.totalTenants}
            sub={[
              <span key="isc" className="stat-badge cyan">ISC {STATS.iscCount}</span>,
              <span key="pam" className="stat-badge amber">PAM {STATS.pamCount}</span>,
            ]}
            color="var(--accent)"
            onClick={() => navigate('/tenants')}
          />
          <StatCard
            label="Health Status"
            value={STATS.healthy}
            sub={[
              <span key="h" className="stat-badge green">● {STATS.healthy} Healthy</span>,
              <span key="d" className="stat-badge amber">● {STATS.degraded} Degraded</span>,
              <span key="o" className="stat-badge red">● {STATS.offline} Offline</span>,
            ]}
            color="var(--green)"
            onClick={() => navigate('/tenants')}
          />
          <StatCard
            label="Managed Identities"
            value={STATS.totalIdentities.toLocaleString()}
            sub={[<span key="s" className="stat-badge cyan">Across {STATS.iscCount} ISC tenants</span>]}
            color="var(--rsm-cyan)"
            onClick={() => navigate('/tenants')}
          />
          <StatCard
            label="Privileged Accounts"
            value={STATS.totalAccounts.toLocaleString()}
            sub={[<span key="s" className="stat-badge amber">Across {STATS.pamCount} PAM tenants</span>]}
            color="var(--amber)"
            onClick={() => navigate('/tenants')}
          />
          <StatCard
            label="Virtual Appliances"
            value={STATS.totalVAs}
            sub={[
              <span key="ok" className="stat-badge green">{STATS.totalVAs - STATS.unhealthyVAs} healthy</span>,
              <span key="un" className="stat-badge red">{STATS.unhealthyVAs} unhealthy</span>,
            ]}
            color={STATS.unhealthyVAs > 0 ? 'var(--red)' : 'var(--green)'}
            onClick={() => navigate('/tenants')}
          />
        </div>

        {/* Two-column: Activity + Quick Stats */}
        <div className="two-col">
          {/* Activity Feed */}
          <div className="card">
            <div className="section-title">Recent Activity</div>
            <div className="activity-feed">
              {MOCK_ACTIVITY.map((a, i) => (
                <div className="activity-item" key={i}>
                  <div className="activity-dot" style={{ background: a.color }} />
                  <div className="activity-text">
                    <strong>{a.user}</strong> {a.detail}
                  </div>
                  <span className="activity-time">{a.time}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Quick Links + Summary */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div className="card">
              <div className="section-title">Tenant Health Breakdown</div>
              <HealthBar healthy={STATS.healthy} degraded={STATS.degraded} offline={STATS.offline} total={STATS.totalTenants} />
              <div style={{ display: 'flex', gap: 16, marginTop: 14 }}>
                <HealthLegend color="var(--green)" label="Healthy"  count={STATS.healthy} />
                <HealthLegend color="var(--amber)" label="Degraded" count={STATS.degraded} />
                <HealthLegend color="var(--red)"   label="Offline"  count={STATS.offline} />
              </div>
            </div>

            <div className="card">
              <div className="section-title">Quick Actions</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <button className="btn btn-primary w-full" onClick={() => navigate('/tenants')}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{width:14,height:14}}>
                    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>
                    <path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
                  </svg>
                  View All Tenants
                </button>
                <button className="btn btn-secondary w-full" onClick={() => navigate('/onboard')}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{width:14,height:14}}>
                    <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/>
                  </svg>
                  Onboard New Tenant
                </button>
                <button className="btn btn-secondary w-full" onClick={() => navigate('/audit')}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{width:14,height:14}}>
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>
                    <line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>
                  </svg>
                  View Audit Logs
                </button>
              </div>
            </div>

            <div className="card">
              <div className="section-title">Tenant Types</div>
              <div style={{ display: 'flex', gap: 16 }}>
                <TypeStat label="SailPoint ISC" count={STATS.iscCount} color="var(--accent)"   badge="badge-isc" />
                <TypeStat label="CyberArk PAM"  count={STATS.pamCount} color="var(--amber)"    badge="badge-pam" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}

function HealthBar({ healthy, degraded, offline, total }) {
  const hp = (healthy / total) * 100
  const dp = (degraded / total) * 100
  const op = (offline / total) * 100
  return (
    <div style={{ height: 10, borderRadius: 6, display: 'flex', overflow: 'hidden', gap: 2 }}>
      <div style={{ width: `${hp}%`, background: 'var(--green)', borderRadius: 4 }} />
      <div style={{ width: `${dp}%`, background: 'var(--amber)', borderRadius: 4 }} />
      <div style={{ width: `${op}%`, background: 'var(--red)',   borderRadius: 4 }} />
    </div>
  )
}

function HealthLegend({ color, label, count }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-2)' }}>
      <div style={{ width: 8, height: 8, borderRadius: '50%', background: color }} />
      {label}: <strong style={{ color: 'var(--text-1)' }}>{count}</strong>
    </div>
  )
}

function TypeStat({ label, count, color, badge }) {
  return (
    <div style={{ flex: 1, padding: '12px 14px', background: 'var(--bg-hover)', borderRadius: 'var(--radius)', display: 'flex', flexDirection: 'column', gap: 4 }}>
      <span className={`badge ${badge}`} style={{ alignSelf: 'flex-start' }}>{label}</span>
      <span style={{ fontFamily: 'var(--font-head)', fontSize: 28, fontWeight: 700, color }}>{count}</span>
      <span style={{ fontSize: 11, color: 'var(--text-3)' }}>active tenants</span>
    </div>
  )
}
