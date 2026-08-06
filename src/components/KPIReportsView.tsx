import React, { useState, useEffect, useMemo } from 'react';
import { ViewType, KPIMetric } from '../types';
import { 
  TrendingUp, 
  TrendingDown, 
  CheckCircle, 
  Map as MapIcon, 
  DollarSign, 
  Activity, 
  ArrowUpRight, 
  ArrowDownRight, 
  FileSpreadsheet, 
  DownloadCloud, 
  SlidersHorizontal,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  MapPin,
  Calendar,
  Info,
  HelpCircle,
  ShieldCheck
} from 'lucide-react';
import { motion } from 'motion/react';
import { getServicingRows } from '../utils/indexedDB';
import { calculateCompanyKPIs } from '../utils/mappingEngine';
import { exportKPIAnalysisToPDF, exportKPIDataToCSV } from '../utils/pdfExport';
import { getClassifiedRowsCached } from '../utils/classificationCache';
import { calculateKPI1, KPI1Result } from '../utils/kpiEngine';

// Thresholds for CI:CO ratio classification
const DEPOSIT_HEAVY_THRESHOLD = 1.2;
const WITHDRAWAL_HEAVY_THRESHOLD = 0.8;

interface KPIReportsViewProps {
  onNavigate: (view: ViewType) => void;
}

interface PerformanceMetrics {
  totalWakalas: number;
  activePercent: number;
  servedPercent: number;
  totalServicingValue: number;
  productSellerPercent: number;
  totalCI: number;
  totalCO: number;
  netFlow: number;
  cicoRatio: number;
  behavior: string;
}

interface RegionalAggregate extends PerformanceMetrics {
  region: string;
}

interface DistrictAggregate extends PerformanceMetrics {
  district: string;
  region: string;
}

interface CompanyAverages {
  totalWakalas: number;
  activePercent: number;
  servedPercent: number;
  totalServicingValue: number;
  productSellerPercent: number;
  netFlow: number;
  cicoRatio: number;
}

