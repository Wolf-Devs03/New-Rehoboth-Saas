/**
 * IndexedDB Utility Helper for WakalaServicingDB
 */

const DB_NAME = 'WakalaServicingDB';
const DB_VERSION = 4;
const ROW_STORE = 'monthlyServicingRows';
const COL_STORE = 'monthlyServicingColumns';
const WEEKLY_ROW_STORE = 'weeklyServicingRows';
const WEEKLY_COL_STORE = 'weeklyServicingColumns';
const DAILY_ROW_STORE = 'dailyServicingRows';

export function initDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    let request: IDBOpenDBRequest;
    try {
      request = indexedDB.open(DB_NAME, DB_VERSION);
    } catch (err) {
      return reject(err);
    }

    request.onupgradeneeded = (event) => {
      const db = request.result;
      const txn = request.transaction;

      try {
        if (!db.objectStoreNames.contains(ROW_STORE)) {
          const rowStore = db.createObjectStore(ROW_STORE, { keyPath: 'compositeKey' });
          rowStore.createIndex('reportingMonth', 'reportingMonth', { unique: false });
          rowStore.createIndex('siteid', 'siteid', { unique: false });
          rowStore.createIndex('Sales_region', 'Sales_region', { unique: false });
          rowStore.createIndex('Owner_Name', 'Owner_Name', { unique: false });
          rowStore.createIndex('MSISDN', 'MSISDN', { unique: false });
          rowStore.createIndex('servicing_status', 'servicing_status', { unique: false });
        } else if (txn) {
          const rowStore = txn.objectStore(ROW_STORE);
          if (!rowStore.indexNames.contains('reportingMonth')) rowStore.createIndex('reportingMonth', 'reportingMonth', { unique: false });
          if (!rowStore.indexNames.contains('siteid')) rowStore.createIndex('siteid', 'siteid', { unique: false });
          if (!rowStore.indexNames.contains('Sales_region')) rowStore.createIndex('Sales_region', 'Sales_region', { unique: false });
          if (!rowStore.indexNames.contains('Owner_Name')) rowStore.createIndex('Owner_Name', 'Owner_Name', { unique: false });
          if (!rowStore.indexNames.contains('MSISDN')) rowStore.createIndex('MSISDN', 'MSISDN', { unique: false });
          if (!rowStore.indexNames.contains('servicing_status')) rowStore.createIndex('servicing_status', 'servicing_status', { unique: false });
        }

        if (!db.objectStoreNames.contains(COL_STORE)) {
          db.createObjectStore(COL_STORE, { keyPath: 'reportingMonth' });
        }

        if (!db.objectStoreNames.contains(WEEKLY_ROW_STORE)) {
          const weeklyRowStore = db.createObjectStore(WEEKLY_ROW_STORE, { keyPath: 'compositeKey' });
          weeklyRowStore.createIndex('reportingWeek', 'reportingWeek', { unique: false });
          weeklyRowStore.createIndex('reportingMonth', 'reportingMonth', { unique: false });
          weeklyRowStore.createIndex('siteid', 'siteid', { unique: false });
          weeklyRowStore.createIndex('Sales_region', 'Sales_region', { unique: false });
          weeklyRowStore.createIndex('Owner_Name', 'Owner_Name', { unique: false });
          weeklyRowStore.createIndex('MSISDN', 'MSISDN', { unique: false });
          weeklyRowStore.createIndex('servicing_status', 'servicing_status', { unique: false });
        } else if (txn) {
          const weeklyRowStore = txn.objectStore(WEEKLY_ROW_STORE);
          if (!weeklyRowStore.indexNames.contains('reportingWeek')) weeklyRowStore.createIndex('reportingWeek', 'reportingWeek', { unique: false });
          if (!weeklyRowStore.indexNames.contains('reportingMonth')) weeklyRowStore.createIndex('reportingMonth', 'reportingMonth', { unique: false });
          if (!weeklyRowStore.indexNames.contains('siteid')) weeklyRowStore.createIndex('siteid', 'siteid', { unique: false });
          if (!weeklyRowStore.indexNames.contains('Sales_region')) weeklyRowStore.createIndex('Sales_region', 'Sales_region', { unique: false });
          if (!weeklyRowStore.indexNames.contains('Owner_Name')) weeklyRowStore.createIndex('Owner_Name', 'Owner_Name', { unique: false });
          if (!weeklyRowStore.indexNames.contains('MSISDN')) weeklyRowStore.createIndex('MSISDN', 'MSISDN', { unique: false });
          if (!weeklyRowStore.indexNames.contains('servicing_status')) weeklyRowStore.createIndex('servicing_status', 'servicing_status', { unique: false });
        }

        if (!db.objectStoreNames.contains(WEEKLY_COL_STORE)) {
          db.createObjectStore(WEEKLY_COL_STORE, { keyPath: 'reportingWeek' });
        }

        if (!db.objectStoreNames.contains(DAILY_ROW_STORE)) {
          const dailyRowStore = db.createObjectStore(DAILY_ROW_STORE, { keyPath: '_id' });
          dailyRowStore.createIndex('servicingDate', 'servicingDate', { unique: false });
          dailyRowStore.createIndex('Branch_msisdn', 'Branch_msisdn', { unique: false });
        } else if (txn) {
          const dailyRowStore = txn.objectStore(DAILY_ROW_STORE);
          if (dailyRowStore.indexNames.contains('Servicing Date')) {
            try { dailyRowStore.deleteIndex('Servicing Date'); } catch (e) {}
          }
          if (!dailyRowStore.indexNames.contains('servicingDate')) {
            dailyRowStore.createIndex('servicingDate', 'servicingDate', { unique: false });
          }
          if (!dailyRowStore.indexNames.contains('Branch_msisdn')) {
            dailyRowStore.createIndex('Branch_msisdn', 'Branch_msisdn', { unique: false });
          }
        }
      } catch (upgradeError) {
        console.error('Error during IndexedDB upgrade:', upgradeError);
        txn?.abort();
      }
    };

    request.onsuccess = () => {
      resolve(request.result);
    };

    request.onerror = () => {
      console.warn('Failed to open WakalaServicingDB, attempting recovery by deleting and recreating...', request.error);
      const deleteReq = indexedDB.deleteDatabase(DB_NAME);
      deleteReq.onsuccess = () => {
        const retryReq = indexedDB.open(DB_NAME, DB_VERSION);
        retryReq.onupgradeneeded = request.onupgradeneeded;
        retryReq.onsuccess = () => resolve(retryReq.result);
        retryReq.onerror = () => reject(retryReq.error);
      };
      deleteReq.onerror = () => reject(request.error);
    };
  });
}

