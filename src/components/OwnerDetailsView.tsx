import React, { useState, useEffect, useMemo } from 'react';
import { ViewType, Owner, ReportSubmission, WakalaEntry, BaseWakala, PriorityWakala } from '../types';
import { normalizeMsisdn } from '../utils/msisdn';
import { buildOwnerWakalaMap } from '../utils/wakalaMapping';
import { ownersList } from '../data';
import WorkLocationSection from './WorkLocationSection';
import TransactionHistorySection from './TransactionHistorySection';
import { getAvatarUrl } from '../utils/avatar';
import OwnerAvatar from './OwnerAvatar';
import { savePhoto, getPhoto, deletePhoto } from '../utils/db';
import { 
  ArrowLeft, 
  User, 
  MapPin, 
  Calendar, 
  Award, 
  TrendingUp, 
  Briefcase, 
  Activity, 
  MoreVertical, 
  Edit, 
  ExternalLink,
  ChevronRight,
  ChevronDown,
  UserCheck,
  CheckCircle,
  AlertTriangle,
  Clock,
  CheckCircle2,
  Camera,
  Trash2,
  X,
  Loader2,
  Navigation
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { getServicingRows } from '../utils/indexedDB';
import { getClassifiedRowsCached } from '../utils/classificationCache';
import { calculateOwnerMtdVolume } from '../utils/kpiEngine';
import { resolveOwnerMatch } from '../utils/ownerMatch';
import { AgentTarget, ManualOwnerTarget } from '../types';
import { useAuth } from './AuthContext';
import { 
  resolveOwnerTarget, 
  getSavedManualOwnerTargets, 
  saveManualOwnerTarget, 
  clearManualOwnerTargetKpi1Override, 
  clearManualOwnerTargetKpi2Override 
} from '../utils/targetResolution';

const regionsList = [
  'Dar es Salaam',
  'Mwanza',
  'Arusha',
  'Dodoma',
  'Mbeya',
  'Morogoro',
  'Tanga',
  'Zanzibar'
];

interface OwnerDetailsViewProps {
  onNavigate: (view: ViewType) => void;
  selectedOwnerName: string;
  isStandaloneAgent?: boolean;
  onLogout?: () => void;
}

export default function OwnerDetailsView({ 
  onNavigate, 
  selectedOwnerName,
  isStandaloneAgent = false,
  onLogout
}: OwnerDetailsViewProps) {
  // Try to find selected owner in our list; fallback to first owner
  const owner = (() => {
    const saved = localStorage.getItem('ownersList');
    let foundOwner: any = null;
    if (saved) {
      try {
        const list = JSON.parse(saved);
        if (Array.isArray(list)) {
          foundOwner = list.find(o => o.name === selectedOwnerName || o.id === selectedOwnerName);
        }
      } catch (e) {
        console.error(e);
      }
    }
    
    if (!foundOwner) {
      foundOwner = ownersList.find(o => o.name === selectedOwnerName) || ownersList[0];
    }
    
    if (foundOwner) {
      let bulkMapped: any[] = [];
      try {
        const savedBaseStr = localStorage.getItem('baseWakalaIndex');
        if (savedBaseStr) {
          const parsedBase: BaseWakala[] = JSON.parse(savedBaseStr);
          if (Array.isArray(parsedBase) && parsedBase.length > 0) {
            const ownerRoster = saved ? JSON.parse(saved) : ownersList;
            const { byOwnerId } = buildOwnerWakalaMap(parsedBase, ownerRoster);
            bulkMapped = byOwnerId.get(foundOwner.id) || [];
          }
        }
      } catch (e) { console.error(e); }

      if (bulkMapped.length > 0) {
        const manualBase = (foundOwner.baseWakalas || []).filter((w: any) => w.source !== 'bulk-import');
        foundOwner.baseWakalas = [...manualBase, ...bulkMapped];
      } else if (foundOwner.baseWakalas === undefined) {
        const savedTillsStr = localStorage.getItem('tillsList');
        const base: any[] = [];
        const iop: any[] = [];
        if (savedTillsStr) {
          try {
            const parsedTills = JSON.parse(savedTillsStr);
            if (Array.isArray(parsedTills)) {
              const matchedTills = parsedTills.filter((t: any) =>
                t.ownerName === foundOwner.name ||
                (foundOwner.masterAgentId && t.masterAgentId === foundOwner.masterAgentId)
              );
              matchedTills.forEach((t: any, idx: number) => {
                const entry = {
                  id: t.id || `wakala-${idx}-${Date.now()}`,
                  name: t.tillName || t.name || 'Wakala',
                  msisdn: t.transactionTill || t.msisdn || '',
                  region: t.location || t.region || 'Dar es Salaam',
                  dateAdded: t.dateAdded || '2026-07-01'
                };
                if (t.title === 'IOP' || t.title === 'MFS IOP' || (t.title && t.title.toLowerCase().includes('iop'))) {
                  iop.push(entry);
                } else {
                  base.push(entry);
                }
              });
            }
          } catch (e) {}
        }
        foundOwner.baseWakalas = base;
        foundOwner.iopWakalas = foundOwner.iopWakalas || iop;
      }

      foundOwner.wakalas = (foundOwner.baseWakalas?.length || 0) + (foundOwner.iopWakalas?.length || 0);
    }
    return foundOwner;
  })();

  const [localOwner, setLocalOwner] = useState<Owner | undefined>(owner);
  const [activeTab, setActiveTab] = useState<'overview' | 'wakalas' | 'location'>('overview');

  // Dynamic submissions list per owner
  const [submissions, setSubmissions] = useState<ReportSubmission[]>(() => {
    if (!localOwner) return [];
    const key = `reportSubmissions_${localOwner.id || localOwner.name}`;
    const saved = localStorage.getItem(key);
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        console.error(e);
      }
    }
    return [];
  });

  const [tillsList, setTillsList] = useState<any[]>([]);
  const [servicingRows, setServicingRows] = useState<any[]>([]);
  const [loadingMetrics, setLoadingMetrics] = useState(true);

  useEffect(() => {
    // Sync localOwner if selectedOwnerName changes
    setLocalOwner(owner);
  }, [selectedOwnerName]);

  useEffect(() => {
    // Load tills and servicing rows
    const savedTills = localStorage.getItem('tillsList');
    if (savedTills) {
      try {
        setTillsList(JSON.parse(savedTills));
      } catch (e) {
        console.error(e);
      }
    }

    async function loadData() {
      try {
        let activeMonth = "July 2026";
        const historyStr = localStorage.getItem('kpiWorkbookHistory');
        if (historyStr) {
          const history = JSON.parse(historyStr);
          if (Array.isArray(history) && history.length > 0 && history[0].reportingMonth) {
            activeMonth = history[0].reportingMonth;
          }
        }
        
        const rows = await getServicingRows(activeMonth);
        setServicingRows(rows || []);
      } catch (e) {
        console.error("Error loading servicing rows in OwnerDetailsView:", e);
      } finally {
        setLoadingMetrics(false);
      }
    }
    loadData();
  }, []);

  const [showEditSuccess, setShowEditSuccess] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editForm, setEditForm] = useState({
    name: '',
    masterAgentId: '',
    region: '',
    title: '',
    avatar: '',
  });
  const [editError, setEditError] = useState<string | null>(null);
  const [editSaveStatus, setEditSaveStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const [tempAvatarData, setTempAvatarData] = useState<string | null>(null);
  const [tempAvatarPhotoId, setTempAvatarPhotoId] = useState<string | undefined>(undefined);
  const [previewSrc, setPreviewSrc] = useState<string>('');
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (tempAvatarData === 'clear') {
      setPreviewSrc(getAvatarUrl(editForm.name));
    } else if (tempAvatarData) {
      setPreviewSrc(tempAvatarData);
    } else if (tempAvatarPhotoId) {
      getPhoto(tempAvatarPhotoId).then(photo => {
        if (photo && photo.imageData) {
          setPreviewSrc(photo.imageData);
        } else {
          setPreviewSrc(getAvatarUrl(editForm.name));
        }
      }).catch(() => {
        setPreviewSrc(getAvatarUrl(editForm.name));
      });
    } else {
      setPreviewSrc(getAvatarUrl(editForm.name));
    }
  }, [tempAvatarData, tempAvatarPhotoId, editForm.name]);

  // Weekly bar data for Agent Activity Distribution (Mon-Sun)
  // Stitch screenshot shows bars for Mon-Sun
  const weeklyActivity = [
    { day: 'Mon', cashIn: 65, cashOut: 40 },
    { day: 'Tue', cashIn: 80, cashOut: 55 },
    { day: 'Wed', cashIn: 95, cashOut: 70 },
    { day: 'Thu', cashIn: 75, cashOut: 60 },
    { day: 'Fri', cashIn: 98, cashOut: 85 },
    { day: 'Sat', cashIn: 40, cashOut: 30 },
    { day: 'Sun', cashIn: 30, cashOut: 20 },
  ];

  const handleAuditRequest = (id: string) => {
    const updated = submissions.map(sub => {
      if (sub.id === id) {
        return { ...sub, status: 'Verified' as const };
      }
      return sub;
    });
    setSubmissions(updated);
    const key = `reportSubmissions_${localOwner.id || localOwner.name}`;
    localStorage.setItem(key, JSON.stringify(updated));
  };

  const getSubStatusStyle = (status: ReportSubmission['status']) => {
    switch (status) {
      case 'Verified':
        return 'bg-emerald-50 text-emerald-700 border-emerald-200';
      case 'Pending Audit':
        return 'bg-amber-50 text-amber-700 border-amber-200';
      case 'Failed':
        return 'bg-rose-50 text-rose-700 border-rose-200';
      default:
        return 'bg-slate-50 text-slate-700 border-slate-200';
    }
  };

  const updateWakalasInLocalStorage = (updatedBase: WakalaEntry[], updatedIop: WakalaEntry[]) => {
    const saved = localStorage.getItem('ownersList');
    if (saved) {
      try {
        const list = JSON.parse(saved);
        if (Array.isArray(list)) {
          const updatedList = list.map((o: any) => {
            if (o.name === localOwner.name || o.id === localOwner.id) {
              return {
                ...o,
                baseWakalas: updatedBase,
                iopWakalas: updatedIop,
                wakalas: updatedBase.length + updatedIop.length
              };
            }
            return o;
          });
          localStorage.setItem('ownersList', JSON.stringify(updatedList));
          
          setLocalOwner(prev => ({
            ...prev,
            baseWakalas: updatedBase,
            iopWakalas: updatedIop,
            wakalas: updatedBase.length + updatedIop.length
          }));
        }
      } catch (e) {
        console.error("Error updating wakalas in localStorage:", e);
      }
    }
  };

  const handleUpdateOwner = (updatedOwner: Owner) => {
    const saved = localStorage.getItem('ownersList');
    if (saved) {
      try {
        const list = JSON.parse(saved);
        if (Array.isArray(list)) {
          const updatedList = list.map((o: any) => {
            if (o.id === localOwner.id || o.name === localOwner.name || o.id === updatedOwner.id || o.name === updatedOwner.name) {
              return updatedOwner;
            }
            return o;
          });
          localStorage.setItem('ownersList', JSON.stringify(updatedList));
        }
      } catch (e) {
        console.error("Error updating owner in localStorage:", e);
        throw e;
      }
    }
    setLocalOwner(updatedOwner);
  };

  const handleOpenEdit = () => {
    setEditForm({
      name: localOwner.name || '',
      masterAgentId: localOwner.masterAgentId || '',
      region: localOwner.region || '',
      title: localOwner.title || 'MFS',
      avatar: localOwner.avatar || '',
    });
    setTempAvatarData(null);
    setTempAvatarPhotoId(localOwner.avatarPhotoId);
    setEditError(null);
    setShowEditModal(true);
  };

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setEditError('Unsupported format. Please upload valid image files only.');
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setEditError('File size exceeds the 5MB limit.');
      return;
    }

    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = err => reject(err);
      });
      setTempAvatarData(base64);
      setEditError(null);
    } catch (err) {
      setEditError('Failed to read image file.');
    }
  };

  const handleRemoveAvatar = async () => {
    setTempAvatarData('clear');
    setTempAvatarPhotoId(undefined);
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setEditError(null);
    setEditSaveStatus(null);

    const { name, masterAgentId, region, title } = editForm;

    if (!name.trim()) {
      setEditError('Full Name cannot be empty.');
      return;
    }
    if (!masterAgentId.trim()) {
      setEditError('Master Agent ID cannot be empty.');
      return;
    }
    if (!region.trim()) {
      setEditError('Region cannot be empty.');
      return;
    }

    try {
      let finalAvatarPhotoId = localOwner.avatarPhotoId;

      if (tempAvatarData === 'clear') {
        if (localOwner.avatarPhotoId) {
          try { await deletePhoto(localOwner.avatarPhotoId); } catch (e) {}
        }
        finalAvatarPhotoId = undefined;
      } else if (tempAvatarData) {
        // delete old if exists
        if (localOwner.avatarPhotoId) {
          try { await deletePhoto(localOwner.avatarPhotoId); } catch (e) {}
        }
        finalAvatarPhotoId = await savePhoto(localOwner.id || localOwner.name, tempAvatarData, undefined, 'avatar');
      }

      const updatedOwner: Owner = {
        ...localOwner,
        name: name.trim(),
        masterAgentId: masterAgentId.trim(),
        region: region.trim(),
        title: title.trim() || undefined,
        avatarPhotoId: finalAvatarPhotoId,
      };

      handleUpdateOwner(updatedOwner);
      setEditSaveStatus({
        type: 'success',
        message: 'Profile changes successfully saved to global registry.'
      });
      setShowEditModal(false);
      setTimeout(() => setEditSaveStatus(null), 4000);
    } catch (err: any) {
      setEditError(err.message || 'Failed to save profile changes.');
      setEditSaveStatus({
        type: 'error',
        message: 'Failed to persist profile changes to localStorage.'
      });
    }
  };

  const cleanMsisdn = (num: string) => {
    const cleaned = num.replace(/\D/g, '');
    return cleaned.slice(-9); // last 9 digits (handles 255... and 0... identically)
  };

  const getAmountVal = (row: any) => {
    const val = row['Volume (TZS)'] || row['Volume'] || row['Amount'] || row['value'] || row['volume'] || row['SA_Servicing_Val'] || row['sa_servicing_val'] || 0;
    if (typeof val === 'number') return val;
    const cleaned = String(val).replace(/,/g, '').replace(/[^0-9.-]/g, '');
    const parsed = parseFloat(cleaned);
    return isNaN(parsed) ? 0 : parsed;
  };

  const getCommissionVal = (row: any) => {
    const keys = ['Commission TZS', 'Commission', 'commission', 'Commission_TZS', 'SA_Commissions', 'sa_commissions'];
    for (const k of keys) {
      if (row[k] !== undefined && row[k] !== null) {
        const valStr = String(row[k]).replace(/,/g, '').trim();
        const val = parseFloat(valStr);
        if (!isNaN(val)) return val;
      }
    }
    return 0;
  };

  // Find rows belonging to this owner
  const ownerRows = useMemo(() => {
    if (!localOwner || !localOwner.name || servicingRows.length === 0) return [];
    
    const ownerTills = (tillsList || [])
      .filter((t: any) => t.assignedOwner && t.assignedOwner.toLowerCase() === localOwner.name.toLowerCase())
      .map((t: any) => (t.transactionTill || t.id || '').trim());

    const allWakalaMsisdns = [
      ...(localOwner.baseWakalas || []),
      ...(localOwner.iopWakalas || [])
    ].map(w => cleanMsisdn(w.msisdn));

    return servicingRows.filter(row => {
      const rowName = String(row['Wakala Owner'] || row['Wakala Name'] || row['Name'] || row['ownerName'] || '').trim().toLowerCase();
      const rowTill = String(row['Branch_msisdn'] || row['transactionTill'] || row['Agent ID'] || row['AgentID'] || '').trim();
      const rowMsisdn = cleanMsisdn(row['Branch_msisdn'] || row['transactionTill'] || row['Agent ID'] || row['AgentID'] || row['MSISDN'] || row['msisdn'] || row['phone'] || row['Phone'] || '');
      
      return (
        rowName === localOwner.name.toLowerCase() ||
        ownerTills.includes(rowTill) ||
        (rowMsisdn && allWakalaMsisdns.includes(rowMsisdn))
      );
    });
  }, [servicingRows, tillsList, localOwner]);

  // Derive metrics
  const { 
    totalVolumeServed, 
    totalCommissions, 
    activeWakalaCount, 
    inactiveWakalaCount, 
    isSynced,
    rankStr 
  } = useMemo(() => {
    if (!localOwner || !localOwner.name) {
      return {
        totalVolumeServed: 0,
        totalCommissions: 0,
        activeWakalaCount: 0,
        inactiveWakalaCount: 0,
        isSynced: false,
        rankStr: 'Not yet synced'
      };
    }
    const allWakalas = [...(localOwner.baseWakalas || []), ...(localOwner.iopWakalas || [])];
    
    if (allWakalas.length === 0) {
      return {
        totalVolumeServed: 0,
        totalCommissions: 0,
        activeWakalaCount: 0,
        inactiveWakalaCount: 0,
        isSynced: false,
        rankStr: 'Not yet synced'
      };
    }

    if (servicingRows.length === 0 || ownerRows.length === 0) {
      return {
        totalVolumeServed: 0,
        totalCommissions: 0,
        activeWakalaCount: 0,
        inactiveWakalaCount: 0,
        isSynced: false,
        rankStr: 'Not yet synced'
      };
    }

    // Sum up Volume Served (Math.abs handles negative and positive sheets)
    const volServed = ownerRows.reduce((sum, r) => sum + Math.abs(getAmountVal(r)), 0);

    // Sum up Commissions
    const comms = ownerRows.reduce((sum, r) => sum + getCommissionVal(r), 0) || (volServed * 0.01);

    // Active/Inactive counts using matching MSISDNs
    let active = 0;
    let hasAnyMatch = false;

    allWakalas.forEach(w => {
      const wClean = cleanMsisdn(w.msisdn);
      // find rows matching this specific wakala
      const wRows = ownerRows.filter(row => {
        const rowMsisdn = cleanMsisdn(row['Branch_msisdn'] || row['transactionTill'] || row['Agent ID'] || row['AgentID'] || row['MSISDN'] || row['msisdn'] || row['phone'] || row['Phone'] || '');
        return rowMsisdn === wClean;
      });

      if (wRows.length > 0) {
        hasAnyMatch = true;
        // Evaluate the company activity rule: SA_Servicing_Txns > 6 OR SA_Servicing_Val > 600000
        const totalTxns = wRows.reduce((sum, r) => {
          const keys = ['SA_Servicing_Txns', 'SA Servicing Txns', 'sa_servicing_txns'];
          for (const k of keys) {
            if (r[k] !== undefined) {
              const val = parseFloat(String(r[k]).replace(/,/g, ''));
              if (!isNaN(val)) return sum + val;
            }
          }
          return sum + 1; // assume 1 if not specified but row exists
        }, 0);

        const totalVal = wRows.reduce((sum, r) => Math.abs(getAmountVal(r)), 0);

        if (totalTxns > 6 || totalVal > 600000) {
          active++;
        }
      }
    });

    const inactive = allWakalas.length - active;

    // Rank Calculation
    const ownerVolumes: { [ownerName: string]: number } = {};
    const savedOwners = localStorage.getItem('ownersList');
    let allOwners: any[] = [];
    if (savedOwners) {
      try { allOwners = JSON.parse(savedOwners); } catch (e) {}
    }
    if (allOwners.length === 0) allOwners = [localOwner];

    allOwners.forEach((o: any) => {
      if (o && o.name) {
        ownerVolumes[o.name.toLowerCase()] = 0;
      }
    });

    servicingRows.forEach(row => {
      const rowName = String(row['Wakala Owner'] || row['Wakala Name'] || row['Name'] || row['ownerName'] || '').trim().toLowerCase();
      if (rowName && ownerVolumes[rowName] !== undefined) {
        ownerVolumes[rowName] += Math.abs(getAmountVal(row));
      } else {
        const rowTill = String(row['Branch_msisdn'] || row['transactionTill'] || row['Agent ID'] || row['AgentID'] || '').trim();
        const matchedTill = (tillsList || []).find((t: any) => (t.transactionTill || t.id || '').trim() === rowTill);
        if (matchedTill && matchedTill.assignedOwner) {
          const ownerNameKey = matchedTill.assignedOwner.toLowerCase();
          if (ownerVolumes[ownerNameKey] !== undefined) {
            ownerVolumes[ownerNameKey] += Math.abs(getAmountVal(row));
          }
        }
      }
    });

    const sorted = Object.entries(ownerVolumes)
      .map(([name, vol]) => ({ name, vol }))
      .sort((a, b) => b.vol - a.vol);

    const activeIndex = sorted.findIndex(o => o.name === localOwner.name.toLowerCase());
    const rankNum = activeIndex !== -1 ? activeIndex + 1 : 1;
    const tier = rankNum <= 2 ? 'Platinum' : (rankNum <= 5 ? 'Gold' : 'Silver');

    return {
      totalVolumeServed: volServed,
      totalCommissions: comms,
      activeWakalaCount: active,
      inactiveWakalaCount: inactive,
      isSynced: hasAnyMatch,
      rankStr: `${tier} #${rankNum}`
    };
  }, [servicingRows, ownerRows, tillsList, localOwner]);

  const { priorityWakalaCount, normalWakalaCount, hasPriorityData } = useMemo(() => {
    if (!localOwner) {
      return { priorityWakalaCount: 0, normalWakalaCount: 0, hasPriorityData: false };
    }

    const rawPriority = localStorage.getItem('priorityWakalaList');
    if (!rawPriority) {
      return { priorityWakalaCount: 0, normalWakalaCount: 0, hasPriorityData: false };
    }

    try {
      const list: PriorityWakala[] = JSON.parse(rawPriority);
      if (!Array.isArray(list) || list.length === 0) {
        return { priorityWakalaCount: 0, normalWakalaCount: 0, hasPriorityData: false };
      }

      const priorityMsisdnSet = new Set<string>();
      list.forEach(p => {
        const norm = normalizeMsisdn(p.msisdn);
        if (norm) priorityMsisdnSet.add(norm);
      });

      if (priorityMsisdnSet.size === 0) {
        return { priorityWakalaCount: 0, normalWakalaCount: 0, hasPriorityData: false };
      }

      const ownerWakalas = [...(localOwner.baseWakalas || []), ...(localOwner.iopWakalas || [])];
      let pCount = 0;

      ownerWakalas.forEach(w => {
        const norm1 = normalizeMsisdn(w.msisdn);
        const norm2 = normalizeMsisdn((w as any).altMsisdn || (w as any).alternateNumber);
        if ((norm1 && priorityMsisdnSet.has(norm1)) || (norm2 && priorityMsisdnSet.has(norm2))) {
          pCount++;
        }
      });

      return {
        priorityWakalaCount: pCount,
        normalWakalaCount: Math.max(0, ownerWakalas.length - pCount),
        hasPriorityData: true
      };
    } catch (e) {
      return { priorityWakalaCount: 0, normalWakalaCount: 0, hasPriorityData: false };
    }
  }, [localOwner]);

  const ownerMtdData = useMemo(() => {
    if (!localOwner || servicingRows.length === 0) {
      return {
        servedVolume: 0,
        baseVolume: 0,
        iopVolume: 0,
        monthlyTarget: 0,
        paDayTarget: 0,
        achievementPercentage: 0,
        status: 'Red' as const,
        hasTarget: false
      };
    }

    const savedSaTills = localStorage.getItem('saTillRegistry');
    const saTillRegistry = savedSaTills ? JSON.parse(savedSaTills) : [];
    const savedBaseWakalas = localStorage.getItem('baseWakalaIndex');
    const baseWakalaIndex = savedBaseWakalas ? JSON.parse(savedBaseWakalas) : [];
    const savedOwners = localStorage.getItem('ownersList');
    const owners: Owner[] = savedOwners ? JSON.parse(savedOwners) : [];

    const classified = getClassifiedRowsCached(servicingRows, saTillRegistry, baseWakalaIndex, tillsList, owners);

    let vols = calculateOwnerMtdVolume(classified, localOwner.id);

    if (vols.servedVolume === 0 && localOwner.name) {
      const matched = resolveOwnerMatch(localOwner.name, owners, 'Owner Portal');
      if (matched.matchedOwner?.id) {
        vols = calculateOwnerMtdVolume(classified, matched.matchedOwner.id);
      }
    }

    const savedTargets = localStorage.getItem('agentTargets');
    const agentTargets: AgentTarget[] = savedTargets ? JSON.parse(savedTargets) : [];
    const manualTargets = getSavedManualOwnerTargets();

    let period = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;
    const periods = agentTargets.map(t => t.period).filter((p): p is string => Boolean(p));
    if (periods.length > 0) {
      const sortedPeriods = Array.from(new Set(periods)).sort().reverse();
      period = sortedPeriods[0];
    }

    const targetRes = resolveOwnerTarget(
      localOwner.id || '',
      period,
      manualTargets,
      agentTargets,
      owners
    );

    const monthlyTarget = targetRes.monthlyTarget || 0;
    const paDayTarget = monthlyTarget / 24;
    const achievementPercentage = monthlyTarget > 0 ? (vols.servedVolume / monthlyTarget) * 100 : 0;
    
    let status: 'Green' | 'Blue' | 'Yellow' | 'Red' = 'Red';
    if (achievementPercentage >= 90) status = 'Green';
    else if (achievementPercentage >= 70) status = 'Blue';
    else if (achievementPercentage >= 60) status = 'Yellow';

    return {
      servedVolume: vols.servedVolume,
      baseVolume: vols.baseVolume,
      iopVolume: vols.iopVolume,
      monthlyTarget,
      paDayTarget,
      achievementPercentage: Math.round(achievementPercentage * 10) / 10,
      status,
      hasTarget: targetRes.source !== 'none' && monthlyTarget > 0
    };
  }, [localOwner, servicingRows, tillsList]);

  const { user } = useAuth();
  const isAdmin = !user || user.role === 'Admin';

  const [targetPeriod, setTargetPeriod] = useState<string>(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });

  const [manualTargetsList, setManualTargetsList] = useState<ManualOwnerTarget[]>(() => getSavedManualOwnerTargets());

  const currentManual = useMemo(() => {
    if (!localOwner?.id) return undefined;
    return manualTargetsList.find(m => m.ownerId === localOwner.id && m.period === targetPeriod);
  }, [localOwner?.id, targetPeriod, manualTargetsList]);

  const [kpi1BaseInput, setKpi1BaseInput] = useState<string>('');
  const [kpi1IopInput, setKpi1IopInput] = useState<string>('');
  const [kpi2NormalInput, setKpi2NormalInput] = useState<string>('');
  const [kpi2PriorityInput, setKpi2PriorityInput] = useState<string>('');

  useEffect(() => {
    if (currentManual) {
      setKpi1BaseInput(currentManual.kpi1BaseTarget !== undefined ? String(currentManual.kpi1BaseTarget) : '');
      setKpi1IopInput(currentManual.kpi1IopTarget !== undefined ? String(currentManual.kpi1IopTarget) : '');
      setKpi2NormalInput(currentManual.kpi2NormalTarget !== undefined ? String(currentManual.kpi2NormalTarget) : '');
      setKpi2PriorityInput(currentManual.kpi2PriorityTarget !== undefined ? String(currentManual.kpi2PriorityTarget) : '');
    } else {
      setKpi1BaseInput('');
      setKpi1IopInput('');
      setKpi2NormalInput('');
      setKpi2PriorityInput('');
    }
  }, [currentManual, localOwner?.id, targetPeriod]);

  const computedKpi1Sum = useMemo(() => {
    const b = parseFloat(kpi1BaseInput) || 0;
    const i = parseFloat(kpi1IopInput) || 0;
    return b + i;
  }, [kpi1BaseInput, kpi1IopInput]);

  const hasKpi1Manual = currentManual?.kpi1BaseTarget !== undefined || currentManual?.kpi1IopTarget !== undefined;
  const hasKpi2Manual = currentManual?.kpi2NormalTarget !== undefined || currentManual?.kpi2PriorityTarget !== undefined;

  const hasKpi1Uploaded = useMemo(() => {
    if (!localOwner) return false;
    const saved = localStorage.getItem('agentTargets');
    if (!saved) return false;
    try {
      const targets: AgentTarget[] = JSON.parse(saved);
      const savedOwnersStr = localStorage.getItem('ownersList');
      const owners: Owner[] = savedOwnersStr ? JSON.parse(savedOwnersStr) : [];
      const forPeriod = targets.filter(t => t.period === targetPeriod);
      for (const t of forPeriod) {
        const match = resolveOwnerMatch(t.ownerName, owners, 'TargetCheck');
        if (match.matchedOwner?.id === localOwner.id && t.monthlyTarget > 0) return true;
      }
    } catch (e) { console.error(e); }
    return false;
  }, [localOwner?.id, targetPeriod]);

  const handleSaveAdminTargets = () => {
    if (!localOwner?.id) return;
    const baseVal = kpi1BaseInput.trim() !== '' ? parseFloat(kpi1BaseInput) : undefined;
    const iopVal = kpi1IopInput.trim() !== '' ? parseFloat(kpi1IopInput) : undefined;
    const normalVal = kpi2NormalInput.trim() !== '' ? parseInt(kpi2NormalInput, 10) : undefined;
    const priorityVal = kpi2PriorityInput.trim() !== '' ? parseInt(kpi2PriorityInput, 10) : undefined;

    const targetObj: ManualOwnerTarget = {
      ownerId: localOwner.id,
      period: targetPeriod,
      kpi1BaseTarget: baseVal !== undefined && !isNaN(baseVal) ? baseVal : undefined,
      kpi1IopTarget: iopVal !== undefined && !isNaN(iopVal) ? iopVal : undefined,
      kpi2NormalTarget: normalVal !== undefined && !isNaN(normalVal) ? normalVal : undefined,
      kpi2PriorityTarget: priorityVal !== undefined && !isNaN(priorityVal) ? priorityVal : undefined,
      setBy: user?.email || 'Admin',
      setAt: new Date().toISOString()
    };

    const updated = saveManualOwnerTarget(targetObj);
    setManualTargetsList(updated);
  };

  const handleClearKpi1Override = () => {
    if (!localOwner?.id) return;
    const updated = clearManualOwnerTargetKpi1Override(localOwner.id, targetPeriod);
    setManualTargetsList(updated);
    setKpi1BaseInput('');
    setKpi1IopInput('');
  };

  const handleClearKpi2Override = () => {
    if (!localOwner?.id) return;
    const updated = clearManualOwnerTargetKpi2Override(localOwner.id, targetPeriod);
    setManualTargetsList(updated);
    setKpi2NormalInput('');
    setKpi2PriorityInput('');
  };

  if (!localOwner) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center p-8 text-center space-y-4 font-sans">
        <div className="h-16 w-16 rounded-full bg-brand-primary/10 flex items-center justify-center text-brand-primary">
          <User className="h-8 w-8 text-brand-primary" />
        </div>
        <h2 className="text-xl font-bold text-brand-text">No Owner Selected</h2>
        <p className="text-sm text-brand-text-variant max-w-md">
          Please select a Wakala Owner from the directory to view their detailed performance profile, Wakalas, and servicing metrics.
        </p>
        <button
          onClick={() => onNavigate(ViewType.OWNERS)}
          className="inline-flex items-center gap-2 rounded-xl bg-brand-primary px-5 py-2.5 font-sans text-sm font-semibold text-white shadow-ambient hover:bg-brand-primary-light transition-all cursor-pointer mt-2"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Owners List
        </button>
      </div>
    );
  }

  const allWakalas = [...(localOwner.baseWakalas || []), ...(localOwner.iopWakalas || [])];

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="space-y-6 max-w-[1440px] mx-auto p-4 sm:p-6 lg:p-8"
    >
      {/* Back to Owners trigger */}
      {!isStandaloneAgent && (
        <div className="flex items-center gap-2">
          <button 
            onClick={() => onNavigate(ViewType.OWNERS)}
            className="inline-flex items-center gap-1.5 font-sans text-xs font-bold text-brand-primary hover:text-brand-primary-light transition-colors group cursor-pointer"
          >
            <ArrowLeft className="h-4 w-4 transition-transform group-hover:-translate-x-0.5" />
            Back to Owners list
          </button>
        </div>
      )}

      {/* Profile Header Block (Image 8 layout) */}
      <motion.div 
        initial={{ y: 15, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        className="rounded-2xl border border-brand-gray-border bg-brand-card p-6 shadow-ambient"
      >
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
          <div className="flex flex-col sm:flex-row items-center sm:items-start gap-5">
            <OwnerAvatar 
              ownerName={localOwner.name} 
              avatarPhotoId={localOwner.avatarPhotoId} 
              className="h-20 w-20 rounded-2xl object-cover ring-4 ring-brand-primary/10 shrink-0 shadow-sm" 
            />
            <div className="text-center sm:text-left font-sans">
              <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2.5">
                <h2 className="text-xl sm:text-2xl font-black text-brand-text tracking-tight">{localOwner.name}</h2>
                <span className="rounded-full bg-amber-100 border border-brand-accent px-3 py-0.5 text-[10px] font-extrabold text-brand-secondary uppercase tracking-wider">
                  {localOwner.title || 'Premium Partner'}
                </span>
              </div>
              
              <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-y-1.5 gap-x-4 text-xs font-medium text-brand-text-variant">
                <div className="flex items-center justify-center sm:justify-start gap-1.5">
                  <Briefcase className="h-4 w-4 text-brand-primary/60 shrink-0" />
                  <span>Master Agent ID: <strong className="font-mono text-brand-text">{localOwner.masterAgentId}</strong></span>
                </div>
                <div className="flex items-center justify-center sm:justify-start gap-1.5">
                  <MapPin className="h-4 w-4 text-brand-primary/60 shrink-0" />
                  {localOwner.workLocation?.address ? (
                    <span>Location: <strong className="text-brand-text">{localOwner.workLocation.address}</strong></span>
                  ) : (
                    <span>Region: <strong className="text-brand-text">{localOwner.region}</strong></span>
                  )}
                </div>
                <div className="flex items-center justify-center sm:justify-start gap-1.5">
                  <Calendar className="h-4 w-4 text-brand-primary/60 shrink-0" />
                  <span>Member Since: <strong className="text-brand-text">{localOwner.memberSince}</strong></span>
                </div>
              </div>
            </div>
          </div>

          <div className="flex gap-2.5 w-full md:w-auto self-stretch md:self-auto">
            <button 
              onClick={handleOpenEdit}
              className="flex-1 md:flex-none inline-flex items-center justify-center gap-1.5 rounded-xl border border-brand-gray-border bg-white px-4 py-2.5 font-sans text-xs font-bold text-brand-primary hover:bg-brand-gray-hover transition-all cursor-pointer"
            >
              <Edit className="h-4 w-4" />
              Edit Profile
            </button>
            {!isStandaloneAgent && (
              <button 
                onClick={() => onNavigate(ViewType.KPI_REPORTS)}
                className="flex-1 md:flex-none inline-flex items-center justify-center gap-1.5 rounded-xl bg-brand-primary px-4 py-2.5 font-sans text-xs font-bold text-white shadow-ambient hover:bg-brand-primary-light transition-all cursor-pointer"
              >
                View Network
              </button>
            )}
          </div>
        </div>

        {editSaveStatus && (
          <motion.div 
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            className={`mt-4 p-3 rounded-xl border font-sans text-xs font-semibold flex items-center gap-2 ${
              editSaveStatus.type === 'success' 
                ? 'bg-emerald-50 text-emerald-800 border-emerald-200' 
                : 'bg-rose-50 text-rose-800 border-rose-200'
            }`}
          >
            {editSaveStatus.type === 'success' ? (
              <CheckCircle2 className="h-4.5 w-4.5 text-emerald-600 shrink-0" />
            ) : (
              <AlertTriangle className="h-4.5 w-4.5 text-rose-600 shrink-0" />
            )}
            {editSaveStatus.message}
          </motion.div>
        )}
      </motion.div>

      {/* Tab Selector - Always show tabs */}
      <div className="flex border-b border-brand-gray-border overflow-x-auto">
        <button
          onClick={() => setActiveTab('overview')}
          className={`px-5 py-3 font-sans text-sm font-bold border-b-2 transition-all cursor-pointer whitespace-nowrap ${
            activeTab === 'overview'
              ? 'border-brand-primary text-brand-primary font-bold'
              : 'border-transparent text-brand-text-variant hover:text-brand-text'
          }`}
        >
          Overview Dashboard
        </button>
        <button
          onClick={() => setActiveTab('wakalas')}
          className={`px-5 py-3 font-sans text-sm font-bold border-b-2 transition-all cursor-pointer whitespace-nowrap ${
            activeTab === 'wakalas'
              ? 'border-brand-primary text-brand-primary font-bold'
              : 'border-transparent text-brand-text-variant hover:text-brand-text'
          }`}
        >
          Wakala Management
        </button>
        <button
          onClick={() => setActiveTab('location')}
          className={`px-5 py-3 font-sans text-sm font-bold border-b-2 transition-all cursor-pointer whitespace-nowrap ${
            activeTab === 'location'
              ? 'border-brand-primary text-brand-primary font-bold'
              : 'border-transparent text-brand-text-variant hover:text-brand-text'
          }`}
        >
          Work Location
        </button>
      </div>

      {activeTab === 'overview' && (
        <>
          {/* Primary Metrics Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {/* Metric 1: Wakala Breakdown */}
            <div className="rounded-2xl border border-brand-gray-border bg-brand-card p-5 shadow-ambient flex flex-col justify-between">
              <span className="block font-sans text-[10px] font-bold text-brand-text-variant uppercase tracking-wider">Wakala</span>
              <div className="mt-2 grid grid-cols-3 gap-2 border-t border-brand-gray-border/50 pt-2">
                <div>
                  <span className="block font-sans text-[9px] font-semibold text-brand-text-variant uppercase">Total</span>
                  <span className="font-sans text-base sm:text-lg font-black text-brand-text">{allWakalas.length}</span>
                </div>
                <div>
                  <span className="block font-sans text-[9px] font-semibold text-brand-text-variant uppercase">Priority</span>
                  <span className={`font-sans text-xs sm:text-sm font-black ${hasPriorityData ? 'text-brand-primary font-mono' : 'text-brand-text-variant'}`}>
                    {hasPriorityData ? priorityWakalaCount : 'Not yet synced'}
                  </span>
                </div>
                <div>
                  <span className="block font-sans text-[9px] font-semibold text-brand-text-variant uppercase">Normal</span>
                  <span className={`font-sans text-xs sm:text-sm font-black ${hasPriorityData ? 'text-brand-text font-mono' : 'text-brand-text-variant'}`}>
                    {hasPriorityData ? normalWakalaCount : 'Not yet synced'}
                  </span>
                </div>
              </div>
            </div>

            {/* Metric 2: Active Wakala */}
            <div className="rounded-2xl border border-brand-gray-border bg-brand-card p-5 shadow-ambient">
              <span className="block font-sans text-[10px] font-bold text-brand-text-variant uppercase tracking-wider">Active Wakala</span>
              <div className="mt-2 flex items-baseline justify-between">
                <span className={`font-sans text-2xl font-black ${isSynced ? 'text-brand-text' : 'text-brand-text-variant text-base'}`}>
                  {isSynced ? activeWakalaCount : 'Not yet synced'}
                </span>
                <span className={`font-sans text-[10px] font-bold px-2 py-0.5 rounded-full ${isSynced ? 'bg-emerald-100 text-emerald-600' : 'bg-slate-100 text-slate-400'}`}>
                  {isSynced ? 'HIGH GROWTH' : 'Awaiting Ingestion'}
                </span>
              </div>
            </div>

            {/* Metric 3: Inactive Wakala */}
            <div className="rounded-2xl border border-brand-gray-border bg-brand-card p-5 shadow-ambient">
              <span className="block font-sans text-[10px] font-bold text-brand-text-variant uppercase tracking-wider">Inactive Wakala</span>
              <div className="mt-2 flex items-baseline justify-between">
                <span className={`font-sans text-2xl font-black ${isSynced ? 'text-rose-600' : 'text-brand-text-variant text-base'}`}>
                  {isSynced ? inactiveWakalaCount : 'Not yet synced'}
                </span>
                <span className={`font-sans text-[10px] font-bold px-2 py-0.5 rounded-full ${isSynced ? 'bg-rose-100 text-rose-700' : 'bg-slate-100 text-slate-400'}`}>
                  {isSynced ? 'REQUIRES REVIEW' : 'Awaiting Ingestion'}
                </span>
              </div>
            </div>
          </div>

          {/* Daily Performance KPIs Section */}
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
              <h3 className="font-sans text-xs font-black uppercase text-brand-primary tracking-wider font-mono">
                Daily MGT Performance KPIs & MTD Serviced Volume
              </h3>
              <span className="font-sans text-[10px] font-mono font-black text-brand-text-variant bg-slate-100 px-2.5 py-1 rounded">
                LATEST SYNC: {localOwner.lastSyncDate || "No Ingestion Today"}
              </span>
            </div>

            {/* Consolidated & Expanded MTD Serviced Volume Card */}
            <div className="rounded-2xl border border-brand-gray-border bg-brand-card p-6 shadow-ambient flex flex-col justify-between space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <span className="block font-sans text-[10px] font-bold text-brand-text-variant uppercase tracking-wider">
                    MTD Serviced Volume (Base + IOP)
                  </span>
                  <div className="mt-1 flex items-baseline gap-2">
                    <span className="font-sans text-2xl sm:text-3xl font-black text-brand-primary font-mono">
                      TZS {ownerMtdData.servedVolume.toLocaleString()}
                    </span>
                  </div>
                </div>
                <div className="text-right">
                  <span className="block font-sans text-[10px] font-bold text-brand-text-variant uppercase tracking-wider">
                    Monthly Target
                  </span>
                  <span className="font-sans text-sm sm:text-base font-extrabold text-brand-text font-mono mt-1 block">
                    {ownerMtdData.hasTarget
                      ? `TZS ${ownerMtdData.monthlyTarget.toLocaleString()}`
                      : <span className="text-amber-700 bg-amber-50 border border-amber-200 px-2.5 py-0.5 rounded-lg text-xs font-sans font-bold">Target Pending</span>}
                  </span>
                </div>
              </div>

              {/* Progress Bar & Percentage */}
              {ownerMtdData.hasTarget ? (
                <div className="space-y-2">
                  <div className="flex items-center justify-between font-sans text-xs font-bold">
                    <span className="text-brand-text-variant">Target Fulfillment Progress</span>
                    <span className={`font-mono text-sm ${
                      ownerMtdData.status === 'Green' ? 'text-emerald-700' :
                      ownerMtdData.status === 'Blue' ? 'text-blue-700' :
                      ownerMtdData.status === 'Yellow' ? 'text-amber-700' : 'text-rose-700'
                    }`}>
                      {ownerMtdData.achievementPercentage}% Achieved
                    </span>
                  </div>
                  <div className="h-3.5 w-full bg-slate-100 rounded-full overflow-hidden p-0.5 border border-slate-200">
                    <div
                      className={`h-full transition-all rounded-full ${
                        ownerMtdData.status === 'Green' ? 'bg-emerald-500' :
                        ownerMtdData.status === 'Blue' ? 'bg-blue-500' :
                        ownerMtdData.status === 'Yellow' ? 'bg-amber-500' : 'bg-rose-500'
                      }`}
                      style={{ width: `${Math.min(100, Math.max(0, ownerMtdData.achievementPercentage))}%` }}
                    />
                  </div>
                </div>
              ) : (
                <div className="p-3 bg-amber-50/60 border border-amber-200/80 rounded-xl flex items-center justify-between text-xs text-amber-900 font-medium">
                  <span>Target Fulfillment Progress</span>
                  <span className="font-bold text-amber-700 bg-amber-100 border border-amber-300 px-2.5 py-0.5 rounded-lg">Target Pending</span>
                </div>
              )}

              {/* Informational Breakdown */}
              <div className="pt-3 border-t border-brand-gray-border/60 flex flex-wrap items-center justify-between gap-3 text-xs font-sans">
                <span className="text-[10px] font-bold uppercase text-brand-text-variant tracking-wider">
                  Volume Breakdown (Informational)
                </span>
                <div className="flex flex-wrap items-center gap-4 font-mono font-bold">
                  <span className="flex items-center gap-1.5 text-slate-700">
                    <span className="h-2 w-2 rounded-full bg-indigo-500 inline-block" />
                    Base Volume: <span className="text-brand-primary">TZS {ownerMtdData.baseVolume.toLocaleString()}</span>
                  </span>
                  <span className="flex items-center gap-1.5 text-slate-700">
                    <span className="h-2 w-2 rounded-full bg-purple-500 inline-block" />
                    IOP Volume: <span className="text-purple-700">TZS {ownerMtdData.iopVolume.toLocaleString()}</span>
                  </span>
                </div>
              </div>
            </div>

            {/* Daily Ingestion Sub-cards */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {/* Card 1: Transactions Today */}
              <div className="rounded-2xl border border-brand-gray-border bg-brand-card p-5 shadow-ambient flex flex-col justify-between">
                <span className="block font-sans text-[10px] font-bold text-brand-text-variant uppercase tracking-wider">Transactions Today</span>
                <div className="mt-2.5 flex items-baseline justify-between gap-1.5 flex-wrap">
                  <span className="font-sans text-lg sm:text-xl font-black text-brand-text">
                    {localOwner.transactionsToday || 0}
                  </span>
                  <span className="text-[9px] font-bold text-amber-600 font-mono">TXNS</span>
                </div>
              </div>

              {/* Card 2: CP Penalty */}
              <div className="rounded-2xl border border-rose-200 bg-rose-50/50 p-5 shadow-ambient flex flex-col justify-between">
                <span className="block font-sans text-[10px] font-bold text-rose-800 uppercase tracking-wider">CP Penalty</span>
                <div className="mt-2.5 flex items-baseline justify-between gap-1.5 flex-wrap">
                  <span className="font-sans text-lg sm:text-xl font-black text-rose-950 font-mono">
                    TZS {(localOwner.penalty || 0).toLocaleString()}
                  </span>
                  <span className="text-[9px] font-bold text-rose-700 font-mono">PENALTY</span>
                </div>
              </div>

              {/* Card 3: IOP Volume (Daily) */}
              <div className="rounded-2xl border border-purple-200 bg-purple-50/50 p-5 shadow-ambient flex flex-col justify-between">
                <span className="block font-sans text-[10px] font-bold text-purple-800 uppercase tracking-wider">IOP Volume (Daily)</span>
                <div className="mt-2.5 flex items-baseline justify-between gap-1.5 flex-wrap">
                  <span className="font-sans text-lg sm:text-xl font-black text-purple-950 font-mono">
                    TZS {(localOwner.iopVolume || 0).toLocaleString()}
                  </span>
                  <span className="text-[9px] font-bold text-purple-700 font-mono">VOLUME</span>
                </div>
              </div>
            </div>
          </div>

          {/* Admin-Only: Targets & Priority Configuration */}
          {isAdmin && (
            <div className="rounded-2xl border border-brand-gray-border bg-brand-card p-6 shadow-ambient space-y-6">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-brand-gray-border pb-4">
                <div>
                  <h3 className="font-sans text-base font-bold text-brand-text flex items-center gap-2">
                    <span>Targets & Priority Configuration</span>
                    <span className="text-[10px] font-extrabold text-amber-800 bg-amber-100 border border-amber-300 px-2 py-0.5 rounded-md uppercase tracking-wider">
                      Admin Access
                    </span>
                  </h3>
                  <p className="font-sans text-xs text-brand-text-variant mt-0.5">
                    Set manual overrides for KPI 1 (Base Target & IOP Target) and KPI 2 (Normal Target & Priority Target counts).
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <label className="text-xs font-bold text-brand-text">Target Period:</label>
                  <input
                    type="month"
                    value={targetPeriod}
                    onChange={(e) => setTargetPeriod(e.target.value)}
                    className="text-xs rounded-lg border border-slate-300 px-2.5 py-1.5 font-mono bg-white"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* KPI 1 Configuration */}
                <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/50 space-y-4">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <h4 className="font-bold text-sm text-brand-text">KPI 1 — Serviced Volume Target (TZS)</h4>
                    <div className="flex items-center gap-2">
                      {hasKpi1Manual ? (
                        <span className="px-2.5 py-0.5 text-[10px] font-bold bg-amber-100 text-amber-900 border border-amber-300 rounded-lg">
                          Using: Manual Override
                        </span>
                      ) : hasKpi1Uploaded ? (
                        <span className="px-2.5 py-0.5 text-[10px] font-bold bg-blue-100 text-blue-900 border border-blue-300 rounded-lg">
                          Using: Uploaded Target
                        </span>
                      ) : (
                        <span className="px-2.5 py-0.5 text-[10px] font-bold bg-slate-100 text-slate-700 border border-slate-300 rounded-lg">
                          No Target Set
                        </span>
                      )}
                      {hasKpi1Manual && (
                        <button
                          type="button"
                          onClick={handleClearKpi1Override}
                          className="text-[10px] font-bold text-rose-700 hover:text-rose-900 underline cursor-pointer"
                        >
                          Clear Override
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] font-bold text-brand-text-variant uppercase tracking-wider mb-1">Base Target (TZS)</label>
                      <input
                        type="number"
                        placeholder="e.g. 50000000"
                        value={kpi1BaseInput}
                        onChange={(e) => setKpi1BaseInput(e.target.value)}
                        className="w-full text-xs font-mono rounded-lg border border-slate-300 px-3 py-2 bg-white"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-brand-text-variant uppercase tracking-wider mb-1">IOP Target (TZS)</label>
                      <input
                        type="number"
                        placeholder="e.g. 30000000"
                        value={kpi1IopInput}
                        onChange={(e) => setKpi1IopInput(e.target.value)}
                        className="w-full text-xs font-mono rounded-lg border border-slate-300 px-3 py-2 bg-white"
                      />
                    </div>
                  </div>

                  <div className="p-3 bg-white rounded-lg border border-slate-200 flex items-center justify-between font-mono text-xs">
                    <span className="font-bold text-slate-600">Combined Monthly Target:</span>
                    <span className="font-black text-brand-primary text-sm">
                      TZS {computedKpi1Sum.toLocaleString()}
                    </span>
                  </div>
                </div>

                {/* KPI 2 Configuration */}
                <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/50 space-y-4">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <h4 className="font-bold text-sm text-brand-text">KPI 2 — Active Wakala Target (Counts)</h4>
                    <div className="flex items-center gap-2">
                      {hasKpi2Manual ? (
                        <span className="px-2.5 py-0.5 text-[10px] font-bold bg-amber-100 text-amber-900 border border-amber-300 rounded-lg">
                          Using: Manual Override
                        </span>
                      ) : (
                        <span className="px-2.5 py-0.5 text-[10px] font-bold bg-slate-100 text-slate-700 border border-slate-300 rounded-lg">
                          No Manual Target
                        </span>
                      )}
                      {hasKpi2Manual && (
                        <button
                          type="button"
                          onClick={handleClearKpi2Override}
                          className="text-[10px] font-bold text-rose-700 hover:text-rose-900 underline cursor-pointer"
                        >
                          Clear Override
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] font-bold text-brand-text-variant uppercase tracking-wider mb-1">Normal Target (Count)</label>
                      <input
                        type="number"
                        placeholder="e.g. 15"
                        value={kpi2NormalInput}
                        onChange={(e) => setKpi2NormalInput(e.target.value)}
                        className="w-full text-xs font-mono rounded-lg border border-slate-300 px-3 py-2 bg-white"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-brand-text-variant uppercase tracking-wider mb-1">Priority Target (Count)</label>
                      <input
                        type="number"
                        placeholder="e.g. 5"
                        value={kpi2PriorityInput}
                        onChange={(e) => setKpi2PriorityInput(e.target.value)}
                        className="w-full text-xs font-mono rounded-lg border border-slate-300 px-3 py-2 bg-white"
                      />
                    </div>
                  </div>

                  <div className="p-3 bg-white rounded-lg border border-slate-200 flex items-center justify-between font-mono text-xs">
                    <span className="font-bold text-slate-600">Weighting Rule:</span>
                    <span className="font-bold text-slate-700">70% Normal / 30% Priority</span>
                  </div>
                </div>
              </div>

              <div className="flex justify-end pt-2">
                <button
                  type="button"
                  onClick={handleSaveAdminTargets}
                  className="px-5 py-2.5 bg-brand-primary text-white text-xs font-bold rounded-xl hover:bg-opacity-90 shadow-sm cursor-pointer transition-all"
                >
                  Save Target Parameters
                </button>
              </div>
            </div>
          )}

          {/* Target Fulfillment & Distribution sub-grid */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            
            {/* Target Fulfillment Card */}
            <div className="lg:col-span-5 rounded-2xl border border-brand-gray-border bg-brand-card p-6 shadow-ambient flex flex-col justify-between">
              <div>
                <h3 className="font-sans text-base font-bold text-brand-text border-b border-brand-gray-border pb-4">Target Fulfillment</h3>
                
                <div className="mt-6 space-y-4">
                  <div>
                    <span className="block font-sans text-[10px] font-bold text-brand-text-variant uppercase tracking-wider">Amount Served (Monthly MTD)</span>
                    <div className="mt-1 flex items-baseline justify-between">
                      <span className="font-sans text-2xl font-black text-brand-primary font-mono">
                        TZS {ownerMtdData.servedVolume.toLocaleString()}
                      </span>
                      <span className="font-sans text-xs font-semibold text-brand-text-variant font-mono">
                        {ownerMtdData.hasTarget ? `Target: TZS ${ownerMtdData.monthlyTarget.toLocaleString()}` : 'Target Pending'}
                      </span>
                    </div>
                  </div>

                  {/* Progress bar and achievement text */}
                  {ownerMtdData.hasTarget ? (
                    <div className="space-y-1.5">
                      <div className="h-3 w-full bg-slate-100 rounded-full overflow-hidden">
                        <div 
                          className={`h-full rounded-full transition-all ${
                            ownerMtdData.status === 'Green' ? 'bg-emerald-500' :
                            ownerMtdData.status === 'Blue' ? 'bg-blue-500' :
                            ownerMtdData.status === 'Yellow' ? 'bg-amber-500' : 'bg-rose-500'
                          }`} 
                          style={{ width: `${Math.min(100, Math.max(0, ownerMtdData.achievementPercentage))}%` }} 
                        />
                      </div>
                      <div className="flex justify-between font-sans text-xs font-semibold text-brand-text">
                        <span>Performance (MGT Contribution)</span>
                        <span className={`font-mono font-bold ${
                          ownerMtdData.status === 'Green' ? 'text-emerald-700' :
                          ownerMtdData.status === 'Blue' ? 'text-blue-700' :
                          ownerMtdData.status === 'Yellow' ? 'text-amber-700' : 'text-rose-700'
                        }`}>
                          {ownerMtdData.achievementPercentage}% achieved
                        </span>
                      </div>
                    </div>
                  ) : (
                    <div className="p-3 bg-amber-50/60 border border-amber-200/80 rounded-xl text-xs text-amber-900 font-medium flex justify-between items-center">
                      <span>Performance (MGT Contribution)</span>
                      <span className="text-amber-700 bg-amber-100 border border-amber-300 px-2 py-0.5 rounded font-bold">Target Pending</span>
                    </div>
                  )}
                </div>
              </div>

              <div className="mt-6 pt-5 border-t border-brand-gray-border grid grid-cols-2 gap-4">
                <div className="bg-brand-gray-hover/40 p-3 rounded-xl border border-brand-gray-border/50">
                  <span className="block font-sans text-[10px] font-bold text-brand-text-variant uppercase tracking-wider">Commissions</span>
                  <span className="block font-mono text-sm font-bold text-brand-text mt-1">
                    {isSynced ? `TZS ${(totalCommissions).toLocaleString()}` : 'Not yet synced'}
                  </span>
                </div>
                <div className="bg-brand-gray-hover/40 p-3 rounded-xl border border-brand-gray-border/50">
                  <span className="block font-sans text-[10px] font-bold text-brand-text-variant uppercase tracking-wider">Rank</span>
                  <span className="block font-sans text-sm font-bold text-amber-700 mt-1 flex items-center gap-1">
                    <Award className="h-4 w-4 text-brand-accent-hover" />
                    {isSynced ? rankStr : 'Not yet synced'}
                  </span>
                </div>
              </div>
            </div>

            {/* Agent Activity Distribution bar chart */}
            <div className="lg:col-span-7 rounded-2xl border border-brand-gray-border bg-brand-card p-6 shadow-ambient">
              <div className="flex items-center justify-between border-b border-brand-gray-border pb-4">
                <div>
                  <h3 className="font-sans text-base font-bold text-brand-text">Agent Activity Distribution</h3>
                  <p className="font-sans text-xs text-brand-text-variant">Weekly volume ratios</p>
                </div>
                <div className="flex gap-3 font-sans text-[10px] font-bold uppercase tracking-wider">
                  <div className="flex items-center gap-1">
                    <span className="h-2.5 w-2.5 rounded-full bg-brand-primary" />
                    <span className="text-brand-text-variant">Cash-In</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="h-2.5 w-2.5 rounded-full bg-brand-primary-container" />
                    <span className="text-brand-text-variant">Cash-Out</span>
                  </div>
                </div>
              </div>

              {/* Bar Chart Graphics */}
              <div className="mt-6 flex h-48 items-end justify-between px-2 font-sans text-[10px] font-semibold text-brand-text-variant">
                {weeklyActivity.map((act) => (
                  <div key={act.day} className="flex flex-col items-center gap-2.5 w-full">
                    <div className="flex gap-1.5 items-end justify-center w-full h-36">
                      {/* Cash In bar */}
                      <div className="relative group w-3.5 sm:w-4 bg-brand-primary rounded-t-sm transition-all hover:opacity-90" style={{ height: `${act.cashIn}%` }}>
                        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 hidden group-hover:block bg-brand-text text-white text-[9px] font-mono py-0.5 px-1.5 rounded shadow-lg z-10 whitespace-nowrap">
                          In: {act.cashIn}%
                        </div>
                      </div>
                      {/* Cash Out bar */}
                      <div className="relative group w-3.5 sm:w-4 bg-brand-primary-container rounded-t-sm transition-all hover:opacity-90" style={{ height: `${act.cashOut}%` }}>
                        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 hidden group-hover:block bg-brand-text text-white text-[9px] font-mono py-0.5 px-1.5 rounded shadow-lg z-10 whitespace-nowrap">
                          Out: {act.cashOut}%
                        </div>
                      </div>
                    </div>
                    <span>{act.day}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Recent Report Submissions Table */}
          <div className="rounded-2xl border border-brand-gray-border bg-brand-card overflow-hidden shadow-ambient">
            <div className="flex items-center justify-between border-b border-brand-gray-border px-6 py-5">
              <h3 className="font-sans text-base font-bold text-brand-text">Recent Report Submissions</h3>
              <button 
                onClick={() => onNavigate(ViewType.REPORT_HISTORY)}
                className="font-sans text-xs font-bold text-brand-primary hover:underline flex items-center gap-0.5 cursor-pointer"
              >
                View All Reports
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-brand-gray-border bg-brand-gray-hover/50 font-sans text-[11px] font-bold text-brand-text-variant uppercase tracking-wider">
                    <th className="px-6 py-4">Report ID</th>
                    <th className="px-6 py-4">Type</th>
                    <th className="px-6 py-4">Amount</th>
                    <th className="px-6 py-4">Timestamp</th>
                    <th className="px-6 py-4">Status</th>
                    <th className="px-6 py-4 text-center">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-brand-gray-border">
                  {submissions.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-6 py-10 text-center font-sans text-xs text-brand-text-variant font-semibold">
                        No submissions yet
                      </td>
                    </tr>
                  ) : (
                    submissions.map((sub) => (
                      <tr key={sub.id} className="hover:bg-brand-gray-hover/30 transition-colors">
                        <td className="px-6 py-4.5 font-mono text-xs font-bold text-brand-primary">
                          {sub.id}
                        </td>
                        <td className="px-6 py-4.5 font-sans text-xs font-semibold text-brand-text">
                          {sub.type}
                        </td>
                        <td className="px-6 py-4.5 font-mono text-xs font-bold text-brand-text">
                          {sub.amount}
                        </td>
                        <td className="px-6 py-4.5 font-sans text-xs font-medium text-brand-text-variant">
                          {sub.timestamp}
                        </td>
                        <td className="px-6 py-4.5">
                          <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 font-sans text-[10px] font-bold tracking-wider ${getSubStatusStyle(sub.status)}`}>
                            {sub.status}
                          </span>
                        </td>
                        <td className="px-6 py-4.5 text-center">
                          {sub.status === 'Pending Audit' ? (
                            <button 
                              onClick={() => handleAuditRequest(sub.id)}
                              className="rounded-lg bg-brand-primary px-3 py-1 font-sans text-[10px] font-bold text-white shadow hover:bg-brand-primary-light transition-all cursor-pointer"
                            >
                              Verify Now
                            </button>
                          ) : (
                            <span className="font-sans text-[10px] font-bold text-emerald-600 flex items-center justify-center gap-1">
                              <CheckCircle className="h-3.5 w-3.5" />
                              Audited
                            </span>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Collapsible Transaction History Section */}
          <div className="mt-6">
            <TransactionHistorySection 
              localOwner={localOwner}
              tillsList={tillsList}
            />
          </div>
        </>
      )}

      {activeTab === 'wakalas' && (
        <WakalaManagementSection 
          localOwner={localOwner}
          onUpdateWakalas={updateWakalasInLocalStorage}
        />
      )}

      {activeTab === 'location' && (
        <WorkLocationSection 
          localOwner={localOwner}
          onUpdateOwner={handleUpdateOwner}
          onUpdateWakalas={updateWakalasInLocalStorage}
          isEditable={isStandaloneAgent}
        />
      )}

      {/* Edit Profile Modal */}
      <AnimatePresence>
        {showEditModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowEditModal(false)}
              className="absolute inset-0 bg-gray-900/60 backdrop-blur-xs"
            />
            <motion.div 
              initial={{ scale: 0.95, y: 20, opacity: 0 }}
              animate={{ scale: 1, y: 0, opacity: 1 }}
              exit={{ scale: 0.95, y: 20, opacity: 0 }}
              className="relative w-full max-w-md rounded-2xl border border-brand-gray-border bg-white p-6 shadow-ambient-hover z-10 font-sans"
            >
              <div className="flex items-center justify-between border-b border-brand-gray-border pb-4 mb-5">
                <div className="flex items-center gap-2">
                  <Edit className="h-5.5 w-5.5 text-brand-primary" />
                  <h3 className="text-lg font-bold text-brand-text">Edit Owner Profile</h3>
                </div>
                <button 
                  onClick={() => setShowEditModal(false)}
                  className="rounded-lg p-1 hover:bg-brand-gray-hover text-brand-text-variant cursor-pointer transition-colors"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <form onSubmit={handleSaveProfile} className="space-y-4">
                {/* Avatar upload control */}
                <div className="flex flex-col items-center gap-2 mb-4">
                  <div 
                    onClick={() => fileInputRef.current?.click()}
                    className="relative w-24 h-24 rounded-full overflow-hidden border-2 border-brand-gray-border shadow-ambient group cursor-pointer bg-slate-50 flex items-center justify-center transition-transform hover:scale-[1.02]"
                  >
                    <img 
                      src={previewSrc} 
                      alt="Profile Preview" 
                      className="w-full h-full object-cover" 
                      referrerPolicy="no-referrer"
                    />
                    <div className="absolute inset-0 bg-black/40 flex flex-col items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                      <Camera className="h-5 w-5 text-white" />
                      <span className="text-[9px] text-white font-bold uppercase mt-1">Upload</span>
                    </div>
                  </div>
                  
                  <input 
                    type="file"
                    ref={fileInputRef}
                    accept="image/*"
                    onChange={handleAvatarChange}
                    className="hidden"
                  />

                  <div className="flex gap-4">
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="text-xs font-bold text-brand-primary hover:underline cursor-pointer transition-all"
                    >
                      Change Photo
                    </button>
                    {tempAvatarData !== 'clear' && (tempAvatarPhotoId || tempAvatarData) && (
                      <button
                        type="button"
                        onClick={handleRemoveAvatar}
                        className="text-xs font-bold text-rose-500 hover:underline cursor-pointer flex items-center gap-1 transition-all"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        Remove Photo
                      </button>
                    )}
                  </div>
                </div>

                {editError && (
                  <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 rounded-xl text-xs font-semibold flex items-center gap-2">
                    <AlertTriangle className="h-4.5 w-4.5 text-rose-600 shrink-0" />
                    <span>{editError}</span>
                  </div>
                )}

                <div>
                  <label className="block text-[10px] font-bold text-brand-text-variant uppercase tracking-wider mb-1">Full Name</label>
                  <input 
                    type="text"
                    required
                    value={editForm.name}
                    onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                    className="w-full rounded-xl border border-brand-gray-border bg-white p-3 text-xs text-brand-text focus:outline-none focus:border-brand-primary font-sans"
                    placeholder="Enter owner's full name"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-brand-text-variant uppercase tracking-wider mb-1">Master Agent ID</label>
                  <input 
                    type="text"
                    required
                    value={editForm.masterAgentId}
                    onChange={(e) => setEditForm({ ...editForm, masterAgentId: e.target.value })}
                    className="w-full rounded-xl border border-brand-gray-border bg-white p-3 text-xs text-brand-text font-mono focus:outline-none focus:border-brand-primary"
                    placeholder="Enter Master Agent ID"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[10px] font-bold text-brand-text-variant uppercase tracking-wider mb-1">Region</label>
                    <select
                      value={editForm.region}
                      onChange={(e) => setEditForm({ ...editForm, region: e.target.value })}
                      className="w-full rounded-xl border border-brand-gray-border bg-white p-3 text-xs text-brand-text focus:outline-none focus:border-brand-primary font-sans cursor-pointer"
                    >
                      <option value="">Select Region</option>
                      {regionsList.map(r => (
                        <option key={r} value={r}>{r}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-brand-text-variant uppercase tracking-wider mb-1">Title / Tier</label>
                    <input 
                      type="text"
                      value={editForm.title}
                      onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
                      className="w-full rounded-xl border border-brand-gray-border bg-white p-3 text-xs text-brand-text focus:outline-none focus:border-brand-primary font-sans"
                      placeholder="e.g. Premium Partner"
                    />
                  </div>
                </div>

                <div className="flex justify-end gap-2.5 pt-3 border-t border-brand-gray-border mt-5">
                  <button
                    type="button"
                    onClick={() => setShowEditModal(false)}
                    className="rounded-xl border border-brand-gray-border bg-white px-4 py-2.5 text-xs font-bold text-brand-text-variant hover:bg-brand-gray-hover cursor-pointer transition-all"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="rounded-xl bg-brand-primary px-4 py-2.5 text-xs font-bold text-white shadow-ambient hover:bg-brand-primary-light cursor-pointer transition-all"
                  >
                    Save Changes
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </motion.div>
  );
}

function WakalaManagementSection({ 
  localOwner, 
  onUpdateWakalas 
}: { 
  localOwner: Owner; 
  onUpdateWakalas: (base: WakalaEntry[], iop: WakalaEntry[]) => void 
}) {
  const [showAddBase, setShowAddBase] = useState(false);
  const [showAddIop, setShowAddIop] = useState(false);

  // Collapse and search states for Base Wakalas
  const [isBaseCollapsed, setIsBaseCollapsed] = useState(false);
  const [baseSearchTerm, setBaseSearchTerm] = useState('');

  // Form states for Base Wakalas
  const [baseName, setBaseName] = useState('');
  const [baseMsisdn, setBaseMsisdn] = useState('');
  const [baseRegion, setBaseRegion] = useState('Dar es Salaam');
  const [baseDistrict, setBaseDistrict] = useState('');
  const [baseWard, setBaseWard] = useState('');
  const [baseSiteId, setBaseSiteId] = useState('');
  const [baseCode, setBaseCode] = useState('');
  const [baseAltNumber, setBaseAltNumber] = useState('');

  // Form states for IOP Wakalas
  const [iopName, setIopName] = useState('');
  const [iopMsisdn, setIopMsisdn] = useState('');
  const [iopRegion, setIopRegion] = useState('Dar es Salaam');

  // Selected Wakala Detail Modal State
  const [selectedWakala, setSelectedWakala] = useState<{ wakala: WakalaEntry; type: 'base' | 'iop' } | null>(null);
  const [isEditingWakala, setIsEditingWakala] = useState(false);
  const [editWakalaData, setEditWakalaData] = useState<Partial<WakalaEntry>>({});
  const [isCapturingGps, setIsCapturingGps] = useState(false);
  const [wakalaPhotoUrl, setWakalaPhotoUrl] = useState<string | null>(null);

  useEffect(() => {
    if (selectedWakala) {
      setEditWakalaData({ ...selectedWakala.wakala });
      if (selectedWakala.wakala.photoId) {
        getPhoto(selectedWakala.wakala.photoId).then(photo => {
          if (photo) setWakalaPhotoUrl(photo.imageData || (photo as any).base64);
        }).catch(() => {});
      } else if (selectedWakala.wakala.photoUrl) {
        setWakalaPhotoUrl(selectedWakala.wakala.photoUrl);
      } else {
        setWakalaPhotoUrl(null);
      }
    } else {
      setIsEditingWakala(false);
      setEditWakalaData({});
      setWakalaPhotoUrl(null);
    }
  }, [selectedWakala]);

  const handleCaptureWakalaGps = () => {
    if (!selectedWakala) return;
    setIsCapturingGps(true);
    if (!navigator.geolocation) {
      triggerNotification('Geolocation is not supported by your browser.', 'error');
      setIsCapturingGps(false);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const newLoc = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          address: editWakalaData.district || selectedWakala.wakala.district || selectedWakala.wakala.region,
          capturedAt: new Date().toISOString()
        };
        setEditWakalaData(prev => ({ ...prev, location: newLoc }));

        const updatedWakala: WakalaEntry = {
          ...selectedWakala.wakala,
          ...editWakalaData,
          location: newLoc
        };

        if (selectedWakala.type === 'base') {
          const updatedBase = (localOwner.baseWakalas || []).map(w => w.id === selectedWakala.wakala.id ? updatedWakala : w);
          onUpdateWakalas(updatedBase, localOwner.iopWakalas || []);
        } else {
          const updatedIop = (localOwner.iopWakalas || []).map(w => w.id === selectedWakala.wakala.id ? updatedWakala : w);
          onUpdateWakalas(localOwner.baseWakalas || [], updatedIop);
        }
        setSelectedWakala({ wakala: updatedWakala, type: selectedWakala.type });

        setIsCapturingGps(false);
        triggerNotification(`GPS Coordinates captured: ${newLoc.lat.toFixed(4)}, ${newLoc.lng.toFixed(4)}`, 'success');
      },
      (err) => {
        setIsCapturingGps(false);
        triggerNotification(`GPS Capture failed: ${err.message}`, 'error');
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const handleWakalaPhotoCapture = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedWakala) return;
    try {
      const reader = new FileReader();
      reader.onload = async () => {
        const base64 = reader.result as string;
        const photoId = await savePhoto(selectedWakala.wakala.id, base64);
        setWakalaPhotoUrl(base64);
        setEditWakalaData(prev => ({ ...prev, photoId, photoUrl: base64 }));

        const updatedWakala: WakalaEntry = {
          ...selectedWakala.wakala,
          ...editWakalaData,
          photoId,
          photoUrl: base64
        };

        if (selectedWakala.type === 'base') {
          const updatedBase = (localOwner.baseWakalas || []).map(w => w.id === selectedWakala.wakala.id ? updatedWakala : w);
          onUpdateWakalas(updatedBase, localOwner.iopWakalas || []);
        } else {
          const updatedIop = (localOwner.iopWakalas || []).map(w => w.id === selectedWakala.wakala.id ? updatedWakala : w);
          onUpdateWakalas(localOwner.baseWakalas || [], updatedIop);
        }
        setSelectedWakala({ wakala: updatedWakala, type: selectedWakala.type });

        triggerNotification('Wakala location photo saved successfully!', 'success');
      };
      reader.readAsDataURL(file);
    } catch (err) {
      triggerNotification('Failed to save Wakala photo.', 'error');
    }
  };

  const [notification, setNotification] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const triggerNotification = (message: string, type: 'success' | 'error') => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 4000);
  };

  const formatExcelDate = (val: any) => {
    if (!val) return '—';
    if (typeof val === 'number' || (!isNaN(Number(val)) && !isNaN(parseFloat(val)))) {
      // Excel dates are days since Dec 30, 1899
      const date = new Date((Number(val) - 25569) * 86400 * 1000);
      if (!isNaN(date.getTime())) {
        return date.toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' });
      }
    }
    return val;
  };

  const handleAddBase = (e: React.FormEvent) => {
    e.preventDefault();
    if (!baseName.trim() || !baseMsisdn.trim() || !baseRegion.trim()) {
      triggerNotification('Please fill in required fields (Name, MSISDN, Region).', 'error');
      return;
    }

    const cleanNum = baseMsisdn.replace(/\D/g, '');
    if (cleanNum.length < 9) {
      triggerNotification('Please enter a valid MSISDN (at least 9 digits).', 'error');
      return;
    }

    const newWakala: WakalaEntry = {
      id: `base-${Date.now()}`,
      name: baseName.trim(),
      msisdn: cleanNum,
      region: baseRegion.trim(),
      district: baseDistrict.trim(),
      siteWard: baseWard.trim(),
      siteId: baseSiteId.trim(),
      code: baseCode.trim(),
      alternateNumber: baseAltNumber.trim(),
      dateAdded: new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
    };

    const updatedBase = [...(localOwner.baseWakalas || []), newWakala];
    onUpdateWakalas(updatedBase, localOwner.iopWakalas || []);
    
    // Reset form
    setBaseName('');
    setBaseMsisdn('');
    setBaseDistrict('');
    setBaseWard('');
    setBaseSiteId('');
    setBaseCode('');
    setBaseAltNumber('');
    setShowAddBase(false);
    triggerNotification(`Base Wakala "${newWakala.name}" added successfully!`, 'success');
  };

  const handleAddIop = (e: React.FormEvent) => {
    e.preventDefault();
    if (!iopName.trim() || !iopMsisdn.trim() || !iopRegion.trim()) {
      triggerNotification('Please fill in all fields.', 'error');
      return;
    }

    const cleanNum = iopMsisdn.replace(/\D/g, '');
    if (cleanNum.length < 9) {
      triggerNotification('Please enter a valid MSISDN (at least 9 digits).', 'error');
      return;
    }

    const newWakala: WakalaEntry = {
      id: `iop-${Date.now()}`,
      name: iopName.trim(),
      msisdn: cleanNum,
      region: iopRegion.trim(),
      dateAdded: new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
    };

    const updatedIop = [...(localOwner.iopWakalas || []), newWakala];
    onUpdateWakalas(localOwner.baseWakalas || [], updatedIop);
    
    // Reset form
    setIopName('');
    setIopMsisdn('');
    setShowAddIop(false);
    triggerNotification(`IOP Wakala "${newWakala.name}" added successfully!`, 'success');
  };

  const handleDeleteWakala = (id: string, type: 'base' | 'iop') => {
    if (type === 'base') {
      const updated = (localOwner.baseWakalas || []).filter(w => w.id !== id);
      onUpdateWakalas(updated, localOwner.iopWakalas || []);
      triggerNotification('Base Wakala removed successfully.', 'success');
    } else {
      const updated = (localOwner.iopWakalas || []).filter(w => w.id !== id);
      onUpdateWakalas(localOwner.baseWakalas || [], updated);
      triggerNotification('IOP Wakala removed successfully.', 'success');
    }
  };

  const handleSaveWakalaEdit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedWakala) return;
    const { wakala, type } = selectedWakala;
    
    const updatedWakala: WakalaEntry = {
      ...wakala,
      ...editWakalaData,
      name: (editWakalaData.name || wakala.name).trim(),
      msisdn: (editWakalaData.msisdn || wakala.msisdn).replace(/\D/g, ''),
      photoId: editWakalaData.photoId || wakala.photoId,
      photoUrl: editWakalaData.photoUrl || wakala.photoUrl,
      location: editWakalaData.location || wakala.location,
    };

    let updatedBase = localOwner.baseWakalas || [];
    let updatedIop = localOwner.iopWakalas || [];

    if (type === 'base') {
      updatedBase = updatedBase.map(w => w.id === wakala.id ? updatedWakala : w);
    } else {
      updatedIop = updatedIop.map(w => w.id === wakala.id ? updatedWakala : w);
    }

    // PERSISTENCE
    onUpdateWakalas(updatedBase, updatedIop);

    // UX IMPROVEMENT
    triggerNotification(`Wakala "${updatedWakala.name}" updated successfully!`, 'success');
    setSelectedWakala(null); // Completely close the card
    setIsEditingWakala(false); // Reset edit state
  };

  const baseWakalas = localOwner.baseWakalas || [];
  const iopWakalas = localOwner.iopWakalas || [];

  const filteredBaseWakalas = baseWakalas.filter(w => 
    w.name.toLowerCase().includes(baseSearchTerm.toLowerCase()) ||
    w.msisdn.includes(baseSearchTerm) ||
    w.region.toLowerCase().includes(baseSearchTerm.toLowerCase()) ||
    (w.district && w.district.toLowerCase().includes(baseSearchTerm.toLowerCase())) ||
    (w.code && w.code.toLowerCase().includes(baseSearchTerm.toLowerCase()))
  );

  return (
    <div className="space-y-6">
      {notification && (
        <motion.div 
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className={`p-4 rounded-xl border text-xs font-bold font-sans flex items-center gap-2 ${
            notification.type === 'success' 
              ? 'bg-emerald-50 text-emerald-800 border-emerald-200' 
              : 'bg-rose-50 text-rose-800 border-rose-200'
          }`}
        >
          {notification.type === 'success' ? (
            <CheckCircle2 className="h-4.5 w-4.5 text-emerald-600 shrink-0" />
          ) : (
            <AlertTriangle className="h-4.5 w-4.5 text-rose-600 shrink-0" />
          )}
          {notification.message}
        </motion.div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* Base Wakalas Panel */}
        <div className="rounded-2xl border border-brand-gray-border bg-brand-card p-6 shadow-ambient">
          <div className="flex items-center justify-between border-b border-brand-gray-border pb-4 mb-4">
            <div 
              onClick={() => setIsBaseCollapsed(!isBaseCollapsed)}
              className="flex items-center gap-2 cursor-pointer select-none group"
            >
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-sans text-base font-bold text-brand-text group-hover:text-brand-primary transition-colors">Base Wakalas</h3>
                  <ChevronDown className={`h-4 w-4 text-brand-text-variant transition-transform duration-200 ${isBaseCollapsed ? 'rotate-180' : ''}`} />
                </div>
                <p className="font-sans text-xs text-brand-text-variant">Standard network agents ({baseWakalas.length})</p>
              </div>
            </div>
            <button
              onClick={() => {
                setShowAddBase(!showAddBase);
                setShowAddIop(false);
                if (isBaseCollapsed) setIsBaseCollapsed(false);
              }}
              className="rounded-xl bg-brand-primary px-3 py-1.5 font-sans text-xs font-bold text-white shadow-ambient hover:bg-brand-primary-light transition-all cursor-pointer"
            >
              {showAddBase ? 'Cancel' : 'Add Base Wakala'}
            </button>
          </div>

          {/* Add Base Wakala Inline Form */}
          {showAddBase && (
            <motion.form 
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              onSubmit={handleAddBase}
              className="mb-6 p-4 rounded-xl border border-brand-gray-border bg-brand-gray-hover/30 space-y-4 overflow-hidden"
            >
              <h4 className="font-sans text-xs font-bold text-brand-primary uppercase tracking-wider">New Base Wakala (Field Details)</h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                <div>
                  <label className="block font-sans text-[10px] font-bold text-brand-text-variant uppercase mb-1">Agent Name *</label>
                  <input
                    type="text"
                    required
                    value={baseName}
                    onChange={e => setBaseName(e.target.value)}
                    placeholder="e.g. Kariakoo Retail"
                    className="w-full rounded-lg border border-brand-gray-border bg-white p-2 text-xs text-brand-text focus:outline-none focus:border-brand-primary font-sans"
                  />
                </div>
                <div>
                  <label className="block font-sans text-[10px] font-bold text-brand-text-variant uppercase mb-1">MSISDN *</label>
                  <input
                    type="text"
                    required
                    value={baseMsisdn}
                    onChange={e => setBaseMsisdn(e.target.value)}
                    placeholder="e.g. 255711223344"
                    className="w-full rounded-lg border border-brand-gray-border bg-white p-2 text-xs text-brand-text focus:outline-none focus:border-brand-primary font-mono"
                  />
                </div>
                <div>
                  <label className="block font-sans text-[10px] font-bold text-brand-text-variant uppercase mb-1">Region *</label>
                  <select
                    value={baseRegion}
                    onChange={e => setBaseRegion(e.target.value)}
                    className="w-full rounded-lg border border-brand-gray-border bg-white p-2 text-xs text-brand-text focus:outline-none focus:border-brand-primary font-sans cursor-pointer"
                  >
                    {regionsList.map(r => (
                      <option key={r} value={r}>{r}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block font-sans text-[10px] font-bold text-brand-text-variant uppercase mb-1">District</label>
                  <input
                    type="text"
                    value={baseDistrict}
                    onChange={e => setBaseDistrict(e.target.value)}
                    placeholder="e.g. Ilala"
                    className="w-full rounded-lg border border-brand-gray-border bg-white p-2 text-xs text-brand-text focus:outline-none focus:border-brand-primary font-sans"
                  />
                </div>
                <div>
                  <label className="block font-sans text-[10px] font-bold text-brand-text-variant uppercase mb-1">Ward</label>
                  <input
                    type="text"
                    value={baseWard}
                    onChange={e => setBaseWard(e.target.value)}
                    placeholder="e.g. Kariakoo"
                    className="w-full rounded-lg border border-brand-gray-border bg-white p-2 text-xs text-brand-text focus:outline-none focus:border-brand-primary font-sans"
                  />
                </div>
                <div>
                  <label className="block font-sans text-[10px] font-bold text-brand-text-variant uppercase mb-1">Site ID</label>
                  <input
                    type="text"
                    value={baseSiteId}
                    onChange={e => setBaseSiteId(e.target.value)}
                    placeholder="e.g. ST-4029"
                    className="w-full rounded-lg border border-brand-gray-border bg-white p-2 text-xs text-brand-text focus:outline-none focus:border-brand-primary font-mono"
                  />
                </div>
                <div>
                  <label className="block font-sans text-[10px] font-bold text-brand-text-variant uppercase mb-1">Agent Code</label>
                  <input
                    type="text"
                    value={baseCode}
                    onChange={e => setBaseCode(e.target.value)}
                    placeholder="e.g. WK-881"
                    className="w-full rounded-lg border border-brand-gray-border bg-white p-2 text-xs text-brand-text focus:outline-none focus:border-brand-primary font-mono"
                  />
                </div>
                <div>
                  <label className="block font-sans text-[10px] font-bold text-brand-text-variant uppercase mb-1">Alternate Number</label>
                  <input
                    type="text"
                    value={baseAltNumber}
                    onChange={e => setBaseAltNumber(e.target.value)}
                    placeholder="e.g. 255755123456"
                    className="w-full rounded-lg border border-brand-gray-border bg-white p-2 text-xs text-brand-text focus:outline-none focus:border-brand-primary font-mono"
                  />
                </div>
              </div>
              <div className="flex justify-end pt-1">
                <button
                  type="submit"
                  className="rounded-lg bg-brand-primary px-4 py-2 font-sans text-xs font-bold text-white shadow hover:bg-brand-primary-light transition-all cursor-pointer"
                >
                  Save Agent
                </button>
              </div>
            </motion.form>
          )}

          {/* Base Wakalas List & Filter */}
          <AnimatePresence>
            {!isBaseCollapsed && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="overflow-hidden"
              >
                {/* Search Bar */}
                <div className="relative mb-4">
                  <input
                    type="text"
                    placeholder="Filter by name, number, region, or code..."
                    value={baseSearchTerm}
                    onChange={(e) => setBaseSearchTerm(e.target.value)}
                    className="w-full rounded-xl border border-brand-gray-border bg-brand-gray-hover/20 p-2.5 pl-9 text-xs focus:outline-none focus:border-brand-primary transition-all font-sans"
                  />
                  <svg className="absolute left-3 top-2.5 h-4 w-4 text-brand-text-variant" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                </div>

                {filteredBaseWakalas.length === 0 ? (
                  <div className="text-center py-8 font-sans text-xs text-brand-text-variant">
                    {baseSearchTerm ? 'No matching Base Wakalas found.' : 'No Base Wakalas added yet. Click the button above to add one.'}
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="border-b border-brand-gray-border text-[10px] font-bold text-brand-text-variant uppercase tracking-wider">
                          <th className="py-2.5">Agent Name</th>
                          <th className="py-2.5">MSISDN</th>
                          <th className="py-2.5">Region / Location</th>
                          <th className="py-2.5">Date Added</th>
                          <th className="py-2.5 text-right">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-brand-gray-border">
                        {filteredBaseWakalas.map(w => {
                          const isMissingInfo = !w.district || !w.siteWard || !w.code;
                          return (
                            <tr 
                              key={w.id} 
                              onClick={() => {
                                setSelectedWakala({ wakala: w, type: 'base' });
                                setEditWakalaData(w);
                                setIsEditingWakala(false);
                              }}
                              className="text-xs group hover:bg-brand-primary/5 transition-all cursor-pointer"
                            >
                              <td className="py-3 font-semibold text-brand-text">
                                <div className="flex items-center gap-1.5">
                                  <span>{w.name}</span>
                                  {isMissingInfo && (
                                    <span className="inline-block h-2 w-2 rounded-full bg-amber-500" title="Missing Location Details — Click to edit" />
                                  )}
                                </div>
                                {w.code && <span className="block text-[10px] font-mono text-brand-text-variant font-normal">Code: {w.code}</span>}
                              </td>
                              <td className="py-3 font-mono text-brand-text-variant font-semibold">{w.msisdn}</td>
                              <td className="py-3">
                                <div className="flex flex-col gap-0.5">
                                  <span className="inline-flex items-center self-start rounded-full bg-slate-100 border border-slate-200 px-2 py-0.5 text-[9px] font-bold text-brand-text-variant">
                                    {w.region}
                                  </span>
                                  {w.district && (
                                    <span className="text-[10px] text-brand-text-variant font-medium">
                                      {w.district}{w.siteWard ? `, ${w.siteWard}` : ''}
                                    </span>
                                  )}
                                </div>
                              </td>
                              <td className="py-3 text-brand-text-variant font-medium">
                                {formatExcelDate(w.dateAdded)}
                              </td>
                              <td className="py-3 text-right" onClick={e => e.stopPropagation()}>
                                <button
                                  onClick={() => handleDeleteWakala(w.id, 'base')}
                                  className="rounded p-1 text-rose-500 hover:bg-rose-50 transition-colors cursor-pointer"
                                  title="Remove Wakala"
                                >
                                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                  </svg>
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* IOP Wakalas Panel */}
        <div className="rounded-2xl border border-brand-gray-border bg-brand-card p-6 shadow-ambient">
          <div className="flex items-center justify-between border-b border-brand-gray-border pb-4 mb-4">
            <div>
              <h3 className="font-sans text-base font-bold text-brand-text">IOP Wakalas</h3>
              <p className="font-sans text-xs text-brand-text-variant">Individual Agent Portal partners ({iopWakalas.length})</p>
            </div>
            <button
              onClick={() => {
                setShowAddIop(!showAddIop);
                setShowAddBase(false);
              }}
              className="rounded-xl bg-brand-primary px-3 py-1.5 font-sans text-xs font-bold text-white shadow-ambient hover:bg-brand-primary-light transition-all cursor-pointer"
            >
              {showAddIop ? 'Cancel' : 'Add IOP Wakala'}
            </button>
          </div>

          {/* Add IOP Wakala Inline Form */}
          {showAddIop && (
            <motion.form 
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              onSubmit={handleAddIop}
              className="mb-6 p-4 rounded-xl border border-brand-gray-border bg-brand-gray-hover/30 space-y-4 overflow-hidden"
            >
              <h4 className="font-sans text-xs font-bold text-brand-primary uppercase tracking-wider">New IOP Wakala</h4>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block font-sans text-[10px] font-bold text-brand-text-variant uppercase mb-1">Agent Name</label>
                  <input
                    type="text"
                    required
                    value={iopName}
                    onChange={e => setIopName(e.target.value)}
                    placeholder="e.g. Kigamboni Retail"
                    className="w-full rounded-lg border border-brand-gray-border bg-white p-2 text-xs text-brand-text focus:outline-none focus:border-brand-primary font-sans"
                  />
                </div>
                <div>
                  <label className="block font-sans text-[10px] font-bold text-brand-text-variant uppercase mb-1">MSISDN</label>
                  <input
                    type="text"
                    required
                    value={iopMsisdn}
                    onChange={e => setIopMsisdn(e.target.value)}
                    placeholder="e.g. 255711889900"
                    className="w-full rounded-lg border border-brand-gray-border bg-white p-2 text-xs text-brand-text focus:outline-none focus:border-brand-primary font-mono"
                  />
                </div>
                <div>
                  <label className="block font-sans text-[10px] font-bold text-brand-text-variant uppercase mb-1">Region</label>
                  <select
                    value={iopRegion}
                    onChange={e => setIopRegion(e.target.value)}
                    className="w-full rounded-lg border border-brand-gray-border bg-white p-2 text-xs text-brand-text focus:outline-none focus:border-brand-primary font-sans cursor-pointer"
                  >
                    {regionsList.map(r => (
                      <option key={r} value={r}>{r}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="flex justify-end">
                <button
                  type="submit"
                  className="rounded-lg bg-brand-primary px-4 py-2 font-sans text-xs font-bold text-white shadow hover:bg-brand-primary-light transition-all cursor-pointer"
                >
                  Save Partner
                </button>
              </div>
            </motion.form>
          )}

          {/* IOP Wakalas List */}
          {iopWakalas.length === 0 ? (
            <div className="text-center py-8 font-sans text-xs text-brand-text-variant">
              No IOP Wakalas added yet. Click the button above to add one.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-brand-gray-border text-[10px] font-bold text-brand-text-variant uppercase tracking-wider">
                    <th className="py-2.5">Agent Name</th>
                    <th className="py-2.5">MSISDN</th>
                    <th className="py-2.5">Region</th>
                    <th className="py-2.5">Date Added</th>
                    <th className="py-2.5 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-brand-gray-border">
                  {iopWakalas.map(w => (
                    <tr 
                      key={w.id} 
                      onClick={() => {
                        setSelectedWakala({ wakala: w, type: 'iop' });
                        setEditWakalaData(w);
                        setIsEditingWakala(false);
                      }}
                      className="text-xs group hover:bg-brand-primary/5 transition-all cursor-pointer"
                    >
                      <td className="py-3 font-semibold text-brand-text">{w.name}</td>
                      <td className="py-3 font-mono text-brand-text-variant font-semibold">{w.msisdn}</td>
                      <td className="py-3">
                        <span className="inline-flex rounded-full bg-slate-100 border border-slate-200 px-2 py-0.5 text-[9px] font-bold text-brand-text-variant">
                          {w.region}
                        </span>
                      </td>
                      <td className="py-3 text-brand-text-variant font-medium">{formatExcelDate(w.dateAdded)}</td>
                      <td className="py-3 text-right" onClick={e => e.stopPropagation()}>
                        <button
                          onClick={() => handleDeleteWakala(w.id, 'iop')}
                          className="rounded p-1 text-rose-500 hover:bg-rose-50 transition-colors cursor-pointer"
                          title="Remove Wakala"
                        >
                          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

      </div>

      {/* Selected Wakala Detail Modal / Slide-over Card */}
      <AnimatePresence>
        {selectedWakala && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="relative w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl border border-slate-100"
            >
              {/* Header */}
              <div className="flex items-center justify-between border-b border-slate-100 pb-4 mb-4">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-sans text-base font-bold text-brand-text">{selectedWakala.wakala.name}</h3>
                    <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider ${
                      selectedWakala.type === 'base' ? 'bg-blue-100 text-blue-800' : 'bg-purple-100 text-purple-800'
                    }`}>
                      {selectedWakala.type === 'base' ? 'Base Wakala' : 'IOP Wakala'}
                    </span>
                  </div>
                  <p className="font-mono text-xs font-medium text-brand-text-variant mt-0.5">MSISDN: {selectedWakala.wakala.msisdn}</p>
                </div>
                <button
                  onClick={() => {
                    setSelectedWakala(null);
                    setIsEditingWakala(false);
                  }}
                  className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors cursor-pointer"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              {!isEditingWakala ? (
                /* View Mode */
                <div className="space-y-4 font-sans text-xs">
                  <div className="grid grid-cols-2 gap-3 bg-slate-50 p-4 rounded-xl border border-slate-100">
                    <div>
                      <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">Region</span>
                      <span className="font-semibold text-slate-800">{selectedWakala.wakala.region || '—'}</span>
                    </div>
                    <div>
                      <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">District</span>
                      <span className="font-semibold text-slate-800">
                        {selectedWakala.wakala.district ? selectedWakala.wakala.district : (
                          <span className="text-amber-600 font-bold bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200">Missing — Fill in</span>
                        )}
                      </span>
                    </div>
                    <div>
                      <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">Ward / Site Ward</span>
                      <span className="font-semibold text-slate-800">
                        {selectedWakala.wakala.siteWard ? selectedWakala.wakala.siteWard : (
                          <span className="text-amber-600 font-bold bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200">Missing — Fill in</span>
                        )}
                      </span>
                    </div>
                    <div>
                      <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">Site ID</span>
                      <span className="font-semibold text-slate-800 font-mono">
                        {selectedWakala.wakala.siteId ? selectedWakala.wakala.siteId : (
                          <span className="text-amber-600 font-bold bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200">Missing — Fill in</span>
                        )}
                      </span>
                    </div>
                    <div>
                      <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">Agent Code</span>
                      <span className="font-semibold text-slate-800 font-mono">
                        {selectedWakala.wakala.code ? selectedWakala.wakala.code : (
                          <span className="text-amber-600 font-bold bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200">Missing — Fill in</span>
                        )}
                      </span>
                    </div>
                    <div>
                      <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">Alternate Number</span>
                      <span className="font-semibold text-slate-800 font-mono">
                        {selectedWakala.wakala.alternateNumber || 'Not provided'}
                      </span>
                    </div>
                    <div>
                      <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">Source</span>
                      <span className="font-semibold text-slate-800 capitalize">
                        {selectedWakala.wakala.source || 'Manual Entry'}
                      </span>
                    </div>
                    <div>
                      <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">Date Added</span>
                      <span className="font-semibold text-slate-800">
                        {formatExcelDate(selectedWakala.wakala.dateAdded)}
                      </span>
                    </div>
                  </div>

                  {/* GPS Coordinates & Photo Preview Card */}
                  <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <MapPin className="h-4 w-4 text-brand-primary" />
                        <span className="font-bold text-slate-800 text-xs">GPS & Location Photo</span>
                      </div>
                      <button
                        type="button"
                        onClick={handleCaptureWakalaGps}
                        disabled={isCapturingGps}
                        className="flex items-center gap-1 text-[11px] font-bold text-brand-primary hover:text-brand-primary-light transition-colors cursor-pointer disabled:opacity-50"
                      >
                        {isCapturingGps ? <Loader2 className="h-3 w-3 animate-spin" /> : <Navigation className="h-3 w-3 fill-current" />}
                        {selectedWakala.wakala.location ? 'Re-capture GPS' : 'Capture GPS'}
                      </button>
                    </div>

                    {selectedWakala.wakala.location ? (
                      <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 text-emerald-800 p-2 rounded-lg font-mono text-[11px]">
                        <CheckCircle className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                        <span>Lat: {selectedWakala.wakala.location.lat.toFixed(4)}, Lng: {selectedWakala.wakala.location.lng.toFixed(4)}</span>
                      </div>
                    ) : (
                      <div className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 p-2 rounded-lg">
                        GPS location not captured yet. Click "Capture GPS" to pinpoint Wakala.
                      </div>
                    )}

                    {/* Camera Photo Input */}
                    <div className="flex items-center justify-between pt-1">
                      {wakalaPhotoUrl || selectedWakala.wakala.photoId || selectedWakala.wakala.photoUrl ? (
                        <div className="flex items-center gap-3">
                          {wakalaPhotoUrl && (
                            <img src={wakalaPhotoUrl} alt="Wakala site photo" className="h-12 w-12 object-cover rounded-lg border border-slate-200 shadow-sm" />
                          )}
                          <span className="text-[10px] text-emerald-700 font-bold bg-emerald-50 px-2 py-1 rounded border border-emerald-200">
                            Photo On File
                          </span>
                        </div>
                      ) : (
                        <span className="text-[11px] text-slate-500 italic">No shop photo attached</span>
                      )}

                      <div>
                        <input
                          type="file"
                          accept="image/*"
                          capture="environment"
                          id="wakala-photo-input"
                          className="hidden"
                          onChange={handleWakalaPhotoCapture}
                        />
                        <label
                          htmlFor="wakala-photo-input"
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-[11px] font-bold text-slate-700 hover:bg-slate-50 transition-colors cursor-pointer shadow-xs"
                        >
                          <Camera className="h-3.5 w-3.5 text-brand-primary" />
                          {wakalaPhotoUrl || selectedWakala.wakala.photoId || selectedWakala.wakala.photoUrl ? 'Change Photo' : 'Snap Photo'}
                        </label>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-2">
                    <button
                      onClick={() => {
                        handleDeleteWakala(selectedWakala.wakala.id, selectedWakala.type);
                        setSelectedWakala(null);
                        setIsEditingWakala(false);
                      }}
                      className="rounded-lg px-3 py-2 text-rose-600 hover:bg-rose-50 font-bold transition-colors cursor-pointer"
                    >
                      Delete Wakala
                    </button>
                    <button
                      onClick={() => {
                        setEditWakalaData({ ...selectedWakala.wakala });
                        setIsEditingWakala(true);
                      }}
                      className="flex items-center gap-1.5 rounded-xl bg-brand-primary px-4 py-2 text-xs font-bold text-white shadow-ambient hover:bg-brand-primary-light transition-all cursor-pointer"
                    >
                      <Edit className="h-3.5 w-3.5" />
                      Edit
                    </button>
                  </div>
                </div>
              ) : (
                /* Edit Mode */
                <form onSubmit={handleSaveWakalaEdit} className="space-y-3 font-sans text-xs">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[10px] font-bold text-brand-text-variant uppercase mb-1">Agent Name *</label>
                      <input
                        type="text"
                        required
                        value={editWakalaData.name || ''}
                        onChange={e => setEditWakalaData({ ...editWakalaData, name: e.target.value })}
                        className="w-full rounded-lg border border-slate-200 p-2 text-xs text-brand-text focus:outline-none focus:border-brand-primary"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-brand-text-variant uppercase mb-1">MSISDN *</label>
                      <input
                        type="text"
                        required
                        value={editWakalaData.msisdn || ''}
                        onChange={e => setEditWakalaData({ ...editWakalaData, msisdn: e.target.value })}
                        className="w-full rounded-lg border border-slate-200 p-2 text-xs text-brand-text focus:outline-none focus:border-brand-primary font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-brand-text-variant uppercase mb-1">Region</label>
                      <select
                        value={editWakalaData.region || 'Dar es Salaam'}
                        onChange={e => setEditWakalaData({ ...editWakalaData, region: e.target.value })}
                        className="w-full rounded-lg border border-slate-200 p-2 text-xs text-brand-text focus:outline-none focus:border-brand-primary cursor-pointer"
                      >
                        {regionsList.map(r => (
                          <option key={r} value={r}>{r}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-brand-text-variant uppercase mb-1">District</label>
                      <input
                        type="text"
                        value={editWakalaData.district || ''}
                        onChange={e => setEditWakalaData({ ...editWakalaData, district: e.target.value })}
                        placeholder="e.g. Ilala"
                        className="w-full rounded-lg border border-slate-200 p-2 text-xs text-brand-text focus:outline-none focus:border-brand-primary"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-brand-text-variant uppercase mb-1">Ward / Site Ward</label>
                      <input
                        type="text"
                        value={editWakalaData.siteWard || ''}
                        onChange={e => setEditWakalaData({ ...editWakalaData, siteWard: e.target.value })}
                        placeholder="e.g. Kariakoo"
                        className="w-full rounded-lg border border-slate-200 p-2 text-xs text-brand-text focus:outline-none focus:border-brand-primary"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-brand-text-variant uppercase mb-1">Site ID</label>
                      <input
                        type="text"
                        value={editWakalaData.siteId || ''}
                        onChange={e => setEditWakalaData({ ...editWakalaData, siteId: e.target.value })}
                        placeholder="e.g. ST-4029"
                        className="w-full rounded-lg border border-slate-200 p-2 text-xs text-brand-text focus:outline-none focus:border-brand-primary font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-brand-text-variant uppercase mb-1">Agent Code</label>
                      <input
                        type="text"
                        value={editWakalaData.code || ''}
                        onChange={e => setEditWakalaData({ ...editWakalaData, code: e.target.value })}
                        placeholder="e.g. WK-881"
                        className="w-full rounded-lg border border-slate-200 p-2 text-xs text-brand-text focus:outline-none focus:border-brand-primary font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-brand-text-variant uppercase mb-1">Alternate Number</label>
                      <input
                        type="text"
                        value={editWakalaData.alternateNumber || ''}
                        onChange={e => setEditWakalaData({ ...editWakalaData, alternateNumber: e.target.value })}
                        placeholder="e.g. 255755123456"
                        className="w-full rounded-lg border border-slate-200 p-2 text-xs text-brand-text focus:outline-none focus:border-brand-primary font-mono"
                      />
                    </div>
                  </div>

                  {/* GPS and Photo Capture Buttons in Edit Mode */}
                  <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-slate-700 text-[11px]">Wakala GPS Location</span>
                      <button
                        type="button"
                        onClick={handleCaptureWakalaGps}
                        disabled={isCapturingGps}
                        className="flex items-center gap-1 text-[11px] font-bold text-brand-primary hover:text-brand-primary-light transition-colors cursor-pointer disabled:opacity-50"
                      >
                        {isCapturingGps ? <Loader2 className="h-3 w-3 animate-spin" /> : <Navigation className="h-3 w-3 fill-current" />}
                        {editWakalaData.location ? 'Update GPS Pin' : 'Get Current GPS'}
                      </button>
                    </div>
                    {editWakalaData.location && (
                      <div className="text-[10px] font-mono text-emerald-800 bg-emerald-50 p-1.5 rounded border border-emerald-200">
                        Lat: {editWakalaData.location.lat.toFixed(4)}, Lng: {editWakalaData.location.lng.toFixed(4)}
                      </div>
                    )}
                  </div>

                  <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                    <button
                      type="button"
                      onClick={() => setIsEditingWakala(false)}
                      className="rounded-lg px-3 py-2 text-slate-600 hover:bg-slate-100 font-semibold transition-colors cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="rounded-xl bg-brand-primary px-4 py-2 text-xs font-bold text-white shadow-ambient hover:bg-brand-primary-light transition-all cursor-pointer"
                    >
                      Complete and Save Details
                    </button>
                  </div>
                </form>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
