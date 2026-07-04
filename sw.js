// ============================================================================
// SERVICE WORKER (sw.js) — Background Sync & Periodic Polling
// ============================================================================

const DB_NAME = 'WEBIndexedDB';
const DB_VERSION = 11;

const sheetKeys = {
  'ORDERS':        'REFERENCE',
  'B2B':           'CODE',
  'B2B2C':         'UID',
  'RATES':         'UID',
  'STAFF':         'STAFF_CODE',
  'ATTENDANCE':    'ATTENDANCE_ID',
  'BRANCHES':      'BRANCH_CODE',
  'MODES':         'SHORT',
  'CARRIERS':      'COMPANY_CODE',
  'MULTIBOX':      'MB_UID',
  'PRODUCTS':      'PD_UID',
  'UPLOADS':       'UPLOAD_UID',
  'CALC_HISTORY':  'CALC_UID',
  'NOTIFICATIONS': 'NOTIF_ID',
  'HOLIDAYS':      'HOLIDAY_ID',
  'LEDGER':        'TXN_ID',
  'SHIPMENTS':     'REFERENCE',
  'HEADER':        'DOX_KEY',
};

// ----------------------------------------------------------------------------
// LIFECYCLE MANAGEMENT
// ----------------------------------------------------------------------------

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

// ----------------------------------------------------------------------------
// INDEXEDDB ENGINE
// ----------------------------------------------------------------------------

function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function getMetadata(key) {
  return openDB().then(db => {
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(['_metadata'], 'readonly');
      const store = transaction.objectStore('_metadata');
      const req = store.get(key);
      req.onsuccess = () => resolve(req.result ? req.result.value : null);
      req.onerror = () => reject(req.error);
    });
  }).catch(() => null);
}

function setMetadata(key, value) {
  return openDB().then(db => {
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(['_metadata'], 'readwrite');
      const store = transaction.objectStore('_metadata');
      const req = store.put({ key, value });
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }).catch(() => {});
}

async function bulkMerge(deltaMap) {
  const db = await openDB();
  const storeNames = Object.keys(deltaMap).filter(name => Object.keys(deltaMap[name]).length > 0);
  if (storeNames.length === 0) return;

  const transaction = db.transaction(storeNames, 'readwrite');
  
  const promises = storeNames.map(storeName => {
    const store = transaction.objectStore(storeName);
    const keyPath = sheetKeys[storeName] || 'id';
    const records = Object.values(deltaMap[storeName]);
    
    return Promise.all(records.map(record => {
      return new Promise((resolve, reject) => {
        const recordToStore = { ...record };
        if (!recordToStore[keyPath]) {
          recordToStore[keyPath] = record.id || Math.random().toString(36).substring(2);
        }
        const req = store.put(recordToStore);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      });
    }));
  });
  
  await Promise.all(promises);
}

// ----------------------------------------------------------------------------
// STREAM SYNC ENGINE
// ----------------------------------------------------------------------------

let _syncInProgress = false;

async function runStreamSync(completedLayers, token, baseUrl) {
  if (_syncInProgress) return;
  _syncInProgress = true;
  
  console.log('[SW] Starting streaming sync...');
  
  // Cache token and URL in IndexedDB so periodic sync can authenticate
  await setMetadata('session_token', token);
  await setMetadata('base_url', baseUrl);

  try {
    const response = await fetch(`${baseUrl}/api/sync/stream`, {
      method: 'POST',
      mode: 'cors',
      credentials: 'omit',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ completed_layers: completedLayers })
    });

    if (!response.ok) throw new Error(`HTTP error: ${response.status}`);
    if (!response.body) throw new Error('ReadableStream not supported');

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let recordCount = 0;
    
    let batchMap = {};
    let bufferedCount = 0;

    const flushBatch = async () => {
      if (bufferedCount === 0) return;
      await bulkMerge(batchMap);
      batchMap = {};
      bufferedCount = 0;
      
      // Notify active tabs
      const clients = await self.clients.matchAll();
      clients.forEach(c => c.postMessage({ type: 'sync_progress', loaded: recordCount }));
    };

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop(); // Keep partial line

      for (const line of lines) {
        if (!line.trim()) continue;
        
        const chunk = JSON.parse(line);
        
        if (chunk.type === 'meta') {
          // Store sync flags
          await setMetadata('syncFlags', chunk.flags);
        } else if (chunk.type === 'data') {
          const col = chunk.sheet;
          const rec = chunk.record;
          const keyPath = sheetKeys[col] || 'id';
          const key = rec[keyPath];
          
          if (!batchMap[col]) batchMap[col] = {};
          batchMap[col][key] = rec;
          bufferedCount++;
          recordCount++;
          
          if (bufferedCount >= 100) {
            await flushBatch();
          }
        } else if (chunk.type === 'layer_done') {
          await flushBatch();
          const layer = chunk.layer;
          await setMetadata(`bg_${layer}_done`, true);
          
          const clients = await self.clients.matchAll();
          clients.forEach(c => c.postMessage({ type: 'layer_done', layer }));
        }
      }
    }
    
    // Final flush
    await flushBatch();
    await setMetadata('lastSyncTime', Date.now());
    
    const clients = await self.clients.matchAll();
    clients.forEach(c => c.postMessage({ type: 'sync_complete', count: recordCount }));
    console.log(`[SW] Streaming sync successfully finished. Synced ${recordCount} records.`);

  } catch (error) {
    console.error('[SW] Streaming sync failed:', error);
    const clients = await self.clients.matchAll();
    clients.forEach(c => c.postMessage({ type: 'sync_failed', message: error.message }));
  } finally {
    _syncInProgress = false;
  }
}

