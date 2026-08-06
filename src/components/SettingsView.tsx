import React, { useState, useEffect, useMemo } from 'react';
import { ViewType } from '../types';
import { 
  User, 
  Bell, 
  Database, 
  Save, 
  CheckCircle, 
  Sun,
  Moon,
  Sliders,
  ChevronRight,
  Shield,
  Map,
  Users,
  Search,
  Filter,
  MapPin,
  Activity
} from 'lucide-react';
import { motion } from 'motion/react';
import { useAuth } from './AuthContext';
import { useCompany } from './CompanyContext';
import AdminFieldMapView from './AdminFieldMapView';
import { getServicingRows } from '../utils/indexedDB';
import { ownersList as initialOwners } from '../data';

interface SettingsViewProps {
  userEmail: string;
  theme?: 'light' | 'dark';
  onThemeChange?: (theme: 'light' | 'dark') => void;
  onNavigate?: (view: ViewType) => void;
  onSelectOwner?: (name: string) => void;
}

interface CombinedWakalaRow {
  id: string;
  name: string;
  msisdn: string;
  siteId: string;
  region: string;
  value: number;
  status: string;
  source: 'Base Wakala' | 'IOP Wakala' | 'Telecom Servicing Data';
  ownerName: string;
}

export default function SettingsView({ 
  userEmail,
  theme = 'light',
  onThemeChange,
  onNavigate,
  onSelectOwner
}: SettingsViewProps) {
  const { user, updateUser } = useAuth();
  const { companyName, updateCompanyName } = useCompany();
  const [adminName, setAdminName] = useState('');
  const [email, setEmail] = useState('');
  const [companyNameInput, setCompanyNameInput] = useState(companyName);
  const [syncInterval, setSyncInterval] = useState('24h');
  const [showSaved, setShowSaved] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [activeTab, setActiveTab] = useState<'settings' | 'overview'>('settings');

  // Sync state with loaded user and company
  useEffect(() => {
    if (user) {
      setAdminName(user.name);
      setEmail(user.email);
    }
    setCompanyNameInput(companyName);
  }, [user?.name, user?.email, companyName]);

  const [owners, setOwners] = useState<any[]>(() => {
    const saved = localStorage.getItem('ownersList');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        console.error(e);
      }
    }
    return initialOwners;
  });

  const [combinedWakalas, setCombinedWakalas] = useState<CombinedWakalaRow[]>([]);
  const [loadingWakalas, setLoadingWakalas] = useState(true);

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
  }, []);

  useEffect(() => {
    async function loadData() {
      setLoadingWakalas(true);
      try {
        const list: CombinedWakalaRow[] = [];

        // 1. Load Base & IOP from owners
        owners.forEach(owner => {
          if (owner.baseWakalas) {
            owner.baseWakalas.forEach((w: any) => {
              list.push({
                id: w.id || `base-${owner.name}-${w.msisdn}-${w.name}`,
                name: w.name || 'N/A',
                msisdn: w.msisdn || 'N/A',
                siteId: 'N/A',
                region: w.region || owner.region || 'N/A',
                value: 0,
                status: 'Active',
                source: 'Base Wakala',
                ownerName: owner.name
              });
            });
          }

          if (owner.iopWakalas) {
            owner.iopWakalas.forEach((w: any) => {
              list.push({
                id: w.id || `iop-${owner.name}-${w.msisdn}-${w.name}`,
                name: w.name || 'N/A',
                msisdn: w.msisdn || 'N/A',
                siteId: 'N/A',
                region: w.region || owner.region || 'N/A',
                value: 0,
                status: 'Active',
                source: 'IOP Wakala',
                ownerName: owner.name
              });
            });
          }
        });

        // 2. Load from IndexedDB
        const rows = await getServicingRows(activeMonth);
        if (rows && rows.length > 0) {
          rows.forEach((r, idx) => {
            const name = r.Full_Name || r['Full Name'] || r.Full_name || r.Owner_Name || r.owner_name || r.name || r['Wakala Name'] || 'N/A';
            const msisdn = r.MSISDN || r.msisdn || r.phone || r['Phone'] || r['Branch_msisdn'] || r['transactionTill'] || 'N/A';
            const siteId = r.siteid || r.site_id || r.SiteID || r.SITEID || r.Site_ID || 'N/A';
            const region = r.Sales_region || r.sales_region || r.Region || r.sales_zone || r.region || 'N/A';
            const rawVal = r.SA_Servicing_Val || r.sa_servicing_val || r['SA_Servicing_Val'] || r['Volume (TZS)'] || r['Volume'] || r['Amount'] || 0;
            const value = typeof rawVal === 'number' ? rawVal : parseFloat(String(rawVal).replace(/[^0-9.-]/g, '')) || 0;
            const status = r.servicing_status || r.status || r.Status || 'Active';
            const ownerName = r.Owner_Name || r.owner_name || r['Wakala Owner'] || r['Wakala Name'] || r.owner || 'N/A';

            list.push({
              id: r.compositeKey || `db-${idx}-${msisdn}`,
              name,
              msisdn,
              siteId,
              region,
              value,
              status,
              source: 'Telecom Servicing Data',
              ownerName
            });
          });
        }

        setCombinedWakalas(list);
      } catch (err) {
        console.error("Error loading combined wakala portfolio in SettingsView:", err);
      } finally {
        setLoadingWakalas(false);
      }
    }

    loadData();
  }, [owners, activeMonth]);

  const [wakalaSearch, setWakalaSearch] = useState('');
  const [wakalaOwnerFilter, setWakalaOwnerFilter] = useState('All');
  const [wakalaRegionFilter, setWakalaRegionFilter] = useState('All');
  const [wakalaPage, setWakalaPage] = useState(1);
  const itemsPerPage = 15;

  // Reset page when filters change
  useEffect(() => {
    setWakalaPage(1);
  }, [wakalaSearch, wakalaOwnerFilter, wakalaRegionFilter]);

  const filteredWakalas = useMemo(() => {
    return combinedWakalas.filter(w => {
      const matchesSearch = 
        w.name.toLowerCase().includes(wakalaSearch.toLowerCase()) ||
        w.msisdn.toLowerCase().includes(wakalaSearch.toLowerCase());

      const matchesOwner = 
        wakalaOwnerFilter === 'All' || 
        w.ownerName.toLowerCase() === wakalaOwnerFilter.toLowerCase();

      const matchesRegion = 
        wakalaRegionFilter === 'All' || 
        w.region.toLowerCase() === wakalaRegionFilter.toLowerCase();

      return matchesSearch && matchesOwner && matchesRegion;
    });
  }, [combinedWakalas, wakalaSearch, wakalaOwnerFilter, wakalaRegionFilter]);

  const totalPages = Math.ceil(filteredWakalas.length / itemsPerPage);
  const paginatedWakalas = useMemo(() => {
    const start = (wakalaPage - 1) * itemsPerPage;
    return filteredWakalas.slice(start, start + itemsPerPage);
  }, [filteredWakalas, wakalaPage]);

  const ownerOptions = useMemo(() => {
    const ownersSet = new Set<string>();
    combinedWakalas.forEach(w => {
      if (w.ownerName && w.ownerName !== 'N/A') {
        ownersSet.add(w.ownerName);
      }
    });
    return ['All', ...Array.from(ownersSet).sort()];
  }, [combinedWakalas]);

  const regionOptions = useMemo(() => {
    const regionsSet = new Set<string>();
    combinedWakalas.forEach(w => {
      if (w.region && w.region !== 'N/A') {
        regionsSet.add(w.region);
      }
    });
    return ['All', ...Array.from(regionsSet).sort()];
  }, [combinedWakalas]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');
    setShowSaved(false);

    if (!companyNameInput.trim()) {
      setErrorMessage('Company Name cannot be empty.');
      return;
    }

    const updated = updateCompanyName(companyNameInput);
    if (!updated) {
      setErrorMessage('Company Name cannot be empty.');
      return;
    }

    try {
      const result = await updateUser(adminName, email);
      if (result.success) {
        setShowSaved(true);
        setTimeout(() => setShowSaved(false), 3000);
      } else {
        setErrorMessage(result.error || 'Failed to save settings.');
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'An unexpected error occurred.');
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="space-y-6 max-w-[1440px] mx-auto p-4 sm:p-6 lg:p-8 font-sans"
    >
      {/* Title */}
      <div>
        <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-brand-text">Portal Settings</h2>
        <p className="text-sm text-brand-text-variant mt-1">Configure global synchronization sync intervals, credential profiles, and audit notifications.</p>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-brand-gray-border/80">
        <button
          onClick={() => setActiveTab('settings')}
          className={`px-5 py-3 text-xs sm:text-sm font-bold border-b-2 transition-all flex items-center gap-2 cursor-pointer ${
            activeTab === 'settings'
              ? 'border-brand-primary text-brand-primary'
              : 'border-transparent text-brand-text-variant hover:text-brand-text hover:border-brand-gray-border'
          }`}
        >
          <Sliders className="h-4.5 w-4.5" />
          General Settings
        </button>
        <button
          onClick={() => setActiveTab('overview')}
          className={`px-5 py-3 text-xs sm:text-sm font-bold border-b-2 transition-all flex items-center gap-2 cursor-pointer ${
            activeTab === 'overview'
              ? 'border-brand-primary text-brand-primary'
              : 'border-transparent text-brand-text-variant hover:text-brand-text hover:border-brand-gray-border'
          }`}
        >
          <Shield className="h-4.5 w-4.5" />
          Admin Overview
        </button>
      </div>

      {activeTab === 'settings' ? (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left Form: col-span-8 */}
          <div className="lg:col-span-8 rounded-2xl border border-brand-gray-border bg-brand-card p-6 shadow-ambient">
            <form onSubmit={handleSave} className="space-y-6">
              
              {/* Sec 1: Profile */}
              <div>
                <h3 className="text-sm font-bold uppercase tracking-wider text-brand-primary border-b border-brand-gray-border pb-2.5 mb-4 flex items-center gap-1.5">
                  <User className="h-4.5 w-4.5" />
                  Administrator Profile & Organization
                </h3>
                
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-bold text-brand-text uppercase tracking-wider mb-1.5">Company / Organization Name</label>
                    <input
                      type="text"
                      required
                      value={companyNameInput}
                      onChange={(e) => setCompanyNameInput(e.target.value)}
                      placeholder="e.g. Hasidadi Enterprises"
                      className="w-full rounded-xl bg-brand-bg border-2 border-transparent px-4 py-2.5 text-sm text-brand-text outline-none focus:border-brand-primary focus:bg-white transition-all font-semibold"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-brand-text uppercase tracking-wider mb-1.5">Administrator Display Name</label>
                    <input
                      type="text"
                      required
                      value={adminName}
                      onChange={(e) => setAdminName(e.target.value)}
                      className="w-full rounded-xl bg-brand-bg border-2 border-transparent px-4 py-2.5 text-sm text-brand-text outline-none focus:border-brand-primary focus:bg-white transition-all"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-brand-text uppercase tracking-wider mb-1.5">Primary Contact Email</label>
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="w-full rounded-xl bg-brand-bg border-2 border-transparent px-4 py-2.5 text-sm text-brand-text outline-none focus:border-brand-primary focus:bg-white transition-all"
                    />
                  </div>
                </div>
              </div>

              {/* Sec 2: Sync credentials */}
              <div>
                <h3 className="text-sm font-bold uppercase tracking-wider text-brand-primary border-b border-brand-gray-border pb-2.5 mb-4 flex items-center gap-1.5">
                  <Database className="h-4.5 w-4.5" />
                  Network Synchronization Credentials
                </h3>
                
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="block text-xs font-bold text-brand-text uppercase tracking-wider">Sync Interval Rate</label>
                      <span className="inline-flex items-center rounded-full bg-brand-gray-hover/60 px-2 py-0.5 text-[9px] font-bold text-brand-text-variant uppercase tracking-wider">Coming Soon</span>
                    </div>
                    <select
                      disabled
                      value={syncInterval}
                      onChange={(e) => setSyncInterval(e.target.value)}
                      className="w-full rounded-xl bg-brand-bg/40 border-2 border-transparent px-4 py-2.5 text-sm text-brand-text/50 outline-none cursor-not-allowed transition-all"
                    >
                      <option value="6h">Every 6 Hours (High Precision)</option>
                      <option value="12h">Every 12 Hours</option>
                      <option value="24h">Daily (24 Hours - Default)</option>
                    </select>
                  </div>
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="block text-xs font-bold text-brand-text uppercase tracking-wider">Third-Party SFTP Port</label>
                      <span className="inline-flex items-center rounded-full bg-brand-gray-hover/60 px-2 py-0.5 text-[9px] font-bold text-brand-text-variant uppercase tracking-wider">Coming Soon</span>
                    </div>
                    <input
                      type="text"
                      disabled
                      value="sftp://tanzania-sftp.trims.org:2201"
                      className="w-full rounded-xl bg-brand-bg/40 border-2 border-transparent px-4 py-2.5 text-sm text-brand-text/50 outline-none cursor-not-allowed transition-all"
                    />
                  </div>
                </div>
              </div>

              {/* Sec 3: Theme & Appearance */}
              <div>
                <h3 className="text-sm font-bold uppercase tracking-wider text-brand-primary border-b border-brand-gray-border pb-2.5 mb-4 flex items-center gap-1.5">
                  <Sun className="h-4.5 w-4.5" />
                  Theme & Appearance
                </h3>
                
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <button
                    type="button"
                    onClick={() => onThemeChange?.('light')}
                    className={`flex items-center justify-between p-4 rounded-xl border-2 transition-all cursor-pointer text-left ${
                      theme === 'light'
                        ? 'border-brand-primary bg-brand-primary/5 dark:bg-brand-primary/10 shadow-sm'
                        : 'border-brand-gray-border bg-brand-card hover:border-brand-primary-light/30'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`p-2.5 rounded-xl ${theme === 'light' ? 'bg-amber-100 text-amber-600' : 'bg-brand-gray-hover text-brand-text-variant'}`}>
                        <Sun className="h-5 w-5" />
                      </div>
                      <div>
                        <p className="text-sm font-bold text-brand-text">Light Theme</p>
                        <p className="text-xs text-brand-text-variant mt-0.5">Classic {companyName} gold & blue</p>
                      </div>
                    </div>
                    {theme === 'light' && (
                      <div className="h-5 w-5 rounded-full bg-brand-primary flex items-center justify-center text-white">
                        <CheckCircle className="h-4 w-4" />
                      </div>
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={() => onThemeChange?.('dark')}
                    className={`flex items-center justify-between p-4 rounded-xl border-2 transition-all cursor-pointer text-left ${
                      theme === 'dark'
                        ? 'border-brand-primary bg-brand-primary/10 shadow-sm'
                        : 'border-brand-gray-border bg-brand-card hover:border-brand-primary-light/30'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`p-2.5 rounded-xl ${theme === 'dark' ? 'bg-blue-950 text-blue-400' : 'bg-brand-gray-hover text-brand-text-variant'}`}>
                        <Moon className="h-5 w-5" />
                      </div>
                      <div>
                        <p className="text-sm font-bold text-brand-text">Dark Theme</p>
                        <p className="text-xs text-brand-text-variant mt-0.5">Eye-safe slate layout</p>
                      </div>
                    </div>
                    {theme === 'dark' && (
                      <div className="h-5 w-5 rounded-full bg-brand-primary flex items-center justify-center text-white">
                        <CheckCircle className="h-4 w-4" />
                      </div>
                    )}
                  </button>
                </div>
              </div>

              {/* Sec 4: Alerts */}
              <div>
                <h3 className="text-sm font-bold uppercase tracking-wider text-brand-primary border-b border-brand-gray-border pb-2.5 mb-4 flex items-center gap-1.5">
                  <Bell className="h-4.5 w-4.5" />
                  Notification Handshakes
                </h3>
                
                <div className="space-y-3 font-sans text-xs font-semibold text-brand-text">
                  <label className="flex items-center gap-2.5 cursor-pointer">
                    <input type="checkbox" defaultChecked className="rounded text-brand-primary focus:ring-brand-primary h-4.5 w-4.5 border-slate-300" />
                    <span>Send slack alert upon failed schema uploads on MGT files</span>
                  </label>
                  <label className="flex items-center gap-2.5 cursor-pointer">
                    <input type="checkbox" defaultChecked className="rounded text-brand-primary focus:ring-brand-primary h-4.5 w-4.5 border-slate-300" />
                    <span>Transmit weekly transaction reports to {companyName} audits</span>
                  </label>
                </div>
              </div>

              {/* Save trigger button */}
              <div className="flex flex-col gap-3 border-t border-brand-gray-border pt-5">
                {errorMessage && (
                  <div className="text-xs font-bold text-rose-600 flex items-center gap-1.5 bg-rose-50 border border-rose-200/50 p-2.5 rounded-xl">
                    {errorMessage}
                  </div>
                )}
                
                <div className="flex items-center justify-between">
                  {showSaved ? (
                    <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-600">
                      <CheckCircle className="h-4.5 w-4.5" />
                      Portal settings saved successfully!
                    </div>
                  ) : <div />}
                  <button
                    type="submit"
                    className="rounded-xl bg-brand-primary px-5 py-2.5 text-xs font-bold text-white shadow-ambient hover:bg-brand-primary-light transition-all flex items-center gap-1.5 cursor-pointer"
                    id="save-settings-btn"
                  >
                    <Save className="h-4 w-4" />
                    Save Settings
                  </button>
                </div>
              </div>
            </form>
          </div>

          {/* Right Info Box: col-span-4 */}
          <div className="lg:col-span-4 space-y-4">
            <div className="rounded-2xl border border-brand-gray-border bg-brand-card p-5 shadow-ambient font-sans text-xs space-y-3">
              <h4 className="font-bold text-brand-text flex items-center gap-1.5">
                <Sliders className="h-4.5 w-4.5 text-brand-primary" />
                Role Classifications
              </h4>
              <p className="text-brand-text-variant leading-relaxed">
                Define Excel workbook title-to-role mappings dynamically. No hardcoded definitions exist.
              </p>
              <button
                type="button"
                onClick={() => onNavigate?.(ViewType.PEOPLE_MGT)}
                className="w-full inline-flex items-center justify-between gap-1 bg-brand-primary/5 hover:bg-brand-primary text-brand-primary hover:text-white px-3.5 py-2 rounded-xl transition-all font-bold text-xs cursor-pointer border border-brand-primary/10"
              >
                <span>Edit Title Mappings</span>
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          {/* 1. FIELD MAP */}
          <div className="rounded-2xl border border-brand-gray-border bg-brand-card p-6 shadow-ambient">
            <h3 className="text-sm font-extrabold uppercase tracking-wider text-brand-primary border-b border-brand-gray-border pb-2.5 mb-4 flex items-center gap-1.5">
              <Map className="h-4.5 w-4.5" />
              Sovereign Field Map
            </h3>
            <p className="text-xs text-brand-text-variant mb-4">
              Geographic tracking of registered owners and operational regions with active work locations.
            </p>
            <div className="h-[450px] rounded-xl overflow-hidden border border-brand-gray-border shadow-inner relative z-10">
              <AdminFieldMapView onSelectOwner={onSelectOwner!} onNavigate={onNavigate!} />
            </div>
          </div>

          {/* 2. OWNERS SUMMARY */}
          <div className="rounded-2xl border border-brand-gray-border bg-brand-card p-6 shadow-ambient">
            <h3 className="text-sm font-extrabold uppercase tracking-wider text-brand-primary border-b border-brand-gray-border pb-2.5 mb-4 flex items-center gap-1.5">
              <Users className="h-4.5 w-4.5" />
              Owners Summary Profile
            </h3>
            <p className="text-xs text-brand-text-variant mb-4">
              Consolidated master directory of active enterprise portfolio owners. Click any row to open full Profile details.
            </p>
            <div className="overflow-x-auto rounded-xl border border-brand-gray-border">
              <table className="w-full text-left border-collapse font-sans text-xs">
                <thead>
                  <tr className="bg-brand-bg/50 border-b border-brand-gray-border text-brand-text-variant uppercase font-bold tracking-wider">
                    <th className="py-3.5 px-4 font-extrabold">Owner Name</th>
                    <th className="py-3.5 px-4 font-extrabold">Region / Work Location</th>
                    <th className="py-3.5 px-4 font-extrabold text-right">Performance</th>
                    <th className="py-3.5 px-4 font-extrabold text-right">Assigned Tills</th>
                    <th className="py-3.5 px-4"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-brand-gray-border/40 bg-brand-card">
                  {owners.map((owner) => {
                    const tillCount = (owner.baseWakalas?.length || 0) + (owner.iopWakalas?.length || 0) || owner.wakalas || 0;
                    const locationStr = owner.workLocation?.address || owner.region || 'N/A';
                    const perf = owner.performance != null ? owner.performance : 0;
                    
                    return (
                      <tr 
                        key={owner.id || owner.name} 
                        onClick={() => onSelectOwner?.(owner.name)}
                        className="hover:bg-brand-gray-hover/50 cursor-pointer transition-all duration-150"
                      >
                        <td className="py-3.5 px-4 font-bold text-brand-text flex items-center gap-2.5">
                          <span className="h-7 w-7 rounded-lg bg-brand-primary/10 text-brand-primary flex items-center justify-center font-black text-xs">
                            {owner.name.charAt(0)}
                          </span>
                          {owner.name}
                        </td>
                        <td className="py-3.5 px-4 text-brand-text-variant font-medium">
                          {locationStr}
                        </td>
                        <td className="py-3.5 px-4 text-right">
                          <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wider ${
                            perf >= 90 
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' 
                              : perf >= 75 
                                ? 'bg-indigo-50 text-indigo-700 border border-indigo-200' 
                                : 'bg-rose-50 text-rose-700 border border-rose-200'
                          }`}>
                            {perf}%
                          </span>
                        </td>
                        <td className="py-3.5 px-4 text-right font-mono font-bold text-brand-text">
                          {tillCount}
                        </td>
                        <td className="py-3.5 px-4 text-right text-brand-primary">
                          <ChevronRight className="h-4.5 w-4.5 inline" />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* 3. FULL WAKALA LIST */}
          <div className="rounded-2xl border border-brand-gray-border bg-brand-card p-6 shadow-ambient">
            <div className="border-b border-brand-gray-border pb-2.5 mb-4 sm:flex sm:items-center sm:justify-between">
              <h3 className="text-sm font-extrabold uppercase tracking-wider text-brand-primary flex items-center gap-1.5">
                <Activity className="h-4.5 w-4.5" />
                Full Wakala Master Registry ({activeMonth})
              </h3>
              <span className="inline-flex items-center rounded-xl bg-brand-primary/10 px-3 py-1 text-xs font-bold text-brand-primary mt-2 sm:mt-0">
                Total Portfolio Size: {filteredWakalas.length} Wakalas
              </span>
            </div>
            
            <p className="text-xs text-brand-text-variant mb-6">
              Complete consolidated registry listing every Wakala served. Includes registered base profiles, active IOP entries, and raw telecom servicing rows.
            </p>

            {/* Filters bar */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
              {/* Search */}
              <div className="relative">
                <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                  <Search className="h-4 w-4 text-brand-text-variant" />
                </div>
                <input
                  type="text"
                  placeholder="Search Wakalas by Name or MSISDN..."
                  value={wakalaSearch}
                  onChange={(e) => setWakalaSearch(e.target.value)}
                  className="block w-full rounded-xl bg-brand-bg border-2 border-transparent pl-9 pr-4 py-2 text-xs font-semibold text-brand-text placeholder-brand-text-variant outline-none focus:border-brand-primary transition-all"
                />
              </div>

              {/* Owner Filter */}
              <div className="relative">
                <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                  <User className="h-4 w-4 text-brand-text-variant" />
                </div>
                <select
                  value={wakalaOwnerFilter}
                  onChange={(e) => setWakalaOwnerFilter(e.target.value)}
                  className="block w-full rounded-xl bg-brand-bg border-2 border-transparent pl-9 pr-4 py-2 text-xs font-semibold text-brand-text outline-none focus:border-brand-primary cursor-pointer transition-all"
                >
                  <option value="All">All Owners</option>
                  {ownerOptions.filter(o => o !== 'All').map(owner => (
                    <option key={owner} value={owner}>{owner}</option>
                  ))}
                </select>
              </div>

              {/* Region Filter */}
              <div className="relative">
                <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                  <MapPin className="h-4 w-4 text-brand-text-variant" />
                </div>
                <select
                  value={wakalaRegionFilter}
                  onChange={(e) => setWakalaRegionFilter(e.target.value)}
                  className="block w-full rounded-xl bg-brand-bg border-2 border-transparent pl-9 pr-4 py-2 text-xs font-semibold text-brand-text outline-none focus:border-brand-primary cursor-pointer transition-all"
                >
                  <option value="All">All Regions</option>
                  {regionOptions.filter(r => r !== 'All').map(region => (
                    <option key={region} value={region}>{region}</option>
                  ))}
                </select>
              </div>
            </div>

            {loadingWakalas ? (
              <div className="flex flex-col items-center justify-center py-12 text-brand-text-variant">
                <span className="animate-spin h-8 w-8 border-4 border-brand-primary border-t-transparent rounded-full mb-3" />
                <p className="text-xs font-bold">Consolidating wakala portfolio registries...</p>
              </div>
            ) : filteredWakalas.length === 0 ? (
              <div className="text-center py-12 border-2 border-dashed border-brand-gray-border rounded-xl">
                <p className="text-xs font-bold text-brand-text-variant">No matching wakalas found in active registries</p>
                <p className="text-[11px] text-brand-text-variant/70 mt-1">Try adjusting search queries or selected filters</p>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="overflow-x-auto rounded-xl border border-brand-gray-border">
                  <table className="w-full text-left border-collapse font-sans text-xs">
                    <thead>
                      <tr className="bg-brand-bg/50 border-b border-brand-gray-border text-brand-text-variant uppercase font-bold tracking-wider">
                        <th className="py-3.5 px-4 font-extrabold">Wakala / Entity Name</th>
                        <th className="py-3.5 px-4 font-extrabold">MSISDN</th>
                        <th className="py-3.5 px-4 font-extrabold">Site ID</th>
                        <th className="py-3.5 px-4 font-extrabold">Region</th>
                        <th className="py-3.5 px-4 font-extrabold">Owner Association</th>
                        <th className="py-3.5 px-4 font-extrabold text-right">Servicing Val</th>
                        <th className="py-3.5 px-4 font-extrabold text-center">Status</th>
                        <th className="py-3.5 px-4 font-extrabold text-center">Source</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-brand-gray-border/40 bg-brand-card">
                      {paginatedWakalas.map((w) => (
                        <tr 
                          key={w.id} 
                          className="hover:bg-brand-gray-hover/30 transition-all duration-150"
                        >
                          <td className="py-3.5 px-4 font-bold text-brand-text">
                            {w.name}
                          </td>
                          <td className="py-3.5 px-4 font-mono font-semibold text-brand-text-variant">
                            {w.msisdn}
                          </td>
                          <td className="py-3.5 px-4 font-mono text-[11px] text-brand-text-variant">
                            {w.siteId}
                          </td>
                          <td className="py-3.5 px-4 font-medium text-brand-text-variant">
                            {w.region}
                          </td>
                          <td className="py-3.5 px-4 font-semibold text-brand-text-variant">
                            {w.ownerName}
                          </td>
                          <td className="py-3.5 px-4 text-right font-mono font-bold text-brand-text">
                            {w.value > 0 ? `TZS ${w.value.toLocaleString()}` : '—'}
                          </td>
                          <td className="py-3.5 px-4 text-center">
                            <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider ${
                              w.status.toLowerCase() === 'active' || w.status.toLowerCase() === 'synced' || w.status.toLowerCase() === 'verified'
                                ? 'bg-emerald-50 text-emerald-700 border border-emerald-100'
                                : 'bg-rose-50 text-rose-700 border border-rose-100'
                            }`}>
                              {w.status}
                            </span>
                          </td>
                          <td className="py-3.5 px-4 text-center">
                            <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[9px] font-extrabold uppercase tracking-wider border ${
                              w.source === 'Base Wakala' 
                                ? 'bg-violet-50 text-violet-700 border-violet-200' 
                                : w.source === 'IOP Wakala' 
                                  ? 'bg-amber-50 text-amber-700 border-amber-200' 
                                  : 'bg-sky-50 text-sky-700 border-sky-200'
                            }`}>
                              {w.source}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Pagination Controls */}
                {totalPages > 1 && (
                  <div className="flex items-center justify-between border-t border-brand-gray-border/60 pt-4">
                    <p className="text-xs text-brand-text-variant font-medium">
                      Showing <strong className="text-brand-text">{(wakalaPage - 1) * itemsPerPage + 1}</strong> to{' '}
                      <strong className="text-brand-text">
                        {Math.min(wakalaPage * itemsPerPage, filteredWakalas.length)}
                      </strong>{' '}
                      of <strong className="text-brand-text">{filteredWakalas.length}</strong> entries
                    </p>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setWakalaPage(prev => Math.max(prev - 1, 1))}
                        disabled={wakalaPage === 1}
                        className="rounded-lg border border-brand-gray-border px-3 py-1.5 text-xs font-bold text-brand-text hover:bg-brand-gray-hover/60 disabled:opacity-40 disabled:cursor-not-allowed transition-all cursor-pointer"
                      >
                        Previous
                      </button>
                      <span className="text-xs font-bold text-brand-text">
                        Page {wakalaPage} of {totalPages}
                      </span>
                      <button
                        onClick={() => setWakalaPage(prev => Math.min(prev + 1, totalPages))}
                        disabled={wakalaPage === totalPages}
                        className="rounded-lg border border-brand-gray-border px-3 py-1.5 text-xs font-bold text-brand-text hover:bg-brand-gray-hover/60 disabled:opacity-40 disabled:cursor-not-allowed transition-all cursor-pointer"
                      >
                        Next
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </motion.div>
  );
}
