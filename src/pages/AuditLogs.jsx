import { useState, useMemo } from 'react'
import { useResizableColumns } from '../lib/useResizableColumns.jsx'
import { MOCK_AUDIT_LOGS } from '../data/mock'

const EVENT_TYPES = ['All','LOGIN_SUCCESS','LOGIN_FAILED','TENANT_LAUNCH','TENANT_ONBOARD','CONFIG_CHANGE','ROLE_CHANGE','SESSION_TIMEOUT','LOGOUT']
const OUTCOMES    = ['All','success','failed','info']

const outcomeClass = { success: 'pill-success', failed: 'pill-failed', info: 'pill-info', warning: 'pill-warning' }

const eventIcon = (type) => {
  const icons = {
    LOGIN_SUCCESS:   { color: 'var(--green)',  icon: '→' },
    LOGIN_FAILED:    { color: 'var(--red)',    icon: '✕' },
    TENANT_LAUNCH:   { color: 'var(--accent)', icon: '▶' },
    TENANT_ONBOARD:  { color: 'var(--green)',  icon: '+' },
    CONFIG_CHANGE:   { color: 'var(--amber)',  icon: '⚙' },
    ROLE_CHANGE:     { color: 'var(--amber)',  icon: '◈' },
    SESSION_TIMEOUT: { color: 'var(--rsm-gray)', icon: '⏱' },
    LOGOUT:          { color: 'var(--rsm-gray)', icon: '←' },
  }
  return icons[type] || { color: 'var(--text-3)', icon: '•' }
}

