import { ClassifiedRow } from './classification';
import { Owner, PriorityWakala, BaseWakala } from '../types';
import { KPI1Status } from './kpiEngine';
import { normalizeMsisdn } from './msisdn';

export interface KPI2Result {
  ownerId: string;
  ownerName: string;
  period: string;
  normalServed: number;         // count of Normal wakalas served this period
  normalTarget: number;         // derived normal target count
  normalAchievementPct: number; // uncapped
  priorityServed: number;
  priorityTarget: number;
  priorityAchievementPct: number; // uncapped
  weightedScore: number;        // overall KPI 2 performance score (percentage)
  status: KPI1Status;           // Green/Blue/Yellow/Red
  hasTarget: boolean;
  normalWeight: number;         // percentage, e.g. 70
  priorityWeight: number;       // percentage, e.g. 30
  hasWeighting: boolean;
  companySharePct: number;      // descriptive field: owner's share of total company wakalas or target
  normalWakalaCount: number;
  priorityWakalaCount: number;
}

function getStatus(score: number): KPI1Status {
  if (score >= 90) return 'Green';
  if (score >= 70) return 'Blue';
  if (score >= 60) return 'Yellow';
  return 'Red';
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/**
 * Retrieves the company overall KPI 2 target from kpiWorkbookHistory for the given period.
 */
function getCompanyTargetFromHistory(period: string): number {
  try {
    const historyStr = localStorage.getItem('kpiWorkbookHistory');
    if (historyStr) {
      const history = JSON.parse(historyStr);
      if (Array.isArray(history) && history.length > 0) {
        const item = history.find((h: any) => h.reportingMonth === period) || history[0];
        if (item && Array.isArray(item.kpis)) {
          const kpiRow = item.kpis.find((k: any) =>
            /target fulfillment|priority wakala|active wakala/i.test(k.name || '')
          ) || item.kpis[0];
          if (kpiRow) {
            if (typeof kpiRow.targetVal === 'number' && kpiRow.targetVal > 0) {
              return kpiRow.targetVal;
            }
            if (kpiRow.target) {
              const parsed = parseFloat(String(kpiRow.target).replace(/,/g, '').replace(/[^0-9.-]/g, ''));
              if (!isNaN(parsed) && parsed > 0) return parsed;
            }
          }
        }
      }
    }
  } catch (e) {
    console.error("Error loading company target from history:", e);
  }
  return 0;
}

/**
 * Helper to fetch saved tillsList from localStorage
 */
function getTillsListFromStorage(): any[] {
  try {
    const saved = localStorage.getItem('tillsList');
    return saved ? JSON.parse(saved) : [];
  } catch (e) {
    return [];
  }
}

/**
 * Calculates KPI 2 (Active Wakala Distribution vs Target) for every owner.
 * Automatically derives Normal / Priority weights and targets per owner.
 */
export function calculateKPI2(
  classifiedRows: ClassifiedRow[],
  owners: Owner[],
  period: string,
  companyOverallTargetParam?: number | any, // supports numeric companyOverallTarget or legacy manualTargets
  priorityWakalasParam?: PriorityWakala[],
  baseWakalasParam?: BaseWakala[]
): KPI2Result[] {
  // Resolve parameters safely
  let companyOverallTarget = 0;
  if (typeof companyOverallTargetParam === 'number') {
    companyOverallTarget = companyOverallTargetParam;
  } else {
    companyOverallTarget = getCompanyTargetFromHistory(period);
  }

  const priorityWakalas: PriorityWakala[] = priorityWakalasParam || (() => {
    try {
      const saved = localStorage.getItem('priorityWakalaList');
      return saved ? JSON.parse(saved) : [];
    } catch (e) {
      return [];
    }
  })();

  const tillsList = getTillsListFromStorage();

  // Period-filtered priority wakalas
  const periodPriorityWakalas = priorityWakalas.filter(p => !p.period || p.period === period);

  // First pass: gather per-owner wakalas and calculate total company wakalas
  const ownerDataMap = new Map<string, {
    owner: Owner;
    ownerWakalasMap: Map<string, { msisdn: string }>;
    priorityMsisdnSet: Set<string>;
  }>();

  let totalCompanyWakalasAcrossAllOwners = 0;

  for (const owner of owners) {
    if (!owner) continue;
    const ownerId = owner.id || '';
    const ownerNameLower = (owner.name || '').trim().toLowerCase();

    // Gather all distinct Wakala MSISDNs for this owner
    const wakalasMap = new Map<string, { msisdn: string }>();

    // 1. From owner's base and iop wakala lists
    const registeredWakalas = [...(owner.baseWakalas || []), ...(owner.iopWakalas || [])];
    registeredWakalas.forEach(w => {
      if (!w) return;
      const m1 = normalizeMsisdn(w.msisdn);
      if (m1) wakalasMap.set(m1, { msisdn: m1 });
      const m2 = normalizeMsisdn((w as any).altMsisdn || (w as any).alternateNumber);
      if (m2) wakalasMap.set(m2, { msisdn: m2 });
    });

    // 2. From tillsList matching owner
    for (const till of tillsList) {
      const tillAssigned = (till.assignedOwner || till.ownerName || '').trim().toLowerCase();
      const tillOwnerId = till.ownerId;
      if ((ownerId && tillOwnerId === ownerId) || (ownerNameLower && tillAssigned === ownerNameLower)) {
        const m = normalizeMsisdn(till.transactionTill || till.msisdn);
        if (m) wakalasMap.set(m, { msisdn: m });
      }
    }

    // 3. From classified rows attributed to this owner
    for (const cr of classifiedRows) {
      if (!cr.auditRecord) continue;
      const crOwnerId = cr.auditRecord.ownerId || cr.attributedOwnerId;
      const crOwnerName = (cr.attributedOwnerName || '').trim().toLowerCase();

      const matchesOwner = (ownerId && crOwnerId === ownerId) || (ownerNameLower && crOwnerName === ownerNameLower);
      if (!matchesOwner) continue;

      const rowMsisdn = normalizeMsisdn(
        cr.auditRecord.normalizedMsisdn ||
        cr.auditRecord.rawMsisdn ||
        cr.row['Branch_msisdn'] ||
        cr.row['transactionTill'] ||
        cr.row['Agent ID'] ||
        cr.row['AgentID'] ||
        cr.row['MSISDN'] ||
        cr.row['msisdn'] ||
        ''
      );

      if (rowMsisdn && !wakalasMap.has(rowMsisdn)) {
        wakalasMap.set(rowMsisdn, { msisdn: rowMsisdn });
      }
    }

    // Determine priority set for this owner
    const ownerPriorityMsisdns = new Set<string>();

    for (const pw of periodPriorityWakalas) {
      const pwMsisdn = normalizeMsisdn(pw.msisdn);
      const matchesByOwnerId = pw.ownerId && ownerId && pw.ownerId === ownerId;
      const matchesByOwnerName = pw.ownerName && ownerNameLower && pw.ownerName.trim().toLowerCase() === ownerNameLower;
      const matchesByMsisdn = pwMsisdn && wakalasMap.has(pwMsisdn);

      if (matchesByOwnerId || matchesByOwnerName || matchesByMsisdn) {
        if (pwMsisdn) {
          ownerPriorityMsisdns.add(pwMsisdn);
          if (!wakalasMap.has(pwMsisdn)) {
            wakalasMap.set(pwMsisdn, { msisdn: pwMsisdn });
          }
        }
      }
    }

    totalCompanyWakalasAcrossAllOwners += wakalasMap.size;

    ownerDataMap.set(ownerId, {
      owner,
      ownerWakalasMap: wakalasMap,
      priorityMsisdnSet: ownerPriorityMsisdns
    });
  }

  // Second pass: compute metrics per owner
  const results: KPI2Result[] = [];

  for (const owner of owners) {
    if (!owner) continue;
    const ownerId = owner.id || '';
    const ownerData = ownerDataMap.get(ownerId);
    if (!ownerData) continue;

    const { ownerWakalasMap, priorityMsisdnSet } = ownerData;

    const priorityWakalaCount = priorityMsisdnSet.size;
    const normalWakalaCount = Math.max(0, ownerWakalasMap.size - priorityWakalaCount);
    const totalOwnerWakalas = ownerWakalasMap.size;

    // Automatic weight derivation
    let normalWeightRatio = 1.0;
    let priorityWeightRatio = 0.0;

    if (totalOwnerWakalas > 0) {
      normalWeightRatio = normalWakalaCount / totalOwnerWakalas;
      priorityWeightRatio = priorityWakalaCount / totalOwnerWakalas;
    }

    // Company share percentage
    const companySharePct = totalCompanyWakalasAcrossAllOwners > 0
      ? round1((totalOwnerWakalas / totalCompanyWakalasAcrossAllOwners) * 100)
      : 0;

    // Derived targets
    const normalTarget = round1(companyOverallTarget * normalWeightRatio);
    const priorityTarget = round1(companyOverallTarget * priorityWeightRatio);

    // Evaluate active/served status per wakala
    let normalServed = 0;
    let priorityServed = 0;

    ownerWakalasMap.forEach(({ msisdn }) => {
      const wClean = normalizeMsisdn(msisdn);
      const wRows = classifiedRows.filter(cr => {
        const rowClean = normalizeMsisdn(
          cr.auditRecord?.normalizedMsisdn ||
          cr.auditRecord?.rawMsisdn ||
          cr.row['Branch_msisdn'] ||
          cr.row['transactionTill'] ||
          cr.row['Agent ID'] ||
          cr.row['AgentID'] ||
          cr.row['MSISDN'] ||
          cr.row['msisdn'] ||
          ''
        );
        return rowClean === wClean;
      });

      const totalTxns = wRows.reduce((sum, cr) => {
        const keys = ['SA_Servicing_Txns', 'SA Servicing Txns', 'sa_servicing_txns'];
        for (const k of keys) {
          if (cr.row[k] !== undefined) {
            const val = parseFloat(String(cr.row[k]).replace(/,/g, ''));
            if (!isNaN(val)) return sum + val;
          }
        }
        return sum + 1;
      }, 0);

      const totalVal = wRows.reduce((sum, cr) => sum + (cr.auditRecord?.amount || 0), 0);

      const isActive = wRows.some(cr => {
        const row = cr.row as Record<string, any>;
        if (!row) return false;
        const val = row.wakala_status ?? row.Wakala_Status ?? row['Wakala Status'] ?? row['wakala status'] ?? row.status ?? row.Status;
        if (val === undefined || val === null || val === '') return false;
        return Number(val) === 1;
      });

      const isServed = isActive ? (totalTxns > 6 || totalVal > 600000) : (totalTxns > 6);

      if (isServed) {
        if (priorityMsisdnSet.has(wClean)) {
          priorityServed++;
        } else {
          normalServed++;
        }
      }
    });

    // Performance percentages (uncapped)
    const normalAchievementPct = normalTarget > 0 ? (normalServed / normalTarget) * 100 : 0;
    const priorityAchievementPct = priorityTarget > 0 ? (priorityServed / priorityTarget) * 100 : 0;

    // Overall KPI 2 performance score
    const totalServed = normalServed + priorityServed;
    let weightedScore = 0;

    if (companyOverallTarget > 0) {
      weightedScore = (totalServed / companyOverallTarget) * 100;
    } else if (normalTarget > 0 || priorityTarget > 0) {
      weightedScore = (normalWeightRatio * normalAchievementPct) + (priorityWeightRatio * priorityAchievementPct);
    }

    const hasTarget = companyOverallTarget > 0 || normalTarget > 0 || priorityTarget > 0;

    results.push({
      ownerId,
      ownerName: owner.name || 'Unknown Owner',
      period,
      normalServed,
      normalTarget,
      normalAchievementPct: round1(normalAchievementPct),
      priorityServed,
      priorityTarget,
      priorityAchievementPct: round1(priorityAchievementPct),
      weightedScore: round1(weightedScore),
      status: getStatus(weightedScore),
      hasTarget,
      normalWeight: round1(normalWeightRatio * 100),
      priorityWeight: round1(priorityWeightRatio * 100),
      hasWeighting: true,
      companySharePct,
      normalWakalaCount,
      priorityWakalaCount
    });
  }

  return results;
}