export default function KPIReportsView({ onNavigate }: KPIReportsViewProps) {
  const [selectedSort, setSelectedSort] = useState('Achievement');
  const [saTillLastUpdated, setSaTillLastUpdated] = useState<string | null>(null);
  const [baseWakalaLastUpdated, setBaseWakalaLastUpdated] = useState<string | null>(null);

  const [kpi1Results, setKpi1Results] = useState<KPI1Result[]>([]);
  const [kpi1Period, setKpi1Period] = useState<string>(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });

  useEffect(() => {
    const loadKPI1 = async () => {
      try {
        let rows = await getServicingRows();
        if (!rows || rows.length === 0) {
          const savedServicing = localStorage.getItem('servicingDataRows');
          if (savedServicing) {
            try { rows = JSON.parse(savedServicing); } catch (e) {}
          }
        }
        const savedSaTill = localStorage.getItem('saTillRegistry');
        const savedBaseWakala = localStorage.getItem('baseWakalaIndex');
        const savedTills = localStorage.getItem('tillsList');
        const savedOwners = localStorage.getItem('ownersList');
        const savedTargets = localStorage.getItem('agentTargets');

        const saTillRegistry = savedSaTill ? JSON.parse(savedSaTill) : [];
        const baseWakalaIndex = savedBaseWakala ? JSON.parse(savedBaseWakala) : [];
        const tillsList = savedTills ? JSON.parse(savedTills) : [];
        const owners = savedOwners ? JSON.parse(savedOwners) : [];
        const agentTargets = savedTargets ? JSON.parse(savedTargets) : [];

        const classified = getClassifiedRowsCached(rows as any, saTillRegistry, baseWakalaIndex, tillsList, owners);
        const results = calculateKPI1(classified, agentTargets, owners, kpi1Period);
        setKpi1Results(results);
      } catch (e) {
        console.error('Failed to calculate KPI 1:', e);
      }
    };
    loadKPI1();
  }, [kpi1Period]);

  useEffect(() => {
    const lastUpd = localStorage.getItem('saTillRegistry_lastUpdated');
    setSaTillLastUpdated(lastUpd);
    const baseLastUpd = localStorage.getItem('baseWakalaIndex_lastUpdated');
    setBaseWakalaLastUpdated(baseLastUpd);
  }, []);

  const [wakalaStats, setWakalaStats] = useState<{
    total: number;
    active: number;
    inactive: number;
    activePercent: string;
    inactivePercent: string;
    loading: boolean;
    error: string | null;
  } | null>(null);

  const [regionalData, setRegionalData] = useState<RegionalAggregate[]>([]);
  const [districtData, setDistrictData] = useState<DistrictAggregate[]>([]);
  const [companyAverages, setCompanyAverages] = useState<CompanyAverages | null>(null);
  const [selectedRegion, setSelectedRegion] = useState<string | null>(null);

  const [sortField, setSortField] = useState<keyof PerformanceMetrics | 'region'>('netFlow');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  const [isTableCollapsed, setIsTableCollapsed] = useState(false);
  const [behaviorFilter, setBehaviorFilter] = useState<'All' | 'Deposit-Heavy' | 'Withdrawal-Heavy' | 'Balanced'>('All');

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

  const [weeklyHistory, setWeeklyHistory] = useState<any[]>(() => {
    const saved = localStorage.getItem('weeklyKpiHistory');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        console.error(e);
      }
    }
    return [];
  });

  const [selectedMetric, setSelectedMetric] = useState<string>('');

  // Auto-select first metric if none is selected
  useEffect(() => {
    if (kpis.length > 0 && !selectedMetric) {
      setSelectedMetric(kpis[0].name);
    }
  }, [kpis, selectedMetric]);

  // Find current month
  const activeMonth = useMemo(() => {
    try {
      const historyStr = localStorage.getItem('kpiWorkbookHistory');
      if (historyStr) {
        const history = JSON.parse(historyStr);
        if (Array.isArray(history) && history.length > 0 && history[0].reportingMonth) {
          return history[0].reportingMonth;
        }
      }
    } catch (e) {}
    return "July 2026";
  }, [kpis]);

  // Extract unique KPI options from kpis array
  const kpiOptions = useMemo(() => {
    return kpis.map(k => k.name);
  }, [kpis]);

  // Progress metrics calculations
  const progressMetrics = useMemo(() => {
    if (!selectedMetric || kpis.length === 0) return null;

    const monthlyKpi = kpis.find(k => k.name === selectedMetric);
    if (!monthlyKpi) return null;

    const monthlyTargetVal = monthlyKpi.targetVal || 0;
    const monthlyTargetLabel = monthlyKpi.target || '0';

    // Extract weekly points for the selected metric and activeMonth
    const weeklyPoints = weeklyHistory
      .filter((h: any) => h.reportingMonth === activeMonth)
      .map((h: any) => {
        const matchedKpi = h.kpis?.find((k: any) => k.name === selectedMetric);
        const weekNum = parseInt(h.reportingWeek.match(/Week (\d+)/)?.[1] || '0', 10);
        return {
          reportingWeek: h.reportingWeek,
          weekNum,
          achievedVal: matchedKpi ? (matchedKpi.achievedVal !== undefined ? matchedKpi.achievedVal : parseFloat(String(matchedKpi.achieved || '0').replace(/[^0-9.-]/g, '')) || 0) : 0,
          achievedLabel: matchedKpi ? matchedKpi.achieved : '0',
          uploadDate: h.uploadDate,
          fileName: h.fileName
        };
      })
      .sort((a, b) => a.weekNum - b.weekNum);

    const latestWeeklyPoint = weeklyPoints.length > 0 ? weeklyPoints[weeklyPoints.length - 1] : null;
    const latestWeeklyAchievedVal = latestWeeklyPoint ? latestWeeklyPoint.achievedVal : 0;
    const latestWeeklyAchievedLabel = latestWeeklyPoint ? latestWeeklyPoint.achievedLabel : '—';

    const progressPercent = monthlyTargetVal > 0 ? Math.round((latestWeeklyAchievedVal / monthlyTargetVal) * 100) : 0;
    const remainingVal = Math.max(0, monthlyTargetVal - latestWeeklyAchievedVal);

    // Format remaining values dynamically
    let remainingLabel = remainingVal.toLocaleString('en-US');
    if (monthlyTargetLabel.includes('TZS') || monthlyTargetLabel.toLowerCase().includes('shillings') || monthlyTargetLabel.toLowerCase().includes('val')) {
      remainingLabel = `TZS ${remainingVal.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
    } else if (monthlyTargetLabel.includes('%')) {
      remainingLabel = `${remainingVal.toFixed(1)}%`;
    }

    // Trajectory Status
    let trajectoryStatus = 'NO CHECKPOINTS';
    let trajectoryColor = 'text-slate-500 bg-slate-50 border-slate-200';
    if (latestWeeklyPoint) {
      const currentWeek = latestWeeklyPoint.weekNum; // 1, 2, 3, 4
      const expectedProgress = currentWeek * 25; // 25% per week linear
      if (progressPercent >= expectedProgress) {
        trajectoryStatus = 'AHEAD OF SCHEDULE';
        trajectoryColor = 'text-emerald-700 bg-emerald-50 border-emerald-200';
      } else if (progressPercent >= expectedProgress - 15) {
        trajectoryStatus = 'ON TRACK';
        trajectoryColor = 'text-blue-700 bg-blue-50 border-blue-200';
      } else {
        trajectoryStatus = 'BEHIND SCHEDULE';
        trajectoryColor = 'text-rose-700 bg-rose-50 border-rose-200';
      }
    }

    return {
      monthlyTargetVal,
      monthlyTargetLabel,
      weeklyPoints,
      latestWeeklyPoint,
      latestWeeklyAchievedVal,
      latestWeeklyAchievedLabel,
      progressPercent,
      remainingVal,
      remainingLabel,
      trajectoryStatus,
      trajectoryColor
    };
  }, [kpis, weeklyHistory, selectedMetric, activeMonth]);

  const handleExportPDF = () => {
    if (kpis.length === 0) return;
    exportKPIAnalysisToPDF({
      kpis,
      wakalaStats: (wakalaStats && !wakalaStats.error) ? wakalaStats : null,
      regionalData,
      districtData,
      selectedRegion,
      progressMetrics,
      activeMonth,
      selectedMetric,
    });
  };

  const handleExportCSV = () => {
    if (regionalData.length === 0 && districtData.length === 0) return;
    exportKPIDataToCSV({
      regionalData,
      districtData,
      activeMonth,
    });
  };

  const loadWakalaStats = async () => {
    try {
      let activeMonth = "July 2026";
      const historyStr = localStorage.getItem('kpiWorkbookHistory');
      if (historyStr) {
        const history = JSON.parse(historyStr);
        if (Array.isArray(history) && history.length > 0 && history[0].reportingMonth) {
          activeMonth = history[0].reportingMonth;
        }
      } else {
        const savedServicing = localStorage.getItem('servicingDataRows');
        if (savedServicing) {
          const rows = JSON.parse(savedServicing);
          if (Array.isArray(rows) && rows.length > 0) {
            const companyKPIs = calculateCompanyKPIs(rows);
            if (companyKPIs.reportingMonth && companyKPIs.reportingMonth !== '—') {
              activeMonth = companyKPIs.reportingMonth;
            }
          }
        }
      }

      const rows = await getServicingRows(activeMonth);
      if (!rows || rows.length === 0) {
        setWakalaStats({
          total: 0,
          active: 0,
          inactive: 0,
          activePercent: '0',
          inactivePercent: '0',
          loading: false,
          error: "No wakala data available for this month yet."
        });
        return;
      }

      const wakalaMap = new Map<string, { txns: number; val: number }>();
      
      const getFieldValue = (row: any, keys: string[]): number => {
        for (const k of keys) {
          if (row[k] !== undefined && row[k] !== null) {
            const valStr = String(row[k]).replace(/,/g, '').trim();
            const val = parseFloat(valStr);
            if (!isNaN(val)) return val;
          }
        }
        for (const rowKey of Object.keys(row)) {
          const normRowKey = rowKey.toLowerCase().replace(/[\s_-]+/g, '');
          for (const searchKey of keys) {
            const normSearchKey = searchKey.toLowerCase().replace(/[\s_-]+/g, '');
            if (normRowKey === normSearchKey) {
              const valStr = String(row[rowKey]).replace(/,/g, '').trim();
              const val = parseFloat(valStr);
              if (!isNaN(val)) return val;
            }
          }
        }
        return 0;
      };

      // 1. Group rows by region
      const regionsMap = new Map<string, any[]>();
      rows.forEach(row => {
        const region = String(row.Sales_region || row.sales_region || row.Region || row.sales_zone || row.Zone || 'Unassigned').trim();
        if (!regionsMap.has(region)) {
          regionsMap.set(region, []);
        }
        regionsMap.get(region)!.push(row);
      });

      const computedRegionalData: RegionalAggregate[] = [];
      const computedDistrictData: DistrictAggregate[] = [];

      // 2. Process each region
      regionsMap.forEach((regionRows, regionName) => {
        // Region Level Wakala Map
        const regWakalaMap = new Map<string, { txns: number; val: number; isProductSeller: boolean; isServed: boolean }>();
        let regTotalCI = 0;
        let regTotalCO = 0;
        let regTotalServicingVal = 0;

        regionRows.forEach(row => {
          const msisdn = String(row.MSISDN || row.msisdn || row.phone || row.Phone || '').trim();
          const txns = getFieldValue(row, ['SA_Servicing_Txns', 'SA Servicing Txns', 'sa_servicing_txns']);
          const val = getFieldValue(row, ['SA_Servicing_Val', 'SA Servicing Val', 'sa_servicing_val']);
          const productSellerVal = getFieldValue(row, ['SA_Product_Sellers', 'SA Product Sellers', 'product_sellers', 'product_seller', 'Product_Sales', 'Product Sales']);
          const isProductSeller = productSellerVal > 0 || row.Product_Seller === true || String(row.Product_Seller).toLowerCase() === 'true' || String(row.Product_Seller).toLowerCase() === 'yes';
          
          const ci = getFieldValue(row, ['CI_val', 'CI val', 'ci_val', 'Cash In Value', 'Cash-In Value', 'Cash-In', 'Cash In', 'deposit', 'Deposit']);
          const co = getFieldValue(row, ['CO_val', 'CO val', 'co_val', 'Cash Out Value', 'Cash-Out Value', 'Cash-Out', 'Cash Out', 'withdrawal', 'Withdrawal']);
          
          regTotalCI += ci;
          regTotalCO += co;
          regTotalServicingVal += val;

          if (msisdn) {
            const existing = regWakalaMap.get(msisdn);
            if (existing) {
              existing.txns += txns;
              existing.val += val;
              if (isProductSeller) existing.isProductSeller = true;
              if (txns > 0 || val > 0) existing.isServed = true;
            } else {
              regWakalaMap.set(msisdn, {
                txns,
                val,
                isProductSeller,
                isServed: txns > 0 || val > 0
              });
            }
          }
        });

        let regActiveCount = 0;
        let regServedCount = 0;
        let regProductSellerCount = 0;
        
        regWakalaMap.forEach(({ txns, val, isProductSeller, isServed }) => {
          if (txns > 6 || val > 600000) {
            regActiveCount++;
          }
          if (isServed) {
            regServedCount++;
          }
          if (isProductSeller) {
            regProductSellerCount++;
          }
        });

        const regTotalWakalas = regWakalaMap.size || 1;
        const regActivePercent = (regActiveCount / regTotalWakalas) * 100;
        const regServedPercent = (regServedCount / regTotalWakalas) * 100;
        const regProductSellerPercent = (regProductSellerCount / regTotalWakalas) * 100;
        
        const regNetFlow = regTotalCI - regTotalCO;
        const regCicoRatio = regTotalCO > 0 ? regTotalCI / regTotalCO : (regTotalCI > 0 ? regTotalCI : 1);
        
        let regBehavior = 'Balanced';
        if (regCicoRatio > DEPOSIT_HEAVY_THRESHOLD) {
          regBehavior = 'Deposit-Heavy';
        } else if (regCicoRatio < WITHDRAWAL_HEAVY_THRESHOLD) {
          regBehavior = 'Withdrawal-Heavy';
        }

        computedRegionalData.push({
          region: regionName,
          totalWakalas: regWakalaMap.size,
          activePercent: regActivePercent,
          servedPercent: regServedPercent,
          totalServicingValue: regTotalServicingVal,
          productSellerPercent: regProductSellerPercent,
          totalCI: regTotalCI,
          totalCO: regTotalCO,
          netFlow: regNetFlow,
          cicoRatio: regCicoRatio,
          behavior: regBehavior
        });

        // Group rows by district for this region
        const districtsMap = new Map<string, any[]>();
        regionRows.forEach(row => {
          const district = String(row.district || row.District || row.sales_district || row.Sales_District || row.Ward || row.City || 'Unassigned').trim();
          if (!districtsMap.has(district)) {
            districtsMap.set(district, []);
          }
          districtsMap.get(district)!.push(row);
        });

        districtsMap.forEach((distRows, distName) => {
          const distWakalaMap = new Map<string, { txns: number; val: number; isProductSeller: boolean; isServed: boolean }>();
          let distTotalCI = 0;
          let distTotalCO = 0;
          let distTotalServicingVal = 0;

          distRows.forEach(row => {
            const msisdn = String(row.MSISDN || row.msisdn || row.phone || row.Phone || '').trim();
            const txns = getFieldValue(row, ['SA_Servicing_Txns', 'SA Servicing Txns', 'sa_servicing_txns']);
            const val = getFieldValue(row, ['SA_Servicing_Val', 'SA Servicing Val', 'sa_servicing_val']);
            const productSellerVal = getFieldValue(row, ['SA_Product_Sellers', 'SA Product Sellers', 'product_sellers', 'product_seller', 'Product_Sales', 'Product Sales']);
            const isProductSeller = productSellerVal > 0 || row.Product_Seller === true || String(row.Product_Seller).toLowerCase() === 'true' || String(row.Product_Seller).toLowerCase() === 'yes';
            
            const ci = getFieldValue(row, ['CI_val', 'CI val', 'ci_val', 'Cash In Value', 'Cash-In Value', 'Cash-In', 'Cash In', 'deposit', 'Deposit']);
            const co = getFieldValue(row, ['CO_val', 'CO val', 'co_val', 'Cash Out Value', 'Cash-Out Value', 'Cash-Out', 'Cash Out', 'withdrawal', 'Withdrawal']);
            
            distTotalCI += ci;
            distTotalCO += co;
            distTotalServicingVal += val;

            if (msisdn) {
              const existing = distWakalaMap.get(msisdn);
              if (existing) {
                existing.txns += txns;
                existing.val += val;
                if (isProductSeller) existing.isProductSeller = true;
                if (txns > 0 || val > 0) existing.isServed = true;
              } else {
                distWakalaMap.set(msisdn, {
                  txns,
                  val,
                  isProductSeller,
                  isServed: txns > 0 || val > 0
                });
              }
            }
          });

          let distActiveCount = 0;
          let distServedCount = 0;
          let distProductSellerCount = 0;

          distWakalaMap.forEach(({ txns, val, isProductSeller, isServed }) => {
            if (txns > 6 || val > 600000) {
              distActiveCount++;
            }
            if (isServed) {
              distServedCount++;
            }
            if (isProductSeller) {
              distProductSellerCount++;
            }
          });

          const distTotalWakalas = distWakalaMap.size || 1;
          const distActivePercent = (distActiveCount / distTotalWakalas) * 100;
          const distServedPercent = (distServedCount / distTotalWakalas) * 100;
          const distProductSellerPercent = (distProductSellerCount / distTotalWakalas) * 100;

          const distNetFlow = distTotalCI - distTotalCO;
          const distCicoRatio = distTotalCO > 0 ? distTotalCI / distTotalCO : (distTotalCI > 0 ? distTotalCI : 1);

          let distBehavior = 'Balanced';
          if (distCicoRatio > DEPOSIT_HEAVY_THRESHOLD) {
            distBehavior = 'Deposit-Heavy';
          } else if (distCicoRatio < WITHDRAWAL_HEAVY_THRESHOLD) {
            distBehavior = 'Withdrawal-Heavy';
          }

          computedDistrictData.push({
            region: regionName,
            district: distName,
            totalWakalas: distWakalaMap.size,
            activePercent: distActivePercent,
            servedPercent: distServedPercent,
            totalServicingValue: distTotalServicingVal,
            productSellerPercent: distProductSellerPercent,
            totalCI: distTotalCI,
            totalCO: distTotalCO,
            netFlow: distNetFlow,
            cicoRatio: distCicoRatio,
            behavior: distBehavior
          });
        });
      });

      // 3. Company-wide totals for averages
      const companyWakalaMap = new Map<string, { txns: number; val: number; isProductSeller: boolean; isServed: boolean }>();
      let companyTotalCI = 0;
      let companyTotalCO = 0;
      let companyTotalServicingVal = 0;

      rows.forEach(row => {
        const msisdn = String(row.MSISDN || row.msisdn || row.phone || row.Phone || '').trim();
        const txns = getFieldValue(row, ['SA_Servicing_Txns', 'SA Servicing Txns', 'sa_servicing_txns']);
        const val = getFieldValue(row, ['SA_Servicing_Val', 'SA Servicing Val', 'sa_servicing_val']);
        const productSellerVal = getFieldValue(row, ['SA_Product_Sellers', 'SA Product Sellers', 'product_sellers', 'product_seller', 'Product_Sales', 'Product Sales']);
        const isProductSeller = productSellerVal > 0 || row.Product_Seller === true || String(row.Product_Seller).toLowerCase() === 'true' || String(row.Product_Seller).toLowerCase() === 'yes';
        
        const ci = getFieldValue(row, ['CI_val', 'CI val', 'ci_val', 'Cash In Value', 'Cash-In Value', 'Cash-In', 'Cash In', 'deposit', 'Deposit']);
        const co = getFieldValue(row, ['CO_val', 'CO val', 'co_val', 'Cash Out Value', 'Cash-Out Value', 'Cash-Out', 'Cash Out', 'withdrawal', 'Withdrawal']);
        
        companyTotalCI += ci;
        companyTotalCO += co;
        companyTotalServicingVal += val;

        if (msisdn) {
          const existing = companyWakalaMap.get(msisdn);
          if (existing) {
            existing.txns += txns;
            existing.val += val;
            if (isProductSeller) existing.isProductSeller = true;
            if (txns > 0 || val > 0) existing.isServed = true;
          } else {
            companyWakalaMap.set(msisdn, {
              txns,
              val,
              isProductSeller,
              isServed: txns > 0 || val > 0
            });
          }
        }
      });

      let companyActiveCount = 0;
      let companyServedCount = 0;
      let companyProductSellerCount = 0;

      companyWakalaMap.forEach(({ txns, val, isProductSeller, isServed }) => {
        if (txns > 6 || val > 600000) {
          companyActiveCount++;
        }
        if (isServed) {
          companyServedCount++;
        }
        if (isProductSeller) {
          companyProductSellerCount++;
        }
      });

      const numRegions = regionsMap.size || 1;
      const compAvgTotalWakalas = companyWakalaMap.size / numRegions;
      const compAvgActivePercent = (companyActiveCount / (companyWakalaMap.size || 1)) * 100;
      const compAvgServedPercent = (companyServedCount / (companyWakalaMap.size || 1)) * 100;
      const compAvgServicingValue = companyTotalServicingVal / numRegions;
      const compAvgProductSellerPercent = (companyProductSellerCount / (companyWakalaMap.size || 1)) * 100;
      const compAvgNetFlow = (companyTotalCI - companyTotalCO) / numRegions;
      const compAvgCicoRatio = companyTotalCO > 0 ? companyTotalCI / companyTotalCO : (companyTotalCI > 0 ? companyTotalCI : 1);

      setRegionalData(computedRegionalData);
      setDistrictData(computedDistrictData);
      setCompanyAverages({
        totalWakalas: compAvgTotalWakalas,
        activePercent: compAvgActivePercent,
        servedPercent: compAvgServedPercent,
        totalServicingValue: compAvgServicingValue,
        productSellerPercent: compAvgProductSellerPercent,
        netFlow: compAvgNetFlow,
        cicoRatio: compAvgCicoRatio
      });

      // Maintain legacy stats
      const total = companyWakalaMap.size;
      const active = companyActiveCount;
      const inactive = total - active;
      const activePercent = ((active / total) * 100).toFixed(1);
      const inactivePercent = ((inactive / total) * 100).toFixed(1);

      setWakalaStats({
        total,
        active,
        inactive,
        activePercent,
        inactivePercent,
        loading: false,
        error: null
      });
    } catch (e: any) {
      console.error("Error loading wakala stats:", e);
      setWakalaStats({
        total: 0,
        active: 0,
        inactive: 0,
        activePercent: '0',
        inactivePercent: '0',
        loading: false,
        error: `Error loading wakala data: ${e.message || e}`
      });
    }
  };

  useEffect(() => {
    loadWakalaStats();
  }, []);

  const sortedRegionalData = useMemo(() => {
    let filtered = regionalData;
    if (behaviorFilter !== 'All') {
      filtered = regionalData.filter(r => r.behavior === behaviorFilter);
    }
    return [...filtered].sort((a, b) => {
      let valA = sortField === 'region' ? a.region : a[sortField as keyof PerformanceMetrics];
      let valB = sortField === 'region' ? b.region : b[sortField as keyof PerformanceMetrics];

      if (typeof valA === 'string' && typeof valB === 'string') {
        return sortOrder === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA);
      }

      return sortOrder === 'asc' 
        ? (valA as number) - (valB as number) 
        : (valB as number) - (valA as number);
    });
  }, [regionalData, sortField, sortOrder, behaviorFilter]);

  const sortedDistrictData = useMemo(() => {
    let filtered = districtData.filter(d => d.region === selectedRegion);
    if (behaviorFilter !== 'All') {
      filtered = filtered.filter(d => d.behavior === behaviorFilter);
    }
    return [...filtered].sort((a, b) => {
      let valA = sortField === 'region' ? a.district : a[sortField as keyof PerformanceMetrics];
      let valB = sortField === 'region' ? b.district : b[sortField as keyof PerformanceMetrics];

      if (typeof valA === 'string' && typeof valB === 'string') {
        return sortOrder === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA);
      }

      return sortOrder === 'asc' 
        ? (valA as number) - (valB as number) 
        : (valB as number) - (valA as number);
    });
  }, [districtData, selectedRegion, sortField, sortOrder, behaviorFilter]);

  const renderSortHeader = (label: string, field: keyof PerformanceMetrics | 'region') => {
    const isSorted = sortField === field;
    return (
      <button 
        onClick={(e) => {
          e.stopPropagation();
          if (sortField === field) {
            setSortOrder(o => o === 'asc' ? 'desc' : 'asc');
          } else {
            setSortField(field);
            setSortOrder('desc');
          }
        }}
        className="inline-flex items-center gap-1 hover:text-indigo-600 font-bold text-slate-500 uppercase tracking-wider text-[10px] transition-colors"
      >
        <span>{label}</span>
        <span className="text-slate-400">
          {isSorted ? (sortOrder === 'asc' ? <ChevronUp size={11} className="inline ml-0.5" /> : <ChevronDown size={11} className="inline ml-0.5" />) : <span className="text-[9px] opacity-40 ml-0.5">↕</span>}
        </span>
      </button>
    );
  };

  const renderAvgComparison = (value: number, average: number, type: 'percent' | 'ratio' | 'currency' | 'number') => {
    if (!average) return null;
    
    let diffText = '';
    let isPositive = false;
    
    if (type === 'percent') {
      const diff = value - average;
      isPositive = diff > 0;
      diffText = `${isPositive ? '+' : ''}${diff.toFixed(1)}%`;
    } else if (type === 'ratio') {
      const diff = value - average;
      isPositive = diff > 0;
      diffText = `${isPositive ? '+' : ''}${diff.toFixed(2)}`;
    } else if (type === 'currency') {
      const diff = value - average;
      isPositive = diff > 0;
      diffText = `${isPositive ? '+' : '−'}TZS ${Math.abs(diff).toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
    } else {
      // number
      const diff = value - average;
      isPositive = diff > 0;
      diffText = `${isPositive ? '+' : ''}${Math.round(diff).toLocaleString('en-US')}`;
    }
    
    if (Math.abs(value - average) < 0.05) {
      return (
        <span className="text-[9px] font-semibold text-slate-400 block mt-0.5 leading-none">
          ● avg
        </span>
      );
    }
    
    return (
      <span className={`text-[9px] font-bold block mt-0.5 leading-none ${isPositive ? 'text-emerald-600' : 'text-rose-500'}`}>
        {isPositive ? '▲' : '▼'} {diffText}
      </span>
    );
  };

  const getBehaviorBadge = (behavior: string) => {
    switch (behavior) {
      case 'Deposit-Heavy':
        return 'bg-blue-50 text-blue-700 border border-blue-200 px-2 py-0.5 rounded-full text-[10px] font-semibold inline-block';
      case 'Withdrawal-Heavy':
        return 'bg-amber-50 text-amber-700 border border-amber-200 px-2 py-0.5 rounded-full text-[10px] font-semibold inline-block';
      default:
        return 'bg-slate-50 text-slate-600 border border-slate-200 px-2 py-0.5 rounded-full text-[10px] font-semibold inline-block';
    }
  };

  useEffect(() => {
    const handleUpdate = () => {
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

      const savedWeekly = localStorage.getItem('weeklyKpiHistory');
      if (savedWeekly) {
        try {
          setWeeklyHistory(JSON.parse(savedWeekly));
        } catch (e) {
          setWeeklyHistory([]);
        }
      } else {
        setWeeklyHistory([]);
      }

      loadWakalaStats();
    };
    window.addEventListener('servicing-rows-updated', handleUpdate);
    window.addEventListener('weekly-kpi-updated', handleUpdate);
    window.addEventListener('storage', handleUpdate);
    return () => {
      window.removeEventListener('servicing-rows-updated', handleUpdate);
      window.removeEventListener('weekly-kpi-updated', handleUpdate);
      window.removeEventListener('storage', handleUpdate);
    };
  }, []);

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
          badgeText: 'Achieved',
          bgClass: 'bg-emerald-50 text-emerald-700 border-emerald-200/60',
          progressClass: 'bg-emerald-500',
        };
      case 'NEEDS ATTENTION':
        return {
          badgeText: String(status || '').toUpperCase().includes('RISK') ? 'At Risk' : 'Needs Attention',
          bgClass: 'bg-amber-50 text-amber-700 border-amber-200/60',
          progressClass: 'bg-amber-500',
        };
      case 'CRITICAL':
        return {
          badgeText: 'Critical',
          bgClass: 'bg-rose-50 text-rose-700 border-rose-200/60',
          progressClass: 'bg-rose-500',
        };
      default:
        return {
          badgeText: 'On Track',
          bgClass: 'bg-blue-50 text-brand-primary border-blue-200/60',
          progressClass: 'bg-brand-primary-light',
        };
    }
  };

  const getStripeColorClass = (index: number) => {
    const colors = [
      'bg-brand-primary',
      'bg-brand-accent-hover',
      'bg-slate-400',
      'bg-indigo-500',
      'bg-blue-500',
      'bg-emerald-500'
    ];
    return colors[index % colors.length];
  };


  const regionalZones = [
    { zone: 'Zone A (Dar es Salaam)', percentage: 42, active: true },
    { zone: 'Zone B (Arusha/Mwanza)', percentage: 28, active: false },
    { zone: 'Zone C (Dodoma)', percentage: 18, active: false },
    { zone: 'Zone D (Zanzibar)', percentage: 12, active: false },
  ];

  const getStatusBadgeStyle = (status: string) => {
    switch (status) {
      case 'EXCEEDED':
        return 'bg-emerald-50 text-emerald-700 border-emerald-200';
      case 'MET':
        return 'bg-blue-50 text-brand-primary border-blue-200';
      case 'BELOW TARGET':
        return 'bg-rose-50 text-rose-700 border-rose-200';
      default:
        return 'bg-slate-50 text-slate-700 border-slate-200';
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="space-y-6 max-w-[1440px] mx-auto p-4 sm:p-6 lg:p-8 font-sans"
    >
      {/* Title Panel */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-brand-text">KPI Reports</h2>
          <p className="text-sm text-brand-text-variant mt-1">Performance intelligence and strategic economic indicators across networks.</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {saTillLastUpdated && (
              <div className="inline-flex items-center gap-1.5 text-xs text-slate-700 bg-slate-100 dark:bg-slate-800/80 dark:text-slate-200 px-3 py-1 rounded-full border border-slate-200 dark:border-slate-700">
                <ShieldCheck className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                <span>SA Till Registry last updated: <strong>{saTillLastUpdated}</strong></span>
              </div>
            )}
            {baseWakalaLastUpdated && (
              <div className="inline-flex items-center gap-1.5 text-xs text-slate-700 bg-slate-100 dark:bg-slate-800/80 dark:text-slate-200 px-3 py-1 rounded-full border border-slate-200 dark:border-slate-700">
                <ShieldCheck className="h-3.5 w-3.5 text-indigo-600 shrink-0" />
                <span>Base Wakala Index last updated: <strong>{baseWakalaLastUpdated}</strong></span>
              </div>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 self-start sm:self-auto">
          <button 
            onClick={handleExportPDF}
            disabled={kpis.length === 0}
            className="inline-flex items-center gap-1.5 rounded-xl bg-brand-primary px-3.5 py-2.5 text-xs font-bold text-white shadow-ambient hover:bg-brand-primary-light transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <DownloadCloud className="h-4 w-4" />
            Export PDF
          </button>
          <button 
            onClick={handleExportCSV}
            disabled={regionalData.length === 0 && districtData.length === 0}
            className="inline-flex items-center gap-1.5 rounded-xl border border-brand-gray-border bg-brand-card px-3.5 py-2.5 text-xs font-bold text-brand-text hover:bg-slate-50 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <FileSpreadsheet className="h-4 w-4 text-brand-primary" />
            Export CSV
          </button>
        </div>
      </div>

      {/* KPI 1 — Weighted Volume */}
      <div className="bg-brand-card p-6 rounded-2xl border border-brand-gray-border shadow-xs space-y-4 mb-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-black text-brand-text">KPI 1 — Weighted Volume</h3>
            <p className="text-xs text-brand-text-variant mt-0.5">
              70% Base Volume / 30% IOP Volume, weighted against each owner's monthly target.
            </p>
          </div>
          <input
            type="month"
            value={kpi1Period}
            onChange={(e) => setKpi1Period(e.target.value)}
            className="text-xs rounded-lg border border-slate-300 px-2 py-1.5"
          />
        </div>

        {kpi1Results.length === 0 ? (
          <div className="text-center py-8 bg-slate-50/50 rounded-xl border border-dashed border-slate-200">
            <p className="text-xs font-bold text-slate-500">No owners or targets found for this period.</p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-slate-200">
            <table className="w-full text-left text-xs font-sans">
              <thead className="bg-slate-50 text-slate-700 font-extrabold border-b border-slate-200">
                <tr>
                  <th className="px-4 py-2.5">Owner</th>
                  <th className="px-4 py-2.5">Base Volume</th>
                  <th className="px-4 py-2.5">Base %</th>
                  <th className="px-4 py-2.5">IOP Volume</th>
                  <th className="px-4 py-2.5">IOP %</th>
                  <th className="px-4 py-2.5">Weighted Score</th>
                  <th className="px-4 py-2.5">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {kpi1Results.map((r) => (
                  <tr key={r.ownerId} className="hover:bg-slate-50">
                    <td className="px-4 py-2.5 font-bold text-brand-text">{r.ownerName}</td>
                    <td className="px-4 py-2.5 font-mono">{r.baseVolume.toLocaleString()}</td>
                    <td className="px-4 py-2.5 font-mono">{r.baseAttainmentPct}%</td>
                    <td className="px-4 py-2.5 font-mono">{r.iopVolume.toLocaleString()}</td>
                    <td className="px-4 py-2.5 font-mono">{r.iopAttainmentPct}%</td>
                    <td className="px-4 py-2.5 font-mono font-bold">{r.weightedScore}%</td>
                    <td className="px-4 py-2.5">
                      {!r.hasTarget ? (
                        <span className="text-[10px] font-extrabold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full border border-slate-200">
                          No Target Set
                        </span>
                      ) : r.status === 'Excellent' ? (
                        <span className="text-[10px] font-extrabold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">Excellent</span>
                      ) : r.status === 'Good' ? (
                        <span className="text-[10px] font-extrabold text-blue-700 bg-blue-50 px-2 py-0.5 rounded-full border border-blue-200">Good</span>
                      ) : r.status === 'Average' ? (
                        <span className="text-[10px] font-extrabold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200">Average</span>
                      ) : (
                        <span className="text-[10px] font-extrabold text-rose-700 bg-rose-50 px-2 py-0.5 rounded-full border border-rose-200">Low</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {kpis.length === 0 ? (
        <div className="rounded-2xl border border-brand-gray-border bg-brand-card p-12 shadow-ambient text-center flex flex-col items-center justify-center gap-4 my-8" id="kpi-reports-empty-state">
          <div className="h-16 w-16 rounded-2xl bg-brand-primary/10 text-brand-primary flex items-center justify-center">
            <FileSpreadsheet className="h-8 w-8" />
          </div>
          <div className="space-y-2 max-w-md">
            <h3 className="font-sans text-lg font-bold text-brand-text">No KPI Data Uploaded Yet</h3>
            <p className="font-sans text-xs text-brand-text-variant leading-relaxed">
              No KPI data uploaded yet — go to Upload Reports to sync this month's KPI Summary
            </p>
          </div>
          <button
            onClick={() => onNavigate(ViewType.UPLOAD_REPORTS)}
            className="inline-flex items-center gap-2 bg-brand-primary text-white text-xs font-bold px-5 py-3 rounded-xl cursor-pointer hover:bg-opacity-90 transition-all shadow-sm mt-2"
            id="kpi-reports-upload-btn"
          >
            <DownloadCloud className="h-4.5 w-4.5 rotate-180" />
            Upload Reports
          </button>
        </div>
      ) : (
        <>
          {/* Stats Cards Section */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
            {kpis.map((kpi, idx) => {
              const badge = getSemanticBadgeInfo(kpi.status, kpi.performance);
              const stripeColor = getStripeColorClass(idx);
              return (
                <div 
                  key={kpi.id} 
                  className="rounded-2xl border border-brand-gray-border bg-brand-card p-5 shadow-ambient relative overflow-hidden flex flex-col justify-between min-h-[142px]"
                  id={`kpi-card-${kpi.id}`}
                >
                  <div className={`absolute top-0 left-0 w-1.5 h-full ${stripeColor}`} />
                  <div>
                    <div className="flex items-start justify-between gap-2">
                      <span className="block text-[10px] font-bold text-brand-text-variant uppercase tracking-wider">{kpi.name}</span>
                      <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[9px] font-bold tracking-wider ${badge.bgClass}`}>
                        {badge.badgeText}
                      </span>
                    </div>
                    <span className="block text-2xl font-black text-brand-text mt-1.5">{kpi.achieved}</span>
                  </div>
                  <div className="mt-4">
                    <div className="flex justify-between items-center text-[10px] font-semibold text-brand-text-variant mb-1">
                      <span>Target: {kpi.target}</span>
                      <span>{kpi.performance}%</span>
                    </div>
                    <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                      <div className={`h-full rounded-full ${badge.progressClass}`} style={{ width: `${Math.min(100, kpi.performance)}%` }} />
                    </div>
                  </div>
                </div>
              );
            })}

            {/* Custom Company Active Wakala Card */}
            <div 
              className="rounded-2xl border border-brand-gray-border bg-brand-card p-5 shadow-ambient relative overflow-hidden flex flex-col justify-between min-h-[142px]"
              id="company-active-wakalas-card"
            >
              <div className="absolute top-0 left-0 w-1.5 h-full bg-indigo-600" />
              <div>
                <div className="flex items-start justify-between gap-2">
                  <span className="block text-[10px] font-bold text-brand-text-variant uppercase tracking-wider">
                    Active Wakalas (Company Rule)
                  </span>
                  <div className="relative group">
                    <span className="inline-flex items-center rounded-full border bg-indigo-50 text-indigo-700 border-indigo-200/60 px-2 py-0.5 text-[9px] font-bold tracking-wider cursor-help">
                      Rule Info
                    </span>
                    <div className="absolute right-0 bottom-full mb-2 hidden group-hover:block w-64 bg-slate-900 text-white text-[11px] rounded-lg p-2.5 shadow-xl z-50 leading-relaxed font-normal">
                      Active = more than 6 servicing transactions or over TZS 600,000 in servicing value this month
                    </div>
                  </div>
                </div>
                
                {wakalaStats ? (
                  wakalaStats.error ? (
                    <div className="text-[11px] font-medium text-rose-500 mt-2 bg-rose-50/50 p-2 rounded-lg border border-rose-100">
                      {wakalaStats.error}
                    </div>
                  ) : (
                    <div className="mt-2.5 space-y-1.5 text-xs">
                      <div className="flex justify-between items-center">
                        <span className="font-semibold text-brand-text-variant">Total Wakalas:</span>
                        <span className="font-bold text-brand-text text-[13px]">{wakalaStats.total}</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="font-semibold text-brand-text-variant">Active Wakalas:</span>
                        <span className="font-bold text-emerald-600 text-[13px]">
                          {wakalaStats.active} <span className="text-[10px] font-semibold">({wakalaStats.activePercent}%)</span>
                        </span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="font-semibold text-brand-text-variant">Inactive Wakalas:</span>
                        <span className="font-bold text-rose-600 text-[13px]">
                          {wakalaStats.inactive} <span className="text-[10px] font-semibold">({wakalaStats.inactivePercent}%)</span>
                        </span>
                      </div>
                    </div>
                  )
                ) : (
                  <span className="block text-xs text-brand-text-variant mt-2 animate-pulse">Loading stats...</span>
                )}
              </div>
              
              {wakalaStats && !wakalaStats.error && (
                <div className="mt-3 border-t border-brand-gray-border/40 pt-2">
                  <div className="flex justify-between items-center text-[10px] font-semibold text-brand-text-variant mb-1">
                    <span>Active Ratio</span>
                    <span>{wakalaStats.activePercent}%</span>
                  </div>
                  <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                    <div 
                      className="h-full rounded-full bg-indigo-600" 
                      style={{ width: `${wakalaStats.activePercent}%` }} 
                    />
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Progress Toward Target Tracker */}
          {progressMetrics && (
            <div className="bg-brand-card rounded-2xl border border-brand-gray-border shadow-ambient p-6 mt-6 animate-fade-in" id="kpi-weekly-progress-tracker">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-brand-gray-border/50 pb-5 mb-6">
                <div>
                  <h3 className="text-sm font-bold text-brand-text flex items-center gap-2">
                    <Activity size={16} className="text-brand-primary" />
                    Weekly Progress Toward Monthly Target ({activeMonth})
                  </h3>
                  <p className="text-xs text-brand-text-variant mt-1">
                    Track incremental progress and run trajectory forecasting using the latest weekly KPI checkpoint.
                  </p>
                </div>

                <div className="flex items-center gap-2.5">
                  <label className="text-xs font-bold text-brand-text-variant uppercase tracking-wider whitespace-nowrap">
                    Selected KPI:
                  </label>
                  <select
                    value={selectedMetric}
                    onChange={(e) => setSelectedMetric(e.target.value)}
                    className="rounded-xl border border-brand-gray-border bg-white px-3.5 py-2 text-xs font-bold text-brand-text focus:border-brand-primary focus:outline-none shadow-xs"
                  >
                    {kpiOptions.map((opt) => (
                      <option key={opt} value={opt}>
                        {opt}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Status Comparison Cards */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
                <div className="bg-slate-50/50 rounded-xl p-4 border border-brand-gray-border/60">
                  <span className="block text-[10px] font-bold text-brand-text-variant uppercase tracking-wider mb-1">
                    Monthly Target
                  </span>
                  <span className="block text-xl font-black text-brand-text">
                    {progressMetrics.monthlyTargetLabel}
                  </span>
                  <span className="block text-[10px] text-brand-text-variant mt-1.5 leading-none">
                    Target baseline set for {activeMonth}
                  </span>
                </div>

                <div className="bg-slate-50/50 rounded-xl p-4 border border-brand-gray-border/60">
                  <span className="block text-[10px] font-bold text-brand-text-variant uppercase tracking-wider mb-1">
                    Latest Weekly Achieved
                  </span>
                  <span className="block text-xl font-black text-brand-text">
                    {progressMetrics.latestWeeklyAchievedLabel}
                  </span>
                  <span className="block text-[10px] text-brand-text-variant mt-1.5 leading-none">
                    {progressMetrics.latestWeeklyPoint 
                      ? `From ${progressMetrics.latestWeeklyPoint.reportingWeek}`
                      : 'No weekly data uploaded yet'}
                  </span>
                </div>

                <div className="bg-slate-50/50 rounded-xl p-4 border border-brand-gray-border/60">
                  <span className="block text-[10px] font-bold text-brand-text-variant uppercase tracking-wider mb-1">
                    Target Achievement %
                  </span>
                  <span className="block text-xl font-black text-brand-text">
                    {progressMetrics.progressPercent}%
                  </span>
                  <div className="mt-1.5 flex items-center gap-1.5">
                    <span className={`inline-block h-2 w-2 rounded-full ${
                      progressMetrics.progressPercent >= 100 
                        ? 'bg-emerald-500' 
                        : progressMetrics.progressPercent >= 50 
                          ? 'bg-blue-500' 
                          : 'bg-amber-500'
                    }`} />
                    <span className="text-[10px] font-bold text-brand-text-variant">
                      {progressMetrics.progressPercent >= 100 ? 'Target Achieved' : 'In Progress'}
                    </span>
                  </div>
                </div>

                <div className="bg-slate-50/50 rounded-xl p-4 border border-brand-gray-border/60">
                  <span className="block text-[10px] font-bold text-brand-text-variant uppercase tracking-wider mb-1">
                    Trajectory Forecast
                  </span>
                  <span className="block text-xl font-black text-brand-text">
                    {progressMetrics.trajectoryStatus === 'NO CHECKPOINTS' ? 'No Data' : progressMetrics.progressPercent + '%'}
                  </span>
                  <div className="mt-1.5">
                    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[9px] font-extrabold tracking-wider ${progressMetrics.trajectoryColor}`}>
                      {progressMetrics.trajectoryStatus}
                    </span>
                  </div>
                </div>
              </div>

              {/* Progress Bar Gauge */}
              <div className="bg-slate-50/20 border border-brand-gray-border/50 rounded-xl p-5 mb-6">
                <div className="flex justify-between items-center text-xs font-bold text-brand-text mb-2">
                  <span>Cumulative Monthly Target Achievement</span>
                  <span className="text-brand-primary">{progressMetrics.progressPercent}%</span>
                </div>
                <div className="h-3 w-full bg-slate-100 rounded-full overflow-hidden relative">
                  <div 
                    className="h-full rounded-full bg-brand-primary transition-all duration-500 relative overflow-hidden" 
                    style={{ width: `${Math.min(100, progressMetrics.progressPercent)}%` }}
                  >
                    <div className="absolute inset-0 bg-linear-to-r from-transparent via-white/20 to-transparent animate-[shimmer_2s_infinite]" />
                  </div>
                </div>
                <div className="flex justify-between text-[10px] text-brand-text-variant mt-2 font-semibold">
                  <span>0% Achieved</span>
                  {progressMetrics.remainingVal > 0 ? (
                    <span className="text-rose-600 font-bold">Remaining to target: {progressMetrics.remainingLabel}</span>
                  ) : (
                    <span className="text-emerald-600 font-bold">Target fully met! (Exceeded by {Math.abs(progressMetrics.remainingVal).toLocaleString()})</span>
                  )}
                  <span>100% Target</span>
                </div>
              </div>

              {/* Timeline of Weekly Checkpoints */}
              <div>
                <h4 className="text-xs font-extrabold text-brand-text uppercase tracking-wider mb-4">
                  Weekly Checkpoint Trajectory
                </h4>

                {progressMetrics.weeklyPoints.length === 0 ? (
                  <div className="bg-slate-50/50 rounded-xl border border-dashed border-brand-gray-border p-8 text-center flex flex-col items-center justify-center">
                    <Info className="h-7 w-7 text-brand-text-variant mb-2" />
                    <p className="text-xs font-bold text-brand-text">No weekly checkpoints uploaded for {activeMonth} yet</p>
                    <p className="text-[11px] text-brand-text-variant mt-1 max-w-sm">
                      Upload Weekly KPI workbooks on the Upload Reports page to log weekly progress and track trajectories.
                    </p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 relative">
                    {/* Background connector line */}
                    <div className="absolute top-1/2 left-0 right-0 h-0.5 bg-slate-100 -translate-y-1/2 hidden sm:block z-0" />
                    
                    {['Week 1', 'Week 2', 'Week 3', 'Week 4'].map((weekName, index) => {
                      const weekNum = index + 1;
                      const point = progressMetrics.weeklyPoints.find(p => p.weekNum === weekNum);
                      const isLogged = !!point;
                      
                      return (
                        <div 
                          key={weekName} 
                          className={`relative rounded-xl p-4 border transition-all z-10 flex flex-col justify-between min-h-[110px] ${
                            isLogged 
                              ? 'bg-white border-brand-primary/40 shadow-xs' 
                              : 'bg-slate-50/30 border-brand-gray-border/40 opacity-70'
                          }`}
                        >
                          <div>
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-bold text-brand-text">{weekName}</span>
                              <span className={`h-2.5 w-2.5 rounded-full ${isLogged ? 'bg-brand-primary' : 'bg-slate-300'}`} />
                            </div>
                            {isLogged ? (
                              <span className="block text-base font-extrabold text-brand-text mt-2">
                                {point.achievedLabel}
                              </span>
                            ) : (
                              <span className="block text-xs font-medium text-slate-400 mt-2">
                                Pending upload
                              </span>
                            )}
                          </div>

                          {isLogged && (
                            <div className="mt-3 text-[10px] text-brand-text-variant border-t border-slate-100 pt-2 flex justify-between items-center">
                              <span>Uploaded:</span>
                              <span className="font-bold text-brand-text">
                                {new Date(point.uploadDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                              </span>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Regional Performance Section */}
          <div className="bg-brand-card rounded-2xl border border-brand-gray-border shadow-ambient mt-6 overflow-hidden" id="regional-performance-section">
            <div className="p-6 border-b border-brand-gray-border/50 bg-slate-50/20">
              <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4">
                <div>
                  <h3 className="text-sm font-bold text-brand-text flex items-center gap-2">
                    <MapIcon size={16} className="text-indigo-600" />
                    Regional Performance Breakdown (Company Rule)
                  </h3>
                  <p className="text-xs text-brand-text-variant mt-1">
                    Performance metrics grouped by Sales Region. Click a row to toggle district-level drill-down.
                  </p>
                </div>
                
                <div className="flex flex-wrap items-center gap-3">
                  {/* Behavior Filters */}
                  <div className="flex items-center gap-1.5 bg-slate-100/80 p-1 rounded-xl border border-slate-200">
                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider px-2">
                      Filter:
                    </span>
                    {(['All', 'Deposit-Heavy', 'Withdrawal-Heavy', 'Balanced'] as const).map((filter) => (
                      <button
                        key={filter}
                        onClick={(e) => {
                          e.stopPropagation();
                          setBehaviorFilter(filter);
                        }}
                        className={`px-3 py-1 text-xs font-semibold rounded-lg transition-all whitespace-nowrap ${
                          behaviorFilter === filter
                            ? 'bg-white text-indigo-600 shadow-sm border border-slate-200/50 font-bold'
                            : 'text-slate-600 hover:text-slate-900 hover:bg-white/40'
                        }`}
                      >
                        {filter === 'All' ? 'All' : filter.replace('-Heavy', ' Heavy')}
                      </button>
                    ))}
                  </div>

                  {/* Info Badge */}
                  {regionalData.length > 0 && (
                    <span className="text-[11px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-100 px-3 py-2 rounded-xl whitespace-nowrap">
                      {sortedRegionalData.length} of {regionalData.length} Regions
                    </span>
                  )}

                  {/* Collapse Toggle Button */}
                  <button
                    onClick={() => setIsTableCollapsed(!isTableCollapsed)}
                    className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-600 hover:text-indigo-600 transition-colors bg-white shadow-sm"
                    title={isTableCollapsed ? "Expand Regional Table" : "Collapse Regional Table"}
                  >
                    <span>{isTableCollapsed ? "Expand" : "Collapse"}</span>
                    {isTableCollapsed ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
                  </button>
                </div>
              </div>
            </div>

            {!isTableCollapsed && (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-brand-gray-border/50 bg-slate-50/50">
                    <th className="p-4 text-xs font-bold text-slate-500 whitespace-nowrap">
                      {renderSortHeader('Region', 'region')}
                    </th>
                    <th className="p-4 text-xs font-bold text-slate-500 whitespace-nowrap text-right">
                      {renderSortHeader('Total Wakalas', 'totalWakalas')}
                    </th>
                    <th className="p-4 text-xs font-bold text-slate-500 whitespace-nowrap text-right">
                      {renderSortHeader('Active %', 'activePercent')}
                    </th>
                    <th className="p-4 text-xs font-bold text-slate-500 whitespace-nowrap text-right">
                      {renderSortHeader('Served %', 'servedPercent')}
                    </th>
                    <th className="p-4 text-xs font-bold text-slate-500 whitespace-nowrap text-right">
                      {renderSortHeader('Total Servicing Value', 'totalServicingValue')}
                    </th>
                    <th className="p-4 text-xs font-bold text-slate-500 whitespace-nowrap text-right">
                      {renderSortHeader('Product Seller %', 'productSellerPercent')}
                    </th>
                    <th className="p-4 text-xs font-bold text-slate-500 whitespace-nowrap text-right">
                      {renderSortHeader('Total CI', 'totalCI')}
                    </th>
                    <th className="p-4 text-xs font-bold text-slate-500 whitespace-nowrap text-right">
                      {renderSortHeader('Total CO', 'totalCO')}
                    </th>
                    <th className="p-4 text-xs font-bold text-slate-500 whitespace-nowrap text-right">
                      {renderSortHeader('Net Flow', 'netFlow')}
                    </th>
                    <th className="p-4 text-xs font-bold text-slate-500 whitespace-nowrap text-right">
                      {renderSortHeader('CI:CO Ratio', 'cicoRatio')}
                    </th>
                    <th className="p-4 text-xs font-bold text-slate-500 whitespace-nowrap text-center">
                      Behavior
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-brand-gray-border/30">
                  {regionalData.length === 0 ? (
                    <tr>
                      <td colSpan={11} className="p-8 text-center text-xs text-brand-text-variant">
                        No regional performance data loaded for this month.
                      </td>
                    </tr>
                  ) : (
                    sortedRegionalData.map((reg) => {
                      const isSelected = selectedRegion === reg.region;
                      const netFlowPositive = reg.netFlow >= 0;
                      return (
                        <tr 
                          key={reg.region}
                          onClick={() => setSelectedRegion(isSelected ? null : reg.region)}
                          className={`hover:bg-slate-50/80 cursor-pointer transition-all duration-150 ${isSelected ? 'bg-indigo-50/50 border-l-4 border-l-indigo-600 font-semibold' : ''}`}
                        >
                          <td className="p-4 text-xs text-brand-text font-semibold whitespace-nowrap">
                            <div className="flex items-center gap-1.5">
                              <MapPin size={13} className={isSelected ? 'text-indigo-600' : 'text-slate-400'} />
                              {reg.region}
                            </div>
                          </td>
                          <td className="p-4 text-xs text-brand-text text-right whitespace-nowrap">
                            <div className="font-semibold">{reg.totalWakalas}</div>
                            {companyAverages && renderAvgComparison(reg.totalWakalas, companyAverages.totalWakalas, 'number')}
                          </td>
                          <td className="p-4 text-xs text-brand-text text-right whitespace-nowrap">
                            <div className="font-semibold">{reg.activePercent.toFixed(1)}%</div>
                            {companyAverages && renderAvgComparison(reg.activePercent, companyAverages.activePercent, 'percent')}
                          </td>
                          <td className="p-4 text-xs text-brand-text text-right whitespace-nowrap">
                            <div className="font-semibold">{reg.servedPercent.toFixed(1)}%</div>
                            {companyAverages && renderAvgComparison(reg.servedPercent, companyAverages.servedPercent, 'percent')}
                          </td>
                          <td className="p-4 text-xs text-brand-text text-right whitespace-nowrap">
                            <div className="font-semibold">TZS {reg.totalServicingValue.toLocaleString('en-US', { maximumFractionDigits: 0 })}</div>
                            {companyAverages && renderAvgComparison(reg.totalServicingValue, companyAverages.totalServicingValue, 'currency')}
                          </td>
                          <td className="p-4 text-xs text-brand-text text-right whitespace-nowrap">
                            <div className="font-semibold">{reg.productSellerPercent.toFixed(1)}%</div>
                            {companyAverages && renderAvgComparison(reg.productSellerPercent, companyAverages.productSellerPercent, 'percent')}
                          </td>
                          <td className="p-4 text-xs text-slate-500 text-right whitespace-nowrap">
                            <div className="font-medium">TZS {reg.totalCI.toLocaleString('en-US', { maximumFractionDigits: 0 })}</div>
                          </td>
                          <td className="p-4 text-xs text-slate-500 text-right whitespace-nowrap">
                            <div className="font-medium">TZS {reg.totalCO.toLocaleString('en-US', { maximumFractionDigits: 0 })}</div>
                          </td>
                          <td className="p-4 text-xs text-right whitespace-nowrap">
                            <div className={`font-bold ${netFlowPositive ? 'text-emerald-600' : 'text-rose-600'}`}>
                              {netFlowPositive ? '+' : ''}TZS {reg.netFlow.toLocaleString('en-US', { maximumFractionDigits: 0 })}
                            </div>
                            {companyAverages && renderAvgComparison(reg.netFlow, companyAverages.netFlow, 'currency')}
                          </td>
                          <td className="p-4 text-xs text-brand-text text-right whitespace-nowrap">
                            <div className="font-bold">{reg.cicoRatio.toFixed(2)}</div>
                            {companyAverages && renderAvgComparison(reg.cicoRatio, companyAverages.cicoRatio, 'ratio')}
                          </td>
                          <td className="p-4 text-center whitespace-nowrap">
                            <span className={getBehaviorBadge(reg.behavior)}>
                              {reg.behavior}
                            </span>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
            )}
          </div>

          {/* District Performance Section (Drill-Down) */}
          {selectedRegion && (
            <div className="bg-brand-card rounded-2xl border border-brand-gray-border shadow-ambient mt-6 overflow-hidden" id="district-performance-section">
              <div className="p-6 border-b border-brand-gray-border/50 bg-indigo-50/10">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div>
                    <h4 className="text-sm font-bold text-indigo-950 flex items-center gap-2">
                      <MapPin size={15} className="text-indigo-600" />
                      District Performance in {selectedRegion}
                    </h4>
                    <p className="text-xs text-brand-text-variant mt-1">
                      Detailed district-level drill-down performance metrics.
                    </p>
                  </div>
                  <button 
                    onClick={() => setSelectedRegion(null)}
                    className="text-xs font-semibold text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 border border-slate-200 hover:border-indigo-200/60 px-3 py-1.5 rounded-lg transition-all"
                  >
                    Close Drill-down
                  </button>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-brand-gray-border/50 bg-slate-50/50">
                      <th className="p-4 text-xs font-bold text-slate-500 whitespace-nowrap">
                        District
                      </th>
                      <th className="p-4 text-xs font-bold text-slate-500 whitespace-nowrap text-right">
                        Total Wakalas
                      </th>
                      <th className="p-4 text-xs font-bold text-slate-500 whitespace-nowrap text-right">
                        Active %
                      </th>
                      <th className="p-4 text-xs font-bold text-slate-500 whitespace-nowrap text-right">
                        Served %
                      </th>
                      <th className="p-4 text-xs font-bold text-slate-500 whitespace-nowrap text-right">
                        Total Servicing Value
                      </th>
                      <th className="p-4 text-xs font-bold text-slate-500 whitespace-nowrap text-right">
                        Product Seller %
                      </th>
                      <th className="p-4 text-xs font-bold text-slate-500 whitespace-nowrap text-right">
                        Total CI
                      </th>
                      <th className="p-4 text-xs font-bold text-slate-500 whitespace-nowrap text-right">
                        Total CO
                      </th>
                      <th className="p-4 text-xs font-bold text-slate-500 whitespace-nowrap text-right">
                        Net Flow
                      </th>
                      <th className="p-4 text-xs font-bold text-slate-500 whitespace-nowrap text-right">
                        CI:CO Ratio
                      </th>
                      <th className="p-4 text-xs font-bold text-slate-500 whitespace-nowrap text-center">
                        Behavior
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-brand-gray-border/30">
                    {sortedDistrictData.length === 0 ? (
                      <tr>
                        <td colSpan={11} className="p-8 text-center text-xs text-brand-text-variant">
                          No districts found for this region.
                        </td>
                      </tr>
                    ) : (
                      sortedDistrictData.map((dist) => {
                        const netFlowPositive = dist.netFlow >= 0;
                        return (
                          <tr key={dist.district} className="hover:bg-slate-50/50 transition-colors">
                            <td className="p-4 text-xs text-brand-text font-semibold whitespace-nowrap">
                              {dist.district}
                            </td>
                            <td className="p-4 text-xs text-brand-text text-right whitespace-nowrap font-medium">
                              {dist.totalWakalas}
                            </td>
                            <td className="p-4 text-xs text-brand-text text-right whitespace-nowrap font-medium">
                              {dist.activePercent.toFixed(1)}%
                            </td>
                            <td className="p-4 text-xs text-brand-text text-right whitespace-nowrap font-medium">
                              {dist.servedPercent.toFixed(1)}%
                            </td>
                            <td className="p-4 text-xs text-brand-text text-right whitespace-nowrap font-medium">
                              TZS {dist.totalServicingValue.toLocaleString('en-US', { maximumFractionDigits: 0 })}
                            </td>
                            <td className="p-4 text-xs text-brand-text text-right whitespace-nowrap font-medium">
                              {dist.productSellerPercent.toFixed(1)}%
                            </td>
                            <td className="p-4 text-xs text-slate-500 text-right whitespace-nowrap">
                              TZS {dist.totalCI.toLocaleString('en-US', { maximumFractionDigits: 0 })}
                            </td>
                            <td className="p-4 text-xs text-slate-500 text-right whitespace-nowrap">
                              TZS {dist.totalCO.toLocaleString('en-US', { maximumFractionDigits: 0 })}
                            </td>
                            <td className="p-4 text-xs text-right whitespace-nowrap">
                              <span className={`font-bold ${netFlowPositive ? 'text-emerald-600' : 'text-rose-600'}`}>
                                {netFlowPositive ? '+' : ''}TZS {dist.netFlow.toLocaleString('en-US', { maximumFractionDigits: 0 })}
                              </span>
                            </td>
                            <td className="p-4 text-xs text-brand-text text-right whitespace-nowrap font-semibold">
                              {dist.cicoRatio.toFixed(2)}
                            </td>
                            <td className="p-4 text-center whitespace-nowrap">
                              <span className={getBehaviorBadge(dist.behavior)}>
                                {dist.behavior}
                              </span>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

        </>
      )}
    </motion.div>
  );
}