export default function AuditLogs() {
  const [search,   setSearch]   = useState('')
  const [evType,   setEvType]   = useState('All')
  const [outcome,  setOutcome]  = useState('All')
  const [sortDir,  setSortDir]  = useState('desc')
  const [page,     setPage]     = useState(1)
  const [pageSize, setPageSize] = useState(25)
  const [toast,    setToast]    = useState(null)

  const filtered = useMemo(() => {
    return MOCK_AUDIT_LOGS
      .filter(log => {
        if (search && !log.user.includes(search.toLowerCase()) && !log.detail.toLowerCase().includes(search.toLowerCase()) && !(log.tenant||'').toLowerCase().includes(search.toLowerCase())) return false
        if (evType   !== 'All' && log.eventType !== evType) return false
        if (outcome  !== 'All' && log.outcome   !== outcome) return false
        return true
      })
      .sort((a, b) => sortDir === 'desc' ? b.ts.localeCompare(a.ts) : a.ts.localeCompare(b.ts))
  }, [search, evType, outcome, sortDir])

  const totalPages = Math.ceil(filtered.length / pageSize)
  const paginated  = filtered.slice((page-1)*pageSize, page*pageSize)

  // ── Resizable columns ──────────────────────────────────────────────────────
  const AUDIT_COLS = [
    { key: 'ts',      defaultWidth: 155 },
    { key: 'event',   defaultWidth: 54  },
    { key: 'user',    defaultWidth: 160 },
    { key: 'tenant',  defaultWidth: 180 },
    { key: 'outcome', defaultWidth: 90  },
    { key: 'ip',      defaultWidth: 115 },
    { key: 'detail',  defaultWidth: 280 },
  ]
  const { getThProps: auditThProps, ResizeHandle: AuditResizeHandle } = useResizableColumns(AUDIT_COLS, { storageKey: 'mih-audit-cols' })


  const exportCsv = () => {
    const header = 'Timestamp,User,Event Type,Tenant,Outcome,IP,Detail'
    const rows   = filtered.map(l => `"${l.ts}","${l.user}","${l.eventType}","${l.tenant||''}","${l.outcome}","${l.ip}","${l.detail}"`)
    const blob   = new Blob([[header, ...rows].join('\n')], { type: 'text/csv' })
    const url    = URL.createObjectURL(blob)
    const a      = document.createElement('a'); a.href = url; a.download = 'mih-audit-log.csv'; a.click()
    URL.revokeObjectURL(url)
    setToast('Audit log exported as CSV')
    setTimeout(() => setToast(null), 2500)
  }

  const exportJson = () => {
    const blob = new Blob([JSON.stringify(filtered, null, 2)], { type: 'application/json' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a'); a.href = url; a.download = 'mih-audit-log.json'; a.click()
    URL.revokeObjectURL(url)
    setToast('Audit log exported as JSON')
    setTimeout(() => setToast(null), 2500)
  }

  return (
    <>
      <div className="topbar">
        <span className="topbar-title">Audit Logs</span>
        <span className="topbar-sub">— {filtered.length} events</span>
        <div className="topbar-right">
          <button className="btn btn-ghost btn-sm" onClick={exportCsv}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{width:13,height:13}}>
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
            </svg>
            Export CSV
          </button>
          <button className="btn btn-ghost btn-sm" onClick={exportJson}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{width:13,height:13}}>
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
            </svg>
            Export JSON
          </button>
        </div>
      </div>

      <div className="page-body">
        {/* Notice Banner */}
        <div className="card card-sm mb-16" style={{ background: 'var(--accent-dim)', border: '1px solid rgba(0,156,222,0.2)', display: 'flex', alignItems: 'center', gap: 8 }}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{width:14,height:14,color:'var(--accent)',flexShrink:0}}>
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
          </svg>
          <span style={{ fontSize: 12.5, color: 'var(--accent)' }}>
            Audit logs are <strong>immutable</strong>. No user, including administrators, can modify or delete log entries. Minimum retention: 365 days.
          </span>
        </div>

        <div className="table-wrap">
          {/* Filters */}
          <div className="table-header">
            <div className="search-bar">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
              </svg>
              <input className="input" placeholder="Search user, tenant, or detail…"
                value={search} onChange={e => { setSearch(e.target.value); setPage(1) }} />
            </div>
            <select className="input select" style={{ width: 170, padding: '7px 30px 7px 10px' }}
              value={evType} onChange={e => { setEvType(e.target.value); setPage(1) }}>
              {EVENT_TYPES.map(o => <option key={o}>{o === 'All' ? 'All Event Types' : o}</option>)}
            </select>
            <select className="input select" style={{ width: 130, padding: '7px 30px 7px 10px' }}
              value={outcome} onChange={e => { setOutcome(e.target.value); setPage(1) }}>
              {OUTCOMES.map(o => <option key={o} value={o}>{o === 'All' ? 'All Outcomes' : o.charAt(0).toUpperCase() + o.slice(1)}</option>)}
            </select>
            <button className="btn-icon" onClick={() => setSortDir(d => d === 'desc' ? 'asc' : 'desc')}
              title={`Sort ${sortDir === 'desc' ? 'oldest first' : 'newest first'}`}>
              {sortDir === 'desc'
                ? <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{width:15,height:15}}><line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/></svg>
                : <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{width:15,height:15}}><line x1="12" y1="5" x2="12" y2="19"/><polyline points="19 12 12 19 5 12"/></svg>}
            </button>
            {(search || evType !== 'All' || outcome !== 'All') && (
              <button className="btn btn-ghost btn-sm" onClick={() => { setSearch(''); setEvType('All'); setOutcome('All'); setPage(1) }}>
                Clear
              </button>
            )}
            <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--text-3)', flexShrink: 0 }}>
              Page size:
            </span>
            <select className="input select" style={{ width: 70, padding: '5px 28px 5px 8px', fontSize: 12 }}
              value={pageSize} onChange={e => { setPageSize(+e.target.value); setPage(1) }}>
              {[10,25,50].map(s => <option key={s}>{s}</option>)}
            </select>
          </div>

          {/* Table */}
          <div style={{ overflowX: 'auto' }}>
            <table className="resizable-table">
              <thead>
                <tr>
                  <th {...auditThProps('ts')}>Timestamp<AuditResizeHandle col="ts"/></th>
                  <th {...auditThProps('event')}>Event<AuditResizeHandle col="event"/></th>
                  <th {...auditThProps('user')}>User<AuditResizeHandle col="user"/></th>
                  <th {...auditThProps('tenant')}>Tenant<AuditResizeHandle col="tenant"/></th>
                  <th {...auditThProps('outcome')}>Outcome<AuditResizeHandle col="outcome"/></th>
                  <th {...auditThProps('ip')}>IP Address<AuditResizeHandle col="ip"/></th>
                  <th {...auditThProps('detail')}>Detail<AuditResizeHandle col="detail"/></th>
                </tr>
              </thead>
              <tbody>
                {paginated.length === 0 ? (
                  <tr><td colSpan={7}>
                    <div className="empty-state">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{width:36,height:36,display:'block',margin:'0 auto 10px',opacity:0.2}}>
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>
                      </svg>
                      <h3>No log entries found</h3>
                      <p>Try adjusting your filters</p>
                    </div>
                  </td></tr>
                ) : paginated.map(log => {
                  const { color, icon } = eventIcon(log.eventType)
                  return (
                    <tr key={log.id}>
                      <td className="mono" style={{ fontSize: 11.5, whiteSpace: 'nowrap' }}>{log.ts}</td>
                      <td>
                        <div title={log.eventType} style={{ width: 24, height: 24, borderRadius: 4, background: `${color}22`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, color, fontWeight: 700 }}>
                          {icon}
                        </div>
                      </td>
                      <td className="mono td-primary" style={{ fontSize: 12 }}>{log.user}</td>
                      <td style={{ fontSize: 12.5 }}>{log.tenant ? <span style={{ color: 'var(--accent)' }}>{log.tenant}</span> : <span style={{ color: 'var(--text-3)' }}>—</span>}</td>
                      <td><span className={`pill ${outcomeClass[log.outcome] || 'pill-info'}`}>{log.outcome}</span></td>
                      <td className="mono" style={{ fontSize: 11.5 }}>{log.ip}</td>
                      <td style={{ fontSize: 12, color: 'var(--text-2)', maxWidth: 350 }}>{log.detail}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="pagination">
              <span className="pagination-info">
                Showing {(page-1)*pageSize+1}–{Math.min(page*pageSize, filtered.length)} of {filtered.length}
              </span>
              <div className="pagination-btns">
                <button className="page-btn" onClick={() => setPage(1)} disabled={page===1}>«</button>
                <button className="page-btn" onClick={() => setPage(p=>p-1)} disabled={page===1}>‹</button>
                {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
                  const p = Math.max(1, Math.min(page-3, totalPages-6)) + i
                  return p <= totalPages ? <button key={p} className={`page-btn${p===page?' active':''}`} onClick={() => setPage(p)}>{p}</button> : null
                })}
                <button className="page-btn" onClick={() => setPage(p=>p+1)} disabled={page===totalPages}>›</button>
                <button className="page-btn" onClick={() => setPage(totalPages)} disabled={page===totalPages}>»</button>
              </div>
            </div>
          )}
        </div>
      </div>

      {toast && (
        <div className="toast-container">
          <div className="toast">{toast}</div>
        </div>
      )}
    </>
  )
}
