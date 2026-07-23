import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { AlertCircle, Loader } from 'lucide-react';

interface SecurityMetrics {
  securityScore: number;
  criticalFindings: number;
  highRiskUsers: number;
  unownedSites: number;
  externalShares: number;
  inactiveUsers: number;
  compliantSites: number;
  nonCompliantSites: number;
  mfaEnabledPercentage: number;
}

const defaultMetrics: SecurityMetrics = {
  securityScore: 72,
  criticalFindings: 12,
  highRiskUsers: 28,
  unownedSites: 3,
  externalShares: 156,
  inactiveUsers: 67,
  compliantSites: 34,
  nonCompliantSites: 8,
  mfaEnabledPercentage: 87,
};

const findingsByCategory = [
  { category: 'External Sharing', count: 24, severity: 'HIGH' },
  { category: 'Weak Permissions', count: 18, severity: 'HIGH' },
  { category: 'MFA Not Enabled', count: 28, severity: 'HIGH' },
  { category: 'Inactive Users', count: 67, severity: 'MEDIUM' },
  { category: 'Unowned Sites', count: 3, severity: 'MEDIUM' },
  { category: 'Sensitive Data Access', count: 12, severity: 'HIGH' },
  { category: 'DLP Policy Gaps', count: 8, severity: 'MEDIUM' },
  { category: 'Retention Policy Missing', count: 5, severity: 'LOW' },
];

const complianceFrameworks = [
  { name: 'Data Encryption', gdpr: 'compliant', hipaa: 'compliant', soc2: 'compliant', iso27001: 'compliant' },
  { name: 'Access Control', gdpr: 'compliant', hipaa: 'partial', soc2: 'compliant', iso27001: 'compliant' },
  { name: 'Audit Logging', gdpr: 'compliant', hipaa: 'compliant', soc2: 'compliant', iso27001: 'compliant' },
  { name: 'DLP Policies', gdpr: 'partial', hipaa: 'partial', soc2: 'compliant', iso27001: 'partial' },
  { name: 'MFA Enforcement', gdpr: 'partial', hipaa: 'compliant', soc2: 'compliant', iso27001: 'compliant' },
  { name: 'Data Retention', gdpr: 'compliant', hipaa: 'non-compliant', soc2: 'compliant', iso27001: 'compliant' },
];

