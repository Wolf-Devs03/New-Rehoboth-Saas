import React, { useState, useEffect } from 'react';
import { ViewType, KPIMetric, TopOwner, RecentReport, AuditReport } from '../types';
import { dashboardKPIs, topOwners, recentReports, ownersList } from '../data';
import { calculateCompanyKPIs } from '../utils/mappingEngine';
import { getDailyServicingRows } from '../utils/indexedDB';
import { 
  TrendingUp, 
  Users, 
  UploadCloud, 
  History, 
  ExternalLink, 
  ChevronRight, 
  AlertCircle, 
  AlertTriangle,
  CheckCircle2, 
  DollarSign, 
  Award,
  Activity,
  Calendar,
  Layers,
  ShieldCheck,
  Sparkles,
  FileDown
} from 'lucide-react';
import { motion } from 'motion/react';
import { useCompany } from './CompanyContext';
import { exportKPIReportToPDF } from '../utils/pdfExport';

interface DashboardViewProps {
  onNavigate: (view: ViewType) => void;
  onSelectOwner: (name: string) => void;
}

export default function DashboardView({ onNavigate, onSelectOwner }: DashboardViewProps) {
  const { companyName } = useCompany();
  const [validationWarnings, setValidationWarnings] = useState<any[]>(() => {
    const saved = localStorage.getItem('kpiValidationWarnings');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {}
    }
    return [];
  });

  useEffect(() => {
    const reloadWarnings = () => {
      const saved = localStorage.getItem('kpiValidationWarnings');
      if (saved) {
        try {
          setValidationWarnings(JSON.parse(saved));
        } catch (e) {}
      } else {
        setValidationWarnings([]);
      }
    };
    window.addEventListener('people-reclassified', reloadWarnings);
    window.addEventListener('storage', reloadWarnings);
    return () => {
      window.removeEventListener('people-reclassified', reloadWarnings);
      window.removeEventListener('storage', reloadWarnings);
    };
  }, []);

  const [kpis, setKpis] = useState<KPIMetric[]>(() => {
    const saved = localStorage.getItem('dashboardKPIs');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        console.error(e);
      }
    }
    return [];
  });

  const computeTopOwnersList = (rows: any[]): TopOwner[] => {
    if (rows && rows.length > 0) {
      const firstRow = rows[0];
      let volCol = '';
      for (const key of Object.keys(firstRow)) {
        const kLower = key.toLowerCase();
        if (kLower.includes('volume') || kLower.includes('amount') || kLower.includes('value')) {
          volCol = key;
          break;
        }
      }

      if (volCol) {
        const agentSums: { [agentId: string]: number } = {};
        const agentZones: { [agentId: string]: string } = {};
        const agentNames: { [agentId: string]: string } = {};

        rows.forEach(row => {
          const agentId = row['Agent ID'] || row['AgentID'] || row['masterAgentId'] || '';
          const zone = row['Zone'] || row['Region'] || 'Master';
          const name = row['Wakala Name'] || row['Name'] || '';
          
          let volStr = String(row[volCol] || '0').replace(/,/g, '').trim();
          const val = parseFloat(volStr) || 0;

          if (agentId) {
            agentSums[agentId] = (agentSums[agentId] || 0) + val;
            if (zone) agentZones[agentId] = zone;
            if (name && !agentNames[agentId]) agentNames[agentId] = name;
          }
        });

        const mappedOwners = Object.keys(agentSums).map(agentId => {
          const matchedOwner = ownersList.find(o => o.masterAgentId === agentId);
          const name = matchedOwner ? matchedOwner.name : (agentNames[agentId] || `Agent ${agentId}`);
          const zone = matchedOwner ? matchedOwner.region : (agentZones[agentId] || 'Master');
          const totalVal = agentSums[agentId];

          return {
            name,
            zone,
            totalVal,
            agentId
          };
        });

        mappedOwners.sort((a, b) => b.totalVal - a.totalVal);

        const maxVal = mappedOwners[0]?.totalVal || 1;
        
        return mappedOwners.slice(0, 4).map((item, idx) => {
          const pct = maxVal > 0 ? Math.round((item.totalVal / maxVal) * 1000) / 10 : 0;
          let formattedAmt = '';
          const val = item.totalVal;
          if (val >= 1000000) {
            formattedAmt = `TZS ${(val / 1000000).toFixed(1)}M`;
          } else if (val >= 1000) {
            formattedAmt = `TZS ${(val / 1000).toFixed(0)}K`;
          } else {
            formattedAmt = `TZS ${val}`;
          }

          return {
            rank: idx + 1,
            name: item.name,
            zone: item.zone,
            percentage: pct,
            amount: formattedAmt
          };
        });
      }
    }
    return [];
  };

  const [companyKPIs, setCompanyKPIs] = useState(() => calculateCompanyKPIs([]));
  const [topOwnersList, setTopOwnersList] = useState<TopOwner[]>([]);

  // Dynamic Recent Reports list derived from the persisted audit history logs
  const [recentReportsList, setRecentReportsList] = useState<RecentReport[]>(() => {
    const savedReports = localStorage.getItem('auditHistoryReports');
    if (savedReports) {
      try {
        const reports = JSON.parse(savedReports);
        if (Array.isArray(reports) && reports.length > 0) {
          return reports.slice(0, 4).map((r: AuditReport) => {
            let statusVal: 'success' | 'warning' | 'error' = 'success';
            if (r.status === 'Failed') statusVal = 'error';
            else if (r.status === 'Processing') statusVal = 'warning';
            return {
              name: r.fileName,
              time: r.date.toUpperCase(),
              zone: r.type.toUpperCase(),
              status: statusVal
            };
          });
        }
      } catch (e) {
        console.error("Failed to load dynamic reports list:", e);
      }
    }
    return [];
  });

  useEffect(() => {
    let isMounted = true;

    const loadData = async () => {
      let rows: any[] = [];
      try {
        rows = await getDailyServicingRows();
      } catch (e) {
        console.error("Failed to load daily servicing rows in DashboardView:", e);
      }

      if (isMounted) {
        setCompanyKPIs(calculateCompanyKPIs(rows));
        setTopOwnersList(computeTopOwnersList(rows));
      }
    };

    loadData();

    const handleUpdate = () => {
      loadData();

      const savedKpis = localStorage.getItem('dashboardKPIs');
      if (savedKpis) {
        try {
          setKpis(JSON.parse(savedKpis));
        } catch (e) {
          setKpis([]);
        }
      } else {
        setKpis([]);
      }

      const savedReports = localStorage.getItem('auditHistoryReports');
      if (savedReports) {
        try {
          const reports = JSON.parse(savedReports);
          if (Array.isArray(reports)) {
            setRecentReportsList(reports.slice(0, 4).map((r: AuditReport) => {
              let statusVal: 'success' | 'warning' | 'error' = 'success';
              if (r.status === 'Failed') statusVal = 'error';
              else if (r.status === 'Processing') statusVal = 'warning';
              return {
                name: r.fileName,
                time: r.date.toUpperCase(),
                zone: r.type.toUpperCase(),
                status: statusVal
              };
            }));
          } else {
            setRecentReportsList([]);
          }
        } catch (e) {
          setRecentReportsList([]);
        }
      } else {
        setRecentReportsList([]);
      }
    };

    window.addEventListener('servicing-rows-updated', handleUpdate);
    window.addEventListener('storage', handleUpdate);

    return () => {
      isMounted = false;
      window.removeEventListener('servicing-rows-updated', handleUpdate);
      window.removeEventListener('storage', handleUpdate);
    };
  }, []);

  // Dynamic metrics calculation based on uploaded KPI report
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth(); // 0-indexed
  const day = now.getDate();
  const totalDays = new Date(year, month + 1, 0).getDate();
  const daysRemaining = totalDays - day;
  const elapsedDays = Math.max(day, 1);

  const monthNames = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
  const currentMonthName = monthNames[month];
  const prevMonthName = monthNames[(month - 1 + 12) % 12];
  const nextUploadDate = `${totalDays} ${currentMonthName}`;

  // Filter financial KPIs
  const financialKPIs = kpis.filter(k => 
    k.target.toUpperCase().includes('TZS') || 
    k.name.toLowerCase().includes('value') || 
    k.name.toLowerCase().includes('float') || 
    k.name.toLowerCase().includes('liquidity')
  );

  const activeFinancialKPIs = financialKPIs.length > 0 ? financialKPIs : kpis;

  const totalTargetVal = activeFinancialKPIs.reduce((sum, k) => sum + (k.targetVal || 0), 0);
  const totalAchievedVal = activeFinancialKPIs.reduce((sum, k) => sum + (k.achievedVal || 0), 0);

  // Set currency prefix to TZS exclusively
  const currencyPrefix = 'TZS ';

  const formatValue = (val: number, prefix: string) => {
    if (val >= 1000000) {
      return `${prefix}${(val / 1000000).toFixed(1)}M`;
    }
    if (val >= 1000) {
      return `${prefix}${(val / 1000).toFixed(1)}K`;
    }
    return `${prefix}${val}`;
  };

  const displayTarget = formatValue(totalTargetVal, currencyPrefix);
  const displayAchieved = formatValue(totalAchievedVal, currencyPrefix);

  const overallPerf = totalTargetVal > 0 ? (totalAchievedVal / totalTargetVal) * 100 : 0;
  const overallPerfString = `${overallPerf.toFixed(1)}%`;

  const projectedVal = (totalAchievedVal / elapsedDays) * totalDays;
  const displayProjected = formatValue(projectedVal, currencyPrefix);

  const projDiffPercent = totalTargetVal > 0 ? ((projectedVal - totalTargetVal) / totalTargetVal) * 100 : 0;
  const projDiffString = projDiffPercent >= 0 
    ? `+${projDiffPercent.toFixed(1)}% of Target` 
    : `${projDiffPercent.toFixed(1)}% of Target`;

  const finalAchievedY = Math.max(10, Math.min(90, 100 - overallPerf));

  // Animation variant for staggered list entrances
  const containerVariants = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: { staggerChildren: 0.08 }
    }
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 15 },
    show: { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 260, damping: 25 } }
  };

  const normalizeStatus = (statusStr: string, performance?: number): 'ON TRACK' | 'ACHIEVED' | 'NEEDS ATTENTION' | 'CRITICAL' => {
    const s = String(statusStr || '').trim().toUpperCase();
    if (s.includes('ACHIEVED') || s.includes('EXCEEDED') || s.includes('MET') || s === 'SUCCESS' || s === 'GREEN' || s === 'GOOD') {
      return 'ACHIEVED';
    }
    if (s.includes('AVERAGE')) {
      return 'NEEDS ATTENTION';
    }
    if (s.includes('ATTENTION') || s.includes('WARN') || s.includes('RISK') || s.includes('BEHIND') || s === 'YELLOW') {
      return 'NEEDS ATTENTION';
    }
    if (s.includes('CRITICAL') || s.includes('BELOW') || s.includes('FAIL') || s.includes('ERROR') || s === 'RED') {
      return 'CRITICAL';
    }
    if (s.includes('ON TRACK') || s === 'OK' || s === 'NORMAL') {
      return 'ON TRACK';
    }

    // Safety net derivation using actual performance percentage
    if (performance !== undefined && !isNaN(performance)) {
      if (performance >= 100) return 'ACHIEVED';
      if (performance >= 85) return 'ON TRACK';
      if (performance >= 60) return 'NEEDS ATTENTION';
      return 'CRITICAL';
    }

    return 'ON TRACK';
  };

  const getSemanticBadgeInfo = (status: string, performance?: number) => {
    const norm = normalizeStatus(status, performance);
    switch (norm) {
      case 'ACHIEVED':
        return {
          normalized: 'ACHIEVED' as const,
          badgeText: 'Achieved',
          bgClass: 'bg-status-success-bg text-status-success-text border-status-success-border/60',
          progressClass: 'bg-status-success-text',
          indicatorColor: 'text-status-success-text'
        };
      case 'NEEDS ATTENTION':
        return {
          normalized: 'NEEDS ATTENTION' as const,
          badgeText: String(status || '').toUpperCase().includes('RISK') ? 'At Risk' : 'Needs Attention',
          bgClass: 'bg-status-warning-bg text-status-warning-text border-status-warning-border/60',
          progressClass: 'bg-status-warning-text',
          indicatorColor: 'text-status-warning-text'
        };
      case 'CRITICAL':
        return {
          normalized: 'CRITICAL' as const,
          badgeText: 'Critical',
          bgClass: 'bg-status-error-bg text-status-error-text border-status-error-border/60',
          progressClass: 'bg-status-error-text',
          indicatorColor: 'text-status-error-text'
        };
      default:
        return {
          normalized: 'ON TRACK' as const,
          badgeText: 'On Track',
          bgClass: 'bg-status-info-bg text-brand-primary border-status-info-border/60',
          progressClass: 'bg-brand-primary-light',
          indicatorColor: 'text-brand-primary'
        };
    }
  };

  const getStatusStyle = (status: string, performance?: number) => {
    return getSemanticBadgeInfo(status, performance).bgClass;
  };

  const getProgressColor = (status: string, performance?: number) => {
    return getSemanticBadgeInfo(status, performance).progressClass;
  };

  const getActionRecommendation = (kpiName: string) => {
    const nameLower = kpiName.toLowerCase();
    if (nameLower.includes('value') || nameLower.includes('servicing')) {
      return "Mobilize top regional distributors in underperforming zones and adjust local liquidity float rules.";
    }
    if (nameLower.includes('active') || nameLower.includes('wakala')) {
      return "Substantial inactive wakalas detected. Implement localized promotional incentives and dispatch territory support.";
    }
    if (nameLower.includes('product') || nameLower.includes('seller')) {
      return "Low seller engagement. Conduct targeted onboarding workshops and evaluate terminal commissions.";
    }
    return "Perform localized operational audit. Contact regional owners to optimize terminal liquidity limits.";
  };

  const highPriorityKPIs = kpis.filter(kpi => {
    const norm = getSemanticBadgeInfo(kpi.status, kpi.performance).normalized;
    return norm === 'CRITICAL' || norm === 'NEEDS ATTENTION';
  });

  const handleExportPDF = () => {
    exportKPIReportToPDF({
      kpis,
      overallPerfString,
      displayTarget,
      displayAchieved,
      displayProjected,
      projDiffString,
      daysRemaining,
      nextUploadDate,
    });
  };

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="space-y-6 max-w-[1440px] mx-auto p-4 sm:p-6 lg:p-8"
    >
      {/* Upper Welcome Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="font-sans text-2xl sm:text-3xl font-extrabold tracking-tight text-brand-text">Executive Dashboard</h2>
          <p className="font-sans text-sm text-brand-text-variant mt-1">Real-time oversight of {companyName} intelligence and monthly KPI targets.</p>
        </div>
        <div className="flex flex-wrap gap-3">
          <button 
            onClick={handleExportPDF}
            className="flex items-center gap-2 rounded-xl border border-brand-gray-border bg-brand-card px-4 py-2.5 font-sans text-sm font-semibold text-brand-text hover:bg-brand-gray-hover hover:border-brand-gray-border transition-all cursor-pointer"
            id="export-pdf-btn"
          >
            <FileDown className="h-4.5 w-4.5 text-brand-primary" />
            Export PDF
          </button>
          <button 
            onClick={() => onNavigate(ViewType.KPI_REPORTS)}
            className="flex items-center gap-2 rounded-xl border border-brand-gray-border bg-brand-card px-4 py-2.5 font-sans text-sm font-semibold text-brand-primary hover:bg-brand-gray-hover transition-all cursor-pointer"
            id="kpi-analysis-btn"
          >
            <TrendingUp className="h-4.5 w-4.5" />
            KPI Analysis
          </button>
          <button 
            onClick={() => onNavigate(ViewType.UPLOAD_REPORTS)}
            className="flex items-center gap-2 rounded-xl bg-brand-primary px-4 py-2.5 font-sans text-sm font-semibold text-white shadow-ambient hover:bg-brand-primary-light transition-all cursor-pointer"
            id="upload-reports-quick-btn"
          >
            <UploadCloud className="h-4.5 w-4.5" />
            Upload New Data
          </button>
        </div>
      </div>

      {/* Today and Month to Date Rows */}
      {companyKPIs.reportingMonth === '—' ? (
        <div className="bg-brand-card border border-brand-gray-border rounded-2xl p-8 shadow-ambient flex flex-col items-center justify-center text-center gap-4 py-12">
          <div className="h-14 w-14 rounded-2xl bg-brand-primary/10 text-brand-primary flex items-center justify-center">
            <UploadCloud className="h-7 w-7" />
          </div>
          <div className="space-y-1 max-w-md">
            <h4 className="font-sans text-base font-black text-slate-800">
              No Data Ingested Yet
            </h4>
            <p className="font-sans text-xs text-brand-text-variant font-medium leading-relaxed">
              No data uploaded yet — go to Upload Reports to get started.
            </p>
          </div>
          <button
            onClick={() => onNavigate(ViewType.UPLOAD_REPORTS)}
            className="mt-2 inline-flex items-center gap-2 bg-brand-primary text-white text-xs font-bold px-4 py-2.5 rounded-xl cursor-pointer hover:bg-opacity-90 transition-all shadow-sm"
          >
            <UploadCloud className="h-4 w-4" />
            Upload Reports
          </button>
        </div>
      ) : (
        <>
          {/* Today Row */}
          <div className="space-y-2">
            <div className="flex items-center gap-2 px-1">
              <Calendar className="h-4 w-4 text-brand-primary" />
              <h3 className="font-sans text-xs font-black uppercase tracking-wider text-brand-primary">Today ({companyKPIs.latestDay})</h3>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* Total Company Opening Float */}
              <div className="rounded-2xl border border-brand-gray-border bg-brand-card p-5 shadow-ambient flex flex-col justify-between">
                <div>
                  <span className="block font-sans text-[10px] font-bold text-brand-text-variant uppercase tracking-wider">Total Company Opening Float</span>
                  <span className="block font-sans text-xl font-black text-brand-text mt-2 font-mono">
                    TZS {companyKPIs.openingFloat.toLocaleString()}
                  </span>
                </div>
                <span className="inline-block mt-3 self-start font-sans text-[10px] font-bold text-brand-text-variant bg-brand-gray-hover px-2 py-0.5 rounded">
                  STARTING BALANCE
                </span>
              </div>

              {/* Total Company Float Received */}
              <div className="rounded-2xl border border-brand-gray-border bg-brand-card p-5 shadow-ambient flex flex-col justify-between">
                <div>
                  <span className="block font-sans text-[10px] font-bold text-brand-text-variant uppercase tracking-wider">Total Company Float Received</span>
                  <span className="block font-sans text-xl font-black text-status-success-text mt-2 font-mono">
                    TZS {companyKPIs.floatReceived.toLocaleString()}
                  </span>
                </div>
                <span className="inline-block mt-3 self-start font-sans text-[10px] font-bold text-status-success-text bg-status-success-bg px-2 py-0.5 rounded">
                  FLOAT INGESTED
                </span>
              </div>

              {/* Total Company Float Served */}
              <div className="rounded-2xl border border-brand-gray-border bg-brand-card p-5 shadow-ambient flex flex-col justify-between">
                <div>
                  <span className="block font-sans text-[10px] font-bold text-brand-text-variant uppercase tracking-wider">Total Company Float Served</span>
                  <span className="block font-sans text-xl font-black text-status-info-text mt-2 font-mono">
                    TZS {companyKPIs.floatServed.toLocaleString()}
                  </span>
                </div>
                <span className="inline-block mt-3 self-start font-sans text-[10px] font-bold text-status-info-text bg-status-info-bg px-2 py-0.5 rounded">
                  FLOAT SERVED
                </span>
              </div>

              {/* Total Company Closing Float */}
              <div className="rounded-2xl border border-brand-gray-border bg-brand-card p-5 shadow-ambient flex flex-col justify-between">
                <div>
                  <span className="block font-sans text-[10px] font-bold text-brand-text-variant uppercase tracking-wider">Total Company Closing Float</span>
                  <span className="block font-sans text-xl font-black text-brand-text mt-2 font-mono">
                    TZS {companyKPIs.closingFloat.toLocaleString()}
                  </span>
                </div>
                <span className="inline-block mt-3 self-start font-sans text-[10px] font-bold text-brand-text-variant bg-brand-gray-hover px-2 py-0.5 rounded">
                  ENDING BALANCE
                </span>
              </div>
            </div>
          </div>

          {/* Month to Date Row */}
          <div className="space-y-2">
            <div className="flex items-center gap-2 px-1">
              <Activity className="h-4 w-4 text-brand-primary" />
              <h3 className="font-sans text-xs font-black uppercase tracking-wider text-brand-primary">Month to Date ({companyKPIs.reportingMonth})</h3>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* MTD Opening Float */}
              <div className="rounded-2xl border border-brand-gray-border bg-brand-card p-5 shadow-ambient flex flex-col justify-between">
                <div>
                  <span className="block font-sans text-[10px] font-bold text-brand-text-variant uppercase tracking-wider">MTD Opening Float</span>
                  <span className="block font-sans text-xl font-black text-brand-text mt-2 font-mono">
                    TZS {companyKPIs.mtdOpeningFloat.toLocaleString()}
                  </span>
                </div>
                <span className="inline-block mt-3 self-start font-sans text-[10px] font-bold text-brand-text-variant bg-brand-gray-hover px-2 py-0.5 rounded">
                  MONTH OPENING
                </span>
              </div>

              {/* MTD Float Received */}
              <div className="rounded-2xl border border-brand-gray-border bg-brand-card p-5 shadow-ambient flex flex-col justify-between">
                <div>
                  <span className="block font-sans text-[10px] font-bold text-brand-text-variant uppercase tracking-wider">MTD Float Received</span>
                  <span className="block font-sans text-xl font-black text-status-success-text mt-2 font-mono">
                    TZS {companyKPIs.mtdFloatReceived.toLocaleString()}
                  </span>
                </div>
                <span className="inline-block mt-3 self-start font-sans text-[10px] font-bold text-status-success-text bg-status-success-bg px-2 py-0.5 rounded">
                  MONTH INGESTED
                </span>
              </div>

              {/* MTD Float Served */}
              <div className="rounded-2xl border border-brand-gray-border bg-brand-card p-5 shadow-ambient flex flex-col justify-between">
                <div>
                  <span className="block font-sans text-[10px] font-bold text-brand-text-variant uppercase tracking-wider">MTD Float Served</span>
                  <span className="block font-sans text-xl font-black text-status-info-text mt-2 font-mono">
                    TZS {companyKPIs.mtdFloatServed.toLocaleString()}
                  </span>
                </div>
                <span className="inline-block mt-3 self-start font-sans text-[10px] font-bold text-status-info-text bg-status-info-bg px-2 py-0.5 rounded">
                  MONTH SERVED
                </span>
              </div>

              {/* MTD Closing Float */}
              <div className="rounded-2xl border border-brand-gray-border bg-brand-card p-5 shadow-ambient flex flex-col justify-between">
                <div>
                  <span className="block font-sans text-[10px] font-bold text-brand-text-variant uppercase tracking-wider">MTD Closing Float</span>
                  <span className="block font-sans text-xl font-black text-brand-text mt-2 font-mono">
                    TZS {companyKPIs.mtdClosingFloat.toLocaleString()}
                  </span>
                </div>
                <span className="inline-block mt-3 self-start font-sans text-[10px] font-bold text-brand-text-variant bg-brand-gray-hover px-2 py-0.5 rounded">
                  MONTH CLOSING
                </span>
              </div>
            </div>
          </div>

          {/* Phase 4 Derived Metrics Row */}
          <div className="space-y-2">
            <div className="flex items-center gap-2 px-1">
              <ShieldCheck className="h-4 w-4 text-brand-primary" />
              <h3 className="font-sans text-xs font-black uppercase tracking-wider text-brand-primary">Derived Metrics & Settlement Ledger</h3>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Total Penalty */}
              <div className="rounded-2xl border border-rose-200 bg-rose-50/50 p-5 shadow-ambient flex flex-col justify-between">
                <div>
                  <span className="block font-sans text-[10px] font-bold text-rose-800 uppercase tracking-wider">Total Penalty</span>
                  <span className="block font-sans text-xl font-black text-rose-950 mt-2 font-mono">
                    TZS {(companyKPIs.totalPenalty || 0).toLocaleString()}
                  </span>
                </div>
                <span className="inline-block mt-3 self-start font-sans text-[10px] font-bold text-rose-800 bg-rose-200/70 px-2 py-0.5 rounded">
                  CP SERVICING VAL
                </span>
              </div>

              {/* Total IOP Ledger */}
              <div className="rounded-2xl border border-purple-200 bg-purple-50/50 p-5 shadow-ambient flex flex-col justify-between">
                <div>
                  <span className="block font-sans text-[10px] font-bold text-purple-800 uppercase tracking-wider">Total IOP Ledger</span>
                  <span className="block font-sans text-xl font-black text-purple-950 mt-2 font-mono">
                    TZS {(companyKPIs.totalIop || 0).toLocaleString()}
                  </span>
                </div>
                <span className="inline-block mt-3 self-start font-sans text-[10px] font-bold text-purple-800 bg-purple-200/70 px-2 py-0.5 rounded">
                  BASE CROSS OWNER VOLUME
                </span>
              </div>
            </div>
          </div>
        </>
      )}

      {/* 1. KPI Performance Summary Container (Upper big card) */}
      <motion.div 
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        className="rounded-2xl border border-brand-gray-border bg-brand-card p-6 shadow-ambient"
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-brand-gray-border pb-5">
          <div>
            <h3 className="font-sans text-lg font-bold text-brand-text">KPI Performance Summary</h3>
            <p className="font-sans text-xs text-brand-text-variant mt-0.5">Real-time status of critical monthly performance indicators.</p>
          </div>
          {companyKPIs.reportingMonth !== '—' && kpis.length > 0 && (
            <button 
              onClick={() => onNavigate(ViewType.KPI_REPORTS)}
              className="inline-flex items-center gap-1.5 rounded-xl bg-brand-gray-hover px-4 py-2 font-sans text-xs font-bold text-brand-primary hover:bg-brand-primary-container/40 transition-colors cursor-pointer"
              id="view-full-kpi-report-btn"
            >
              Full Report
              <ExternalLink className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        {companyKPIs.reportingMonth === '—' || kpis.length === 0 ? (
          <div className="flex flex-col items-center justify-center text-center py-10 gap-4">
            <div className="h-14 w-14 rounded-2xl bg-brand-primary/10 text-brand-primary flex items-center justify-center">
              <UploadCloud className="h-7 w-7" />
            </div>
            <div className="space-y-1 max-w-sm">
              <h4 className="font-sans text-sm font-bold text-brand-text">No KPI Summary Available</h4>
              <p className="font-sans text-xs text-brand-text-variant font-medium leading-relaxed">
                No KPI reports have been processed yet. Go to Upload Reports to ingest a KPI report or workbook.
              </p>
            </div>
            <button
              onClick={() => onNavigate(ViewType.UPLOAD_REPORTS)}
              className="inline-flex items-center gap-2 bg-brand-primary text-white text-xs font-bold px-4 py-2.5 rounded-xl cursor-pointer hover:bg-opacity-90 transition-all shadow-sm"
            >
              <UploadCloud className="h-4 w-4" />
              Upload Reports
            </button>
          </div>
        ) : (
          <>
            {/* High-Priority KPIs Attention Summary Block */}
            {highPriorityKPIs.length > 0 ? (
              <div className="mt-5 p-4 rounded-2xl border border-brand-gray-border bg-brand-gray-hover/30">
                <div className="flex items-center gap-2 mb-3">
                  <span className="flex h-2.5 w-2.5 rounded-full bg-status-error-text animate-pulse shrink-0" />
                  <h4 className="font-sans text-xs font-bold uppercase tracking-wider text-status-error-text">Action Required: Priority KPI Attention Summary</h4>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {highPriorityKPIs.map(kpi => {
                    const badge = getSemanticBadgeInfo(kpi.status, kpi.performance);
                    const isCritical = badge.normalized === 'CRITICAL';
                    return (
                      <div 
                        key={`high-priority-${kpi.id}`}
                        className="p-6 rounded-[24px] bg-brand-card border border-brand-gray-border/80 shadow-[0_8px_30px_rgba(0,0,0,0.04)] flex flex-col justify-between transition-all duration-300 hover:scale-[1.01] hover:shadow-[0_12px_40px_rgba(0,0,0,0.08)]"
                      >
                        <div>
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              {isCritical ? (
                                <span className="inline-flex items-center gap-1 px-3 py-1 font-sans text-[10px] font-black uppercase tracking-wider text-white bg-status-error-text border border-status-error-border rounded-lg shadow-sm animate-pulse">
                                  <AlertCircle className="h-3.5 w-3.5 text-white" />
                                  CRITICAL
                                </span>
                              ) : (
                                <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 font-sans text-[10px] font-bold uppercase tracking-wider ${badge.bgClass}`}>
                                  <AlertCircle className="h-3 w-3" />
                                  {badge.badgeText}
                                </span>
                              )}
                              <h5 className="font-sans text-sm font-extrabold text-brand-text mt-3.5">{kpi.name}</h5>
                            </div>
                            <div className="text-right shrink-0">
                              <span className="block font-sans text-[10px] text-brand-text-variant uppercase font-bold tracking-wider">MTD Perf.</span>
                              <span className={`font-mono text-base font-black ${isCritical ? 'text-status-error-text' : 'text-status-warning-text'}`}>{kpi.performance}%</span>
                            </div>
                          </div>
                          <p className="font-sans text-xs text-brand-text-variant font-medium mt-3 leading-relaxed">
                            {getActionRecommendation(kpi.name)}
                          </p>
                        </div>
                        <div className="mt-5 pt-3.5 border-t border-dashed border-brand-gray-border flex items-center justify-between text-[11px]">
                          <span className="font-sans font-medium text-brand-text-variant">Target: <strong className="font-mono text-brand-text font-bold">{kpi.target}</strong></span>
                          <span className="font-sans font-medium text-brand-text-variant">Achieved: <strong className="font-mono text-brand-text font-bold">{kpi.achieved}</strong></span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className="mt-5 p-4 rounded-2xl border border-status-success-border/30 bg-status-success-bg/30 flex items-center gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-status-success-bg/80 text-status-success-text shrink-0">
                  <CheckCircle2 className="h-5 w-5" />
                </div>
                <div>
                  <h5 className="font-sans text-xs font-bold text-status-success-text">Operational Summary Healthy</h5>
                  <p className="font-sans text-xs text-status-success-text/90 mt-0.5">All tracked key performance indicators are currently on track or achieved. Operational targets are stabilized.</p>
                </div>
              </div>
            )}

            {/* Column Labels */}
            <div className="mt-6 hidden md:grid grid-cols-12 gap-4 px-4 font-sans text-[11px] font-bold text-brand-text-variant uppercase tracking-wider">
              <div className="col-span-4">KPI Metric</div>
              <div className="col-span-2 text-right">Monthly Target</div>
              <div className="col-span-2 text-right">MTD Achieved</div>
              <div className="col-span-3 text-center">Performance %</div>
              <div className="col-span-1 text-right">Status</div>
            </div>

            {/* Metrics Rows */}
            <div className="mt-4 divide-y divide-brand-gray-border/60">
              {kpis.map((kpi) => (
                <div 
                  key={kpi.id} 
                  className="grid grid-cols-1 md:grid-cols-12 gap-3 md:gap-4 items-center py-4 px-2 hover:bg-brand-gray-hover/30 rounded-xl transition-colors"
                >
                  {/* KPI Identity */}
                  <div className="col-span-1 md:col-span-4 flex items-center gap-3">
                    <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-primary-container/40 text-brand-primary shadow-sm shrink-0">
                      <Layers className="h-5 w-5" />
                    </div>
                    <div>
                      <h4 className="font-sans text-sm font-bold text-brand-text">{kpi.name}</h4>
                      <span className="md:hidden font-sans text-xs text-brand-text-variant">Target: {kpi.target}</span>
                    </div>
                  </div>

                  {/* Monthly Target (Desktop) */}
                  <div className="col-span-2 text-right hidden md:block">
                    <span className="font-mono text-sm font-semibold text-brand-text">{kpi.target}</span>
                  </div>

                  {/* MTD Achieved */}
                  <div className="col-span-2 text-right flex md:block justify-between items-center bg-brand-gray-hover/30 md:bg-transparent px-3 py-2 md:p-0 rounded-lg">
                    <span className="md:hidden font-sans text-xs font-semibold text-brand-text-variant">MTD Achieved</span>
                    <span className="font-mono text-sm font-bold text-brand-primary">{kpi.achieved}</span>
                  </div>

                  {/* Performance Indicator Gauge */}
                  <div className="col-span-3 flex items-center gap-3 bg-brand-gray-hover/30 md:bg-transparent px-3 py-2 md:p-0 rounded-lg">
                    <span className="md:hidden font-sans text-xs font-semibold text-brand-text-variant shrink-0">Performance</span>
                    <div className="flex-1">
                      <div className="h-2 w-full overflow-hidden rounded-full bg-brand-gray-hover/40">
                        <motion.div 
                          initial={{ width: 0 }}
                          animate={{ width: `${kpi.performance}%` }}
                          transition={{ duration: 1, ease: 'easeOut' }}
                          className={`h-full rounded-full ${getProgressColor(kpi.status, kpi.performance)}`}
                        />
                      </div>
                    </div>
                    <span className="font-mono text-xs font-bold text-brand-text-variant w-8 text-right">{kpi.performance}%</span>
                  </div>

                  {/* Status Badge */}
                  <div className="col-span-1 flex md:block justify-between items-center bg-brand-gray-hover/30 md:bg-transparent px-3 py-2 md:p-0 rounded-lg">
                    <span className="md:hidden font-sans text-xs font-semibold text-brand-text-variant">Status</span>
                    <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 font-sans text-[10px] font-bold tracking-wider ${getSemanticBadgeInfo(kpi.status, kpi.performance).bgClass}`}>
                      {getSemanticBadgeInfo(kpi.status, kpi.performance).badgeText}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </motion.div>

      {/* 2. Middle Grid Section (Performance Trend, Top Owners) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Performance Trend Chart Card (col-span-8) */}
        <motion.div 
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.1 }}
          className="lg:col-span-8 rounded-2xl border border-brand-gray-border bg-brand-card p-6 shadow-ambient flex flex-col justify-between"
        >
          <div>
            <div className="flex items-center justify-between border-b border-brand-gray-border pb-4">
              <div>
                <h3 className="font-sans text-base font-bold text-brand-text">Performance Trend</h3>
                <p className="font-sans text-xs text-brand-text-variant">Monthly Target vs Achievement</p>
              </div>
              <span className="font-sans text-[11px] font-bold text-brand-text-variant/70">JUL - NOV</span>
            </div>

            {/* Custom high-fidelity SVG Area Line Chart */}
            <div className="relative mt-6 h-56 w-full flex items-end justify-between px-2 font-mono">
              {/* Background grid lines */}
              <div className="absolute inset-x-0 bottom-4 top-2 flex flex-col justify-between pointer-events-none opacity-40">
                <div className="border-t border-dashed border-brand-gray-border w-full" />
                <div className="border-t border-dashed border-brand-gray-border w-full" />
                <div className="border-t border-dashed border-brand-gray-border w-full" />
                <div className="border-t border-dashed border-brand-gray-border w-full" />
              </div>

              <svg className="absolute inset-0 h-full w-full overflow-visible" viewBox="0 0 100 100" preserveAspectRatio="none">
                {/* Definitions for gorgeous gradients */}
                <defs>
                  <linearGradient id="chartGradientTarget" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#dae2ff" stopOpacity="0.4" />
                    <stop offset="100%" stopColor="#dae2ff" stopOpacity="0" />
                  </linearGradient>
                  <linearGradient id="chartGradientAchieved" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#0055d4" stopOpacity="0.15" />
                    <stop offset="100%" stopColor="#0055d4" stopOpacity="0" />
                  </linearGradient>
                </defs>

                {/* Target Fill Area (Dotted/Light Blue concept) */}
                <path 
                  d="M 5,95 Q 25,60 50,45 T 95,30 L 95,95 L 5,95 Z" 
                  fill="url(#chartGradientTarget)"
                />
                {/* Target Line */}
                <path 
                  d="M 5,95 Q 25,60 50,45 T 95,30" 
                  fill="none" 
                  stroke="var(--color-brand-gray-border)" 
                  strokeWidth="2.5" 
                  strokeDasharray="4 4"
                />

                {/* Achievement Area */}
                <path 
                  d={`M 5,95 C 25,75 50,35 95,${finalAchievedY} L 95,95 L 5,95 Z`} 
                  fill="url(#chartGradientAchieved)"
                />
                {/* Achievement Line */}
                <path 
                  d={`M 5,95 C 25,75 50,35 95,${finalAchievedY}`} 
                  fill="none" 
                  stroke="var(--color-brand-primary)" 
                  strokeWidth="3.5"
                />

                {/* Data point glowing highlights */}
                <circle cx="50" cy="35" r="4.5" fill="var(--color-brand-primary)" stroke="var(--color-brand-card)" strokeWidth="2.5" />
                <circle cx="95" cy={finalAchievedY} r="4.5" fill="var(--color-brand-primary)" stroke="var(--color-brand-card)" strokeWidth="2.5" />
              </svg>

              {/* X Axis Labels */}
              <div className="absolute inset-x-0 bottom-0 flex justify-between px-1 text-[11px] font-bold text-brand-text-variant font-sans">
                <span>JUL</span>
                <span>AUG</span>
                <span>SEP</span>
                <span>OCT</span>
                <span>NOV</span>
              </div>
            </div>
          </div>

          {/* Chart Legend Indicators */}
          <div className="mt-5 flex gap-4 border-t border-brand-gray-border pt-4">
            <div className="flex items-center gap-1.5">
              <span className="h-2.5 w-6 rounded bg-brand-gray-hover border border-dashed border-brand-gray-border" />
              <span className="font-sans text-xs font-semibold text-brand-text-variant">Target</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="h-2.5 w-6 rounded bg-brand-primary" />
              <span className="font-sans text-xs font-semibold text-brand-text">Achievement</span>
            </div>
          </div>
        </motion.div>

        {/* Top Owners List Card (col-span-4) */}
        <motion.div 
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.15 }}
          className="lg:col-span-4 rounded-2xl border border-brand-gray-border bg-brand-card p-6 shadow-ambient flex flex-col justify-between"
        >
          <div>
            <div className="flex items-center justify-between border-b border-brand-gray-border pb-4">
              <div>
                <h3 className="font-sans text-base font-bold text-brand-text">Top Owners</h3>
                <p className="font-sans text-xs text-brand-text-variant">Highest monthly achievements</p>
              </div>
              <Award className="h-5 w-5 text-brand-accent" />
            </div>

            {/* List with staggered entrance */}
            <motion.div 
              variants={containerVariants}
              initial="hidden"
              animate="show"
              className="mt-4 space-y-3.5"
            >
              {topOwnersList.length === 0 ? (
                <div className="text-center py-8 font-sans text-xs text-brand-text-variant font-medium">
                  No owner achievements found. Upload servicing CSV to compute.
                </div>
              ) : (
                topOwnersList.map((owner) => (
                  <motion.div 
                    key={owner.rank}
                    variants={itemVariants}
                    onClick={() => {
                      onSelectOwner(owner.name);
                      onNavigate(ViewType.OWNER_DETAILS);
                    }}
                    className="flex items-center justify-between p-2 rounded-xl hover:bg-brand-gray-hover/60 border border-transparent hover:border-brand-gray-border/55 cursor-pointer transition-all group"
                  >
                    <div className="flex items-center gap-3">
                      <span className="font-mono text-xs font-extrabold text-brand-primary bg-brand-primary-container/40 h-7 w-7 flex items-center justify-center rounded-lg">
                        #{owner.rank}
                      </span>
                      <div>
                        <h4 className="font-sans text-xs font-bold text-brand-text group-hover:text-brand-primary group-hover:underline transition-all">
                          {owner.name}
                        </h4>
                        <p className="font-mono text-[9px] text-brand-text-variant">{owner.zone}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <span className="font-sans text-xs font-bold text-status-success-text block">{owner.percentage}%</span>
                      <span className="font-mono text-[9px] text-brand-text-variant">{owner.amount}</span>
                    </div>
                  </motion.div>
                ))
              )}
            </motion.div>
          </div>

          <button 
            onClick={() => onNavigate(ViewType.OWNERS)}
            className="mt-4 w-full rounded-xl bg-brand-gray-hover py-2.5 font-sans text-xs font-semibold text-brand-primary hover:bg-brand-primary-container/40 transition-all text-center flex items-center justify-center gap-1 cursor-pointer"
          >
            Manage All Owners
            <ChevronRight className="h-4 w-4" />
          </button>
        </motion.div>
      </div>

      {/* 3. Bottom Summary Metric Rows */}
      <motion.div 
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.25 }}
        className="max-w-md"
      >
        {/* Days Remaining Card */}
        <div className="rounded-2xl border border-brand-accent/30 bg-brand-accent/5 p-5 shadow-ambient">
          <span className="block font-sans text-[10px] font-bold text-brand-secondary uppercase tracking-wider flex items-center gap-1">
            <Calendar className="h-3.5 w-3.5 text-brand-secondary" />
            Days Remaining
          </span>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="font-sans text-2xl font-black text-brand-secondary">
              {daysRemaining < 10 ? `0${Math.max(0, daysRemaining)}` : Math.max(0, daysRemaining)} Days
            </span>
            <span className="font-mono text-[9px] font-bold text-brand-secondary">NEXT UPLOAD: {nextUploadDate}</span>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}