export async function saveMonthlyServicingData(
  reportingMonth: string,
  rows: any[],
  columns: string[]
): Promise<void> {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([ROW_STORE, COL_STORE], 'readwrite');
    const rowStore = transaction.objectStore(ROW_STORE);
    const colStore = transaction.objectStore(COL_STORE);

    transaction.onerror = () => {
      reject(transaction.error);
    };

    transaction.oncomplete = () => {
      resolve();
    };

    // Save columns
    colStore.put({
      reportingMonth,
      columns
    });

    // Save rows
    rows.forEach((row, index) => {
      const idVal = row._id || row.id || `row-${index}-${Date.now()}`;
      const enrichedRow = {
        ...row,
        reportingMonth,
        compositeKey: `${reportingMonth}_${idVal}`,
        // Ensure indexed fields are explicitly on the top-level row structure
        siteid: row.siteid || row.site_id || row.SiteID || row.SITEID || '',
        Sales_region: row.Sales_region || row.sales_region || row.Region || row.sales_zone || '',
        Owner_Name: row.Owner_Name || row.owner_name || row['Wakala Name'] || row.owner || '',
        MSISDN: row.MSISDN || row.msisdn || row.phone || '',
        servicing_status: row.servicing_status || row.status || row.Status || ''
      };
      rowStore.put(enrichedRow);
    });
  });
}

export async function getServicingRows(reportingMonth?: string): Promise<any[]> {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([ROW_STORE], 'readonly');
    const store = transaction.objectStore(ROW_STORE);
    const request = reportingMonth 
      ? store.index('reportingMonth').getAll(IDBKeyRange.only(reportingMonth))
      : store.getAll();

    request.onsuccess = () => {
      resolve(request.result || []);
    };

    request.onerror = () => {
      reject(request.error);
    };
  });
}

