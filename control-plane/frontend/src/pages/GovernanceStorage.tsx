import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Loader } from 'lucide-react';

export default function GovernanceStorage() {
  const { clientId } = useParams<{ clientId: string }>();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);

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

  const storageOpportunities = [
    { label: 'Remove Stale Files', size: 87.2, color: '#f56565', importance: 'critical' },
    { label: 'Consolidate Duplicates', size: 34, color: '#ecc94b', importance: 'high' },
    { label: 'Clean Empty Folders', size: 2.1, color: '#48bb78', importance: 'medium' },
    { label: 'Archive Large Files', size: 18.9, color: '#ecc94b', importance: 'high' },
  ];

  const totalSavings = storageOpportunities.reduce((sum, s) => sum + s.size, 0);

  return (
    <div className="min-h-screen bg-[#0f1219] p-8">
      <div className="max-w-7xl mx-auto space-y-8">
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-3xl font-bold text-white mb-2">Storage & Optimization</h1>
            <p className="text-[#a0aec0]">Storage analysis, stale files, duplicates and cost optimization opportunities</p>
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
            <h2 className="text-sm font-semibold uppercase tracking-wide mb-4 opacity-95">Storage Overview</h2>
            <div className="text-5xl font-bold mb-4">542 GB</div>
            <p className="text-base leading-relaxed opacity-95 max-w-lg">consumed from 1 TB (54%). Savings potential: {totalSavings.toFixed(1)} GB removing stale and duplicate files.</p>
          </div>
          <div className="flex gap-8">
            <div className="text-center">
              <div className="text-xs font-semibold uppercase opacity-90 mb-2">Used</div>
              <div className="text-3xl font-bold">542</div>
              <div className="text-xs font-semibold uppercase">GB</div>
            </div>
            <div className="text-center">
              <div className="text-xs font-semibold uppercase opacity-90 mb-2">Available</div>
              <div className="text-3xl font-bold">458</div>
              <div className="text-xs font-semibold uppercase">GB</div>
            </div>
            <div className="text-center">
              <div className="text-xs font-semibold uppercase opacity-90 mb-2">Savings Potential</div>
              <div className="text-3xl font-bold">121</div>
              <div className="text-xs font-semibold uppercase">GB</div>
            </div>
            <div className="text-center">
              <div className="text-xs font-semibold uppercase opacity-90 mb-2">Monthly Cost</div>
              <div className="text-3xl font-bold">R$1.9K</div>
              <div className="text-xs font-semibold uppercase">storage</div>
            </div>
          </div>
        </div>

        {/* Metrics Grid */}
        <div className="grid grid-cols-6 gap-4">
          <div className="bg-[#1a1f2e] border border-[rgba(255,255,255,0.1)] rounded-lg p-6 hover:border-[rgba(234,90,28,0.3)] transition">
            <div className="text-xs font-semibold text-[#718096] uppercase tracking-wide mb-3">Stale Files (>365d)</div>
            <div className="text-3xl font-bold text-[#EA5A1C] mb-2">3.421</div>
            <p className="text-sm text-[#a0aec0]">87.2 GB | R$218/mês</p>
          </div>

          <div className="bg-[#1a1f2e] border border-[rgba(255,255,255,0.1)] rounded-lg p-6 hover:border-[rgba(234,90,28,0.3)] transition">
            <div className="text-xs font-semibold text-[#718096] uppercase tracking-wide mb-3">Duplicate Files</div>
            <div className="text-3xl font-bold text-[#EA5A1C] mb-2">847</div>
            <p className="text-sm text-[#a0aec0]">34 GB | R$85/mês</p>
          </div>

          <div className="bg-[#1a1f2e] border border-[rgba(255,255,255,0.1)] rounded-lg p-6 hover:border-[rgba(234,90,28,0.3)] transition">
            <div className="text-xs font-semibold text-[#718096] uppercase tracking-wide mb-3">Trash Items</div>
            <div className="text-3xl font-bold text-[#EA5A1C] mb-2">14.523</div>
            <p className="text-sm text-[#a0aec0]">542.3 GB | Being held</p>
          </div>

          <div className="bg-[#1a1f2e] border border-[rgba(255,255,255,0.1)] rounded-lg p-6 hover:border-[rgba(234,90,28,0.3)] transition">
            <div className="text-xs font-semibold text-[#718096] uppercase tracking-wide mb-3">Empty Folders</div>
            <div className="text-3xl font-bold text-[#EA5A1C] mb-2">342</div>
            <p className="text-sm text-[#a0aec0]">2.1 GB | Clean up</p>
          </div>

          <div className="bg-[#1a1f2e] border border-[rgba(255,255,255,0.1)] rounded-lg p-6 hover:border-[rgba(234,90,28,0.3)] transition">
            <div className="text-xs font-semibold text-[#718096] uppercase tracking-wide mb-3">Large Files (>100MB)</div>
            <div className="text-3xl font-bold text-[#EA5A1C] mb-2">128</div>
            <p className="text-sm text-[#a0aec0]">56.7 GB | Review</p>
          </div>

          <div className="bg-[#1a1f2e] border border-[rgba(255,255,255,0.1)] rounded-lg p-6 hover:border-[rgba(234,90,28,0.3)] transition">
            <div className="text-xs font-semibold text-[#718096] uppercase tracking-wide mb-3">Annual Savings</div>
            <div className="text-3xl font-bold text-[#48bb78] mb-2">R$3.6K</div>
            <p className="text-sm text-[#a0aec0]">potential</p>
          </div>
        </div>

        {/* Optimization Opportunities */}
        <div className="bg-[#1a1f2e] border border-[rgba(255,255,255,0.1)] rounded-lg p-6">
          <h3 className="text-lg font-semibold text-white mb-6">Optimization Opportunities</h3>
          <div className="space-y-6">
            {storageOpportunities.map((opp, idx) => (
              <div key={idx}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <span style={{ color: '#a0aec0', fontSize: '12px', fontWeight: 600 }}>{opp.label}</span>
                  <span style={{ color: opp.color, fontWeight: 600 }}>{opp.size} GB</span>
                </div>
                <div style={{ height: '6px', background: 'rgba(255,255,255,0.1)', borderRadius: '3px', overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: '100%', background: opp.color, borderRadius: '3px' }}></div>
                </div>
              </div>
            ))}
            <div style={{ borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: '16px', marginTop: '16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ color: '#fff', fontWeight: 700, fontSize: '13px' }}>Total Savings</span>
                <span style={{ color: '#48bb78', fontWeight: 700, fontSize: '16px' }}>{totalSavings.toFixed(1)} GB</span>
              </div>
              <div style={{ fontSize: '11px', color: '#718096', marginTop: '6px' }}>
                Economia anual potencial: <strong>R$ 3.556</strong>
              </div>
            </div>
          </div>
        </div>

        {/* Top Storage by Site */}
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-[#1a1f2e] border border-[rgba(255,255,255,0.1)] rounded-lg p-6">
            <h3 className="text-lg font-semibold text-white mb-4">Storage by Site (Top 5)</h3>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', fontSize: '11px' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                    <th style={{ textAlign: 'left', padding: '8px 0', color: '#718096', fontWeight: 600, fontSize: '9px', textTransform: 'uppercase' }}>Site</th>
                    <th style={{ textAlign: 'right', padding: '8px 0', color: '#718096', fontWeight: 600, fontSize: '9px', textTransform: 'uppercase' }}>Storage</th>
                  </tr>
                </thead>
                <tbody>
                  <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                    <td style={{ padding: '8px 0', color: '#a0aec0' }}>IT Operations</td>
                    <td style={{ textAlign: 'right', padding: '8px 0', color: '#EA5A1C', fontWeight: 600 }}>234.7 GB</td>
                  </tr>
                  <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                    <td style={{ padding: '8px 0', color: '#a0aec0' }}>Engineering Hub</td>
                    <td style={{ textAlign: 'right', padding: '8px 0', color: '#EA5A1C', fontWeight: 600 }}>156.2 GB</td>
                  </tr>
                  <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                    <td style={{ padding: '8px 0', color: '#a0aec0' }}>Marketing Hub</td>
                    <td style={{ textAlign: 'right', padding: '8px 0', color: '#EA5A1C', fontWeight: 600 }}>124.5 GB</td>
                  </tr>
                  <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                    <td style={{ padding: '8px 0', color: '#a0aec0' }}>Finance Team</td>
                    <td style={{ textAlign: 'right', padding: '8px 0', color: '#EA5A1C', fontWeight: 600 }}>78.9 GB</td>
                  </tr>
                  <tr>
                    <td style={{ padding: '8px 0', color: '#a0aec0' }}>Legal Hub</td>
                    <td style={{ textAlign: 'right', padding: '8px 0', color: '#EA5A1C', fontWeight: 600 }}>45.2 GB</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <div className="bg-[#1a1f2e] border border-[rgba(255,255,255,0.1)] rounded-lg p-6">
            <h3 className="text-lg font-semibold text-white mb-4">Stale Files by Age</h3>
            <div className="space-y-4">
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                  <span style={{ color: '#a0aec0', fontSize: '11px' }}>1-2 years old</span>
                  <span style={{ color: '#fff', fontWeight: 600 }}>1.234 files</span>
                </div>
                <div style={{ height: '6px', background: 'rgba(255,255,255,0.1)', borderRadius: '3px', overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: '60%', background: '#ecc94b' }}></div>
                </div>
              </div>
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                  <span style={{ color: '#a0aec0', fontSize: '11px' }}>2-3 years old</span>
                  <span style={{ color: '#fff', fontWeight: 600 }}>987 files</span>
                </div>
                <div style={{ height: '6px', background: 'rgba(255,255,255,0.1)', borderRadius: '3px', overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: '50%', background: '#EA5A1C' }}></div>
                </div>
              </div>
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                  <span style={{ color: '#a0aec0', fontSize: '11px' }}>3+ years old</span>
                  <span style={{ color: '#fff', fontWeight: 600 }}>200 files</span>
                </div>
                <div style={{ height: '6px', background: 'rgba(255,255,255,0.1)', borderRadius: '3px', overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: '40%', background: '#f56565' }}></div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
