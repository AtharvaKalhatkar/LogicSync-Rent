import axios from 'axios';

// Helper: Secure browser-compatible UUID generator (no extra npm packages required)
const generateUUID = () => {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
};

// Default Configurations (Empty by default for a white-label clean slate)
const DEFAULT_SETTINGS = {
  buildingName: "",
  ownerName: "",
  ownerPhone: "",
  payeeName: "",
  upiId: "",
  roomRent: 5000,
  unitPrice: 10.0,
  effectiveFrom: new Date().toISOString().split('T')[0]
};

const SEED_TENANTS = [];

const SEED_READINGS = [];

// Initialize LocalStorage Database if empty
const initializeLocalStorageDB = () => {
  if (!localStorage.getItem('rm_storage_mode')) {
    localStorage.setItem('rm_storage_mode', 'local');
  }
  if (!localStorage.getItem('rm_server_url')) {
    localStorage.setItem('rm_server_url', 'http://localhost:8081');
  }
  if (!localStorage.getItem('rm_settings')) {
    localStorage.setItem('rm_settings', JSON.stringify(DEFAULT_SETTINGS));
  }
  if (!localStorage.getItem('rm_tenants')) {
    localStorage.setItem('rm_tenants', JSON.stringify(SEED_TENANTS));
  }
  if (!localStorage.getItem('rm_readings')) {
    localStorage.setItem('rm_readings', JSON.stringify(SEED_READINGS));
  }
  if (!localStorage.getItem('rm_invoices')) {
    localStorage.setItem('rm_invoices', JSON.stringify([]));
  }
  if (!localStorage.getItem('rm_onboarded')) {
    localStorage.setItem('rm_onboarded', 'false');
  }
};

initializeLocalStorageDB();

// Core Services
export const storageService = {
  getMode: () => localStorage.getItem('rm_storage_mode') || 'local',
  setMode: (mode) => localStorage.setItem('rm_storage_mode', mode),
  
  getServerUrl: () => localStorage.getItem('rm_server_url') || 'http://localhost:8081',
  setServerUrl: (url) => {
    let cleanUrl = url.trim();
    if (cleanUrl.endsWith('/')) {
      cleanUrl = cleanUrl.slice(0, -1);
    }
    localStorage.setItem('rm_server_url', cleanUrl);
  },

  // Axios Client Generator with dynamic base URL
  getApiClient: () => {
    const url = localStorage.getItem('rm_server_url') || 'http://localhost:8081';
    return axios.create({ baseURL: `${url}/api` });
  }
};

// settings operations
export const settingsService = {
  get: async () => {
    if (storageService.getMode() === 'local') {
      return JSON.parse(localStorage.getItem('rm_settings'));
    }
    // Remote
    try {
      const api = storageService.getApiClient();
      // Note: Pricing policy is global in Spring Boot. We fetch the latest active.
      const res = await api.get('/pricing');
      const latest = res.data[0] || {};
      const local = JSON.parse(localStorage.getItem('rm_settings'));
      return {
        ...local,
        roomRent: latest.roomRent || local.roomRent,
        unitPrice: latest.unitPrice || local.unitPrice,
        effectiveFrom: latest.effectiveFrom || local.effectiveFrom
      };
    } catch (err) {
      console.warn("Backend unavailable. Fallback to local settings.");
      return JSON.parse(localStorage.getItem('rm_settings'));
    }
  },

  save: async (settings) => {
    // Always save locally first as config details (owner/building info) are stored client side for universality!
    localStorage.setItem('rm_settings', JSON.stringify(settings));
    
    if (storageService.getMode() === 'local') {
      return settings;
    }
    // Remote: Sync pricing policy to spring boot backend
    try {
      const api = storageService.getApiClient();
      await api.post('/pricing', {
        roomRent: parseFloat(settings.roomRent),
        unitPrice: parseFloat(settings.unitPrice),
        effectiveFrom: settings.effectiveFrom || new Date().toISOString().split('T')[0]
      });
      return settings;
    } catch (err) {
      console.error("Failed to sync settings with backend server", err);
      throw err;
    }
  }
};

