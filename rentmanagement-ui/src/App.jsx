import React, { useState, useEffect } from 'react';
import { jsPDF } from 'jspdf';
import { 
  Download, Users, Zap, Plus, FileText, ChevronRight, 
  LayoutDashboard, X, Loader2, Settings, Eye, Phone,
  CreditCard, Share2, Server, Database, Smartphone, Check, Trash2, Calendar
} from 'lucide-react';
import { 
  storageService, settingsService, tenantService, 
  meterService, invoiceService, backupService
} from './storage';

const App = () => {
  // Navigation
  const [activeTab, setActiveTab] = useState("dashboard"); // dashboard, tenants, readings, invoices, settings
  
  // Onboarding Wizard status state
  const [isOnboarded, setIsOnboarded] = useState(localStorage.getItem('rm_onboarded') === 'true');
  
  // Application Data States
  const [tenants, setTenants] = useState([]);
  const [monthlyInvoices, setMonthlyInvoices] = useState([]);
  const [month, setMonth] = useState("2026-01");
  const [commonUnits, setCommonUnits] = useState(50);
  const [loading, setLoading] = useState(false);
  const [storageMode, setStorageMode] = useState(storageService.getMode());
  const [serverUrl, setServerUrl] = useState(storageService.getServerUrl());

  // Modals & Panels State
  const [showTenantModal, setShowTenantModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [selectedTenant, setSelectedTenant] = useState(null);
  const [selectedInvoice, setSelectedInvoice] = useState(null);

  // Form States
  const [readings, setReadings] = useState({ prev: 0, curr: '' });
  const [pricingSettings, setPricingSettings] = useState({
    buildingName: '',
    ownerName: '',
    ownerPhone: '',
    payeeName: '',
    upiId: '',
    roomRent: '',
    unitPrice: '',
    effectiveFrom: ''
  });
  const [newTenant, setNewTenant] = useState({ 
    name: '', roomNo: '', phoneNo: '', meterId: '', 
    aadharNo: '', email: '', joiningDate: new Date().toISOString().split('T')[0] 
  });

  // Load app details
  useEffect(() => {
    loadSettings();
  }, []);

  useEffect(() => { 
    loadTenants(); 
    fetchMonthlyHistory();
  }, [month, storageMode]);

  const loadSettings = async () => {
    try {
      const config = await settingsService.get();
      setPricingSettings(config);
    } catch (err) {
      console.error("Failed to load settings configuration.");
    }
  };

  const loadTenants = async () => {
    setLoading(true);
    try {
      const data = await tenantService.getAll();
      setTenants(data);
    } catch (err) {
      console.error("Failed to load tenants");
      setTenants([]);
    } finally {
      setLoading(false);
    }
  };

  const fetchMonthlyHistory = async () => {
    try {
      const data = await invoiceService.getByMonth(month);
      setMonthlyInvoices(data);
    } catch (err) {
      setMonthlyInvoices([]);
    }
  };

  // PWA Mode configuration updates
  const handleToggleStorageMode = async (mode) => {
    storageService.setMode(mode);
    setStorageMode(mode);
    // Reload components
    setTimeout(() => {
      loadSettings();
      loadTenants();
      fetchMonthlyHistory();
    }, 100);
  };

  const handleUpdateServerUrl = () => {
    storageService.setServerUrl(serverUrl);
    alert("Server base URL updated!");
    handleToggleStorageMode('server');
  };

  const handleAddTenant = async () => {
    if (!newTenant.name || !newTenant.roomNo || !newTenant.phoneNo) {
      alert("Name, Room No, and Phone are required fields.");
      return;
    }
    try {
      await tenantService.add(newTenant);
      alert("Tenant Registered Successfully!");
      setShowTenantModal(false);
      setNewTenant({
        name: '', roomNo: '', phoneNo: '', meterId: '', 
        aadharNo: '', email: '', joiningDate: new Date().toISOString().split('T')[0]
      });
      loadTenants();
    } catch (err) {
      alert(err.message || "Error adding tenant. Check for duplicate active room.");
    }
  };

  const handleToggleTenant = async (id, status) => {
    try {
      await tenantService.toggleActive(id, status);
      loadTenants();
    } catch (err) {
      alert("Failed to change tenant status.");
    }
  };

  const handleDeleteTenant = async (id) => {
    if (!window.confirm("Are you sure you want to delete this tenant completely?")) return;
    try {
      await tenantService.delete(id);
      await loadTenants();
      await fetchMonthlyHistory();
    } catch (err) {
      alert("Failed to delete tenant.");
    }
  };

  const openReadingModal = async (tenant) => {
    setSelectedTenant(tenant);
    setLoading(true);
    try {
      const latestReading = await meterService.getLatestForRoom(tenant.roomNo);
      setReadings({ prev: latestReading || 0, curr: '' });
    } catch (err) {
      setReadings({ prev: 0, curr: '' });
    } finally {
      setLoading(false);
    }
  };

  const handleSaveReading = async () => {
    if (!readings.curr || isNaN(readings.curr)) {
      alert("Please enter a valid current meter reading.");
      return;
    }
    if (parseFloat(readings.curr) < parseFloat(readings.prev)) {
      alert("Current reading cannot be lower than the previous reading.");
      return;
    }
    try {
      await meterService.save(selectedTenant.roomNo, readings.prev, readings.curr, month);
      alert("Meter Reading Saved Successfully!");
      setSelectedTenant(null);
      fetchMonthlyHistory();
    } catch (err) {
      alert(err.message || "Error saving reading.");
    }
  };

  const triggerBulkInvoicing = async () => {
    if (!commonUnits || isNaN(commonUnits)) {
      alert("Please enter valid common area units.");
      return;
    }
    setLoading(true);
    try {
      const result = await invoiceService.generateBulk(month, commonUnits);
      alert(result);
      fetchMonthlyHistory();
      setActiveTab("invoices"); // Shift tab directly to show them
    } catch (err) {
      alert(err.message || "Bulk generation failed.");
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteInvoice = async (id) => {
    if (!window.confirm("Are you sure you want to delete this invoice?")) return;
    try {
      await invoiceService.delete(id);
      fetchMonthlyHistory();
    } catch (err) {
      alert("Failed to delete invoice.");
    }
  };

  const handleSaveSettings = async () => {
    try {
      await settingsService.save(pricingSettings);
      alert("App Settings & Policies Saved Successfully!");
      setShowSettingsModal(false);
    } catch (err) {
      alert("Failed to save settings. Please verify server connection if in Server Mode.");
    }
  };

  // UPI Payment Details
  const getUpiUrl = (invoice) => {
    const amount = parseFloat(invoice.totalAmount).toFixed(2);
    const payee = encodeURIComponent(pricingSettings.payeeName || "Landlord Name");
    const upi = pricingSettings.upiId || "landlord@upi";
    return `upi://pay?pa=${upi}&pn=${payee}&am=${amount}&cu=INR`;
  };

  // Smart country-code formatter for direct WhatsApp click-to-chat
  const formatPhoneForWhatsApp = (rawPhone) => {
    let cleaned = (rawPhone || "").replace(/\D/g, "");
    if (cleaned.length === 10) {
      cleaned = "91" + cleaned; // Prepend India country code (91) by default
    }
    return cleaned;
  };

  // WhatsApp bill message generator
  const shareInvoiceWhatsApp = (inv) => {
    const dateObj = new Date(inv.billingMonth);
    const monthName = dateObj.toLocaleString('default', { month: 'long', year: 'numeric' });
    const building = (pricingSettings.buildingName || "MY BUILDING").toUpperCase();
    const upiUri = getUpiUrl(inv);

    const message = `*${building}* 🏢
------------------------------------
*INVOICE DETAILS*
• *Tenant*: ${inv.tenantName}
• *Room No*: Room ${inv.roomNo}
• *Billing Month*: ${monthName}
------------------------------------
*BILL BREAKDOWN*
1. *Monthly Room Rent*: ₹${parseFloat(inv.roomRent).toFixed(2)}
2. *Electricity (Personal)*: ₹${parseFloat(inv.electricityCharge).toFixed(2)}
   (_Readings: ${inv.previousReading} ➔ ${inv.currentReading} = ${inv.unitsConsumed} Units_)
3. *Common Electricity*: ₹${parseFloat(inv.commonAreaCharge).toFixed(2)}
------------------------------------
💰 *TOTAL AMOUNT DUE: ₹${parseFloat(inv.totalAmount).toFixed(2)}*
------------------------------------
Please tap the link below to pay directly via GPay/PhonePe/Paytm:
${upiUri}

Owner: ${pricingSettings.ownerName}
Contact: ${pricingSettings.ownerPhone}
Thank you! 🙏`;

    const cleanedPhone = formatPhoneForWhatsApp(tenants.find(t => t.id === inv.tenantId)?.phoneNo || "");
    const waUrl = `https://wa.me/${cleanedPhone}?text=${encodeURIComponent(message)}`;
    window.open(waUrl, '_blank');
  };

  // Offline PDF Generator
  const generatePDF = (inv) => {
    const doc = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4'
    });

    const building = (pricingSettings.buildingName || "MY BUILDING").toUpperCase();
    const owner = pricingSettings.ownerName || "Property Owner";
    const phone = pricingSettings.ownerPhone || "+91 9999999999";
    const payee = pricingSettings.payeeName || "Owner Name";
    const upi = pricingSettings.upiId || "owner@upi";

    // Colors
    const primary = [37, 99, 235]; // Blue
    const dark = [15, 23, 42]; // Slate 900
    const light = [248, 250, 252]; // Slate 50

    // Top color band
    doc.setFillColor(...primary);
    doc.rect(0, 0, 210, 32, 'F');

    // Title
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(20);
    doc.text(building, 105, 12, { align: 'center' });

    // Subtitle
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.text(`OWNER: ${owner.toUpperCase()} | CONTACT: ${phone}`, 105, 18, { align: 'center' });
    
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.text("UTILITY & RENT BILL RECEIPT", 105, 25, { align: 'center' });

    // Section: Tenant Details
    doc.setTextColor(...dark);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.text("TENANT & INVOICE DETAILS", 15, 42);
    doc.setDrawColor(226, 232, 240); // slate-200
    doc.setLineWidth(0.3);
    doc.line(15, 44, 195, 44);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.text(`Tenant Name: ${inv.tenantName}`, 15, 50);
    doc.text(`Room Number: Room ${inv.roomNo}`, 120, 50);

    const monthName = new Date(inv.billingMonth).toLocaleString('default', { month: 'long', year: 'numeric' });
    doc.text(`Billing Month: ${monthName}`, 15, 55);
    doc.text(`Invoice Date: ${new Date(inv.createdAt).toLocaleDateString()}`, 120, 55);

    // Section: Readings
    doc.setFont('helvetica', 'bold');
    doc.text("UTILITIES METERS", 15, 66);
    doc.line(15, 68, 195, 68);

    doc.setFont('helvetica', 'normal');
    doc.text(`Previous Reading: ${inv.previousReading} kWh`, 15, 74);
    doc.text(`Current Reading: ${inv.currentReading} kWh`, 70, 74);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...primary);
    doc.text(`Units Consumed: ${inv.unitsConsumed} kWh`, 130, 74);

    // Section: Table
    doc.setTextColor(...dark);
    doc.setFont('helvetica', 'bold');
    doc.text("BILL BREAKDOWN", 15, 85);
    doc.line(15, 87, 195, 87);

    // Table Header
    doc.setFillColor(...light);
    doc.rect(15, 91, 180, 7, 'F');
    doc.setFontSize(8);
    doc.text("PARTICULARS DESCRIPTION", 18, 95.5);
    doc.text("AMOUNT (INR)", 192, 95.5, { align: 'right' });

    // Table Rows
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.text("1. Monthly Base Room Rent", 18, 104);
    doc.text(`Rs. ${parseFloat(inv.roomRent).toFixed(2)}`, 192, 104, { align: 'right' });

    doc.text(`2. Personal Electricity (${inv.unitsConsumed} Units @ Rs. ${parseFloat(inv.unitPrice).toFixed(2)} / Unit)`, 18, 110);
    doc.text(`Rs. ${parseFloat(inv.electricityCharge).toFixed(2)}`, 192, 110, { align: 'right' });

    doc.text("3. Common Area Electricity Share", 18, 116);
    doc.text(`Rs. ${parseFloat(inv.commonAreaCharge).toFixed(2)}`, 192, 116, { align: 'right' });

    // Total box
    doc.setFillColor(239, 246, 255); // Blue-50
    doc.rect(15, 122, 180, 9, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...primary);
    doc.setFontSize(10);
    doc.text("TOTAL DUE AMOUNT PAYABLE", 18, 127.5);
    doc.text(`Rs. ${parseFloat(inv.totalAmount).toFixed(2)}`, 192, 127.5, { align: 'right' });

    // Section: Gateway
    doc.setTextColor(...dark);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.text("DIRECT UPI PAYMENT GATEWAY", 15, 140);
    doc.line(15, 142, 195, 142);

    doc.setFillColor(...light);
    doc.rect(15, 146, 180, 24, 'F');

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.text(`Payee Receiver: ${payee}`, 18, 152);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...primary);
    doc.text(`UPI Payee Address: ${upi}`, 18, 157);
    doc.setTextColor(...dark);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.text("Scan the QR code to transfer directly using GPay, PhonePe, Paytm, or BHIM.", 18, 163);

    // Dynamic QR Embed
    // Grab visual QR image from DOM
    const qrImg = document.querySelector("#invoice-bill-print img");
    if (qrImg) {
      try {
        // Embed the QR Code
        doc.addImage(qrImg, 'PNG', 163, 147, 21, 21);
      } catch (e) {
        console.warn("Could not embed QR image onto PDF locally", e);
      }
    }

    // Footers
    doc.setTextColor(148, 163, 184); // Slate 400
    doc.setFontSize(7.5);
    doc.setFont('helvetica', 'normal');
    doc.text("Generated securely via LogicSync Rent • Local PWA System", 105, 180, { align: 'center' });
    doc.text("This is an offline generated digital receipt. Thank you!", 105, 184, { align: 'center' });

    return doc;
  };

  // Direct Share PDF Document
  const handleSharePDF = async (inv) => {
    try {
      const doc = generatePDF(inv);
      const blob = doc.output('blob');
      const filename = `LogicSync_Bill_Room_${inv.roomNo}.pdf`;
      const file = new File([blob], filename, { type: 'application/pdf' });

      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        const dateObj = new Date(inv.billingMonth);
        const monthName = dateObj.toLocaleString('default', { month: 'long', year: 'numeric' });
        const upiUri = getUpiUrl(inv);
        
        await navigator.share({
          files: [file],
          title: `Rent Invoice - Room ${inv.roomNo}`,
          text: `Dear Tenant, here is the Rent & Utility bill PDF for Room ${inv.roomNo} (${monthName}).\n\n💰 *Total Amount Due: Rs. ${parseFloat(inv.totalAmount).toFixed(2)}*\n⚡ Pay directly via GPay/PhonePe: ${upiUri}\n\nPlease find the detailed PDF receipt attached below. Thank you!`
        });
      } else {
        // Fallback for browsers that don't support file sharing (e.g. desktop)
        doc.save(filename);
        alert("Native PDF sharing not supported on this browser. File has been downloaded locally!");
      }
    } catch (err) {
      console.error("Failed to share PDF directly", err);
      alert("Sharing failed. Downloading file as fallback.");
      try {
        const doc = generatePDF(inv);
        doc.save(`LogicSync_Bill_Room_${inv.roomNo}.pdf`);
      } catch (e) {
        alert("Failed to compile offline PDF.");
      }
    }
  };

  // Offline Download PDF Only
  const handleDownloadPDFOnly = (inv) => {
    try {
      const doc = generatePDF(inv);
      doc.save(`LogicSync_Bill_Room_${inv.roomNo}.pdf`);
    } catch (err) {
      alert("Failed to download PDF offline.");
    }
  };

  const handleCompleteOnboarding = async () => {
    if (!pricingSettings.buildingName || !pricingSettings.ownerName || !pricingSettings.upiId || !pricingSettings.ownerPhone) {
      alert("Please fill in the Property Name, Owner Name, Contact Phone, and UPI ID to initialize your profile.");
      return;
    }
    try {
      await settingsService.save(pricingSettings);
      localStorage.setItem('rm_onboarded', 'true');
      setIsOnboarded(true);
    } catch (err) {
      alert("Failed to initialize profile settings.");
    }
  };

  const handleResetProfile = () => {
    if (!window.confirm("Are you sure you want to reset your LogicSync Rent profile? This will completely ERASE all registered tenants, utility readings, invoices, outstanding dues, and settings, returning you to a clean onboarding screen.")) return;
    
    // Clear databases
    localStorage.setItem('rm_onboarded', 'false');
    localStorage.setItem('rm_settings', JSON.stringify({
      buildingName: "",
      ownerName: "",
      ownerPhone: "",
      payeeName: "",
      upiId: "",
      roomRent: 5000,
      unitPrice: 10.0,
      effectiveFrom: new Date().toISOString().split('T')[0]
    }));
    localStorage.setItem('rm_tenants', JSON.stringify([]));
    localStorage.setItem('rm_readings', JSON.stringify([]));
    localStorage.setItem('rm_invoices', JSON.stringify([]));

    // Clear React states
    setPricingSettings({
      buildingName: '',
      ownerName: '',
      ownerPhone: '',
      payeeName: '',
      upiId: '',
      roomRent: '',
      unitPrice: '',
      effectiveFrom: ''
    });
    setTenants([]);
    setMonthlyInvoices([]);
    setIsOnboarded(false);
    
    alert("Application data wiped successfully! Welcome to your new clean slate.");
  };

  // Print Invoice Functionality
  const printInvoice = () => {
    const printContent = document.getElementById("invoice-bill-print").innerHTML;
    const originalContent = document.body.innerHTML;
    document.body.innerHTML = `
      <div style="padding: 40px; font-family: sans-serif; color: #000; background: #fff;">
        ${printContent}
      </div>
    `;
    window.print();
    window.location.reload();
  };

  // Helper Stats Calculations
  const totalRevenue = monthlyInvoices.reduce((sum, inv) => sum + parseFloat(inv.totalAmount), 0);
  const paidRevenue = monthlyInvoices.filter(inv => inv.status === 'PAID').reduce((sum, inv) => sum + parseFloat(inv.totalAmount), 0);
  const pendingDues = monthlyInvoices.filter(inv => inv.status !== 'PAID').reduce((sum, inv) => sum + parseFloat(inv.totalAmount), 0);
  const activeTenantsCount = tenants.filter(t => t.active).length;

  const handleTogglePaymentStatus = async (id, currentStatus) => {
    try {
      const nextStatus = currentStatus === 'PAID' ? 'GENERATED' : 'PAID';
      await invoiceService.toggleStatus(id, nextStatus);
      fetchMonthlyHistory();
    } catch (err) {
      alert("Failed to change payment status.");
    }
  };

  const handleExportBackup = () => {
    try {
      const jsonString = backupService.export();
      const blob = new Blob([jsonString], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `LogicSync_Backup_${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err) {
      alert("Failed to export backup.");
    }
  };

  const handleImportBackup = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const success = backupService.import(event.target.result);
        if (success) {
          alert("Backup Restored Successfully! Reloading files...");
          loadSettings();
          loadTenants();
          fetchMonthlyHistory();
        }
      } catch (err) {
        alert(err.message || "Failed to restore backup.");
      }
    };
    reader.readAsText(file);
  };

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center font-sans sm:py-6 select-none bg-[radial-gradient(ellipse_80%_80%_at_50%_-20%,rgba(37,99,235,0.15),rgba(255,255,255,0))]">
      
      {/* Physical Mobile Frame Mockup (Only renders on Desktop, full screen on Mobile) */}
      <div className="w-full min-h-screen sm:min-h-[820px] sm:max-h-[820px] sm:max-w-md sm:rounded-[40px] sm:border-[10px] sm:border-slate-800 sm:shadow-[0_25px_60px_-15px_rgba(0,0,0,0.8)] bg-slate-900 text-slate-100 flex flex-col relative overflow-hidden">
        
        {!isOnboarded ? (
          /* ONBOARDING SETUP FLOW */
          <div className="flex-1 flex flex-col p-6 justify-between overflow-y-auto bg-slate-950/20 backdrop-blur-sm animate-fadeIn">
            <div className="space-y-6">
              
              {/* App Logo & Welcome */}
              <div className="text-center pt-6 space-y-3">
                <div className="mx-auto w-20 h-20 bg-slate-900 border border-slate-800 rounded-3xl flex items-center justify-center shadow-xl shadow-blue-500/5 overflow-hidden">
                  <img src="/logisync_rent_logo.png" alt="LogicSync Logo" className="w-16 h-16 object-contain" />
                </div>
                <div>
                  <h2 className="text-xl font-black tracking-tight text-slate-100">LogicSync Rent</h2>
                  <p className="text-[10px] text-blue-400 font-bold uppercase tracking-widest mt-1">Universal Onboarding Wizard</p>
                </div>
              </div>

              {/* Form card */}
              <div className="bg-slate-900 border border-slate-850 p-5 rounded-2xl space-y-4 shadow-xl">
                <h3 className="text-xs font-black text-slate-300 uppercase tracking-widest border-b border-slate-850 pb-2 flex items-center">
                  <Settings size={12} className="text-blue-500 mr-1.5" /> Initialize Landlord Hub
                </h3>
                
                <div className="space-y-3 text-xs">
                  <div>
                    <label className="text-[9px] font-black uppercase text-slate-500 block mb-1">Property / Building Name</label>
                    <input 
                      type="text" 
                      placeholder="e.g. Sunrise Apartments"
                      value={pricingSettings.buildingName || ''} 
                      onChange={e => setPricingSettings({...pricingSettings, buildingName: e.target.value})} 
                      className="w-full bg-slate-950 border border-slate-850 p-3 rounded-xl font-bold text-slate-100 focus:outline-none focus:border-blue-500" 
                    />
                  </div>
                  <div>
                    <label className="text-[9px] font-black uppercase text-slate-500 block mb-1">Landlord / Owner Name</label>
                    <input 
                      type="text" 
                      placeholder="e.g. John Doe"
                      value={pricingSettings.ownerName || ''} 
                      onChange={e => setPricingSettings({...pricingSettings, ownerName: e.target.value})} 
                      className="w-full bg-slate-950 border border-slate-850 p-3 rounded-xl font-bold text-slate-100 focus:outline-none focus:border-blue-500" 
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[9px] font-black uppercase text-slate-500 block mb-1">Contact Phone (WhatsApp)</label>
                      <input 
                        type="text" 
                        placeholder="+91 9999999999"
                        value={pricingSettings.ownerPhone || ''} 
                        onChange={e => setPricingSettings({...pricingSettings, ownerPhone: e.target.value})} 
                        className="w-full bg-slate-950 border border-slate-850 p-3 rounded-xl font-bold text-slate-100 focus:outline-none focus:border-blue-500" 
                      />
                    </div>
                    <div>
                      <label className="text-[9px] font-black uppercase text-slate-500 block mb-1">UPI Payee Display Name</label>
                      <input 
                        type="text" 
                        placeholder="e.g. Jane Doe"
                        value={pricingSettings.payeeName || ''} 
                        onChange={e => setPricingSettings({...pricingSettings, payeeName: e.target.value})} 
                        className="w-full bg-slate-950 border border-slate-850 p-3 rounded-xl font-bold text-slate-100 focus:outline-none focus:border-blue-500" 
                      />
                    </div>
                  </div>
                  <div>
                    <label className="text-[9px] font-black uppercase text-slate-500 block mb-1">UPI ID for Direct QR payments</label>
                    <input 
                      type="text" 
                      placeholder="landlord@upi"
                      value={pricingSettings.upiId || ''} 
                      onChange={e => setPricingSettings({...pricingSettings, upiId: e.target.value})} 
                      className="w-full bg-slate-950 border border-slate-850 p-3 rounded-xl font-bold text-slate-100 focus:outline-none focus:border-blue-500" 
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2 border-t border-slate-850 pt-3 mt-1">
                    <div>
                      <label className="text-[9px] font-black uppercase text-slate-500 block mb-1">Monthly Room Rent (₹)</label>
                      <input 
                        type="number" 
                        placeholder="5000"
                        value={pricingSettings.roomRent || ''} 
                        onChange={e => setPricingSettings({...pricingSettings, roomRent: e.target.value})} 
                        className="w-full bg-slate-950 border border-slate-850 p-3 rounded-xl font-bold text-slate-100 focus:outline-none focus:border-blue-500" 
                      />
                    </div>
                    <div>
                      <label className="text-[9px] font-black uppercase text-slate-500 block mb-1">Electricity/Unit (₹)</label>
                      <input 
                        type="number" 
                        step="0.01"
                        placeholder="10.50"
                        value={pricingSettings.unitPrice || ''} 
                        onChange={e => setPricingSettings({...pricingSettings, unitPrice: e.target.value})} 
                        className="w-full bg-slate-950 border border-slate-850 p-3 rounded-xl font-bold text-slate-100 focus:outline-none focus:border-blue-500" 
                      />
                    </div>
                  </div>
                </div>

              </div>

            </div>

            <button 
              onClick={handleCompleteOnboarding}
              className="w-full py-4 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white rounded-2xl font-black uppercase tracking-widest text-xs shadow-xl shadow-blue-500/10 transition mt-6"
            >
              Launch My Dashboard
            </button>
          </div>
        ) : (
          /* REGULAR MAIN APPLICATION CONTAINER */
          <>
            {/* MOBILE APPLICATION HEADER */}
            <header className="bg-slate-950 p-4 border-b border-slate-850 flex justify-between items-center sticky top-0 z-40 backdrop-blur-md bg-opacity-90 shrink-0">
              <div>
                <h2 className="text-sm font-black tracking-tight text-blue-500 uppercase italic">
                  LogicSync Rent
                </h2>
                <span className="text-[9px] uppercase font-bold text-slate-400 tracking-wider flex items-center mt-0.5">
                  <span className={`w-1.5 h-1.5 rounded-full mr-1.5 ${storageMode === 'local' ? 'bg-emerald-500 animate-pulse' : 'bg-blue-500 animate-pulse'}`}></span>
                  🏢 {pricingSettings.buildingName || "My Heights"}
                </span>
              </div>
              <button onClick={() => setActiveTab("settings")} className={`p-2 rounded-xl transition ${activeTab === 'settings' ? 'bg-blue-600 text-white' : 'bg-slate-900 border border-slate-850 text-slate-300 hover:bg-slate-800'}`}>
                <Settings size={16} />
              </button>
            </header>

            {/* MAIN LAYOUT WRAPPER */}
            <main className="flex-1 p-4 overflow-y-auto pb-6">
        
        {/* TAB 1: DASHBOARD CONTAINER */}
        {activeTab === 'dashboard' && (
          <div className="space-y-6 animate-fadeIn">
            
            {/* Quick Greeting */}
            <div className="flex flex-col md:flex-row justify-between md:items-center space-y-4 md:space-y-0">
              <div>
                <h3 className="text-2xl font-black tracking-tight text-slate-100">Management Dashboard</h3>
                <p className="text-slate-400 text-xs font-semibold">Real-time metrics & billing scheduler</p>
              </div>
              <div className="flex space-x-2">
                <input 
                  type="month" 
                  value={month} 
                  onChange={(e) => setMonth(e.target.value)} 
                  className="bg-slate-950 border border-slate-800 text-slate-100 text-xs font-black p-2.5 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer" 
                />
              </div>
            </div>

            {/* Quick Metrics Grid */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 flex flex-col justify-between">
                <span className="text-[10px] uppercase font-black text-amber-500 tracking-wider">Pending Dues</span>
                <span className="text-xl font-black text-amber-500 mt-2">₹{pendingDues.toFixed(0)}</span>
                <span className="text-[9px] font-semibold text-slate-500 italic mt-1">Paid: ₹{paidRevenue.toFixed(0)}</span>
              </div>
              <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 flex flex-col justify-between">
                <span className="text-[10px] uppercase font-black text-slate-400 tracking-wider">Active Tenants</span>
                <span className="text-xl font-black text-slate-200 mt-2">{activeTenantsCount}</span>
                <span className="text-[9px] font-semibold text-slate-500 italic mt-1">Rooms active</span>
              </div>
              <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 flex flex-col justify-between">
                <span className="text-[10px] uppercase font-black text-slate-400 tracking-wider">Electricity Rate</span>
                <span className="text-xl font-black text-blue-400 mt-2">₹{parseFloat(pricingSettings.unitPrice || 0).toFixed(2)}</span>
                <span className="text-[9px] font-semibold text-slate-500 italic mt-1">Per consumed unit</span>
              </div>
              <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 flex flex-col justify-between">
                <span className="text-[10px] uppercase font-black text-slate-400 tracking-wider">Room Rent Policy</span>
                <span className="text-xl font-black text-indigo-400 mt-2">₹{parseFloat(pricingSettings.roomRent || 0).toFixed(0)}</span>
                <span className="text-[9px] font-semibold text-slate-500 italic mt-1">Monthly base rent</span>
              </div>
            </div>

            {/* Quick Actions Panel */}
            <div className="bg-gradient-to-br from-blue-900/40 to-slate-950 p-6 rounded-3xl border border-slate-800 relative overflow-hidden">
              <div className="absolute right-0 bottom-0 translate-x-4 translate-y-4 opacity-5 pointer-events-none">
                <Zap size={200} />
              </div>
              <h4 className="font-black text-base text-blue-400 uppercase tracking-widest text-xs">Run Bulk Monthly Billing</h4>
              <p className="text-slate-300 text-xs mt-1 max-w-md font-medium">
                Generates digital invoices for all active tenants for <span className="font-bold text-white underline">{month}</span>. Make sure all meter readings are saved first!
              </p>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6">
                <div>
                  <label className="text-[9px] font-black uppercase text-slate-400 tracking-wider block mb-1">Common Area Electricity Units</label>
                  <input 
                    type="number" 
                    placeholder="Enter units (e.g. 50)" 
                    value={commonUnits} 
                    onChange={(e) => setCommonUnits(e.target.value)} 
                    className="w-full bg-slate-950 border border-slate-850 p-3 rounded-xl font-bold text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500" 
                  />
                </div>
                <button 
                  onClick={triggerBulkInvoicing} 
                  disabled={loading} 
                  className="w-full bg-blue-600 text-white rounded-xl font-black uppercase tracking-wider text-xs shadow-lg shadow-blue-600/30 hover:bg-blue-700 transition flex items-center justify-center p-4 mt-4 md:mt-0"
                >
                  {loading ? <Loader2 className="animate-spin text-white mr-2" size={16} /> : <Zap size={14} className="mr-2" />} 
                  Compute Bulk Bills
                </button>
              </div>
            </div>

            {/* Local Storage Mode Hero Banner (for universal pitch) */}
            {storageMode === 'local' && (
              <div className="bg-slate-950 p-5 rounded-2xl border border-slate-800 flex items-center justify-between">
                <div className="flex items-center space-x-3.5">
                  <div className="p-3 bg-emerald-500/10 rounded-xl text-emerald-400 border border-emerald-500/25">
                    <Smartphone size={20} />
                  </div>
                  <div>
                    <h5 className="font-black text-sm text-slate-200">Self-Contained Local Mode Active</h5>
                    <p className="text-[10px] text-slate-400 font-medium">Data resides strictly inside your phone browser. No internet or passwords needed!</p>
                  </div>
                </div>
                <button onClick={() => setActiveTab("settings")} className="text-[9px] font-black uppercase tracking-widest text-blue-500 hover:underline">
                  Cloud Setup
                </button>
              </div>
            )}
            
            {/* Quick Status of Invoices */}
            <div className="bg-slate-950 rounded-2xl border border-slate-800 overflow-hidden">
              <div className="p-4 border-b border-slate-900 font-black text-slate-200 text-xs tracking-wider flex justify-between items-center bg-slate-950/70">
                <span>Recent Invoices ({monthlyInvoices.length})</span>
                <span className="text-[10px] text-slate-500 lowercase font-bold">Billing Month: {month}</span>
              </div>
              
              <div className="divide-y divide-slate-900 max-h-80 overflow-y-auto">
                {monthlyInvoices.map((inv) => (
                  <div key={inv.id} className="p-4 hover:bg-slate-900/50 transition flex justify-between items-center">
                    <div>
                      <h6 className="font-bold text-sm text-slate-200">{inv.tenantName}</h6>
                      <div className="flex items-center space-x-2 text-[10px] text-slate-400 font-bold mt-1">
                        <span className="text-blue-500">Room {inv.roomNo}</span>
                        <span>•</span>
                        <span>₹{inv.totalAmount.toFixed(0)}</span>
                      </div>
                    </div>
                    <button 
                      onClick={() => setSelectedInvoice(inv)} 
                      className="p-2 bg-slate-900 text-slate-300 rounded-lg hover:bg-slate-800 transition flex items-center space-x-1"
                    >
                      <Eye size={12} />
                      <span className="text-[10px] font-black uppercase">Open</span>
                    </button>
                  </div>
                ))}
                {monthlyInvoices.length === 0 && (
                  <div className="p-8 text-center text-slate-500 italic text-xs font-semibold">No invoices generated for this month. Adjust month or run calculation above.</div>
                )}
              </div>
            </div>
            
          </div>
        )}

        {/* TAB 2: TENANTS DIRECTORY */}
        {activeTab === 'tenants' && (
          <div className="space-y-6 animate-fadeIn">
            <div className="flex justify-between items-center">
              <div>
                <h3 className="text-2xl font-black tracking-tight text-slate-100">Tenants Register</h3>
                <p className="text-slate-400 text-xs font-semibold">Manage building residents & details</p>
              </div>
              <button 
                onClick={() => setShowTenantModal(true)} 
                className="flex items-center space-x-1.5 bg-blue-600 text-white text-xs font-black uppercase px-4 py-2.5 rounded-xl hover:bg-blue-700 shadow-lg shadow-blue-600/20 transition"
              >
                <Plus size={14} /> <span>Register</span>
              </button>
            </div>

            {/* Tenant Cards List */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {tenants.map((t) => (
                <div key={t.id} className="bg-slate-950 p-5 rounded-2xl border border-slate-800 hover:border-slate-700 transition flex flex-col justify-between space-y-4">
                  <div className="flex justify-between items-start">
                    <div>
                      <div className="flex items-center space-x-2">
                        <h4 className="font-black text-base text-slate-100">{t.name}</h4>
                        <span className={`text-[9px] px-2 py-0.5 rounded-full font-black uppercase tracking-wider ${t.active ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/25' : 'bg-red-500/10 text-red-400 border border-red-500/25'}`}>
                          {t.active ? 'Active' : 'Inactive'}
                        </span>
                      </div>
                      <p className="text-xs font-bold text-blue-500 mt-1">Room {t.roomNo} • Meter ID: {t.meterId || 'N/A'}</p>
                    </div>
                    
                    {/* Delete Icon */}
                    <button 
                      onClick={() => handleDeleteTenant(t.id)} 
                      className="text-slate-600 hover:text-red-400 p-1.5 transition rounded-lg hover:bg-red-500/10"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>

                  <div className="space-y-1 text-slate-400 text-[10px] font-bold uppercase tracking-wider">
                    <div className="flex items-center space-x-1">
                      <Phone size={10} className="text-slate-500" />
                      <span>{t.phoneNo}</span>
                    </div>
                    {t.aadharNo && <div className="text-slate-500">Aadhar: {t.aadharNo}</div>}
                    <div className="flex items-center space-x-1">
                      <Calendar size={10} className="text-slate-500" />
                      <span>Joined: {t.joiningDate}</span>
                    </div>
                  </div>

                  {/* CTA Actions */}
                  <div className="flex items-center space-x-2 pt-2 border-t border-slate-900">
                    {t.active ? (
                      <>
                        <button 
                          onClick={() => openReadingModal(t)} 
                          className="flex-1 bg-blue-600 text-white py-2 rounded-xl text-[10px] font-black uppercase hover:bg-blue-700 transition"
                        >
                          Record Reading
                        </button>
                        <button 
                          onClick={() => handleToggleTenant(t.id, false)} 
                          className="px-3 py-2 bg-slate-900 border border-slate-800 text-[10px] text-slate-400 font-bold uppercase rounded-xl hover:text-red-400 hover:bg-red-500/10 hover:border-red-500/10 transition"
                        >
                          Checkout
                        </button>
                      </>
                    ) : (
                      <button 
                        onClick={() => handleToggleTenant(t.id, true)} 
                        className="w-full bg-slate-900 border border-slate-800 text-slate-300 py-2 rounded-xl text-[10px] font-black uppercase hover:bg-slate-800 hover:text-emerald-400 hover:border-emerald-500/20 transition"
                      >
                        Re-Activate Tenant
                      </button>
                    )}
                  </div>
                </div>
              ))}
              {tenants.length === 0 && (
                <div className="col-span-full py-16 text-center bg-slate-950 border border-slate-850 rounded-2xl text-slate-500 italic text-sm font-semibold">
                  No tenants registered in the system. Tap Register to add one!
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 3: METER READINGS SUBMIT */}
        {activeTab === 'readings' && (
          <div className="space-y-6 animate-fadeIn">
            <div>
              <h3 className="text-2xl font-black tracking-tight text-slate-100">Meter Utilities</h3>
              <p className="text-slate-400 text-xs font-semibold">Record personal water/electricity readings for {month}</p>
            </div>

            {/* Active Tenants Readings Grid */}
            <div className="bg-slate-950 rounded-2xl border border-slate-800 overflow-hidden">
              <div className="p-4 border-b border-slate-900 font-black text-slate-200 text-xs tracking-wider flex justify-between bg-slate-950/70">
                <span>Select tenant to insert reading</span>
                <span className="text-[10px] text-slate-500 italic uppercase">Month: {month}</span>
              </div>
              
              <div className="divide-y divide-slate-900">
                {tenants.filter(t => t.active).map((t) => (
                  <div key={t.id} className="p-4 hover:bg-slate-900/40 transition flex justify-between items-center">
                    <div>
                      <h4 className="font-bold text-sm text-slate-200">{t.name}</h4>
                      <p className="text-[10px] text-slate-400 font-bold mt-0.5">Room {t.roomNo} • Meter ID: {t.meterId || 'N/A'}</p>
                    </div>
                    <button 
                      onClick={() => openReadingModal(t)} 
                      className="bg-blue-600 hover:bg-blue-700 text-white font-black text-[10px] uppercase py-2 px-4 rounded-xl transition"
                    >
                      Enter Reading
                    </button>
                  </div>
                ))}
                {tenants.filter(t => t.active).length === 0 && (
                  <div className="p-12 text-center text-slate-500 italic text-xs font-bold">
                    No active tenants registered in the system. Add active tenants first.
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* TAB 4: INVOICES FEED */}
        {activeTab === 'invoices' && (
          <div className="space-y-6 animate-fadeIn">
            <div className="flex justify-between items-center">
              <div>
                <h3 className="text-2xl font-black tracking-tight text-slate-100">Billing Receivables</h3>
                <p className="text-slate-400 text-xs font-semibold">Generated receipts for month {month}</p>
              </div>
              <button 
                onClick={() => window.print()} 
                className="flex items-center space-x-1.5 bg-slate-950 border border-slate-800 text-slate-300 text-xs font-black uppercase px-4 py-2.5 rounded-xl hover:bg-slate-900 transition"
              >
                <Download size={14} /> <span>Print Page</span>
              </button>
            </div>

            {/* List of Invoices generated */}
            <div className="space-y-3">
              {monthlyInvoices.map((inv) => (
                <div key={inv.id} className="bg-slate-950 p-4 rounded-2xl border border-slate-850 hover:border-slate-800 transition flex justify-between items-center">
                  <div className="flex-1 min-w-0 pr-4">
                    <div className="flex items-center space-x-2">
                      <h4 className="font-bold text-sm text-slate-200 truncate">{inv.tenantName}</h4>
                      <span className="text-[10px] text-blue-500 font-bold bg-blue-500/10 px-2 py-0.5 rounded-md">Room {inv.roomNo}</span>
                    </div>
                    <div className="flex items-center space-x-3 text-[10px] text-slate-400 font-bold mt-1.5">
                      <span>Rent: ₹{inv.roomRent}</span>
                      <span>•</span>
                      <span>Power: {inv.unitsConsumed} Units</span>
                    </div>
                  </div>
                  
                  <div className="flex items-center space-x-3">
                    <div className="text-right">
                      <p className="text-sm font-black text-emerald-400">₹{inv.totalAmount.toFixed(0)}</p>
                      <button 
                        onClick={() => handleTogglePaymentStatus(inv.id, inv.status)}
                        className={`text-[8px] uppercase tracking-wider font-black px-2 py-0.5 rounded-md mt-1 cursor-pointer select-none transition ${inv.status === 'PAID' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/25' : 'bg-amber-500/10 text-amber-400 border border-amber-500/25'}`}
                      >
                        {inv.status === 'PAID' ? 'PAID ✓' : 'UNPAID ✕'}
                      </button>
                    </div>
                    
                    <div className="flex items-center space-x-1.5">
                      <button 
                        onClick={() => setSelectedInvoice(inv)} 
                        className="p-2 bg-slate-900 text-slate-300 hover:bg-slate-850 rounded-xl transition"
                        title="View Detailed Bill"
                      >
                        <Eye size={14} />
                      </button>
                      <button 
                        onClick={() => shareInvoiceWhatsApp(inv)} 
                        className="p-2 bg-emerald-600/10 text-emerald-400 hover:bg-emerald-600/20 border border-emerald-500/20 rounded-xl transition"
                        title="Send via WhatsApp"
                      >
                        <Share2 size={14} />
                      </button>
                      <button 
                        onClick={() => handleDeleteInvoice(inv.id)} 
                        className="p-2 bg-red-600/10 text-red-400 hover:bg-red-600/20 border border-red-500/20 rounded-xl transition"
                        title="Delete Invoice"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
              {monthlyInvoices.length === 0 && (
                <div className="py-16 text-center bg-slate-950 border border-slate-850 rounded-2xl text-slate-500 italic text-xs font-semibold">
                  No billing invoices have been calculated for {month}. Move to Dashboard to run bulk invoicing.
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 5: SETTINGS CONFIGURATION */}
        {activeTab === 'settings' && (
          <div className="space-y-6 animate-fadeIn">
            <div>
              <h3 className="text-2xl font-black tracking-tight text-slate-100">App Configurations</h3>
              <p className="text-slate-400 text-xs font-semibold">Customize storage drivers, building details, and pricing</p>
            </div>

            {/* 1. Storage Integration Driver Selection */}
            <div className="bg-slate-950 p-6 rounded-2xl border border-slate-800 space-y-4">
              <h4 className="font-black text-sm text-slate-200 flex items-center">
                <Database className="text-blue-500 mr-2" size={16} /> Data Storage Mode
              </h4>
              <p className="text-[11px] text-slate-400 font-medium">
                Choose where your data resides. **Local Offline Mode** runs inside your phone browser instantly with zero passwords. **Cloud Server Mode** syncs back to the centralized Spring Boot API server database.
              </p>

              <div className="grid grid-cols-2 gap-3 pt-2">
                <button 
                  onClick={() => handleToggleStorageMode('local')}
                  className={`p-4 rounded-xl border flex flex-col items-center justify-center text-center transition ${storageMode === 'local' ? 'bg-blue-600/10 border-blue-500 text-white shadow-xl' : 'bg-slate-900/50 border-slate-850 text-slate-400 hover:text-white'}`}
                >
                  <Smartphone size={24} className="mb-2" />
                  <span className="text-xs font-black uppercase">Local Storage (Offline)</span>
                  <span className="text-[9px] opacity-75 mt-1 font-semibold">No setups/No passwords</span>
                </button>
                <button 
                  onClick={() => handleToggleStorageMode('server')}
                  className={`p-4 rounded-xl border flex flex-col items-center justify-center text-center transition ${storageMode === 'server' ? 'bg-blue-600/10 border-blue-500 text-white shadow-xl' : 'bg-slate-900/50 border-slate-850 text-slate-400 hover:text-white'}`}
                >
                  <Server size={24} className="mb-2" />
                  <span className="text-xs font-black uppercase">Server Storage (Cloud)</span>
                  <span className="text-[9px] opacity-75 mt-1 font-semibold">Syncs to PostgreSQL db</span>
                </button>
              </div>

              {/* Server URL Input Panel */}
              {storageMode === 'server' && (
                <div className="p-4 bg-slate-900 border border-slate-850 rounded-xl space-y-3 mt-4 animate-slideDown">
                  <div>
                    <label className="text-[9px] font-black uppercase text-slate-400 block mb-1">Backend REST Server API URL</label>
                    <input 
                      type="text" 
                      placeholder="http://localhost:8081" 
                      value={serverUrl} 
                      onChange={(e) => setServerUrl(e.target.value)} 
                      className="w-full bg-slate-950 border border-slate-800 p-3 rounded-lg font-bold text-xs text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500" 
                    />
                  </div>
                  <button 
                    onClick={handleUpdateServerUrl}
                    className="w-full bg-slate-950 hover:bg-slate-800 text-slate-100 border border-slate-800 p-2.5 rounded-lg text-xs font-black uppercase tracking-wider transition"
                  >
                    Update Endpoint
                  </button>
                </div>
              )}
            </div>

            {/* 2. Building & Payment details configuration */}
            <div className="bg-slate-950 p-6 rounded-2xl border border-slate-800 space-y-5">
              <h4 className="font-black text-sm text-slate-200 flex items-center">
                <CreditCard className="text-emerald-400 mr-2" size={16} /> Building & UPI Billing Profile
              </h4>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-[9px] font-black uppercase text-slate-400 block mb-1">Building/Heights Name</label>
                  <input 
                    type="text" 
                    value={pricingSettings.buildingName || ''} 
                    onChange={e => setPricingSettings({...pricingSettings, buildingName: e.target.value})} 
                    className="w-full bg-slate-900 border border-slate-850 p-3 rounded-xl font-bold text-xs text-slate-200 focus:outline-none" 
                  />
                </div>
                <div>
                  <label className="text-[9px] font-black uppercase text-slate-400 block mb-1">Owner Contact Phone (WhatsApp)</label>
                  <input 
                    type="text" 
                    value={pricingSettings.ownerPhone || ''} 
                    onChange={e => setPricingSettings({...pricingSettings, ownerPhone: e.target.value})} 
                    className="w-full bg-slate-900 border border-slate-850 p-3 rounded-xl font-bold text-xs text-slate-200 focus:outline-none" 
                  />
                </div>
                <div>
                  <label className="text-[9px] font-black uppercase text-slate-400 block mb-1">Owner Contact Name</label>
                  <input 
                    type="text" 
                    value={pricingSettings.ownerName || ''} 
                    onChange={e => setPricingSettings({...pricingSettings, ownerName: e.target.value})} 
                    className="w-full bg-slate-900 border border-slate-850 p-3 rounded-xl font-bold text-xs text-slate-200 focus:outline-none" 
                  />
                </div>
                <div>
                  <label className="text-[9px] font-black uppercase text-slate-400 block mb-1">UPI Payee ID (for QR Code)</label>
                  <input 
                    type="text" 
                    value={pricingSettings.upiId || ''} 
                    onChange={e => setPricingSettings({...pricingSettings, upiId: e.target.value})} 
                    className="w-full bg-slate-900 border border-slate-850 p-3 rounded-xl font-bold text-xs text-slate-200 focus:outline-none" 
                  />
                </div>
                <div>
                  <label className="text-[9px] font-black uppercase text-slate-400 block mb-1">UPI Receiver Name</label>
                  <input 
                    type="text" 
                    value={pricingSettings.payeeName || ''} 
                    onChange={e => setPricingSettings({...pricingSettings, payeeName: e.target.value})} 
                    className="w-full bg-slate-900 border border-slate-850 p-3 rounded-xl font-bold text-xs text-slate-200 focus:outline-none" 
                  />
                </div>
              </div>
            </div>

            {/* 3. Global Pricing Policies configuration */}
            <div className="bg-slate-950 p-6 rounded-2xl border border-slate-800 space-y-5">
              <h4 className="font-black text-sm text-slate-200 flex items-center">
                <Zap className="text-yellow-400 mr-2" size={16} /> Global Pricing Policy
              </h4>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="text-[9px] font-black uppercase text-slate-400 block mb-1">Room Monthly Rent (₹)</label>
                  <input 
                    type="number" 
                    value={pricingSettings.roomRent || ''} 
                    onChange={e => setPricingSettings({...pricingSettings, roomRent: e.target.value})} 
                    className="w-full bg-slate-900 border border-slate-850 p-3 rounded-xl font-bold text-xs text-slate-200 focus:outline-none" 
                  />
                </div>
                <div>
                  <label className="text-[9px] font-black uppercase text-slate-400 block mb-1">Electricity Unit Price (₹)</label>
                  <input 
                    type="number" 
                    step="0.01" 
                    value={pricingSettings.unitPrice || ''} 
                    onChange={e => setPricingSettings({...pricingSettings, unitPrice: e.target.value})} 
                    className="w-full bg-slate-900 border border-slate-850 p-3 rounded-xl font-bold text-xs text-slate-200 focus:outline-none" 
                  />
                </div>
                <div>
                  <label className="text-[9px] font-black uppercase text-slate-400 block mb-1">Policy Effective From</label>
                  <input 
                    type="date" 
                    value={pricingSettings.effectiveFrom || ''} 
                    onChange={e => setPricingSettings({...pricingSettings, effectiveFrom: e.target.value})} 
                    className="w-full bg-slate-900 border border-slate-850 p-3 rounded-xl font-bold text-xs text-slate-200 focus:outline-none" 
                  />
                </div>
              </div>

              <button 
                onClick={handleSaveSettings}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white p-4 rounded-xl text-xs font-black uppercase tracking-widest shadow-xl shadow-blue-600/10 transition"
              >
                Save Profile & Policies
              </button>
            </div>

            {/* 4. Offline Data Backup & Recovery */}
            <div className="bg-slate-950 p-6 rounded-2xl border border-slate-800 space-y-4">
              <h4 className="font-black text-sm text-slate-200 flex items-center">
                <Database className="text-emerald-400 mr-2" size={16} /> Data Backup & Security
              </h4>
              <p className="text-[11px] text-slate-400 font-medium">
                Keep your offline records safe! Since data sits inside this browser locally, download a backup file to copy to another phone or keep as a safe recovery file.
              </p>

              <div className="flex flex-col space-y-3 pt-2">
                <button 
                  onClick={handleExportBackup}
                  className="w-full bg-slate-900 border border-slate-800 hover:bg-slate-850 text-slate-200 p-3.5 rounded-xl text-xs font-black uppercase tracking-wider transition flex items-center justify-center space-x-1.5"
                >
                  <Download size={14} className="text-blue-500" />
                  <span>Download JSON Backup File</span>
                </button>
                
                <label className="w-full bg-slate-900 border border-slate-800 hover:bg-slate-850 text-slate-300 p-3.5 rounded-xl text-xs font-black uppercase tracking-wider transition flex flex-center justify-center space-x-1.5 cursor-pointer text-center items-center">
                  <Plus size={14} className="text-emerald-500" />
                  <span>Upload & Restore Backup</span>
                  <input 
                    type="file" 
                    accept=".json" 
                    onChange={handleImportBackup} 
                    className="hidden" 
                  />
                </label>
              </div>
            </div>

            {/* 5. Reset Profile (White-label tester) */}
            <div className="bg-slate-950 p-6 rounded-2xl border border-slate-800 space-y-3">
              <h4 className="font-black text-sm text-red-400 flex items-center">
                <X className="text-red-400 mr-2" size={16} /> Reset Configurations
              </h4>
              <button 
                onClick={handleResetProfile}
                className="w-full bg-slate-900 hover:bg-red-500/10 border border-slate-800 hover:border-red-500/30 text-[10px] text-slate-400 hover:text-red-400 py-3 rounded-xl font-black uppercase tracking-wider transition"
              >
                Reset App & Rerun Wizard
              </button>
            </div>

          </div>
        )}

      </main>

      {/* PERSISTENT BOTTOM NAVIGATION BAR */}
      <nav className="bg-slate-950 border-t border-slate-850 flex justify-around items-center p-3.5 sticky bottom-0 z-40 backdrop-blur-md bg-opacity-95 shrink-0">
        <button 
          onClick={() => setActiveTab("dashboard")} 
          className={`flex flex-col items-center space-y-1 ${activeTab === 'dashboard' ? 'text-blue-500 animate-pulseFast' : 'text-slate-500'}`}
        >
          <LayoutDashboard size={18} />
          <span className="text-[8px] font-black uppercase">Home</span>
        </button>

        <button 
          onClick={() => setActiveTab("tenants")} 
          className={`flex flex-col items-center space-y-1 ${activeTab === 'tenants' ? 'text-blue-500 animate-pulseFast' : 'text-slate-500'}`}
        >
          <Users size={18} />
          <span className="text-[8px] font-black uppercase">Tenants</span>
        </button>

        <button 
          onClick={() => setActiveTab("readings")} 
          className={`flex flex-col items-center space-y-1 ${activeTab === 'readings' ? 'text-blue-500 animate-pulseFast' : 'text-slate-500'}`}
        >
          <Zap size={18} />
          <span className="text-[8px] font-black uppercase">Readings</span>
        </button>

        <button 
          onClick={() => setActiveTab("invoices")} 
          className={`flex flex-col items-center space-y-1 ${activeTab === 'invoices' ? 'text-blue-500 animate-pulseFast' : 'text-slate-500'}`}
        >
          <FileText size={18} />
          <span className="text-[8px] font-black uppercase">Bills</span>
        </button>
      </nav>

      {/* MODAL SHEET: REGISTER TENANT */}
      {showTenantModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fadeIn">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 w-full max-w-lg shadow-2xl relative animate-scaleIn">
            <button onClick={() => setShowTenantModal(false)} className="absolute right-4 top-4 text-slate-500 hover:text-slate-300 p-1 bg-slate-950 rounded-lg">
              <X size={16} />
            </button>
            <h3 className="text-lg font-black tracking-tight mb-4">Register Tenant Room</h3>
            
            <div className="grid grid-cols-2 gap-4 mb-6">
              <div className="col-span-2">
                <label className="text-[9px] font-black uppercase text-slate-400 block mb-1">Full Name</label>
                <input 
                  placeholder="e.g. Sneha Patil" 
                  className="w-full p-3 bg-slate-950 border border-slate-850 rounded-xl font-bold text-xs text-slate-100" 
                  value={newTenant.name}
                  onChange={e => setNewTenant({...newTenant, name: e.target.value})} 
                />
              </div>
              <div>
                <label className="text-[9px] font-black uppercase text-slate-400 block mb-1">Room No</label>
                <input 
                  placeholder="101" 
                  className="w-full p-3 bg-slate-950 border border-slate-850 rounded-xl font-bold text-xs text-slate-100" 
                  value={newTenant.roomNo}
                  onChange={e => setNewTenant({...newTenant, roomNo: e.target.value})} 
                />
              </div>
              <div>
                <label className="text-[9px] font-black uppercase text-slate-400 block mb-1">Meter ID</label>
                <input 
                  placeholder="M-101" 
                  className="w-full p-3 bg-slate-950 border border-slate-850 rounded-xl font-bold text-xs text-slate-100" 
                  value={newTenant.meterId}
                  onChange={e => setNewTenant({...newTenant, meterId: e.target.value})} 
                />
              </div>
              <div>
                <label className="text-[9px] font-black uppercase text-slate-400 block mb-1">Contact Phone</label>
                <input 
                  placeholder="+91 98765 43210" 
                  className="w-full p-3 bg-slate-950 border border-slate-850 rounded-xl font-bold text-xs text-slate-100" 
                  value={newTenant.phoneNo}
                  onChange={e => setNewTenant({...newTenant, phoneNo: e.target.value})} 
                />
              </div>
              <div>
                <label className="text-[9px] font-black uppercase text-slate-400 block mb-1">Aadhar ID (Optional)</label>
                <input 
                  placeholder="1234-5678-9012" 
                  className="w-full p-3 bg-slate-950 border border-slate-850 rounded-xl font-bold text-xs text-slate-100" 
                  value={newTenant.aadharNo}
                  onChange={e => setNewTenant({...newTenant, aadharNo: e.target.value})} 
                />
              </div>
              <div className="col-span-2">
                <label className="text-[9px] font-black uppercase text-slate-400 block mb-1">Joining Date</label>
                <input 
                  type="date"
                  className="w-full p-3 bg-slate-950 border border-slate-850 rounded-xl font-bold text-xs text-slate-100" 
                  value={newTenant.joiningDate}
                  onChange={e => setNewTenant({...newTenant, joiningDate: e.target.value})} 
                />
              </div>
            </div>

            <button 
              onClick={handleAddTenant} 
              className="w-full py-4 bg-blue-600 text-white rounded-2xl font-black uppercase tracking-wider text-xs shadow-xl shadow-blue-600/10 hover:bg-blue-700 transition"
            >
              Verify & Save Tenant
            </button>
          </div>
        </div>
      )}

      {/* MODAL SHEET: ADD METER READING */}
      {selectedTenant && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fadeIn">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 w-full max-w-md shadow-2xl relative animate-scaleIn">
            <button onClick={() => setSelectedTenant(null)} className="absolute right-4 top-4 text-slate-500 hover:text-slate-300 p-1 bg-slate-950 rounded-lg">
              <X size={16} />
            </button>
            
            <h3 className="text-lg font-black tracking-tight">Record Meter Reading</h3>
            <p className="text-[10px] text-blue-500 uppercase font-black tracking-wider mt-1 mb-6">Room {selectedTenant.roomNo} • {selectedTenant.name}</p>
            
            <div className="space-y-4 mb-6">
              <div>
                <label className="text-[9px] font-black uppercase text-slate-500 block mb-1">Previous Meter Reading (Auto)</label>
                <input 
                  type="number" 
                  disabled 
                  value={readings.prev} 
                  className="w-full p-4 bg-slate-950/50 border border-slate-850 text-slate-500 font-bold rounded-xl cursor-not-allowed text-xs focus:outline-none" 
                />
              </div>
              <div>
                <label className="text-[9px] font-black uppercase text-blue-400 block mb-1">Current Meter Reading</label>
                <input 
                  type="number" 
                  autoFocus
                  placeholder="Enter current reading" 
                  value={readings.curr} 
                  onChange={e => setReadings({...readings, curr: e.target.value})} 
                  className="w-full p-4 bg-slate-950 border border-slate-800 text-slate-100 font-black rounded-xl text-base focus:outline-none focus:ring-2 focus:ring-blue-500" 
                />
              </div>
            </div>

            <button 
              onClick={handleSaveReading} 
              className="w-full py-4 bg-blue-600 text-white rounded-2xl font-black uppercase tracking-wider text-xs shadow-xl shadow-blue-600/10 hover:bg-blue-700 transition animate-pulseFast"
            >
              Commit Utilities Reading
            </button>
          </div>
        </div>
      )}

      {/* MODAL SHEET: DIGITAL INVOICE DRAWER (RECEIPT WITH DYNAMIC UPI PAY QR) */}
      {selectedInvoice && (
        <div className="fixed inset-0 bg-slate-950/90 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fadeIn overflow-y-auto">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 w-full max-w-lg shadow-2xl relative my-8 animate-scaleIn">
            
            {/* Action Bar */}
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-base font-black tracking-wider uppercase text-blue-500">Digital Invoice</h3>
              <div className="flex items-center space-x-2">
                <button 
                  onClick={() => shareInvoiceWhatsApp(selectedInvoice)} 
                  className="p-2 bg-emerald-600/10 text-emerald-400 hover:bg-emerald-600/20 border border-emerald-500/20 rounded-xl transition"
                  title="WhatsApp Share"
                >
                  <Share2 size={15} />
                </button>
                <button 
                  onClick={printInvoice} 
                  className="p-2 bg-slate-950 hover:bg-slate-850 border border-slate-850 rounded-xl text-slate-300 transition"
                  title="Print PDF"
                >
                  <Download size={15} />
                </button>
                <button 
                  onClick={() => setSelectedInvoice(null)} 
                  className="p-2 bg-slate-950 hover:bg-slate-850 text-slate-500 hover:text-slate-350 rounded-xl"
                >
                  <X size={15} />
                </button>
              </div>
            </div>

            {/* PRINT WRAPPER FOR CSS PRINTER */}
            <div id="invoice-bill-print" className="bg-slate-950 p-6 rounded-2xl border border-slate-850 text-slate-100 flex flex-col space-y-6">
              
              {/* Receipt Header */}
              <div className="text-center pb-4 border-b border-slate-900">
                <h4 className="font-black text-lg text-slate-100 tracking-wide uppercase italic">
                  {pricingSettings.buildingName || "MY BUILDING"}
                </h4>
                <p className="text-[9px] font-bold text-slate-400 mt-1 uppercase tracking-wider">
                  Owner: {pricingSettings.ownerName || "Landlord"} | Contact: {pricingSettings.ownerPhone || "+91 9999999999"}
                </p>
                <p className="text-[10px] text-blue-400 font-black uppercase tracking-widest mt-2">
                  Utility & Rent Receipt
                </p>
              </div>

              {/* Invoice Meta */}
              <div className="grid grid-cols-2 gap-4 text-xs font-bold uppercase tracking-wider text-slate-400 pb-4 border-b border-slate-900">
                <div>
                  <span className="text-[8px] text-slate-500 block mb-0.5">Tenant Details</span>
                  <span className="text-slate-200 font-black">{selectedInvoice.tenantName}</span>
                </div>
                <div className="text-right">
                  <span className="text-[8px] text-slate-500 block mb-0.5">Room & Meter</span>
                  <span className="text-blue-400 font-black">Room {selectedInvoice.roomNo}</span>
                </div>
                <div>
                  <span className="text-[8px] text-slate-500 block mb-0.5">Billing Month</span>
                  <span className="text-slate-200">
                    {new Date(selectedInvoice.billingMonth).toLocaleString('default', { month: 'long', year: 'numeric' })}
                  </span>
                </div>
                <div className="text-right">
                  <span className="text-[8px] text-slate-500 block mb-0.5">Invoice Date</span>
                  <span>{new Date(selectedInvoice.createdAt).toLocaleDateString()}</span>
                </div>
              </div>

              {/* Meter readings details */}
              <div>
                <span className="text-[8px] font-black text-slate-500 uppercase tracking-widest block mb-2">Meter Utility Readings</span>
                <div className="grid grid-cols-3 gap-2 bg-slate-900/50 border border-slate-900 p-3 rounded-xl text-center">
                  <div>
                    <span className="text-[8px] text-slate-500 block">Previous</span>
                    <span className="text-xs font-bold text-slate-300">{selectedInvoice.previousReading}</span>
                  </div>
                  <div>
                    <span className="text-[8px] text-slate-500 block">Current</span>
                    <span className="text-xs font-bold text-slate-300">{selectedInvoice.currentReading}</span>
                  </div>
                  <div>
                    <span className="text-[8px] text-blue-400 block font-black">Consumed</span>
                    <span className="text-xs font-black text-blue-400">{selectedInvoice.unitsConsumed} Units</span>
                  </div>
                </div>
              </div>

              {/* Bill Particulars */}
              <div className="space-y-3">
                <span className="text-[8px] font-black text-slate-500 uppercase tracking-widest block mb-1">Billing Particulars</span>
                
                <div className="flex justify-between items-center text-xs font-bold py-1">
                  <span className="text-slate-400">Monthly Room Rent</span>
                  <span className="text-slate-200">₹{parseFloat(selectedInvoice.roomRent).toFixed(2)}</span>
                </div>
                <div className="flex justify-between items-center text-xs font-bold py-1 border-t border-slate-900/50">
                  <span className="text-slate-400">Personal Electricity Consumption</span>
                  <span className="text-slate-200">₹{parseFloat(selectedInvoice.electricityCharge).toFixed(2)}</span>
                </div>
                <div className="flex justify-between items-center text-xs font-bold py-1 border-t border-slate-900/50">
                  <span className="text-slate-400">Common Area Electricity Share</span>
                  <span className="text-slate-200">₹{parseFloat(selectedInvoice.commonAreaCharge).toFixed(2)}</span>
                </div>
                
                <div className="flex justify-between items-center text-sm font-black p-3 bg-slate-900 border border-slate-900 rounded-xl mt-4">
                  <span className="text-slate-300 uppercase tracking-wider text-xs">Total Amount Payable</span>
                  <span className="text-emerald-400 text-base">₹{parseFloat(selectedInvoice.totalAmount).toFixed(2)}</span>
                </div>
              </div>

              {/* UPI Payment Gate Details */}
              <div className="bg-slate-900/50 p-4 rounded-xl border border-slate-900 flex flex-col md:flex-row items-center justify-between space-y-4 md:space-y-0">
                <div className="text-center md:text-left space-y-1">
                  <span className="text-[8px] font-black text-slate-500 uppercase tracking-widest block">Direct Payment Desk</span>
                  <span className="text-xs font-black text-slate-300 block">{pricingSettings.payeeName || "Landlord Name"}</span>
                  <span className="text-[9px] font-bold text-blue-500 block underline truncate max-w-[200px]">{pricingSettings.upiId || "landlord@upi"}</span>
                </div>
                
                {/* Real-time Dynamic UPI Pay QR */}
                <div className="p-2 bg-white rounded-xl shadow-lg border border-slate-100 flex items-center justify-center shrink-0">
                  <img 
                    src={`https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(getUpiUrl(selectedInvoice))}`} 
                    alt="UPI Payment QR Code" 
                    className="w-24 h-24"
                    onError={(e) => { e.target.style.display = 'none'; }}
                  />
                </div>
              </div>

            </div>

            {/* Quick Actions Footer */}
            <div className="flex flex-col space-y-3 mt-6">
              
              {/* Premium Direct PDF Share Button */}
              <button 
                onClick={() => handleSharePDF(selectedInvoice)}
                className="w-full py-4 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white rounded-2xl font-black text-xs uppercase tracking-widest transition flex items-center justify-center shadow-xl shadow-blue-500/10 animate-pulseFast"
              >
                <Share2 size={14} className="mr-2 animate-bounce" /> Share Real PDF (WhatsApp / Email)
              </button>

              <div className="grid grid-cols-3 gap-2">
                <button 
                  onClick={() => shareInvoiceWhatsApp(selectedInvoice)}
                  className="py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold text-[10px] uppercase tracking-wider transition flex flex-col items-center justify-center"
                >
                  <Phone size={14} className="mb-1" />
                  <span>Text Bill</span>
                </button>
                
                <button 
                  onClick={() => handleDownloadPDFOnly(selectedInvoice)}
                  className="py-3 bg-slate-950 border border-slate-800 hover:bg-slate-900 text-slate-200 rounded-xl font-bold text-[10px] uppercase tracking-wider transition flex flex-col items-center justify-center"
                >
                  <Download size={14} className="mb-1" />
                  <span>Get PDF</span>
                </button>

                <button 
                  onClick={printInvoice}
                  className="py-3 bg-slate-950 border border-slate-800 hover:bg-slate-900 text-slate-200 rounded-xl font-bold text-[10px] uppercase tracking-wider transition flex flex-col items-center justify-center"
                >
                  <FileText size={14} className="mb-1" />
                  <span>Print</span>
                </button>
              </div>

            </div>

          </div>
        </div>
      )}

      {/* SYSTEM DESIGN STYLE CUSTOM UTILITY DECORATION */}
      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(4px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes scaleIn {
          from { opacity: 0; transform: scale(0.96); }
          to { opacity: 1; transform: scale(1); }
        }
        .animate-fadeIn {
          animation: fadeIn 0.25s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }
        .animate-scaleIn {
          animation: scaleIn 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }
        .bg-slate-850 {
          background-color: #182235;
        }
        .border-slate-850 {
          border-color: #1e293b;
        }
      `}</style>

          </>
        )}
      </div>
    </div>
  );
};

export default App;