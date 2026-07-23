import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Loader } from 'lucide-react';

interface Site {
  id: string;
  name: string;
  owner: string;
  ownerEmail: string;
  healthScore: number;
  complianceRate: number;
  users: number;
  storageGb: number;
  issues: number;
}

const defaultSites: Site[] = [
  { id: '1', name: 'Legal Hub', owner: 'john.smith@company.com', ownerEmail: 'john.smith@company.com', healthScore: 95, complianceRate: 95, users: 42, storageGb: 45.2, issues: 1 },
  { id: '2', name: 'Finance Team', owner: 'maria.silva@company.com', ownerEmail: 'maria.silva@company.com', healthScore: 88, complianceRate: 88, users: 28, storageGb: 78.9, issues: 3 },
  { id: '3', name: 'HR Operations', owner: 'admin@company.com', ownerEmail: 'admin@company.com', healthScore: 82, complianceRate: 82, users: 35, storageGb: 56.3, issues: 5 },
  { id: '4', name: 'Marketing Hub', owner: 'sarah.jones@company.com', ownerEmail: 'sarah.jones@company.com', healthScore: 76, complianceRate: 76, users: 22, storageGb: 124.5, issues: 8 },
  { id: '5', name: 'IT Operations', owner: 'admin-it@company.com', ownerEmail: 'admin-it@company.com', healthScore: 71, complianceRate: 71, users: 18, storageGb: 234.7, issues: 12 },
  { id: '6', name: 'Sales Office', owner: 'unassigned', ownerEmail: '', healthScore: 45, complianceRate: 45, users: 0, storageGb: 2.8, issues: 15 },
  { id: '7', name: 'PR Department', owner: 'unassigned', ownerEmail: '', healthScore: 38, complianceRate: 38, users: 0, storageGb: 0.1, issues: 18 },
  { id: '8', name: 'Engineering Hub', owner: 'tech.lead@company.com', ownerEmail: 'tech.lead@company.com', healthScore: 68, complianceRate: 68, users: 48, storageGb: 156.2, issues: 22 },
];