// tenant operations
export const tenantService = {
  getAll: async () => {
    if (storageService.getMode() === 'local') {
      return JSON.parse(localStorage.getItem('rm_tenants'));
    }
    // Remote
    const api = storageService.getApiClient();
    const res = await api.get('/tenants');
    return res.data;
  },

  add: async (tenant) => {
    if (storageService.getMode() === 'local') {
      const tenants = JSON.parse(localStorage.getItem('rm_tenants'));
      const newTenant = {
        ...tenant,
        id: generateUUID(),
        active: true
      };
      
      // Duplicate checks
      const isDuplicateRoom = tenants.some(t => t.active && t.roomNo === tenant.roomNo);
      if (isDuplicateRoom) {
        throw new Error("Active room number already registered!");
      }

      tenants.push(newTenant);
      localStorage.setItem('rm_tenants', JSON.stringify(tenants));
      return newTenant;
    }
    // Remote
    const api = storageService.getApiClient();
    const res = await api.post('/tenants', { ...tenant, active: true });
    return res.data;
  },

  toggleActive: async (id, status) => {
    if (storageService.getMode() === 'local') {
      const tenants = JSON.parse(localStorage.getItem('rm_tenants'));
      const updated = tenants.map(t => t.id === id ? { ...t, active: status } : t);
      localStorage.setItem('rm_tenants', JSON.stringify(updated));
      return updated.find(t => t.id === id);
    }
    // Remote
    const api = storageService.getApiClient();
    // Assuming backend has a soft delete or update tenant endpoint
    const res = await api.post(`/tenants`, { id, active: status });
    return res.data;
  },

  delete: async (id) => {
    if (storageService.getMode() === 'local') {
      const tenants = JSON.parse(localStorage.getItem('rm_tenants'));
      const filtered = tenants.filter(t => t.id !== id);
      localStorage.setItem('rm_tenants', JSON.stringify(filtered));

      // Cascade delete all invoices associated with this deleted tenant
      const invoices = JSON.parse(localStorage.getItem('rm_invoices')) || [];
      const filteredInvoices = invoices.filter(inv => inv.tenantId !== id);
      localStorage.setItem('rm_invoices', JSON.stringify(filteredInvoices));

      return true;
    }
    // Remote
    const api = storageService.getApiClient();
    await api.delete(`/tenants/${id}`);
    return true;
  }
};

// meter readings operations
export const meterService = {
  getLatestForRoom: async (roomNo) => {
    if (storageService.getMode() === 'local') {
      const readings = JSON.parse(localStorage.getItem('rm_readings'));
      const roomReadings = readings
        .filter(r => r.roomNo === roomNo)
        .sort((a, b) => new Date(b.readingMonth) - new Date(a.readingMonth));
      
      return roomReadings.length > 0 ? roomReadings[0].currentReading : 0;
    }
    // Remote
    try {
      const api = storageService.getApiClient();
      const res = await api.get(`/meter-readings/latest/${roomNo}`);
      return res.data || 0;
    } catch (err) {
      return 0;
    }
  },

  save: async (roomNo, previousReading, currentReading, month) => {
    const readingMonth = `${month}-01`; // format as date standard
    
    if (storageService.getMode() === 'local') {
      const readings = JSON.parse(localStorage.getItem('rm_readings'));
      
      // Prevent duplicates for the same month and room
      const filtered = readings.filter(r => !(r.roomNo === roomNo && r.readingMonth === readingMonth));
      
      const newReading = {
        roomNo,
        readingMonth,
        previousReading: parseFloat(previousReading),
        currentReading: parseFloat(currentReading),
        unitsConsumed: parseFloat(currentReading) - parseFloat(previousReading)
      };

      if (newReading.unitsConsumed < 0) {
        throw new Error("Current reading cannot be less than previous reading.");
      }

      filtered.push(newReading);
      localStorage.setItem('rm_readings', JSON.stringify(filtered));
      return newReading;
    }
    // Remote
    const api = storageService.getApiClient();
    const res = await api.post(`/meter-readings/room/${roomNo}`, {
      readingMonth,
      previousReading: parseFloat(previousReading),
      currentReading: parseFloat(currentReading)
    });
    return res.data;
  }
};