// ----------------------------------------------------------------------------
// PERIODIC BACKGROUND DELTA POLL (5-MIN SAFETY NET)
// ----------------------------------------------------------------------------

async function checkAndPullDeltas() {
  if (_syncInProgress) return;
  
  const token = await getMetadata('session_token');
  const baseUrl = await getMetadata('base_url');
  const lastSyncTime = await getMetadata('lastSyncTime');
  
  if (!token || !baseUrl || !lastSyncTime) return;
  
  console.log('[SW] Running periodic background delta check...');
  
  try {
    // 1. Fetch missed events
    const res = await fetch(`${baseUrl}/api/fetchEvents?since_ms=${lastSyncTime}`, {
      method: 'GET',
      mode: 'cors',
      credentials: 'omit',
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    if (!res.ok) return;
    
    const json = await res.json();
    const events = json.data || [];
    if (events.length === 0) {
      await setMetadata('lastSyncTime', Date.now());
      return;
    }
    
    // 2. Parse upserts and deletes
    const upserts = {};
    const deletes = {};
    for (const ev of events) {
      const { COLLECTION: col, ACTION: action, PB_ID: pb_id } = ev;
      if (!col || !pb_id) continue;
      if (action === 'create' || action === 'update') {
        (upserts[col] = upserts[col] || []).push(pb_id);
      } else if (action === 'delete') {
        (deletes[col] = deletes[col] || []).push(pb_id);
      }
    }
    
    const deltaMap = {};
    
    // 3. Fetch upserted records in bulk
    if (Object.keys(upserts).length > 0) {
      for (const [col, ids] of Object.entries(upserts)) {
        const recordsRes = await fetch(`${baseUrl}/api/getRecords`, {
          method: 'POST',
          mode: 'cors',
          credentials: 'omit',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({ collection: col, ids })
        });
        if (recordsRes.ok) {
          const recordsJson = await recordsRes.json();
          if (recordsJson.data) {
            deltaMap[col] = recordsJson.data;
          }
        }
      }
    }
    // 4. Handle deletes
    if (Object.keys(deletes).length > 0) {
      const db = await openDB();
      for (const [col, pb_ids] of Object.entries(deletes)) {
        const keyPath = sheetKeys[col] || 'id';
        const transaction = db.transaction([col], 'readwrite');
        const store = transaction.objectStore(col);
        
        for (const pb_id of pb_ids) {
          // Secondary index lookup: Service Worker gets record by PB ID from IndexedDB
          // (best effort delete using ID)
          store.delete(pb_id);
        }
      }
    }
    
    // 5. Commit delta updates
    if (Object.keys(deltaMap).length > 0) {
      await bulkMerge(deltaMap);
    }
    
    // 6. Fetch background notifications and trigger native OS push alerts
    const notifRes = await fetch(`${baseUrl}/api/fetchNotifications`, {
      method: 'GET',
      mode: 'cors',
      credentials: 'omit',
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    if (notifRes.ok) {
      const notifJson = await notifRes.json();
      const serverNotifs = notifJson.data || {};
      
      const db = await openDB();
      const transaction = db.transaction(['NOTIFICATIONS'], 'readonly');
      const store = transaction.objectStore('NOTIFICATIONS');
      
      const newNotifs = {};
      for (const [id, notif] of Object.entries(serverNotifs)) {
        const isUnread = !notif.IS_READ;
        if (isUnread) {
          const existing = await new Promise((resolve) => {
            const req = store.get(id);
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => resolve(null);
          });
          
          if (!existing) {
            newNotifs[id] = notif;
            self.registration.showNotification(`Genie Update (${notif.LEVEL || 'INFO'})`, {
              body: notif.MESSAGE || 'You have a new notification.',
              tag: id,
              data: { url: '/' }
            });
          }
        }
      }
      
      if (Object.keys(newNotifs).length > 0) {
        await bulkMerge({ 'NOTIFICATIONS': newNotifs });
      }
    }
    
    await setMetadata('lastSyncTime', Date.now());
    console.log('[SW] Periodic background delta check complete.');
    
    // Broadcast data loaded/refreshed to tabs
    const clients = await self.clients.matchAll();
    clients.forEach(c => c.postMessage({ type: 'bg_delta_complete' }));

  } catch (error) {
    console.warn('[SW] Periodic background delta check failed:', error.message);
  }
}

// Start periodic safety ticker inside Service Worker
setInterval(checkAndPullDeltas, 5 * 60 * 1000);

// ----------------------------------------------------------------------------
// NATIVE OS NOTIFICATION CLICK HANDLER
// ----------------------------------------------------------------------------

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // Focus existing open tab if available
      for (const client of clientList) {
        const url = new URL(client.url);
        if (url.origin === self.location.origin && 'focus' in client) {
          return client.focus();
        }
      }
      // Otherwise, open a new window
      if (self.clients.openWindow) {
        return self.clients.openWindow('/');
      }
    })
  );
});

// ----------------------------------------------------------------------------
// MESSAGE CLIENT DISPATCHER
// ----------------------------------------------------------------------------

self.addEventListener('message', (event) => {
  const { type, completed_layers, token, base, api_url } = event.data || {};
  if (type === 'start_sync') {
    const url = base || api_url;
    runStreamSync(completed_layers, token, url);
  }
});
