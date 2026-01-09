/**
 * ============================================================================
 * INDEXEDDB WRAPPER - HIGH PERFORMANCE DATA STORAGE
 * ============================================================================
 * 
 * This module provides a high-performance IndexedDB wrapper for storing
 * application data with better performance than localStorage.
 * 
 * Features:
 * - Automatic database initialization
 * - Promise-based API
 * - Efficient bulk operations
 * - Delta sync support
 * - Automatic cleanup
 */

class AppDatabase {
  constructor() {
    this.dbName = 'IpostexDB';
    this.version = 1;
    this.db = null;
  }

  async init() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.version);
      
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        this.db = request.result;
        resolve(this.db);
      };
      
      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        
        // Create object stores for each sheet
        const sheets = [
          'RECORD', 'B2B', 'B2B2C', 'RATELIST', 'STAFF', 
          'ATTENDANCE', 'BRANCHES', 'MODE', 'CARRIER',
          'LOGS', 'LEDGER', 'CRM'
        ];
        
        sheets.forEach(sheetName => {
          if (!db.objectStoreNames.contains(sheetName)) {
            const store = db.createObjectStore(sheetName, { keyPath: 'id' });
            store.createIndex('TIME_STAMP', 'TIME_STAMP', { unique: false });
          }
        });
        
        // Create metadata store
        if (!db.objectStoreNames.contains('_metadata')) {
          db.createObjectStore('_metadata', { keyPath: 'key' });
        }
      };
    });
  }

  async setMetadata(key, value) {
    if (!this.db) throw new Error('Database not initialized');
    const transaction = this.db.transaction(['_metadata'], 'readwrite');
    const store = transaction.objectStore('_metadata');
    return new Promise((resolve, reject) => {
      const request = store.put({ key, value, timestamp: Date.now() });
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async getMetadata(key) {
    if (!this.db) throw new Error('Database not initialized');
    const transaction = this.db.transaction(['_metadata'], 'readonly');
    const store = transaction.objectStore('_metadata');
    return new Promise((resolve, reject) => {
      const request = store.get(key);
      request.onsuccess = () => resolve(request.result ? request.result.value : null);
      request.onerror = () => reject(request.error);
    });
  }

  async putSheet(sheetName, data) {
    if (!this.db || !data || typeof data !== 'object') return;
    
    const transaction = this.db.transaction([sheetName], 'readwrite');
    const store = transaction.objectStore(sheetName);
    
    const records = Object.keys(data).map(key => ({
      id: key,
      ...data[key]
    }));
    
    return new Promise((resolve, reject) => {
      let completed = 0;
      const total = records.length;
      
      if (total === 0) {
        resolve();
        return;
      }
      
      records.forEach(record => {
        const request = store.put(record);
        request.onsuccess = () => {
          completed++;
          if (completed === total) resolve();
        };
        request.onerror = () => reject(request.error);
      });
    });
  }

  async getSheet(sheetName) {
    if (!this.db) {
      console.warn(`[IndexedDB] Database not initialized for getSheet(${sheetName})`);
      return {};
    }
    const transaction = this.db.transaction([sheetName], 'readonly');
    const store = transaction.objectStore(sheetName);
    const request = store.getAll();
    
    return new Promise((resolve, reject) => {
      request.onsuccess = () => {
        const records = request.result;
        const result = {};
        records.forEach(record => {
          const { id, ...data } = record;
          result[id] = data;
        });
        resolve(result);
      };
      request.onerror = () => reject(request.error);
    });
  }

  async mergeSheet(sheetName, deltaData) {
    if (!this.db || !deltaData || typeof deltaData !== 'object') return;
    
    const transaction = this.db.transaction([sheetName], 'readwrite');
    const store = transaction.objectStore(sheetName);
    
    return new Promise((resolve, reject) => {
      const entries = Object.entries(deltaData);
      let completed = 0;
      const total = entries.length;
      
      if (total === 0) {
        resolve();
        return;
      }
      
      entries.forEach(([key, record]) => {
        const request = store.put({ id: key, ...record });
        request.onsuccess = () => {
          completed++;
          if (completed === total) resolve();
        };
        request.onerror = () => reject(request.error);
      });
    });
  }

  async clearSheet(sheetName) {
    if (!this.db) return;
    const transaction = this.db.transaction([sheetName], 'readwrite');
    const store = transaction.objectStore(sheetName);
    return new Promise((resolve, reject) => {
      const request = store.clear();
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async clearAll() {
    const sheets = [
      'RECORD', 'B2B', 'B2B2C', 'RATELIST', 'STAFF', 
      'ATTENDANCE', 'BRANCHES', 'MODE', 'CARRIER',
      'LOGS', 'LEDGER', 'CRM', '_metadata'
    ];
    
    for (const sheetName of sheets) {
      try {
        await this.clearSheet(sheetName);
      } catch (error) {
        console.warn(`Failed to clear ${sheetName}:`, error);
      }
    }
  }

  async getLastSyncTime() {
    if (!this.db) {
      console.warn('[IndexedDB] Database not initialized for getLastSyncTime');
      return null;
    }
    return await this.getMetadata('lastSyncTime');
  }

  async setLastSyncTime(timestamp) {
    if (!this.db) {
      console.warn('[IndexedDB] Database not initialized for setLastSyncTime');
      return;
    }
    await this.setMetadata('lastSyncTime', timestamp);
  }
}

// Global database instance
window.appDB = new AppDatabase();

// IndexedDB Manager for search functionality
class IndexedDBManager {
  constructor(appDB) {
    this.appDB = appDB;
  }

  async getAllStoreNames() {
    if (!this.appDB || !this.appDB.db) {
      throw new Error('Database not initialized');
    }
    
    const storeNames = [];
    for (let i = 0; i < this.appDB.db.objectStoreNames.length; i++) {
      const storeName = this.appDB.db.objectStoreNames[i];
      if (storeName !== '_metadata') {
        storeNames.push(storeName);
      }
    }
    return storeNames;
  }

  async getAll(storeName) {
    if (!this.appDB || !this.appDB.db) {
      throw new Error('Database not initialized');
    }
    
    const transaction = this.appDB.db.transaction([storeName], 'readonly');
    const store = transaction.objectStore(storeName);
    
    return new Promise((resolve, reject) => {
      const request = store.getAll();
      request.onsuccess = () => {
        const records = request.result || [];
        resolve(records);
      };
      request.onerror = () => reject(request.error);
    });
  }

  async count(storeName) {
    if (!this.appDB || !this.appDB.db) {
      throw new Error('Database not initialized');
    }
    
    const transaction = this.appDB.db.transaction([storeName], 'readonly');
    const store = transaction.objectStore(storeName);
    
    return new Promise((resolve, reject) => {
      const request = store.count();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }
}

// Global IndexedDBManager instance
window.IndexedDBManager = null;

// Initialize database immediately and on DOM ready
(async function initializeDB() {
  try {
    await window.appDB.init();
    console.log('[IndexedDB] Database initialized successfully');
    
    // Initialize IndexedDBManager
    window.IndexedDBManager = new IndexedDBManager(window.appDB);
    
    // Dispatch custom event to notify other scripts
    window.dispatchEvent(new CustomEvent('indexedDBReady'));
    // Show success notification if available
    if (window.showNotification) {
      window.showNotification('✅ Database ready for offline storage', 'success');
    }
  } catch (error) {
    console.error('[IndexedDB] Failed to initialize database:', error);
    // Show error notification if available
    if (window.showNotification) {
      window.showNotification(`⚠️ Database initialization failed: ${error.message}`, 'error');
    }
    // Set to null to indicate failure
    window.appDB = null;
    window.IndexedDBManager = null;
  }
})();

// Also try on DOMContentLoaded as fallback
document.addEventListener('DOMContentLoaded', async () => {
  if (!window.appDB || !window.appDB.db) {
    try {
      if (!window.appDB) window.appDB = new AppDatabase();
      await window.appDB.init();
      console.log('[IndexedDB] Database initialized on DOM ready');
      
      // Initialize IndexedDBManager
      window.IndexedDBManager = new IndexedDBManager(window.appDB);
      
      window.dispatchEvent(new CustomEvent('indexedDBReady'));
    } catch (error) {
      console.error('[IndexedDB] Fallback initialization failed:', error);
      window.appDB = null;
      window.IndexedDBManager = null;
    }
  }
});