// invoice calculations and operations
export const invoiceService = {
  getByMonth: async (month) => {
    if (storageService.getMode() === 'local') {
      const invoices = JSON.parse(localStorage.getItem('rm_invoices'));
      // Match by month in YYYY-MM
      return invoices.filter(inv => inv.billingMonth.startsWith(month));
    }
    // Remote
    const api = storageService.getApiClient();
    const res = await api.get(`/invoices/month/${month}`);
    return res.data;
  },

  generateBulk: async (month, totalCommonUnits) => {
    if (storageService.getMode() === 'local') {
      const tenants = JSON.parse(localStorage.getItem('rm_tenants')).filter(t => t.active);
      const readings = JSON.parse(localStorage.getItem('rm_readings'));
      const settings = JSON.parse(localStorage.getItem('rm_settings'));
      const invoices = JSON.parse(localStorage.getItem('rm_invoices'));

      if (tenants.length === 0) {
        throw new Error("No active tenants found.");
      }

      const commonUnitsShare = parseFloat(totalCommonUnits) / tenants.length;
      const billingMonthStr = `${month}-01`;

      let success = 0;
      let skipped = 0;
      
      // Prepare invoice array
      const updatedInvoices = [...invoices];

      tenants.forEach(tenant => {
        // Find reading for this room and month
        const reading = readings.find(r => r.roomNo === tenant.roomNo && r.readingMonth === billingMonthStr);
        
        if (!reading) {
          skipped++;
          return;
        }

        // Check if invoice already exists for this tenant & month
        const existingIdx = updatedInvoices.findIndex(inv => inv.tenantId === tenant.id && inv.billingMonth === billingMonthStr);

        const unitsConsumed = reading.unitsConsumed;
        const electricityCharge = unitsConsumed * parseFloat(settings.unitPrice);
        const commonAreaCharge = commonUnitsShare * parseFloat(settings.unitPrice);
        const totalAmount = parseFloat(settings.roomRent) + electricityCharge + commonAreaCharge;

        const newInvoice = {
          id: generateUUID(),
          tenantId: tenant.id,
          tenantName: tenant.name,
          roomNo: tenant.roomNo,
          billingMonth: billingMonthStr,
          createdAt: new Date().toISOString(),
          status: "GENERATED",
          roomRent: parseFloat(settings.roomRent),
          unitPrice: parseFloat(settings.unitPrice),
          unitsConsumed,
          electricityCharge,
          commonAreaCharge,
          previousReading: reading.previousReading,
          currentReading: reading.currentReading,
          totalAmount
        };

        if (existingIdx > -1) {
          // Overwrite existing invoice for updates
          updatedInvoices[existingIdx] = newInvoice;
        } else {
          updatedInvoices.push(newInvoice);
        }
        success++;
      });

      localStorage.setItem('rm_invoices', JSON.stringify(updatedInvoices));
      return `Bulk generation complete: ${success} success, ${skipped} skipped.`;
    }
    // Remote
    const api = storageService.getApiClient();
    const res = await api.post(`/invoices/bulk?month=${month}&totalCommonUnits=${totalCommonUnits}`);
    return res.data;
  },

  delete: async (id) => {
    if (storageService.getMode() === 'local') {
      const invoices = JSON.parse(localStorage.getItem('rm_invoices'));
      const filtered = invoices.filter(inv => inv.id !== id);
      localStorage.setItem('rm_invoices', JSON.stringify(filtered));
      return true;
    }
    // Remote: Spring Boot backend doesn't have delete invoice in typical controller, but we support it
    try {
      const api = storageService.getApiClient();
      await api.delete(`/invoices/${id}`);
      return true;
    } catch (err) {
      console.warn("Delete remote invoice failed, proceeding", err);
      return false;
    }
  },

  toggleStatus: async (id, status) => {
    if (storageService.getMode() === 'local') {
      const invoices = JSON.parse(localStorage.getItem('rm_invoices'));
      const updated = invoices.map(inv => inv.id === id ? { ...inv, status: status } : inv);
      localStorage.setItem('rm_invoices', JSON.stringify(updated));
      return updated.find(inv => inv.id === id);
    }
    // Remote: Spring Boot might not have direct payment status toggle, but we support it
    try {
      const api = storageService.getApiClient();
      const res = await api.post(`/invoices/${id}/status`, { status });
      return res.data;
    } catch (err) {
      console.warn("Remote status update unavailable. Updating locally as backup.");
      // Fallback
      const invoices = JSON.parse(localStorage.getItem('rm_invoices'));
      const updated = invoices.map(inv => inv.id === id ? { ...inv, status: status } : inv);
      localStorage.setItem('rm_invoices', JSON.stringify(updated));
      return updated.find(inv => inv.id === id);
    }
  }
};

// backup and restore operations for local universality
export const backupService = {
  export: () => {
    const data = {
      rm_settings: JSON.parse(localStorage.getItem('rm_settings')),
      rm_tenants: JSON.parse(localStorage.getItem('rm_tenants')),
      rm_readings: JSON.parse(localStorage.getItem('rm_readings')),
      rm_invoices: JSON.parse(localStorage.getItem('rm_invoices')),
      exportedAt: new Date().toISOString(),
      app: "LogicSync Rent"
    };
    return JSON.stringify(data, null, 2);
  },

  import: (jsonString) => {
    try {
      const data = JSON.parse(jsonString);
      if (!data.rm_settings || !data.rm_tenants || !data.rm_readings || !data.rm_invoices) {
        throw new Error("Invalid backup file: missing core tables.");
      }
      localStorage.setItem('rm_settings', JSON.stringify(data.rm_settings));
      localStorage.setItem('rm_tenants', JSON.stringify(data.rm_tenants));
      localStorage.setItem('rm_readings', JSON.stringify(data.rm_readings));
      localStorage.setItem('rm_invoices', JSON.stringify(data.rm_invoices));
      return true;
    } catch (err) {
      console.error("Backup import error", err);
      throw new Error(err.message || "Failed to parse backup JSON file.");
    }
  }
};

