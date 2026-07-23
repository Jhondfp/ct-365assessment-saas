import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Loader } from 'lucide-react';

export default function GovernanceSharing() {
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

  const riskyShares = [
    { doc: 'Q3_Financial_Report.xlsx', sharedWith: 'Anyone with link', type: 'PUBLIC', risk: 'HIGH' },
    { doc: 'Employee_Salaries.xlsx', sharedWith: 'Contoso Group', type: 'GROUP', risk: 'HIGH' },
    { doc: 'Strategy_2024_Plan.pptx', sharedWith: 'External Domain', type: 'EXTERNAL', risk: 'HIGH' },
    { doc: 'Legal_Case_Files.docx', sharedWith: 'Anyone with link', type: 'PUBLIC', risk: 'HIGH' },
    { doc: 'Client_Database.xlsx', sharedWith: 'Guest User', type: 'GUEST', risk: 'HIGH' },
  ];

  const sharingByType = [
    { type: 'Public "Anyone"', count: 24, percentage: 15, color: '#f56565' },
    { type: 'External Users', count: 78, percentage: 50, color: '#EA5A1C' },
    { type: 'Guest Users', count: 54, percentage: 35, color: '#EA5A1C' },
    { type: 'Internal Only', count: 89, percentage: 57, color: '#48bb78' },
    { type: 'Anonymous Links', count: 12, percentage: 8, color: '#667eea' },
  ];

  return (
    <div className="min-h-screen bg-[#0f1219] p-8">
      <div className="max-w-7xl mx-auto space-y-8">
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-3xl font-bold text-white mb-2">Sharing Analysis</h1>
            <p className="text-[#a0aec0]">External sharing, public access and data exposure risk assessment</p>
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
            <h2 className="text-sm font-semibold uppercase tracking-wide mb-4 opacity-95">Sharing Overview</h2>
            <div className="text-5xl font-bold mb-4">156</div>
            <p className="text-base leading-relaxed opacity-95 max-w-lg">external sharing links identified. 24 sensitive documents shared with public or groups.</p>
          </div>
          <div className="flex gap-8">
            <div className="text-center">
              <div className="text-xs font-semibold uppercase opacity-90 mb-2">External Sharing</div>
              <div className="text-3xl font-bold">156</div>
              <div className="text-xs font-semibold uppercase">links</div>
            </div>
            <div className="text-center">
              <div className="text-xs font-semibold uppercase opacity-90 mb-2">Public Access</div>
              <div className="text-3xl font-bold">24</div>
              <div className="text-xs font-semibold uppercase">docs</div>
            </div>
            <div className="text-center">
              <div className="text-xs font-semibold uppercase opacity-90 mb-2">Risky Links</div>
              <div className="text-3xl font-bold">12</div>
              <div className="text-xs font-semibold uppercase">issues</div>
            </div>
          </div>
        </div>

        {/* Metrics Grid */}
        <div className="grid grid-cols-6 gap-4">
          <div className="bg-[#1a1f2e] border border-[rgba(255,255,255,0.1)] rounded-lg p-6 hover:border-[rgba(234,90,28,0.3)] transition">
            <div className="text-xs font-semibold text-[#718096] uppercase tracking-wide mb-3">External Sharing</div>
            <div className="text-3xl font-bold text-[#f56565] mb-2">156</div>
            <p className="text-sm text-[#a0aec0]">active shares</p>
          </div>

          <div className="bg-[#1a1f2e] border border-[rgba(255,255,255,0.1)] rounded-lg p-6 hover:border-[rgba(234,90,28,0.3)] transition">
            <div className="text-xs font-semibold text-[#718096] uppercase tracking-wide mb-3">Public "Anyone" Links</div>
            <div className="text-3xl font-bold text-[#EA5A1C] mb-2">24</div>
            <p className="text-sm text-[#a0aec0]">exposed</p>
          </div>

          <div className="bg-[#1a1f2e] border border-[rgba(255,255,255,0.1)] rounded-lg p-6 hover:border-[rgba(234,90,28,0.3)] transition">
            <div className="text-xs font-semibold text-[#718096] uppercase tracking-wide mb-3">Organization Links</div>
            <div className="text-3xl font-bold text-[#EA5A1C] mb-2">89</div>
            <p className="text-sm text-[#a0aec0]">internal</p>
          </div>

          <div className="bg-[#1a1f2e] border border-[rgba(255,255,255,0.1)] rounded-lg p-6 hover:border-[rgba(234,90,28,0.3)] transition">
            <div className="text-xs font-semibold text-[#718096] uppercase tracking-wide mb-3">Group Links</div>
            <div className="text-3xl font-bold text-[#EA5A1C] mb-2">43</div>
            <p className="text-sm text-[#a0aec0]">groups</p>
          </div>

          <div className="bg-[#1a1f2e] border border-[rgba(255,255,255,0.1)] rounded-lg p-6 hover:border-[rgba(234,90,28,0.3)] transition">
            <div className="text-xs font-semibold text-[#718096] uppercase tracking-wide mb-3">Guest Users</div>
            <div className="text-3xl font-bold text-[#EA5A1C] mb-2">78</div>
            <p className="text-sm text-[#a0aec0]">active</p>
          </div>

          <div className="bg-[#1a1f2e] border border-[rgba(255,255,255,0.1)] rounded-lg p-6 hover:border-[rgba(234,90,28,0.3)] transition">
            <div className="text-xs font-semibold text-[#718096] uppercase tracking-wide mb-3">Risk Score</div>
            <div className="text-3xl font-bold text-[#f56565] mb-2">6.8/10</div>
            <p className="text-sm text-[#a0aec0]">HIGH RISK</p>
          </div>
        </div>

        {/* Risky Shares Table */}
        <div className="bg-[#1a1f2e] border border-[rgba(255,255,255,0.1)] rounded-lg p-6">
          <h3 className="text-lg font-semibold text-white mb-4">Risky Shares (High Risk)</h3>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', fontSize: '12px', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.05)' }}>
                  <th style={{ padding: '12px', textAlign: 'left', fontWeight: 600, color: '#718096', textTransform: 'uppercase', fontSize: '10px' }}>Document</th>
                  <th style={{ padding: '12px', textAlign: 'left', fontWeight: 600, color: '#718096', textTransform: 'uppercase', fontSize: '10px' }}>Shared With</th>
                  <th style={{ padding: '12px', textAlign: 'center', fontWeight: 600, color: '#718096', textTransform: 'uppercase', fontSize: '10px' }}>Type</th>
                  <th style={{ padding: '12px', textAlign: 'center', fontWeight: 600, color: '#718096', textTransform: 'uppercase', fontSize: '10px' }}>Risk</th>
                  <th style={{ padding: '12px', textAlign: 'center', fontWeight: 600, color: '#718096', textTransform: 'uppercase', fontSize: '10px' }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {riskyShares.map((share, idx) => (
                  <tr key={idx} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                    <td style={{ padding: '12px', color: '#fff', fontWeight: 600 }}>{share.doc}</td>
                    <td style={{ padding: '12px', color: '#a0aec0' }}>{share.sharedWith}</td>
                    <td style={{ padding: '12px', textAlign: 'center' }}>
                      <span style={{ background: share.type === 'PUBLIC' ? 'rgba(245,101,101,0.2)' : 'rgba(234,90,28,0.2)', color: share.type === 'PUBLIC' ? '#f56565' : '#EA5A1C', padding: '4px 8px', borderRadius: '4px', fontSize: '9px', fontWeight: 600, textTransform: 'uppercase' }}>
                        {share.type}
                      </span>
                    </td>
                    <td style={{ padding: '12px', textAlign: 'center' }}>
                      <span style={{ background: 'rgba(245,101,101,0.2)', color: '#f56565', padding: '4px 8px', borderRadius: '4px', fontSize: '9px', fontWeight: 600, textTransform: 'uppercase' }}>
                        HIGH
                      </span>
                    </td>
                    <td style={{ padding: '12px', textAlign: 'center' }}>
                      <button style={{ background: 'rgba(102,126,234,0.2)', color: '#667eea', padding: '4px 8px', borderRadius: '3px', border: 'none', fontSize: '9px', fontWeight: 600, cursor: 'pointer', textTransform: 'uppercase' }}>
                        Review
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Sharing by Type */}
        <div className="bg-[#1a1f2e] border border-[rgba(255,255,255,0.1)] rounded-lg p-6">
          <h3 className="text-lg font-semibold text-white mb-6">Sharing by Type</h3>
          <div className="space-y-6">
            {sharingByType.map((item, idx) => (
              <div key={idx}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                  <span style={{ color: '#a0aec0', fontSize: '12px', fontWeight: 600 }}>{item.type}</span>
                  <span style={{ color: '#fff', fontWeight: 600 }}>{item.count}</span>
                </div>
                <div style={{ height: '6px', background: 'rgba(255,255,255,0.1)', borderRadius: '3px', overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${item.percentage}%`, background: item.color }}></div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
