import { useState, useEffect } from 'react';
import { calculateCompanyKPIs } from '../utils/mappingEngine';
import { useAuth } from '../components/AuthContext';

export function useReportingMetadata() {
  const { user } = useAuth();

  const [metadata, setMetadata] = useState(() => {
    try {
      const rows = JSON.parse(localStorage.getItem('servicingDataRows') || '[]');
      const { reportingMonth, lastUpload } = calculateCompanyKPIs(rows);
      return { reportingMonth, lastUpload };
    } catch (e) {
      return { reportingMonth: '—', lastUpload: '—' };
    }
  });

  useEffect(() => {
    const handleUpdate = () => {
      try {
        const rows = JSON.parse(localStorage.getItem('servicingDataRows') || '[]');
        const { reportingMonth, lastUpload } = calculateCompanyKPIs(rows);
        setMetadata({ reportingMonth, lastUpload });
      } catch (e) {
        console.error("Hook calculation failed", e);
      }
    };

    window.addEventListener('servicing-rows-updated', handleUpdate);
    window.addEventListener('storage', handleUpdate);
    return () => {
      window.removeEventListener('servicing-rows-updated', handleUpdate);
      window.removeEventListener('storage', handleUpdate);
    };
  }, []);

  let activeUserName = 'Admin Portal';
  if (user && user.name) {
    activeUserName = user.name;
  } else {
    try {
      const savedUser = localStorage.getItem('hasidadi_current_user');
      if (savedUser) {
        const parsed = JSON.parse(savedUser);
        if (parsed && parsed.name) {
          activeUserName = parsed.name;
        }
      }
    } catch (e) {
      // ignore
    }
  }

  return {
    reportingMonth: metadata.reportingMonth,
    lastUpload: metadata.lastUpload,
    activeUserName
  };
}
