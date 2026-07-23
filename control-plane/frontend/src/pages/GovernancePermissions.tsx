import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Loader } from 'lucide-react';

export default function GovernancePermissions() {
  const { clientId } = useParams<{ clientId: string }>();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [filterType, setFilterType] = useState('all');

  useEffect(() => {
    setTimeout(() => setLoading(false), 500);
  }, [clientId]);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0f1219] flex items-center justify-center">
        <Loader className="w-8 h-8 text-[#EA5A1C] animate-spin" />
      </div>
    );
  }

  const users = [
    { email: 'john.smith@company.com', owns: 5, access: 12, mfa: true, activity: 'Today' },
    { email: 'maria.silva@company.com', owns: 3, access: 8, mfa: true, activity: '2h ago' },
    { email: 'admin@company.com', owns: 12, access: 42, mfa: true, activity: '1h ago' },
    { email: 'old.employee@company.com', owns: 0, access: 5, mfa: false, activity: '45d ago' },
    { email: 'contractor@external.com', owns: 0, access: 3, mfa: false, activity: '8d ago' },
  ];

  const permissions = [
    { label: 'Site Owners', count: 38, percentage: 100, color: '#48bb78' },
    { label: 'Site Members', count: 156, percentage: 100, color: '#EA5A1C' },
    { label: 'Site Visitors', count: 98, percentage: 100, color: '#48bb78' },
    { label: 'External Users', count: 20, percentage: 100, color: '#EA5A1C' },
    { label: 'Service Accounts', count: 8, percentage: 100, color: '#f56565' },
  ];

  return (
    <div className="min-h-screen bg-[#0f1219] p-8">
      <div className="max-w-7xl mx-auto space-y-8">
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-3xl font-bold text-white mb-2">Permissions & Risk Analysis</h1>
            <p className="text-[#a0aec0]">Detailed permission analysis, access reviews and risk assessment</p>
          </div>
          <button
            onClick={() => navigate(`/clientes/${clientId}/governance`)}
            className="px-4 py-2 bg-[rgba(255,255,255,0.1)] text-[#a0aec0] rounded-lg hover:bg-[rgba(255,255,255,0.15)] transition"
          >
            ← Back
          </button>
        </div>

        {/* Hero Card */}
        <div className="bg-gradient-to-r from-[#EA5A1C] to-[#8b3fa0] rounded-lg p-8 text-white shadow-lg flex justify-between items-center">
          <div>
            <h2 className="text-sm font-semibold uppercase tracking-wide mb-4 opacity-95">Permission Risk Profile</h2>
            <div className="text-5xl font-bold mb-4">68/100</div>
            <p className="text-base leading-relaxed opacity-95 max-w-lg">risk score. 18 weak permission findings, 28 users without MFA and 3 sites without designated owner.</p>
          </div>
          <div className="flex gap-8">
            <div className="text-center">
              <div className="text-xs font-semibold uppercase opacity-90 mb-2">Weak Permissions</div>
              <div className="text-3xl font-bold">18</div>
              <div className="text-xs font-semibold uppercase">issues</div>
            </div>
            <div className="text-center">
              <div className="text-xs font-semibold uppercase opacity-90 mb-2">No MFA Users</div>
              <div className="text-3xl font-bold">28</div>
              <div className="text-xs font-semibold uppercase">9%</div>
            </div>
            <div className="text-center">
              <div className="text-xs font-semibold uppercase opacity-90 mb-2">Unowned Sites</div>
              <div className="text-3xl font-bold">3</div>
              <div className="text-xs font-semibold uppercase">critical</div>
            </div>
          </div>
        </div>

        {/* Metrics Grid */}
        <div className="grid grid-cols-6 gap-4">
          <div className="bg-[#1a1f2e] border border-[rgba(255,255,255,0.1)] rounded-lg p-6 hover:border-[rgba(234,90,28,0.3)] transition">
            <div className="text-xs font-semibold text-[#718096] uppercase tracking-wide mb-3">Permission Risk</div>
            <div className="text-3xl font-bold text-[#f56565] mb-2">68</div>
            <p className="text-sm text-[#a0aec0]">HIGH RISK</p>
          </div>

          <div className="bg-[#1a1f2e] border border-[rgba(255,255,255,0.1)] rounded-lg p-6 hover:border-[rgba(234,90,28,0.3)] transition">
            <div className="text-xs font-semibold text-[#718096] uppercase tracking-wide mb-3">Excessive Permissions</div>
            <div className="text-3xl font-bold text-[#f56565] mb-2">42</div>
            <p className="text-sm text-[#a0aec0]">over-privileged</p>
          </div>

          <div className="bg-[#1a1f2e] border border-[rgba(255,255,255,0.1)] rounded-lg p-6 hover:border-[rgba(234,90,28,0.3)] transition">
            <div className="text-xs font-semibold text-[#718096] uppercase tracking-wide mb-3">Orphaned Accounts</div>
            <div className="text-3xl font-bold text-[#EA5A1C] mb-2">12</div>
            <p className="text-sm text-[#a0aec0]">without owner</p>
          </div>

          <div className="bg-[#1a1f2e] border border-[rgba(255,255,255,0.1)] rounded-lg p-6 hover:border-[rgba(234,90,28,0.3)] transition">
            <div className="text-xs font-semibold text-[#718096] uppercase tracking-wide mb-3">Service Accounts</div>
            <div className="text-3xl font-bold text-[#EA5A1C] mb-2">8</div>
            <p className="text-sm text-[#a0aec0]">with high access</p>
          </div>

          <div className="bg-[#1a1f2e] border border-[rgba(255,255,255,0.1)] rounded-lg p-6 hover:border-[rgba(234,90,28,0.3)] transition">
            <div className="text-xs font-semibold text-[#718096] uppercase tracking-wide mb-3">Owner Concentration</div>
            <div className="text-3xl font-bold text-[#EA5A1C] mb-2">38%</div>
            <p className="text-sm text-[#a0aec0]">3 users = 40% sites</p>
          </div>

          <div className="bg-[#1a1f2e] border border-[rgba(255,255,255,0.1)] rounded-lg p-6 hover:border-[rgba(234,90,28,0.3)] transition">
            <div className="text-xs font-semibold text-[#718096] uppercase tracking-wide mb-3">Last Access Review</div>
            <div className="text-3xl font-bold text-[#f56565] mb-2">6mo</div>
            <p className="text-sm text-[#a0aec0]">ago - overdue</p>
          </div>
        </div>

        {/* Filter Pills */}
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '12px' }}>
          {['All (312)', 'High Risk (42)', 'Medium (85)', 'Low (185)'].map((pill) => (
            <button
              key={pill}
              onClick={() => setFilterType(pill.split(' ')[0].toLowerCase())}
              style={{
                padding: '6px 12px',
                borderRadius: '5px',
                border: '1px solid ' + (pill.includes('All') ? '#EA5A1C' : 'rgba(255,255,255,0.1)'),
                background: pill.includes('All') ? '#EA5A1C' : 'transparent',
                color: pill.includes('All') ? '#fff' : '#a0aec0',
                fontSize: '10px',
                fontWeight: 600,
                cursor: 'pointer',
                textTransform: 'uppercase',
                whiteSpace: 'nowrap',
                transition: 'all 0.2s',
              }}
            >
              {pill}
            </button>
          ))}
        </div>

        {/* Users and Permissions Grid */}
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-[#1a1f2e] border border-[rgba(255,255,255,0.1)] rounded-lg p-6">
            <h3 className="text-lg font-semibold text-white mb-4">Users by Permission Level</h3>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', fontSize: '11px' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                    <th style={{ textAlign: 'left', padding: '8px 0', color: '#718096', fontWeight: 600, fontSize: '9px', textTransform: 'uppercase' }}>User</th>
                    <th style={{ textAlign: 'center', padding: '8px 0', color: '#718096', fontWeight: 600, fontSize: '9px', textTransform: 'uppercase' }}>Owns</th>
                    <th style={{ textAlign: 'center', padding: '8px 0', color: '#718096', fontWeight: 600, fontSize: '9px', textTransform: 'uppercase' }}>Access</th>
                    <th style={{ textAlign: 'center', padding: '8px 0', color: '#718096', fontWeight: 600, fontSize: '9px', textTransform: 'uppercase' }}>MFA</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((user, idx) => (
                    <tr key={idx} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                      <td style={{ padding: '8px 0', color: '#a0aec0', fontSize: '10px' }}>{user.email.split('@')[0]}</td>
                      <td style={{ textAlign: 'center', padding: '8px 0', color: '#fff', fontWeight: 600 }}>{user.owns}</td>
                      <td style={{ textAlign: 'center', padding: '8px 0', color: '#fff', fontWeight: 600 }}>{user.access}</td>
                      <td style={{ textAlign: 'center', padding: '8px 0' }}>
                        <span style={{ color: user.mfa ? '#48bb78' : '#f56565', fontWeight: 600, fontSize: '12px' }}>
                          {user.mfa ? '✓' : '✗'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="bg-[#1a1f2e] border border-[rgba(255,255,255,0.1)] rounded-lg p-6">
            <h3 className="text-lg font-semibold text-white mb-6">Permission Breakdown</h3>
            <div className="space-y-4">
              {permissions.map((perm, idx) => (
                <div key={idx}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                    <span style={{ color: '#a0aec0', fontSize: '11px', fontWeight: 600 }}>{perm.label}</span>
                    <span style={{ color: '#fff', fontWeight: 600 }}>{perm.count}</span>
                  </div>
                  <div style={{ height: '6px', background: 'rgba(255,255,255,0.1)', borderRadius: '3px', overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: '100%', background: perm.color }}></div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
