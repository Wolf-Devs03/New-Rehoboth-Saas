import { ClassifiedRow } from './classification';
import { Owner, ManualOwnerTarget, PriorityWakala } from '../types';
import { KPI1Status } from './kpiEngine';
import { isWakalaPriority, getSavedManualOwnerTargets } from './targetResolution';
import { normalizeMsisdn } from './msisdn';

export interface KPI2Result {
  ownerId: string;
  ownerName: string;
  period: string;
  normalServed: number;         // count of Normal wakala served this period
  normalTarget: number;         // admin-set target count
  normalAchievementPct: number; // uncapped
  priorityServed: number;
  priorityTarget: number;
  priorityAchievementPct: number; // uncapped
  weightedScore: number;        // (min(normalPct,100)*0.7) + (min(priorityPct,100)*0.3), capped combination
  status: KPI1Status;           // reuse the same Green/Blue/Yellow/Red type
  hasTarget: boolean;
}

const NORMAL_WEIGHT = 0.70;
const PRIORITY_WEIGHT = 0.30;

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
 * Calculates KPI 2 (Active Wakala Distribution vs Target) for every owner.
 * Splits wakalas into Normal vs Priority using isWakalaPriority.
 * Evaluates active/served rule (>6 transactions OR >600,000 TZS, SA exception 6-txns-only).
 */
export function calculateKPI2(
  classifiedRows: ClassifiedRow[],
  owners: Owner[],
  period: string,
  manualTargets?: ManualOwnerTarget[],
  priorityWakalas?: PriorityWakala[]
): KPI2Result[] {
  const results: KPI2Result[] = [];
  const actualManualTargets = manualTargets || getSavedManualOwnerTargets();

  for (const owner of owners) {
    if (!owner) continue;
    const ownerId = owner.id || '';
    const ownerNameLower = (owner.name || '').trim().toLowerCase();

    // 1. Gather all distinct Wakala MSISDNs for this owner
    const wakalasMap = new Map<string, { msisdn: string; isSaTill: boolean }>();

    // From owner's base and iop wakala lists
    const registeredWakalas = [...(owner.baseWakalas || []), ...(owner.iopWakalas || [])];
    registeredWakalas.forEach(w => {
      if (!w) return;
      const m1 = normalizeMsisdn(w.msisdn);
      if (m1) wakalasMap.set(m1, { msisdn: m1, isSaTill: false });
      const m2 = normalizeMsisdn((w as any).altMsisdn || (w as any).alternateNumber);
      if (m2) wakalasMap.set(m2, { msisdn: m2, isSaTill: false });
    });

    // From classified rows attributed to this owner
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
        const isSa = cr.bucket === 'SA_INTERNAL';
        wakalasMap.set(rowMsisdn, { msisdn: rowMsisdn, isSaTill: isSa });
      }
    }

    // 2. Evaluate served status per Wakala
    let normalServed = 0;
    let priorityServed = 0;

    wakalasMap.forEach(({ msisdn, isSaTill }) => {
      // Find matching classified rows
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

      // Calculate total txns and total volume
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

      // Evaluate active-wakala rule (>6 transactions OR >600,000 TZS; SA exception: >6 txns only)
      const isServed = isSaTill ? totalTxns > 6 : (totalTxns > 6 || totalVal > 600000);

      if (isServed) {
        const isPriority = isWakalaPriority(msisdn, period, priorityWakalas);
        if (isPriority) {
          priorityServed++;
        } else {
          normalServed++;
        }
      }
    });

    // 3. Resolve Admin Targets for KPI2
    const manual = actualManualTargets.find(m => m.ownerId === ownerId && m.period === period);
    const normalTarget = manual?.kpi2NormalTarget ?? 0;
    const priorityTarget = manual?.kpi2PriorityTarget ?? 0;

    const hasTarget = (manual?.kpi2NormalTarget !== undefined || manual?.kpi2PriorityTarget !== undefined) && 
                      (normalTarget > 0 || priorityTarget > 0);

    // 4. Compute achievement % (uncapped)
    const normalAchievementPct = normalTarget > 0 ? (normalServed / normalTarget) * 100 : 0;
    const priorityAchievementPct = priorityTarget > 0 ? (priorityServed / priorityTarget) * 100 : 0;

    // 5. Compute weighted score (capped combination: min(pct, 100) * weight)
    const cappedNormalPct = Math.min(normalAchievementPct, 100);
    const cappedPriorityPct = Math.min(priorityAchievementPct, 100);

    let weightedScore = 0;
    if (hasTarget) {
      if (normalTarget > 0 && priorityTarget > 0) {
        weightedScore = (cappedNormalPct * NORMAL_WEIGHT) + (cappedPriorityPct * PRIORITY_WEIGHT);
      } else if (normalTarget > 0) {
        weightedScore = cappedNormalPct;
      } else if (priorityTarget > 0) {
        weightedScore = cappedPriorityPct;
      }
    }

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
    });
  }

  return results;
}
