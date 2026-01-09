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
    const transaction = this.db.transaction(['_metadata'], 'readwrite');
    const store = transaction.objectStore('_metadata');
    await store.put({ key, value, timestamp: Date.now() });
  }

  async getMetadata(key) {
    const transaction = this.db.transaction(['_metadata'], 'readonly');
    const store = transaction.objectStore('_metadata');
    const result = await store.get(key);
    return result ? result.value : null;
  }

  async putSheet(sheetName, data) {
    if (!data || typeof data !== 'object') return;
    
    const transaction = this.db.transaction([sheetName], 'readwrite');
    const store = transaction.objectStore(sheetName);
    
    // Convert object to array of records with proper IDs
    const records = Object.keys(data).map(key => ({
      id: key,
      ...data[key]
    }));
    
    // Bulk insert
    for (const record of records) {
      await store.put(record);
    }
  }

  async getSheet(sheetName) {
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
    if (!deltaData || typeof deltaData !== 'object') return;
    
    const transaction = this.db.transaction([sheetName], 'readwrite');
    const store = transaction.objectStore(sheetName);
    
    // Merge delta data
    for (const [key, record] of Object.entries(deltaData)) {
      await store.put({ id: key, ...record });
    }
  }

  async clearSheet(sheetName) {
    const transaction = this.db.transaction([sheetName], 'readwrite');
    const store = transaction.objectStore(sheetName);
    await store.clear();
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
    return await this.getMetadata('lastSyncTime');
  }

  async setLastSyncTime(timestamp) {
    await this.setMetadata('lastSyncTime', timestamp);
  }
}

// Global database instance
window.appDB = new AppDatabase();

// Initialize database on load
document.addEventListener('DOMContentLoaded', async () => {
  try {
    await window.appDB.init();
    console.log('[IndexedDB] Database initialized successfully');
  } catch (error) {
    console.error('[IndexedDB] Failed to initialize database:', error);
    // Fallback to localStorage if IndexedDB fails
    window.appDB = null;
  }
});