export default function GovernanceSecurity() {
  const { clientId } = useParams<{ clientId: string }>();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [metrics, setMetrics] = useState<SecurityMetrics>(defaultMetrics);

  useEffect(() => {
    const loadMetrics = async () => {
      try {
        setLoading(true);
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

  return (
    <div className="min-h-screen bg-[#0f1219] p-8">
      <div className="max-w-7xl mx-auto space-y-8">
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-3xl font-bold text-white mb-2">Security & Compliance</h1>
            <p className="text-[#a0aec0]">Security analysis, regulatory compliance and risk findings</p>
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
            <h2 className="text-sm font-semibold uppercase tracking-wide mb-4 opacity-95">Compliance Status</h2>
            <div className="text-5xl font-bold mb-4">92%</div>
            <p className="text-base leading-relaxed opacity-95 max-w-lg">Overall adherence to security and compliance policies. {metrics.nonCompliantSites} sites require remediation.</p>
          </div>
          <div className="flex gap-8">
            <div className="text-center">
              <div className="text-xs font-semibold uppercase opacity-90 mb-2">Compliant</div>
              <div className="text-3xl font-bold">{metrics.compliantSites}</div>
              <div className="text-xs font-semibold uppercase">sites</div>
            </div>
            <div className="text-center">
              <div className="text-xs font-semibold uppercase opacity-90 mb-2">Non-Compliant</div>
              <div className="text-3xl font-bold">{metrics.nonCompliantSites}</div>
              <div className="text-xs font-semibold uppercase">sites</div>
            </div>
            <div className="text-center">
              <div className="text-xs font-semibold uppercase opacity-90 mb-2">MFA Enabled</div>
              <div className="text-3xl font-bold">{metrics.mfaEnabledPercentage}%</div>
              <div className="text-xs font-semibold uppercase">users</div>
            </div>
          </div>
        </div>

        {/* Metrics Grid */}
        <div className="grid grid-cols-6 gap-4">
          <div className="bg-[#1a1f2e] border border-[rgba(255,255,255,0.1)] rounded-lg p-6 hover:border-[rgba(234,90,28,0.3)] transition">
            <div className="text-xs font-semibold text-[#718096] uppercase tracking-wide mb-3">Security Score</div>
            <div className="text-3xl font-bold text-[#EA5A1C] mb-2">{metrics.securityScore}</div>
            <p className="text-sm text-[#a0aec0]">Needs Improvement</p>
          </div>

          <div className="bg-[#1a1f2e] border border-[rgba(255,255,255,0.1)] rounded-lg p-6 hover:border-[rgba(234,90,28,0.3)] transition">
            <div className="text-xs font-semibold text-[#718096] uppercase tracking-wide mb-3">Critical Findings</div>
            <div className="text-3xl font-bold text-[#f56565] mb-2">{metrics.criticalFindings}</div>
            <p className="text-sm text-[#a0aec0]">active issues</p>
          </div>

          <div className="bg-[#1a1f2e] border border-[rgba(255,255,255,0.1)] rounded-lg p-6 hover:border-[rgba(234,90,28,0.3)] transition">
            <div className="text-xs font-semibold text-[#718096] uppercase tracking-wide mb-3">High Risk Users</div>
            <div className="text-3xl font-bold text-[#EA5A1C] mb-2">{metrics.highRiskUsers}</div>
            <p className="text-sm text-[#a0aec0]">without MFA</p>
          </div>

          <div className="bg-[#1a1f2e] border border-[rgba(255,255,255,0.1)] rounded-lg p-6 hover:border-[rgba(234,90,28,0.3)] transition">
            <div className="text-xs font-semibold text-[#718096] uppercase tracking-wide mb-3">Unowned Sites</div>
            <div className="text-3xl font-bold text-[#ecc94b] mb-2">{metrics.unownedSites}</div>
            <p className="text-sm text-[#a0aec0]">without owner</p>
          </div>

          <div className="bg-[#1a1f2e] border border-[rgba(255,255,255,0.1)] rounded-lg p-6 hover:border-[rgba(234,90,28,0.3)] transition">
            <div className="text-xs font-semibold text-[#718096] uppercase tracking-wide mb-3">Ext. Sharing</div>
            <div className="text-3xl font-bold text-[#f56565] mb-2">{metrics.externalShares}</div>
            <p className="text-sm text-[#a0aec0]">shares</p>
          </div>

          <div className="bg-[#1a1f2e] border border-[rgba(255,255,255,0.1)] rounded-lg p-6 hover:border-[rgba(234,90,28,0.3)] transition">
            <div className="text-xs font-semibold text-[#718096] uppercase tracking-wide mb-3">Inactive Users</div>
            <div className="text-3xl font-bold text-[#EA5A1C] mb-2">{metrics.inactiveUsers}</div>
            <p className="text-sm text-[#a0aec0]">no login (90d)</p>
          </div>
        </div>

        {/* Compliance Framework */}
        <div className="bg-[#1a1f2e] border border-[rgba(255,255,255,0.1)] rounded-lg p-6">
          <h3 className="text-lg font-semibold text-white mb-4">Compliance Framework Matrix</h3>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                  <th style={{ padding: '10px', textAlign: 'left', fontWeight: 600, color: '#718096', textTransform: 'uppercase', fontSize: '10px' }}>Control</th>
                  <th style={{ padding: '10px', textAlign: 'center', fontWeight: 600, color: '#718096', textTransform: 'uppercase', fontSize: '10px', minWidth: '80px' }}>GDPR</th>
                  <th style={{ padding: '10px', textAlign: 'center', fontWeight: 600, color: '#718096', textTransform: 'uppercase', fontSize: '10px', minWidth: '80px' }}>HIPAA</th>
                  <th style={{ padding: '10px', textAlign: 'center', fontWeight: 600, color: '#718096', textTransform: 'uppercase', fontSize: '10px', minWidth: '80px' }}>SOC2</th>
                  <th style={{ padding: '10px', textAlign: 'center', fontWeight: 600, color: '#718096', textTransform: 'uppercase', fontSize: '10px', minWidth: '80px' }}>ISO27001</th>
                </tr>
              </thead>
              <tbody>
                {complianceFrameworks.map((row, idx) => (
                  <tr key={idx} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                    <td style={{ padding: '10px', color: '#a0aec0' }}>{row.name}</td>
                    <td style={{ padding: '10px', textAlign: 'center', background: row.gdpr === 'compliant' ? 'rgba(72,187,120,0.15)' : row.gdpr === 'partial' ? 'rgba(236,201,75,0.15)' : 'rgba(245,101,101,0.15)', color: row.gdpr === 'compliant' ? '#48bb78' : row.gdpr === 'partial' ? '#ecc94b' : '#f56565', fontWeight: 600 }}>
                      {row.gdpr === 'compliant' ? '✓' : row.gdpr === 'partial' ? '~' : '✗'}
                    </td>
                    <td style={{ padding: '10px', textAlign: 'center', background: row.hipaa === 'compliant' ? 'rgba(72,187,120,0.15)' : row.hipaa === 'partial' ? 'rgba(236,201,75,0.15)' : 'rgba(245,101,101,0.15)', color: row.hipaa === 'compliant' ? '#48bb78' : row.hipaa === 'partial' ? '#ecc94b' : '#f56565', fontWeight: 600 }}>
                      {row.hipaa === 'compliant' ? '✓' : row.hipaa === 'partial' ? '~' : '✗'}
                    </td>
                    <td style={{ padding: '10px', textAlign: 'center', background: row.soc2 === 'compliant' ? 'rgba(72,187,120,0.15)' : row.soc2 === 'partial' ? 'rgba(236,201,75,0.15)' : 'rgba(245,101,101,0.15)', color: row.soc2 === 'compliant' ? '#48bb78' : row.soc2 === 'partial' ? '#ecc94b' : '#f56565', fontWeight: 600 }}>
                      {row.soc2 === 'compliant' ? '✓' : row.soc2 === 'partial' ? '~' : '✗'}
                    </td>
                    <td style={{ padding: '10px', textAlign: 'center', background: row.iso27001 === 'compliant' ? 'rgba(72,187,120,0.15)' : row.iso27001 === 'partial' ? 'rgba(236,201,75,0.15)' : 'rgba(245,101,101,0.15)', color: row.iso27001 === 'compliant' ? '#48bb78' : row.iso27001 === 'partial' ? '#ecc94b' : '#f56565', fontWeight: 600 }}>
                      {row.iso27001 === 'compliant' ? '✓' : row.iso27001 === 'partial' ? '~' : '✗'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Security Findings */}
        <div className="bg-[#1a1f2e] border border-[rgba(255,255,255,0.1)] rounded-lg p-6">
          <h3 className="text-lg font-semibold text-white mb-4">Security Findings by Category</h3>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                  <th style={{ padding: '10px', textAlign: 'left', fontWeight: 600, color: '#718096', textTransform: 'uppercase', fontSize: '10px' }}>Category</th>
                  <th style={{ padding: '10px', textAlign: 'center', fontWeight: 600, color: '#718096', textTransform: 'uppercase', fontSize: '10px' }}>Count</th>
                  <th style={{ padding: '10px', textAlign: 'center', fontWeight: 600, color: '#718096', textTransform: 'uppercase', fontSize: '10px' }}>Severity</th>
                  <th style={{ padding: '10px', textAlign: 'center', fontWeight: 600, color: '#718096', textTransform: 'uppercase', fontSize: '10px' }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {findingsByCategory.map((finding, idx) => (
                  <tr key={idx} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                    <td style={{ padding: '10px', color: '#a0aec0' }}>{finding.category}</td>
                    <td style={{ padding: '10px', textAlign: 'center', color: '#fff', fontWeight: 600 }}>{finding.count}</td>
                    <td style={{ padding: '10px', textAlign: 'center' }}>
                      <span style={{ background: finding.severity === 'HIGH' ? 'rgba(245,101,101,0.2)' : finding.severity === 'MEDIUM' ? 'rgba(236,201,75,0.2)' : 'rgba(72,187,120,0.2)', color: finding.severity === 'HIGH' ? '#f56565' : finding.severity === 'MEDIUM' ? '#ecc94b' : '#48bb78', padding: '4px 8px', borderRadius: '4px', fontSize: '9px', fontWeight: 600, textTransform: 'uppercase' }}>
                        {finding.severity}
                      </span>
                    </td>
                    <td style={{ padding: '10px', textAlign: 'center' }}>
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
      </div>
    </div>
  );
}