export async function getServicingColumns(reportingMonth: string): Promise<string[]> {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([COL_STORE], 'readonly');
    const store = transaction.objectStore(COL_STORE);
    const request = store.get(reportingMonth);

    request.onsuccess = () => {
      resolve(request.result ? request.result.columns : []);
    };

    request.onerror = () => {
      reject(request.error);
    };
  });
}

export async function clearMonthlyServicingData(reportingMonth: string): Promise<void> {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([ROW_STORE, COL_STORE], 'readwrite');
    const rowStore = transaction.objectStore(ROW_STORE);
    const colStore = transaction.objectStore(COL_STORE);

    colStore.delete(reportingMonth);

    const index = rowStore.index('reportingMonth');
    const range = IDBKeyRange.only(reportingMonth);
    const cursorRequest = index.openCursor(range);

    cursorRequest.onsuccess = (event) => {
      const cursor = (event.target as IDBRequest<IDBCursorWithValue | null>).result;
      if (cursor) {
        cursor.delete();
        cursor.continue();
      }
    };

    transaction.oncomplete = () => {
      resolve();
    };

    transaction.onerror = () => {
      reject(transaction.error);
    };
  });
}

export async function saveWeeklyServicingData(
  reportingWeek: string,
  reportingMonth: string,
  rows: any[],
  columns: string[]
): Promise<void> {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([WEEKLY_ROW_STORE, WEEKLY_COL_STORE], 'readwrite');
    const rowStore = transaction.objectStore(WEEKLY_ROW_STORE);
    const colStore = transaction.objectStore(WEEKLY_COL_STORE);

    transaction.onerror = () => {
      reject(transaction.error);
    };

    transaction.oncomplete = () => {
      resolve();
    };

    // Save columns
    colStore.put({
      reportingWeek,
      columns
    });

    // Save rows
    rows.forEach((row, index) => {
      const idVal = row._id || row.id || `row-${index}-${Date.now()}`;
      const enrichedRow = {
        ...row,
        reportingWeek,
        reportingMonth,
        compositeKey: `${reportingWeek}_${idVal}`,
        // Ensure indexed fields are explicitly on the top-level row structure
        siteid: row.siteid || row.site_id || row.SiteID || row.SITEID || '',
        Sales_region: row.Sales_region || row.sales_region || row.Region || row.sales_zone || '',
        Owner_Name: row.Owner_Name || row.owner_name || row['Wakala Name'] || row.owner || '',
        MSISDN: row.MSISDN || row.msisdn || row.phone || '',
        servicing_status: row.servicing_status || row.status || row.Status || ''
      };
      rowStore.put(enrichedRow);
    });
  });
}

export async function getWeeklyServicingRows(reportingWeek: string): Promise<any[]> {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([WEEKLY_ROW_STORE], 'readonly');
    const store = transaction.objectStore(WEEKLY_ROW_STORE);
    const index = store.index('reportingWeek');
    const request = index.getAll(IDBKeyRange.only(reportingWeek));

    request.onsuccess = () => {
      resolve(request.result || []);
    };

    request.onerror = () => {
      reject(request.error);
    };
  });
}

export async function getWeeklyServicingColumns(reportingWeek: string): Promise<string[]> {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([WEEKLY_COL_STORE], 'readonly');
    const store = transaction.objectStore(WEEKLY_COL_STORE);
    const request = store.get(reportingWeek);

    request.onsuccess = () => {
      resolve(request.result ? request.result.columns : []);
    };

    request.onerror = () => {
      reject(request.error);
    };
  });
}

export async function clearWeeklyServicingData(reportingWeek: string): Promise<void> {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([WEEKLY_ROW_STORE, WEEKLY_COL_STORE], 'readwrite');
    const rowStore = transaction.objectStore(WEEKLY_ROW_STORE);
    const colStore = transaction.objectStore(WEEKLY_COL_STORE);

    colStore.delete(reportingWeek);

    const index = rowStore.index('reportingWeek');
    const range = IDBKeyRange.only(reportingWeek);
    const cursorRequest = index.openCursor(range);

    cursorRequest.onsuccess = (event) => {
      const cursor = (event.target as IDBRequest<IDBCursorWithValue | null>).result;
      if (cursor) {
        cursor.delete();
        cursor.continue();
      }
    };

    transaction.oncomplete = () => {
      resolve();
    };

    transaction.onerror = () => {
      reject(transaction.error);
    };
  });
}