export default function GovernanceSites() {
  const { clientId } = useParams<{ clientId: string }>();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [sites, setSites] = useState<Site[]>(defaultSites);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    const loadSites = async () => {
      try {
        setLoading(true);
        setTimeout(() => setLoading(false), 500);
      } catch (err) {
        console.error(err);
        setLoading(false);
      }
    };
    loadSites();
  }, [clientId]);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0f1219] flex items-center justify-center">
        <Loader className="w-8 h-8 text-[#EA5A1C] animate-spin" />
      </div>
    );
  }

  const filteredSites = sites.filter(s => s.name.toLowerCase().includes(searchTerm.toLowerCase()));
  const avgHealth = Math.round(sites.reduce((sum, s) => sum + s.healthScore, 0) / sites.length);

  const getScoreBadgeColor = (score: number) => {
    if (score >= 80) return '#48bb78';
    if (score >= 60) return '#ecc94b';
    return '#f56565';
  };

  return (
    <div className="min-h-screen bg-[#0f1219] p-8">
      <div className="max-w-7xl mx-auto space-y-8">
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-3xl font-bold text-white mb-2">Sites Analysis</h1>
            <p className="text-[#a0aec0]">Detailed analysis of {sites.length} SharePoint sites with health scores and compliance</p>
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
            <h2 className="text-sm font-semibold uppercase tracking-wide mb-4 opacity-95">Sites Monitored</h2>
            <div className="text-5xl font-bold mb-4">{sites.length}</div>
            <p className="text-base leading-relaxed opacity-95 max-w-lg">sites analyzed with distribution: {sites.filter(s => s.healthScore >= 80).length} healthy, {sites.filter(s => s.healthScore >= 60 && s.healthScore < 80).length} warning, {sites.filter(s => s.healthScore < 60).length} critical.</p>
          </div>
          <div className="flex gap-8">
            <div className="text-center">
              <div className="text-xs font-semibold uppercase opacity-90 mb-2">Healthy</div>
              <div className="text-3xl font-bold">{sites.filter(s => s.healthScore >= 80).length}</div>
            </div>
            <div className="text-center">
              <div className="text-xs font-semibold uppercase opacity-90 mb-2">Warning</div>
              <div className="text-3xl font-bold">{sites.filter(s => s.healthScore >= 60 && s.healthScore < 80).length}</div>
            </div>
            <div className="text-center">
              <div className="text-xs font-semibold uppercase opacity-90 mb-2">Critical</div>
              <div className="text-3xl font-bold">{sites.filter(s => s.healthScore < 60).length}</div>
            </div>
          </div>
        </div>

        {/* Metrics Grid */}
        <div className="grid grid-cols-6 gap-4">
          <div className="bg-[#1a1f2e] border border-[rgba(255,255,255,0.1)] rounded-lg p-6 hover:border-[rgba(234,90,28,0.3)] transition">
            <div className="text-xs font-semibold text-[#718096] uppercase tracking-wide mb-3">Avg Health Score</div>
            <div className="text-3xl font-bold text-[#EA5A1C] mb-2">{avgHealth}</div>
            <p className="text-sm text-[#a0aec0]">out of 100</p>
          </div>

          <div className="bg-[#1a1f2e] border border-[rgba(255,255,255,0.1)] rounded-lg p-6 hover:border-[rgba(234,90,28,0.3)] transition">
            <div className="text-xs font-semibold text-[#718096] uppercase tracking-wide mb-3">Total Users</div>
            <div className="text-3xl font-bold text-[#EA5A1C] mb-2">312</div>
            <p className="text-sm text-[#a0aec0]">with access</p>
          </div>

          <div className="bg-[#1a1f2e] border border-[rgba(255,255,255,0.1)] rounded-lg p-6 hover:border-[rgba(234,90,28,0.3)] transition">
            <div className="text-xs font-semibold text-[#718096] uppercase tracking-wide mb-3">Total Storage</div>
            <div className="text-3xl font-bold text-[#EA5A1C] mb-2">542 GB</div>
            <p className="text-sm text-[#a0aec0]">of 1 TB</p>
          </div>

          <div className="bg-[#1a1f2e] border border-[rgba(255,255,255,0.1)] rounded-lg p-6 hover:border-[rgba(234,90,28,0.3)] transition">
            <div className="text-xs font-semibold text-[#718096] uppercase tracking-wide mb-3">Compliance Rate</div>
            <div className="text-3xl font-bold text-[#EA5A1C] mb-2">92%</div>
            <p className="text-sm text-[#a0aec0]">conformance</p>
          </div>

          <div className="bg-[#1a1f2e] border border-[rgba(255,255,255,0.1)] rounded-lg p-6 hover:border-[rgba(234,90,28,0.3)] transition">
            <div className="text-xs font-semibold text-[#718096] uppercase tracking-wide mb-3">Unowned Sites</div>
            <div className="text-3xl font-bold text-[#f56565] mb-2">3</div>
            <p className="text-sm text-[#a0aec0]">critical</p>
          </div>

          <div className="bg-[#1a1f2e] border border-[rgba(255,255,255,0.1)] rounded-lg p-6 hover:border-[rgba(234,90,28,0.3)] transition">
            <div className="text-xs font-semibold text-[#718096] uppercase tracking-wide mb-3">Last Scan</div>
            <div className="text-3xl font-bold text-[#EA5A1C] mb-2">2h</div>
            <p className="text-sm text-[#a0aec0]">ago</p>
          </div>
        </div>

        {/* Search Bar */}
        <div className="bg-[#1a1f2e] border border-[rgba(255,255,255,0.1)] rounded-lg p-4 flex gap-4">
          <input
            type="text"
            placeholder="Search site..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{ flex: 1, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '5px', color: '#fff', padding: '8px 12px', fontSize: '12px' }}
          />
          <span style={{ color: '#718096', fontSize: '11px', padding: '8px' }}>Showing {filteredSites.length} of {sites.length} sites</span>
        </div>

        {/* Sites Table */}
        <div className="bg-[#1a1f2e] border border-[rgba(255,255,255,0.1)] rounded-lg overflow-hidden">
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.05)' }}>
                  <th style={{ padding: '12px', textAlign: 'left', fontWeight: 600, color: '#718096', textTransform: 'uppercase', fontSize: '10px' }}>Site Name</th>
                  <th style={{ padding: '12px', textAlign: 'left', fontWeight: 600, color: '#718096', textTransform: 'uppercase', fontSize: '10px' }}>Owner</th>
                  <th style={{ padding: '12px', textAlign: 'center', fontWeight: 600, color: '#718096', textTransform: 'uppercase', fontSize: '10px' }}>Health</th>
                  <th style={{ padding: '12px', textAlign: 'center', fontWeight: 600, color: '#718096', textTransform: 'uppercase', fontSize: '10px' }}>Compliance</th>
                  <th style={{ padding: '12px', textAlign: 'center', fontWeight: 600, color: '#718096', textTransform: 'uppercase', fontSize: '10px' }}>Users</th>
                  <th style={{ padding: '12px', textAlign: 'center', fontWeight: 600, color: '#718096', textTransform: 'uppercase', fontSize: '10px' }}>Storage</th>
                  <th style={{ padding: '12px', textAlign: 'center', fontWeight: 600, color: '#718096', textTransform: 'uppercase', fontSize: '10px' }}>Issues</th>
                  <th style={{ padding: '12px', textAlign: 'center', fontWeight: 600, color: '#718096', textTransform: 'uppercase', fontSize: '10px' }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {filteredSites.map((site) => (
                  <tr key={site.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                    <td style={{ padding: '12px', color: '#fff', fontWeight: 600 }}>{site.name}</td>
                    <td style={{ padding: '12px', color: '#a0aec0', fontSize: '11px' }}>{site.owner === 'unassigned' ? '(unassigned)' : site.owner}</td>
                    <td style={{ padding: '12px', textAlign: 'center' }}>
                      <span style={{ background: site.healthScore >= 80 ? 'rgba(72,187,120,0.2)' : site.healthScore >= 60 ? 'rgba(236,201,75,0.2)' : 'rgba(245,101,101,0.2)', color: getScoreBadgeColor(site.healthScore), padding: '4px 8px', borderRadius: '4px', fontSize: '10px', fontWeight: 600 }}>
                        {site.healthScore} {site.healthScore >= 80 ? '- Excellent' : site.healthScore >= 60 ? '- Good' : '- Poor'}
                      </span>
                    </td>
                    <td style={{ padding: '12px', textAlign: 'center', color: '#a0aec0', fontWeight: 600 }}>{site.complianceRate}%</td>
                    <td style={{ padding: '12px', textAlign: 'center', color: '#a0aec0' }}>{site.users}</td>
                    <td style={{ padding: '12px', textAlign: 'center', color: '#a0aec0' }}>{site.storageGb} GB</td>
                    <td style={{ padding: '12px', textAlign: 'center' }}>
                      <span style={{ background: site.issues > 10 ? 'rgba(245,101,101,0.2)' : site.issues > 5 ? 'rgba(236,201,75,0.2)' : 'rgba(72,187,120,0.2)', color: site.issues > 10 ? '#f56565' : site.issues > 5 ? '#ecc94b' : '#48bb78', padding: '4px 8px', borderRadius: '4px', fontSize: '10px', fontWeight: 600 }}>
                        {site.issues} {site.issues > 10 ? 'HIGH' : site.issues > 5 ? 'MED' : 'LOW'}
                      </span>
                    </td>
                    <td style={{ padding: '12px', textAlign: 'center' }}>
                      <button style={{ background: 'rgba(102,126,234,0.2)', color: '#667eea', padding: '4px 8px', borderRadius: '3px', border: 'none', fontSize: '9px', fontWeight: 600, cursor: 'pointer', textTransform: 'uppercase' }}>
                        View
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
