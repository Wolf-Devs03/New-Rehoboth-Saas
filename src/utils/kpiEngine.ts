import { ClassifiedRow } from './classification';
import { AgentTarget, Owner } from '../types';
import { resolveOwnerMatch } from './ownerMatch';

export type KPI1Status = 'Excellent' | 'Good' | 'Average' | 'Low';

export interface KPI1Result {
  ownerId: string;
  ownerName: string;
  period: string;
  baseVolume: number;
  iopVolume: number;
  baseTarget: number;
  iopTarget: number;
  monthlyTarget: number;
  baseAttainmentPct: number;
  iopAttainmentPct: number;
  weightedScore: number;
  status: KPI1Status;
  hasTarget: boolean; // false if no AgentTarget record was found for this owner/period
}

const BASE_WEIGHT = 0.70;
const IOP_WEIGHT = 0.30;

function getStatus(score: number): KPI1Status {
  if (score >= 90) return 'Excellent';
  if (score >= 70) return 'Good';
  if (score >= 60) return 'Average';
  return 'Low';
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/**
 * Computes KPI 1 (weighted volume) for every owner, for a given period.
 * Consumes ALREADY-classified rows (get these via getClassifiedRowsCached
 * in the caller) — this function does no classification itself, only
 * aggregation, so it stays fast and independently testable.
 */
export function calculateKPI1(
  classifiedRows: ClassifiedRow[],
  agentTargets: AgentTarget[],
  owners: Owner[],
  period: string
): KPI1Result[] {
  const results: KPI1Result[] = [];

  // Pre-resolve each target's owner once, rather than per-row
  const targetsForPeriod = agentTargets.filter(t => t.period === period);
  const targetByOwnerId = new Map<string, AgentTarget>();
  for (const t of targetsForPeriod) {
    const match = resolveOwnerMatch(t.ownerName, owners, 'KPI 1 Calculation');
    if (match.matchedOwner) {
      targetByOwnerId.set(match.matchedOwner.id, t);
    }
  }

  // Pre-aggregate volume per owner in a single pass over classifiedRows,
  // rather than re-scanning the full row set once per owner
  const baseVolumeByOwner = new Map<string, number>();
  const iopVolumeByOwner = new Map<string, number>();

  for (const cr of classifiedRows) {
    if (cr.bucket === 'SA_INTERNAL') continue;
    const actingOwnerId = cr.auditRecord?.ownerId;
    if (!actingOwnerId || actingOwnerId === 'UNASSIGNED') continue;
    const amount = cr.auditRecord?.amount || 0;

    if (cr.bucket === 'BASE') {
      baseVolumeByOwner.set(actingOwnerId, (baseVolumeByOwner.get(actingOwnerId) || 0) + amount);
    } else if (cr.bucket === 'BASE_CROSS_OWNER' || cr.bucket === 'IOP') {
      iopVolumeByOwner.set(actingOwnerId, (iopVolumeByOwner.get(actingOwnerId) || 0) + amount);
    }
  }

  for (const owner of owners) {
    const target = targetByOwnerId.get(owner.id);
    const monthlyTarget = target?.monthlyTarget || 0;
    const baseTarget = monthlyTarget * BASE_WEIGHT;
    const iopTarget = monthlyTarget * IOP_WEIGHT;

    const baseVolume = baseVolumeByOwner.get(owner.id) || 0;
    const iopVolume = iopVolumeByOwner.get(owner.id) || 0;

    const baseAttainmentPct = baseTarget > 0 ? Math.min(100, (baseVolume / baseTarget) * 100) : 0;
    const iopAttainmentPct = iopTarget > 0 ? Math.min(100, (iopVolume / iopTarget) * 100) : 0;
    const weightedScore = (baseAttainmentPct * BASE_WEIGHT) + (iopAttainmentPct * IOP_WEIGHT);

    results.push({
      ownerId: owner.id,
      ownerName: owner.name,
      period,
      baseVolume,
      iopVolume,
      baseTarget,
      iopTarget,
      monthlyTarget,
      baseAttainmentPct: round1(baseAttainmentPct),
      iopAttainmentPct: round1(iopAttainmentPct),
      weightedScore: round1(Math.min(100, weightedScore)),
      status: getStatus(weightedScore),
      hasTarget: !!target,
    });
  }

  return results;
}
