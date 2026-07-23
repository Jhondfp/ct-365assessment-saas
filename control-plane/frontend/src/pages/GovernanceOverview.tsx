import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { AlertCircle, Loader } from 'lucide-react';

interface OverviewMetrics {
  totalSites: number;
  avgHealthScore: number;
  healthySites: number;
  warningSites: number;
  criticalSites: number;
  openFindings: number;
  mfaEnabledUsers: number;
  mfaDisabledUsers: number;
  riskyShares: number;
  totalStorageGb: number;
}

const defaultMetrics: OverviewMetrics = {
  totalSites: 42,
  avgHealthScore: 78,
  healthySites: 28,
  warningSites: 10,
  criticalSites: 4,
  openFindings: 12,
  mfaEnabledUsers: 284,
  mfaDisabledUsers: 28,
  riskyShares: 24,
  totalStorageGb: 542,
};

export default function GovernanceOverview() {
  const { clientId } = useParams<{ clientId: string }>();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [metrics, setMetrics] = useState<OverviewMetrics>(defaultMetrics);

  useEffect(() => {
    const loadMetrics = async () => {
      try {
        setLoading(true);
        // TODO: Replace with actual API call
        // const response = await fetch(`/api/governance/clients/${clientId}/overview`);
        // const data = await response.json();
        // setMetrics(data.data);
        setTimeout(() => setLoading(false), 500);
      } catch (err) {
        console.error(err);
        setLoading(false);
      }
    };
    loadMetrics();
  }, [clientId]);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0f1219] flex items-center justify-center">
        <Loader className="w-8 h-8 text-[#EA5A1C] animate-spin" />
      </div>
    );
  }

  const mfaPercentage = Math.round((metrics.mfaEnabledUsers / (metrics.mfaEnabledUsers + metrics.mfaDisabledUsers)) * 100);

  return (
    <div className="min-h-screen bg-[#0f1219] p-8">
      <div className="max-w-7xl mx-auto space-y-8">
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-3xl font-bold text-white mb-2">Governance Overview</h1>
            <p className="text-[#a0aec0]">Consolidated governance status, health scores and compliance metrics</p>
          </div>
          <button
            onClick={() => navigate(`/clientes/${clientId}`)}
            className="px-4 py-2 bg-[rgba(255,255,255,0.1)] text-[#a0aec0] rounded-lg hover:bg-[rgba(255,255,255,0.15)] transition"
          >
            ← Back
          </button>
        </div>

        {/* Hero Card */}
        <div className="bg-gradient-to-r from-[#EA5A1C] to-[#8b3fa0] rounded-lg p-8 mb-8 text-white shadow-lg flex justify-between items-center">
          <div>
            <h2 className="text-sm font-semibold uppercase tracking-wide mb-4 opacity-95">Governance Health Score</h2>
            <div className="text-5xl font-bold mb-4 leading-tight">{metrics.avgHealthScore}</div>
            <p className="text-base leading-relaxed opacity-95 max-w-lg">Overall governance score based on analysis of {metrics.totalSites} sites, 24.847 files and 312 users with access.</p>
          </div>
          <div className="flex gap-8">
            <div className="text-center">
              <div className="text-xs font-semibold uppercase tracking-wide opacity-90 mb-2">Healthy Sites</div>
              <div className="text-3xl font-bold mb-1">{metrics.healthySites}</div>
              <div className="text-xs font-semibold uppercase">good status</div>
            </div>
            <div className="text-center">
              <div className="text-xs font-semibold uppercase tracking-wide opacity-90 mb-2">MFA Enabled</div>
              <div className="text-3xl font-bold mb-1">{mfaPercentage}%</div>
              <div className="text-xs font-semibold uppercase">users</div>
            </div>
            <div className="text-center">
              <div className="text-xs font-semibold uppercase tracking-wide opacity-90 mb-2">Compliance</div>
              <div className="text-3xl font-bold mb-1">92%</div>
              <div className="text-xs font-semibold uppercase">adherence</div>
            </div>
          </div>
        </div>

        {/* Metrics Grid */}
        <div className="grid grid-cols-6 gap-4">
          <div className="bg-[#1a1f2e] border border-[rgba(255,255,255,0.1)] rounded-lg p-6 hover:border-[rgba(234,90,28,0.3)] transition">
            <div className="text-xs font-semibold text-[#718096] uppercase tracking-wide mb-3">Total Sites</div>
            <div className="text-3xl font-bold text-[#EA5A1C] mb-2 leading-tight">{metrics.totalSites}</div>
            <p className="text-sm text-[#a0aec0]">monitored</p>
          </div>

          <div className="bg-[#1a1f2e] border border-[rgba(255,255,255,0.1)] rounded-lg p-6 hover:border-[rgba(234,90,28,0.3)] transition">
            <div className="text-xs font-semibold text-[#718096] uppercase tracking-wide mb-3">Security Findings</div>
            <div className="text-3xl font-bold text-[#f56565] mb-2 leading-tight">{metrics.openFindings}</div>
            <p className="text-sm text-[#a0aec0]">open issues</p>
          </div>

          <div className="bg-[#1a1f2e] border border-[rgba(255,255,255,0.1)] rounded-lg p-6 hover:border-[rgba(234,90,28,0.3)] transition">
            <div className="text-xs font-semibold text-[#718096] uppercase tracking-wide mb-3">No MFA Users</div>
            <div className="text-3xl font-bold text-[#EA5A1C] mb-2 leading-tight">{metrics.mfaDisabledUsers}</div>
            <p className="text-sm text-[#a0aec0]">require action</p>
          </div>

          <div className="bg-[#1a1f2e] border border-[rgba(255,255,255,0.1)] rounded-lg p-6 hover:border-[rgba(234,90,28,0.3)] transition">
            <div className="text-xs font-semibold text-[#718096] uppercase tracking-wide mb-3">Risky Shares</div>
            <div className="text-3xl font-bold text-[#f56565] mb-2 leading-tight">{metrics.riskyShares}</div>
            <p className="text-sm text-[#a0aec0]">external access</p>
          </div>

          <div className="bg-[#1a1f2e] border border-[rgba(255,255,255,0.1)] rounded-lg p-6 hover:border-[rgba(234,90,28,0.3)] transition">
            <div className="text-xs font-semibold text-[#718096] uppercase tracking-wide mb-3">Storage Used</div>
            <div className="text-3xl font-bold text-[#EA5A1C] mb-2 leading-tight">{metrics.totalStorageGb} GB</div>
            <div style={{ height: '6px', background: 'rgba(255,255,255,0.1)', borderRadius: '3px', overflow: 'hidden', marginTop: '8px' }}>
              <div style={{ height: '100%', width: '54%', background: '#EA5A1C', borderRadius: '3px' }}></div>
            </div>
            <p className="text-sm text-[#a0aec0]">of 1 TB (54%)</p>
          </div>

          <div className="bg-[#1a1f2e] border border-[rgba(255,255,255,0.1)] rounded-lg p-6 hover:border-[rgba(234,90,28,0.3)] transition">
            <div className="text-xs font-semibold text-[#718096] uppercase tracking-wide mb-3">Stale Files</div>
            <div className="text-3xl font-bold text-[#EA5A1C] mb-2 leading-tight">3.421</div>
            <p className="text-sm text-[#a0aec0]">over 365 days</p>
          </div>
        </div>

        {/* Navigation Cards */}
        <div className="grid grid-cols-3 gap-4">
          <button
            onClick={() => navigate(`/clientes/${clientId}/governance/security`)}
            className="bg-[#1a1f2e] border border-[rgba(255,255,255,0.1)] rounded-lg p-6 hover:border-[#EA5A1C] hover:bg-[#242d3f] transition text-left"
          >
            <div className="text-lg font-semibold text-white mb-2">Security & Compliance</div>
            <p className="text-sm text-[#a0aec0]">Framework compliance, findings and MFA status</p>
          </button>

          <button
            onClick={() => navigate(`/clientes/${clientId}/governance/sites`)}
            className="bg-[#1a1f2e] border border-[rgba(255,255,255,0.1)] rounded-lg p-6 hover:border-[#EA5A1C] hover:bg-[#242d3f] transition text-left"
          >
            <div className="text-lg font-semibold text-white mb-2">Sites Analysis</div>
            <p className="text-sm text-[#a0aec0]">Health scores, compliance rates and detailed breakdown</p>
          </button>

          <button
            onClick={() => navigate(`/clientes/${clientId}/governance/storage`)}
            className="bg-[#1a1f2e] border border-[rgba(255,255,255,0.1)] rounded-lg p-6 hover:border-[#EA5A1C] hover:bg-[#242d3f] transition text-left"
          >
            <div className="text-lg font-semibold text-white mb-2">Storage & Optimization</div>
            <p className="text-sm text-[#a0aec0]">Stale files, duplicates, trash and cost analysis</p>
          </button>

          <button
            onClick={() => navigate(`/clientes/${clientId}/governance/sharing`)}
            className="bg-[#1a1f2e] border border-[rgba(255,255,255,0.1)] rounded-lg p-6 hover:border-[#EA5A1C] hover:bg-[#242d3f] transition text-left"
          >
            <div className="text-lg font-semibold text-white mb-2">Sharing Analysis</div>
            <p className="text-sm text-[#a0aec0]">External sharing, public access and guest users</p>
          </button>

          <button
            onClick={() => navigate(`/clientes/${clientId}/governance/permissions`)}
            className="bg-[#1a1f2e] border border-[rgba(255,255,255,0.1)] rounded-lg p-6 hover:border-[#EA5A1C] hover:bg-[#242d3f] transition text-left"
          >
            <div className="text-lg font-semibold text-white mb-2">Permissions & Risk</div>
            <p className="text-sm text-[#a0aec0]">Permission levels, access reviews and risk assessment</p>
          </button>

          <button
            onClick={() => navigate(`/clientes/${clientId}/governance/recommendations`)}
            className="bg-[#1a1f2e] border border-[rgba(255,255,255,0.1)] rounded-lg p-6 hover:border-[#EA5A1C] hover:bg-[#242d3f] transition text-left"
          >
            <div className="text-lg font-semibold text-white mb-2">Recommendations</div>
            <p className="text-sm text-[#a0aec0]">Filterable recommendations by severity</p>
          </button>
        </div>
      </div>
    </div>
  );
}