function getDedupeKey(r: any): string {
  const id = r['Transaction ID'] || r['transactionId'] || r._id || '';
  const msisdn = (r['Branch_msisdn'] || r['branch_msisdn'] || '').trim();
  if (id && msisdn) {
    return `${String(id).toLowerCase()}_${msisdn}`;
  }
  return r._id || `row_${Math.random()}`;
}

let migrationPromise: Promise<void> | null = null;

export async function migrateLocalStorageToIndexedDB(): Promise<void> {
  if (migrationPromise) return migrationPromise;
  migrationPromise = (async () => {
    try {
      const saved = localStorage.getItem('servicingDataRows');
      if (saved) {
        let rows: any[] = [];
        try {
          rows = JSON.parse(saved);
        } catch (e) {
          console.error('Failed to parse servicingDataRows from localStorage during migration:', e);
        }
        if (Array.isArray(rows) && rows.length > 0) {
          await saveDailyServicingData(rows);
        }
        localStorage.removeItem('servicingDataRows');
        console.log(`Migrated ${rows.length} rows from localStorage servicingDataRows into WakalaServicingDB IndexedDB.`);
      }
    } catch (err) {
      console.error('Failed migrating servicingDataRows to IndexedDB:', err);
    }
  })();
  return migrationPromise;
}

export async function getDailyServicingRows(): Promise<any[]> {
  await migrateLocalStorageToIndexedDB();
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([DAILY_ROW_STORE], 'readonly');
    const store = transaction.objectStore(DAILY_ROW_STORE);
    const request = store.getAll();

    request.onsuccess = () => {
      resolve(request.result || []);
    };

    request.onerror = () => {
      reject(request.error);
    };
  });
}

export async function saveDailyServicingData(newRows: any[]): Promise<void> {
  if (!Array.isArray(newRows) || newRows.length === 0) return;
  const db = await initDB();

  // Get existing rows first to deduplicate
  const existingRows = await new Promise<any[]>((resolve) => {
    const transaction = db.transaction([DAILY_ROW_STORE], 'readonly');
    const store = transaction.objectStore(DAILY_ROW_STORE);
    const request = store.getAll();
    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => resolve([]);
  });

  const existingKeys = new Set(existingRows.map(r => getDedupeKey(r)));

  const uniqueNewRows = newRows.filter(r => {
    const key = getDedupeKey(r);
    if (existingKeys.has(key)) return false;
    existingKeys.add(key);
    return true;
  });

  if (uniqueNewRows.length === 0) return;

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([DAILY_ROW_STORE], 'readwrite');
    const store = transaction.objectStore(DAILY_ROW_STORE);

    transaction.onerror = () => reject(transaction.error);
    transaction.oncomplete = () => {
      window.dispatchEvent(new CustomEvent('servicing-rows-updated'));
      resolve();
    };

    uniqueNewRows.forEach((row, index) => {
      const key = getDedupeKey(row);
      const enrichedRow = {
        ...row,
        _id: row._id || key || `row-${index}-${Date.now()}`,
        servicingDate: row.servicingDate || row['Servicing Date'] || row.Servicing_Date || row.date || '',
        Branch_msisdn: row.Branch_msisdn || row['Branch_msisdn'] || row.branch_msisdn || row.msisdn || ''
      };
      store.put(enrichedRow);
    });
  });
}

export async function appendDailyServicingData(newRows: any[]): Promise<void> {
  return saveDailyServicingData(newRows);
}

export async function clearDailyServicingData(): Promise<void> {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([DAILY_ROW_STORE], 'readwrite');
    const store = transaction.objectStore(DAILY_ROW_STORE);
    const request = store.clear();

    request.onsuccess = () => {
      localStorage.removeItem('servicingDataRows');
      window.dispatchEvent(new CustomEvent('servicing-rows-updated'));
      resolve();
    };

    request.onerror = () => reject(request.error);
  });
}

