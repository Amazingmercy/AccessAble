import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  LayoutDashboard, Users, Contact, ArrowLeftRight, Settings, Search, Bell, Plus,
  Copy, ExternalLink, ShieldCheck, Wallet, Activity, ArrowUpRight, ArrowDownLeft,
  Menu, X, CheckCircle2, AlertCircle, Link2, Eye, Edit3, Trash2, UserX, UserCheck,
  RefreshCw, Sliders, UserPlus, Check, HelpCircle, Cpu, Radio, ShieldAlert, KeyRound,
  Lock, RotateCcw
} from 'lucide-react';
import './style.css';

const API = import.meta.env.VITE_API_URL || 'http://localhost:4000';
const CUSTOMER = import.meta.env.VITE_CUSTOMER_URL || 'http://localhost:5174';

const money = n => new Intl.NumberFormat('en-NG', {
  style: 'currency',
  currency: 'NGN',
  maximumFractionDigits: 2
}).format(Number(n || 0) / 100);

function App() {
  const [page, setPage] = useState('Overview'); // Overview, Customers, NFC access, Transactions, Settings
  const [summary, setSummary] = useState(null);
  const [customers, setCustomers] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [securitySettings, setSecuritySettings] = useState(null);
  const [busy, setBusy] = useState(false);
  const [query, setQuery] = useState('');
  const [txQuery, setTxQuery] = useState('');
  const [nfcQuery, setNfcQuery] = useState('');
  const [mobileNav, setMobileNav] = useState(false);
  const [notice, setNotice] = useState(null); // { text: string, type: 'success' | 'warning' | 'error' }

  const notify = (text, type = 'success') => {
    setNotice({ text, type });
  };

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), 4500);
    return () => clearTimeout(timer);
  }, [notice]);

  // Modals state
  const [registerModal, setRegisterModal] = useState(false);
  const [manageModal, setManageModal] = useState(false);
  const [selectedCustomerId, setSelectedCustomerId] = useState(null);
  const [selectedCustomerData, setSelectedCustomerData] = useState(null);
  const [customerModalTab, setCustomerModalTab] = useState('overview');
  const [issuedUrl, setIssuedUrl] = useState(null);
  const [copied, setCopied] = useState(false);

  // NFC Station state
  const [selectedNfcCustomer, setSelectedNfcCustomer] = useState(null);
  const [nfcWriting, setNfcWriting] = useState(false);
  const [nfcWriteStatus, setNfcWriteStatus] = useState('');

  // Confirmation dialog
  const [confirmDialog, setConfirmDialog] = useState({ open: false, title: '', message: '', onConfirm: null, danger: true });

  // Registration form state
  const initialNewCustomer = {
    name: '',
    accountNumber: '',
    phone: '',
    email: '',
    balance: '50000',
    preferences: {
      voiceGuidance: true,
      speechRate: 1.0,
      textSize: 'normal',
      highContrast: false,
      screenReader: true,
      preferredInteractionMode: 'voice_first'
    },
    beneficiaries: [
      { nickname: 'Mama', accountHolderName: 'Mary Nwosu', accountNumber: '0123456789', bankName: 'Access Bank' }
    ]
  };
  const [newCustomer, setNewCustomer] = useState(initialNewCustomer);

  // Edit customer form state
  const [editFormData, setEditFormData] = useState({ name: '', phone: '', email: '', balance: '0' });
  const [editPrefsData, setEditPrefsData] = useState({
    voiceGuidance: true, speechRate: 1.0, textSize: 'normal', highContrast: false, screenReader: true, preferredInteractionMode: 'voice_first'
  });

  // New beneficiary in manage modal
  const [newBen, setNewBen] = useState({ nickname: '', accountHolderName: '', accountNumber: '', bankName: 'Access Bank' });
  const [showAddBen, setShowAddBen] = useState(false);

  async function load() {
    setBusy(true);
    try {
      const [sRes, cRes, tRes, secRes] = await Promise.all([
        fetch(API + '/api/dashboard/summary').then(r => r.json()),
        fetch(API + '/api/customers').then(r => r.json()),
        fetch(API + '/api/dashboard/transactions').then(r => r.json()),
        fetch(API + '/api/dashboard/security-settings').then(r => r.json()).catch(() => null)
      ]);
      setSummary(sRes);
      const custList = Array.isArray(cRes) ? cRes : [];
      setCustomers(custList);
      setTransactions(Array.isArray(tRes) ? tRes : []);
      if (secRes) setSecuritySettings(secRes);
      if (custList.length > 0 && !selectedNfcCustomer) {
        setSelectedNfcCustomer(custList[0]);
      }
    } catch {
      notify('Cannot connect to the API. Ensure the server is running on port 4000.', 'error');
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    return customers.filter(c =>
      (c.name + ' ' + c.accountNumber + ' ' + (c.phone || '')).toLowerCase().includes(query.toLowerCase())
    );
  }, [customers, query]);

  const filteredNfc = useMemo(() => {
    return customers.filter(c =>
      (c.name + ' ' + c.accountNumber + ' ' + c.activationToken).toLowerCase().includes(nfcQuery.toLowerCase())
    );
  }, [customers, nfcQuery]);

  const filteredTx = useMemo(() => {
    return transactions.filter(t =>
      (t.reference + ' ' + t.customerName + ' ' + t.description).toLowerCase().includes(txQuery.toLowerCase())
    );
  }, [transactions, txQuery]);

  // Open customer management modal
  async function openManageCustomer(c) {
    setSelectedCustomerId(c.id);
    setManageModal(true);
    setCustomerModalTab('overview');
    setShowAddBen(false);
    try {
      const res = await fetch(`${API}/api/customers/${c.id}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setSelectedCustomerData(data);
      setEditFormData({
        name: data.customer.name,
        phone: data.customer.phone || '',
        email: data.customer.email || '',
        balance: (data.customer.balance / 100).toString()
      });
      setEditPrefsData(data.accessibilityPreferences || {
        voiceGuidance: true, speechRate: 1.0, textSize: 'normal', highContrast: false, screenReader: true, preferredInteractionMode: 'voice_first'
      });
    } catch (e) {
      notify(e.message, 'error');
    }
  }

  async function refreshSelectedCustomer() {
    if (!selectedCustomerId) return;
    try {
      const res = await fetch(`${API}/api/customers/${selectedCustomerId}`);
      const data = await res.json();
      if (res.ok) {
        setSelectedCustomerData(data);
      }
    } catch {}
  }

  async function handleRegisterCustomer(e) {
    e.preventDefault();
    try {
      const payload = {
        ...newCustomer,
        balance: Number(newCustomer.balance || 0),
        beneficiaries: newCustomer.beneficiaries.filter(b => b.nickname.trim() && b.accountNumber.trim())
      };
      const r = await fetch(API + '/api/customers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Registration failed');
      setIssuedUrl(d.activationUrl);
      setNewCustomer(initialNewCustomer);
      notify('Customer registered successfully!', 'success');
      await load();
    } catch (err) {
      notify(err.message, 'error');
    }
  }

  async function handleUpdateCustomer(e) {
    e.preventDefault();
    try {
      const r = await fetch(`${API}/api/customers/${selectedCustomerId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editFormData)
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      notify('Customer profile updated successfully.', 'success');
      await refreshSelectedCustomer();
      await load();
    } catch (e) {
      notify(e.message, 'error');
    }
  }

  async function handleUpdatePreferences(e) {
    e.preventDefault();
    try {
      const r = await fetch(`${API}/api/customers/${selectedCustomerId}/preferences`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editPrefsData)
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      notify('Customer accessibility preferences updated.', 'success');
      await refreshSelectedCustomer();
      await load();
    } catch (e) {
      notify(e.message, 'error');
    }
  }

  function promptToggleStatus(customer) {
    const nextStatus = customer.status === 'active' ? 'deactivated' : 'active';
    const isDeactivating = nextStatus === 'deactivated';
    setConfirmDialog({
      open: true,
      title: isDeactivating ? `Deactivate ${customer.name}?` : `Reactivate ${customer.name}?`,
      message: isDeactivating
        ? `Deactivating will immediately suspend NFC card activation and customer PWA access. Historical records and transactions will remain intact.`
        : `Reactivating will restore NFC access and customer PWA sign-in permissions.`,
      danger: isDeactivating,
      onConfirm: async () => {
        try {
          const r = await fetch(`${API}/api/customers/${customer.id}/status`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: nextStatus })
          });
          const d = await r.json();
          if (!r.ok) throw new Error(d.error);
          notify(`Customer ${customer.name} is now ${nextStatus}.`, 'success');
          await refreshSelectedCustomer();
          await load();
        } catch (e) {
          notify(e.message, 'error');
        }
      }
    });
  }

  async function handleAddBeneficiary(e) {
    e.preventDefault();
    try {
      const r = await fetch(`${API}/api/customers/${selectedCustomerId}/beneficiaries`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newBen)
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      setNewBen({ nickname: '', accountHolderName: '', accountNumber: '', bankName: 'Access Bank' });
      setShowAddBen(false);
      notify('Beneficiary added successfully.', 'success');
      await refreshSelectedCustomer();
      await load();
    } catch (e) {
      notify(e.message, 'error');
    }
  }

  function promptDeleteBeneficiary(ben) {
    setConfirmDialog({
      open: true,
      title: `Remove beneficiary '${ben.nickname}'?`,
      message: `Are you sure you want to remove ${ben.nickname} (${ben.accountHolderName || ben.nickname})? They will no longer be available for voice transfers.`,
      danger: true,
      onConfirm: async () => {
        try {
          const r = await fetch(`${API}/api/customers/${selectedCustomerId}/beneficiaries/${ben.id}`, {
            method: 'DELETE'
          });
          const d = await r.json();
          if (!r.ok) throw new Error(d.error);
          notify(`Beneficiary '${ben.nickname}' removed.`, 'success');
          await refreshSelectedCustomer();
          await load();
        } catch (e) {
          notify(e.message, 'error');
        }
      }
    });
  }

  async function handleRegenerateToken(customerId) {
    const id = customerId || selectedCustomerId;
    try {
      const r = await fetch(`${API}/api/customers/${id}/regenerate-token`, { method: 'POST' });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      notify('New NFC activation token generated.', 'success');
      await refreshSelectedCustomer();
      await load();
    } catch (e) {
      notify(e.message, 'error');
    }
  }

  // Web NFC hardware programmer
  async function programPhysicalTag(targetCustomer) {
    const target = targetCustomer || selectedNfcCustomer;
    if (!target) return;
    const url = target.activationUrl || `${CUSTOMER}/activate/${target.activationToken}`;

    if ('NDEFReader' in window) {
      try {
        setNfcWriting(true);
        setNfcWriteStatus('Hold the NTAG215 card against the back of this device…');
        const ndef = new window.NDEFReader();
        await ndef.write({
          records: [{ recordType: 'url', data: url }]
        });
        setNfcWriteStatus(`Success! Card programmed for ${target.name}.`);
        notify(`NFC card programmed successfully for ${target.name}.`, 'success');
      } catch (err) {
        setNfcWriteStatus('Write cancelled or unsupported on this device.');
      } finally {
        setNfcWriting(false);
      }
    } else {
      copyToClipboard(url);
      setNfcWriteStatus(`URL copied to clipboard! (Desktop mode: Web NFC requires Android/Chrome. Use an NFC writer app like NFC Tools to write this URL to the NTAG215 card).`);
    }
  }

  // Reset demo data
  function promptResetDemo() {
    setConfirmDialog({
      open: true,
      title: 'Reset Demo Data & Balances?',
      message: 'This will reset demo customer accounts (Emeka Nwosu and John Okafor) to their seed balances (₦85,000 and ₦125,000) and ensure their status is active.',
      danger: false,
      onConfirm: async () => {
        try {
          const r = await fetch(API + '/api/dashboard/reset-demo', { method: 'POST' });
          const d = await r.json();
          if (!r.ok) throw new Error(d.error);
          notify(d.message, 'success');
          await load();
        } catch (e) {
          notify(e.message, 'error');
        }
      }
    });
  }

  function copyToClipboard(url) {
    navigator.clipboard?.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const nav = [
    ['Overview', LayoutDashboard],
    ['Customers', Users],
    ['NFC access', Contact],
    ['Transactions', ArrowLeftRight],
    ['Settings', Settings]
  ];

  return (
    <div className="shell">
      {notice && (
        <div className={`notice-toast ${notice.type || 'success'}`}>
          {notice.type === 'error' || notice.type === 'warning' ? (
            <AlertCircle size={18} />
          ) : (
            <CheckCircle2 size={18} />
          )}
          <span>{notice.text || notice}</span>
          <button onClick={() => setNotice(null)}>Dismiss</button>
        </div>
      )}

      <aside className={`sidebar ${mobileNav ? 'show' : ''}`}>
        <div className="brand">
          <div className="brand-mark">A</div>
          <div>
            <b>AccessAble</b>
            <small>Bank console</small>
          </div>
          <button className="close-nav" onClick={() => setMobileNav(false)}>
            <X size={18} />
          </button>
        </div>

        <div className="nav-label">WORKSPACE</div>
        {nav.slice(0, 4).map(([n, I]) => (
          <button
            key={n}
            className={'nav-item ' + (page === n ? 'active' : '')}
            onClick={() => { setPage(n); setMobileNav(false); }}
          >
            <I size={18} />
            <span>{n}</span>
            {n === 'Customers' && <em>{customers.length}</em>}
            {n === 'Transactions' && <em>{transactions.length}</em>}
          </button>
        ))}

        <div className="nav-label settings-label">PREFERENCES</div>
        <button
          className={'nav-item ' + (page === 'Settings' ? 'active' : '')}
          onClick={() => { setPage('Settings'); setMobileNav(false); }}
        >
          <Settings size={18} />
          <span>Security & settings</span>
        </button>

        <div className="sidebar-bottom">
          <div className="secure-icon"><ShieldCheck size={17} /></div>
          <b>Prototype environment</b>
          <p>Simulated demo accounts only. No real money or live bank credentials.</p>
          <span className="status-pill"><i /> API workspace</span>
        </div>
      </aside>

      {mobileNav && <div className="scrim" onClick={() => setMobileNav(false)} />}

      <main className="main">
        <header className="topbar">
          <button className="menu-btn" onClick={() => setMobileNav(true)}><Menu /></button>
          <div className="crumb">Workspace <span>/</span> <b>{page}</b></div>
          <div className="top-actions">
            <span className="live"><i /> System online</span>
            <button className="icon-btn" onClick={() => notify('Operations status: All demo services operational.', 'success')}>
              <Bell size={18} />
            </button>
            <div className="avatar">BA</div>
            <div className="profile">
              <b>Bank administrator</b>
              <small>Demo workspace</small>
            </div>
          </div>
        </header>

        <section className="content">
          <div className="page-heading">
            <div>
              <div className="eyebrow">ACCESSABLE BANKING · OPERATIONS</div>
              <h1>{page === 'Overview' ? 'Good afternoon' : page === 'Settings' ? 'Security & settings' : page}</h1>
              <p>
                {page === 'Overview'
                  ? 'A clear view of accessible banking activity and customer access.'
                  : page === 'Customers'
                  ? 'Manage complete customer profiles, accessibility preferences, and beneficiaries.'
                  : page === 'NFC access'
                  ? 'NFC card hardware provisioning station and physical tag programmer.'
                  : page === 'Transactions'
                  ? 'Review simulated customer banking activity and transaction records.'
                  : 'Prototype security parameters, WebAuthn relying party configuration, and demo safeguards.'}
              </p>
            </div>
            <button className="primary-btn" onClick={() => { setIssuedUrl(null); setRegisterModal(true); }}>
              <Plus size={17} /> Register customer
            </button>
          </div>

          {/* PAGE: OVERVIEW */}
          {page === 'Overview' && (
            <>
              <div className="stats">
                {[
                  ['Total customers', summary?.totalCustomers ?? '—', Users, 'Registered profiles'],
                  ['Active customers', summary?.activeCustomers ?? '—', ShieldCheck, `${summary?.deactivatedCustomers || 0} deactivated`],
                  ['Transactions', summary?.transactions ?? '—', Activity, 'Simulated activity'],
                  ['Transfer volume', summary ? money(summary.transferVolume) : '—', Wallet, 'Successful transfers']
                ].map(([label, value, I, sub]) => (
                  <div className="stat-card" key={label}>
                    <div className="stat-top">
                      <span>{label}</span>
                      <div className="stat-icon"><I size={18} /></div>
                    </div>
                    <strong>{value}</strong>
                    <small>{sub}</small>
                  </div>
                ))}
              </div>

              <div className="panel-grid">
                <div className="panel">
                  <div className="panel-head">
                    <div>
                      <h2>Customer directory</h2>
                      <p>Quick overview of customer profiles</p>
                    </div>
                    <button className="text-btn" onClick={() => setPage('Customers')}>
                      View all ({customers.length}) <ArrowUpRight size={15} />
                    </button>
                  </div>
                  {/* Clean, unscrollable overview table showing only vital info */}
                  <OverviewCustomerTable
                    rows={customers.slice(0, 5)}
                    onManage={openManageCustomer}
                  />
                </div>

                <div className="panel side-panel">
                  <div className="panel-head">
                    <div>
                      <h2>Access health</h2>
                      <p>Prototype readiness</p>
                    </div>
                    <ShieldCheck className="green" size={20} />
                  </div>
                  <div className="health-score">
                    <div className="ring">
                      <b>Ready</b>
                      <small>demo</small>
                    </div>
                    <div>
                      <b>Core services</b>
                      <p>Dashboard & API workspace</p>
                      <span className="health-ok"><i /> Available</span>
                    </div>
                  </div>
                  <div className="health-row">
                    <span>Voice-first customer PWA</span>
                    <b>Enabled</b>
                  </div>
                  <div className="health-row">
                    <span>WebAuthn passkeys</span>
                    <b>Configured</b>
                  </div>
                  <div className="health-row">
                    <span>Accessibility preferences</span>
                    <b>Integrated</b>
                  </div>
                  <div className="health-row">
                    <span>Live bank connection</span>
                    <b className="muted">Simulated demo</b>
                  </div>
                  <div className="tip">
                    <ShieldCheck size={17} />
                    <span>Customer biometric data stays on their device. AccessAble verifies a cryptographic passkey response without transmitting biometrics.</span>
                  </div>
                </div>
              </div>
            </>
          )}

          {/* PAGE: ALL CUSTOMERS */}
          {page === 'Customers' && (
            <div className="panel">
              <div className="panel-head directory-head">
                <div>
                  <h2>All customer profiles</h2>
                  <p>{filtered.length} customers registered in database</p>
                </div>
                <div className="searchbox">
                  <Search size={17} />
                  <input
                    placeholder="Search name, account or phone"
                    value={query}
                    onChange={e => setQuery(e.target.value)}
                  />
                </div>
              </div>
              <FullCustomerTable
                rows={filtered}
                onManage={openManageCustomer}
                onIssue={c => {
                  setIssuedUrl(c.activationUrl);
                  setRegisterModal(true);
                }}
              />
            </div>
          )}

          {/* PAGE: DEDICATED NFC HARDWARE STATION */}
          {page === 'NFC access' && (
            <>
              <div className="nfc-station">
                <div className="panel">
                  <div className="panel-head">
                    <div>
                      <h2>NFC card programmer station</h2>
                      <p>Encode NTAG215 physical card with customer activation token</p>
                    </div>
                    <Radio className="green" size={19} />
                  </div>
                  <div style={{ padding: 22 }}>
                    <label style={{ fontSize: 11, fontWeight: 700, color: '#475569', display: 'block', marginBottom: 8 }}>
                      Select customer profile to program:
                    </label>
                    <select
                      value={selectedNfcCustomer?.id || ''}
                      onChange={e => {
                        const c = customers.find(x => x.id === e.target.value);
                        setSelectedNfcCustomer(c);
                        setNfcWriteStatus('');
                      }}
                      style={{ width: '100%', padding: '11px 12px', border: '1px solid #e2e8f0', borderRadius: 8, font: "12px 'DM Sans'", marginBottom: 18 }}
                    >
                      {customers.map(c => (
                        <option key={c.id} value={c.id}>
                          {c.name} — {c.accountNumber} ({c.status})
                        </option>
                      ))}
                    </select>

                    {selectedNfcCustomer && (
                      <div>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 16 }}>
                          <div style={{ padding: 10, background: '#f8fafc', borderRadius: 8, border: '1px solid #e2e8f0' }}>
                            <span style={{ fontSize: 9, color: '#64748b', display: 'block' }}>TAG STANDARD</span>
                            <b style={{ fontSize: 11 }}>NTAG215 (Type 2)</b>
                          </div>
                          <div style={{ padding: 10, background: '#f8fafc', borderRadius: 8, border: '1px solid #e2e8f0' }}>
                            <span style={{ fontSize: 9, color: '#64748b', display: 'block' }}>RECORD TYPE</span>
                            <b style={{ fontSize: 11 }}>NDEF URI Record</b>
                          </div>
                          <div style={{ padding: 10, background: '#f8fafc', borderRadius: 8, border: '1px solid #e2e8f0' }}>
                            <span style={{ fontSize: 9, color: '#64748b', display: 'block' }}>ENCODED PAYLOAD</span>
                            <b style={{ fontSize: 11 }}>~54 Bytes</b>
                          </div>
                        </div>

                        <div style={{ fontSize: 10, color: '#64748b', marginBottom: 5 }}>NDEF Card URL payload:</div>
                        <div className="url-box" style={{ margin: '0 0 16px' }}>
                          {selectedNfcCustomer.activationUrl || `${CUSTOMER}/activate/${selectedNfcCustomer.activationToken}`}
                        </div>

                        <div className="actions-group" style={{ flexWrap: 'wrap' }}>
                          <button
                            className="primary-btn"
                            disabled={nfcWriting || selectedNfcCustomer.status !== 'active'}
                            onClick={() => programPhysicalTag(selectedNfcCustomer)}
                          >
                            <Cpu size={16} />
                            {nfcWriting ? 'Scanning for NFC card…' : 'Program physical tag (Web NFC)'}
                          </button>
                          <a
                            href={selectedNfcCustomer.activationUrl || `${CUSTOMER}/activate/${selectedNfcCustomer.activationToken}`}
                            target="_blank"
                            rel="noreferrer"
                            className="secondary-btn"
                            style={{ textDecoration: 'none' }}
                          >
                            <ExternalLink size={16} /> Simulate NFC phone tap
                          </a>
                          <button
                            className="secondary-btn"
                            onClick={() => copyToClipboard(selectedNfcCustomer.activationUrl || `${CUSTOMER}/activate/${selectedNfcCustomer.activationToken}`)}
                          >
                            {copied ? <Check size={16} /> : <Copy size={16} />}
                            {copied ? 'Copied' : 'Copy payload URL'}
                          </button>
                        </div>

                        {nfcWriteStatus && (
                          <div style={{ marginTop: 14, padding: 10, background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, color: '#166534', fontSize: 11 }}>
                            {nfcWriteStatus}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                <div className="panel side-panel" style={{ padding: 22 }}>
                  <div className="panel-head" style={{ padding: 0, marginBottom: 16 }}>
                    <div>
                      <h2>Physical card mockup</h2>
                      <p>Bank-issued contactless card preview</p>
                    </div>
                  </div>
                  <div className="nfc-card-preview">
                    <div className="nfc-chip" />
                    <b>AccessAble Card</b>
                    <small>{selectedNfcCustomer ? selectedNfcCustomer.name : 'Customer card'}</small>
                    <div className="tag-id">
                      TOKEN: {selectedNfcCustomer ? selectedNfcCustomer.activationToken?.substring(0, 16) + '...' : 'TAG-••••-••••'}
                    </div>
                  </div>
                  <div className="tip" style={{ margin: '18px 0 0' }}>
                    <ShieldCheck size={17} />
                    <span>Hardware safety: Sensitive account numbers and biometric credentials are never written to physical NFC tags. Only an opaque activation token is stored.</span>
                  </div>
                </div>
              </div>

              {/* Tag Registry Table */}
              <div className="panel">
                <div className="panel-head directory-head">
                  <div>
                    <h2>Card inventory & tag registry</h2>
                    <p>{filteredNfc.length} provisioned customer NFC tags</p>
                  </div>
                  <div className="searchbox">
                    <Search size={17} />
                    <input
                      placeholder="Search name, account or token"
                      value={nfcQuery}
                      onChange={e => setNfcQuery(e.target.value)}
                    />
                  </div>
                </div>
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>CUSTOMER</th>
                        <th>ACCOUNT REF.</th>
                        <th>ACTIVATION TOKEN</th>
                        <th>TAG STATUS</th>
                        <th>ACTIONS</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredNfc.map(c => (
                        <tr key={c.id}>
                          <td>
                            <div className="customer-cell">
                              <div className="customer-avatar">{c.name.split(' ').map(x => x[0]).slice(0, 2).join('')}</div>
                              <div>
                                <b>{c.name}</b>
                                <small>{c.phone || c.email}</small>
                              </div>
                            </div>
                          </td>
                          <td className="mono">{c.accountNumber}</td>
                          <td className="mono" style={{ fontSize: 10 }}>{c.activationToken}</td>
                          <td>
                            <span className={`status-pill ${c.status !== 'active' ? 'inactive' : ''}`}>
                              <i /> {c.status === 'active' ? 'Card active' : 'Card revoked'}
                            </span>
                          </td>
                          <td>
                            <div className="actions-group">
                              <button
                                className="row-action"
                                onClick={() => {
                                  setSelectedNfcCustomer(c);
                                  window.scrollTo({ top: 0, behavior: 'smooth' });
                                }}
                              >
                                <Radio size={13} /> Select for writer
                              </button>
                              <a
                                href={c.activationUrl || `${CUSTOMER}/activate/${c.activationToken}`}
                                target="_blank"
                                rel="noreferrer"
                                className="row-action secondary"
                                style={{ textDecoration: 'none' }}
                              >
                                <ExternalLink size={13} /> Tap test
                              </a>
                              <button
                                className="row-action secondary"
                                onClick={() => handleRegenerateToken(c.id)}
                                title="Reissue new token"
                              >
                                <RefreshCw size={13} /> Reissue
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}

          {/* PAGE: TRANSACTIONS */}
          {page === 'Transactions' && (
            <div className="panel">
              <div className="panel-head directory-head">
                <div>
                  <h2>Simulated transaction activity</h2>
                  <p>{filteredTx.length} records</p>
                </div>
                <div className="searchbox">
                  <Search size={17} />
                  <input
                    placeholder="Search reference, customer or description"
                    value={txQuery}
                    onChange={e => setTxQuery(e.target.value)}
                  />
                </div>
              </div>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>REFERENCE</th>
                      <th>CUSTOMER</th>
                      <th>TYPE</th>
                      <th>DESCRIPTION</th>
                      <th>AMOUNT</th>
                      <th>STATUS</th>
                      <th>DATE</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredTx.map(t => (
                      <tr key={t.id}>
                        <td className="mono">{t.reference}</td>
                        <td>
                          <b>{t.customerName}</b>
                          <small style={{ display: 'block', color: '#9aa4b3', fontSize: 10 }}>{t.customerAccount}</small>
                        </td>
                        <td>
                          <span className={`badge ${t.type === 'credit' ? 'good' : 'info'}`}>
                            {t.type === 'credit' ? <ArrowDownLeft size={11} /> : <ArrowUpRight size={11} />}
                            {t.type}
                          </span>
                        </td>
                        <td>{t.description}</td>
                        <td className="mono" style={{ fontWeight: 700, color: t.type === 'debit' ? '#dc2626' : '#16a34a' }}>
                          {t.type === 'debit' ? '-' : '+'}{t.amount}
                        </td>
                        <td>
                          <span className="badge good"><CheckCircle2 size={11} /> {t.status}</span>
                        </td>
                        <td>{new Date(t.createdAt).toLocaleString('en-NG', { dateStyle: 'medium', timeStyle: 'short' })}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {!filteredTx.length && (
                  <div className="empty-state">
                    <Activity size={28} />
                    <b>No transactions found</b>
                    <p>Run a transfer using the customer voice PWA to create simulated transactions.</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* PAGE: PROTOTYPE SECURITY & SETTINGS */}
          {page === 'Settings' && (
            <div>
              <div className="notice" style={{ background: '#f0fdf4', borderColor: '#bbf7d0', color: '#166534', marginBottom: 20 }}>
                <ShieldCheck size={18} />
                <span>
                  <strong>Prototype Security Environment:</strong> Demonstration safeguards active. All banking balances and money transfers are simulated. No connection to real financial clearing rails.
                </span>
              </div>

              <div className="settings-grid">
                <div className="setting-box">
                  <h3><ShieldCheck size={17} style={{ color: '#6258d9' }} /> WebAuthn & Passkey Security</h3>
                  <p>Cryptographic platform authenticator settings for customer biometric verification.</p>
                  <div className="setting-item">
                    <span>Relying Party ID (RP_ID)</span>
                    <strong>{securitySettings?.rpId || 'localhost'}</strong>
                  </div>
                  <div className="setting-item">
                    <span>Relying Party Name</span>
                    <strong>{securitySettings?.rpName || 'AccessAble Banking'}</strong>
                  </div>
                  <div className="setting-item">
                    <span>User Verification Policy</span>
                    <strong style={{ color: '#16a34a' }}>Required (Biometric/PIN)</strong>
                  </div>
                  <div className="setting-item">
                    <span>Challenge Expiration TTL</span>
                    <strong>{securitySettings?.challengeTtlSeconds || 300} seconds</strong>
                  </div>
                  <div className="setting-item">
                    <span>Biometric Storage Policy</span>
                    <strong style={{ color: '#16a34a' }}>Zero-Storage (Device only)</strong>
                  </div>
                </div>

                <div className="setting-box">
                  <h3><Lock size={17} style={{ color: '#6258d9' }} /> Demonstration Controls & Rails</h3>
                  <p>Simulation boundary controls governing demo balances and transfer limits.</p>
                  <div className="setting-item">
                    <span>Simulation Mode</span>
                    <strong style={{ color: '#16a34a' }}>Active (Simulated DB)</strong>
                  </div>
                  <div className="setting-item">
                    <span>Max Demo Transfer Limit</span>
                    <strong>₦200,000.00 / txn</strong>
                  </div>
                  <div className="setting-item">
                    <span>Staff Authentication</span>
                    <strong style={{ color: '#16a34a' }}>Key Protected (demo-staff)</strong>
                  </div>
                  <div className="setting-item">
                    <span>Spoken PIN Policy</span>
                    <strong style={{ color: '#dc2626' }}>Strictly Disallowed</strong>
                  </div>
                  <div className="setting-item">
                    <span>NFC Token Exposure</span>
                    <strong style={{ color: '#16a34a' }}>Opaque (Zero Account Data)</strong>
                  </div>
                </div>
              </div>

              <div className="panel" style={{ padding: 22 }}>
                <div className="panel-head" style={{ padding: 0, marginBottom: 14 }}>
                  <div>
                    <h2>Reset demo environment</h2>
                    <p>Restore seed customers (John Okafor and Emeka Nwosu) to default balances</p>
                  </div>
                </div>
                <p style={{ fontSize: 12, color: '#64748b', lineHeight: 1.6, margin: '0 0 16px' }}>
                  During testing, transactions reduce demo balances. You can reset demo balances back to starting amounts (₦85,000 for Emeka and ₦125,000 for John) and reactivate their profiles at any time.
                </p>
                <button className="secondary-btn" onClick={promptResetDemo}>
                  <RotateCcw size={15} /> Reset demo balances & statuses
                </button>
              </div>
            </div>
          )}

          <footer>
            © 2026 AccessAble Banking <span>Accessible by design · Prototype v2.1</span>
          </footer>
        </section>
      </main>

      {/* Register Customer Modal */}
      {registerModal && (
        <div className="modal-backdrop" onClick={() => setRegisterModal(false)}>
          <div className="modal wide" onClick={e => e.stopPropagation()}>
            <div className="modal-head">
              <div>
                <span className="eyebrow">CUSTOMER MANAGEMENT</span>
                <h2>{issuedUrl ? 'NFC activation link' : 'Register a customer'}</h2>
              </div>
              <button className="icon-btn" onClick={() => setRegisterModal(false)}><X /></button>
            </div>

            <div className="modal-body">
              {issuedUrl ? (
                <>
                  <div className="success-mark"><CheckCircle2 size={27} /></div>
                  <p className="modal-copy">
                    Activation link created. Write this URL to the customer's NFC tag as an NDEF URL record, or open it directly in a mobile browser.
                  </p>
                  <div className="url-box">{issuedUrl}</div>
                  <div className="form-row">
                    <button className="primary-btn" onClick={() => copyToClipboard(issuedUrl)}>
                      {copied ? <Check size={16} /> : <Copy size={16} />}
                      {copied ? 'Copied to clipboard' : 'Copy activation URL'}
                    </button>
                    <a
                      href={issuedUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="secondary-btn"
                      style={{ textDecoration: 'none' }}
                    >
                      <ExternalLink size={16} /> Test PWA activation
                    </a>
                  </div>
                  <div className="modal-note">
                    <ShieldCheck size={16} />
                    The tag contains an opaque activation token only. No account data or credentials are stored on the tag.
                  </div>
                </>
              ) : (
                <form className="customer-form" onSubmit={handleRegisterCustomer}>
                  <div className="section-heading">1. Customer Information</div>
                  <div className="form-row">
                    <label>
                      Customer full name *
                      <input
                        required
                        value={newCustomer.name}
                        onChange={e => setNewCustomer({ ...newCustomer, name: e.target.value })}
                        placeholder="e.g. Emeka Nwosu"
                      />
                    </label>
                    <label>
                      Account reference *
                      <input
                        required
                        value={newCustomer.accountNumber}
                        onChange={e => setNewCustomer({ ...newCustomer, accountNumber: e.target.value })}
                        placeholder="e.g. AB-1003"
                      />
                    </label>
                  </div>

                  <div className="form-row">
                    <label>
                      Phone number
                      <input
                        value={newCustomer.phone}
                        onChange={e => setNewCustomer({ ...newCustomer, phone: e.target.value })}
                        placeholder="0803..."
                      />
                    </label>
                    <label>
                      Email address
                      <input
                        type="email"
                        value={newCustomer.email}
                        onChange={e => setNewCustomer({ ...newCustomer, email: e.target.value })}
                        placeholder="name@email.com"
                      />
                    </label>
                  </div>

                  <label>
                    Opening demo balance (₦)
                    <input
                      type="number"
                      min="0"
                      value={newCustomer.balance}
                      onChange={e => setNewCustomer({ ...newCustomer, balance: e.target.value })}
                    />
                  </label>

                  <div className="section-heading">2. Accessibility Preferences</div>
                  <div className="form-row">
                    <div className="toggle-row">
                      <span>Voice guidance</span>
                      <input
                        type="checkbox"
                        checked={newCustomer.preferences.voiceGuidance}
                        onChange={e => setNewCustomer({
                          ...newCustomer,
                          preferences: { ...newCustomer.preferences, voiceGuidance: e.target.checked }
                        })}
                      />
                    </div>
                    <div className="toggle-row">
                      <span>Screen reader support</span>
                      <input
                        type="checkbox"
                        checked={newCustomer.preferences.screenReader}
                        onChange={e => setNewCustomer({
                          ...newCustomer,
                          preferences: { ...newCustomer.preferences, screenReader: e.target.checked }
                        })}
                      />
                    </div>
                  </div>

                  <div className="form-row-3">
                    <label>
                      Speech rate
                      <select
                        value={newCustomer.preferences.speechRate}
                        onChange={e => setNewCustomer({
                          ...newCustomer,
                          preferences: { ...newCustomer.preferences, speechRate: parseFloat(e.target.value) }
                        })}
                      >
                        <option value="0.8">0.8x (Slower)</option>
                        <option value="0.94">0.94x (Natural)</option>
                        <option value="1.0">1.0x (Normal)</option>
                        <option value="1.2">1.2x (Faster)</option>
                      </select>
                    </label>
                    <label>
                      Text size
                      <select
                        value={newCustomer.preferences.textSize}
                        onChange={e => setNewCustomer({
                          ...newCustomer,
                          preferences: { ...newCustomer.preferences, textSize: e.target.value }
                        })}
                      >
                        <option value="normal">Normal</option>
                        <option value="large">Large</option>
                        <option value="extra-large">Extra Large</option>
                      </select>
                    </label>
                    <label>
                      Preferred mode
                      <select
                        value={newCustomer.preferences.preferredInteractionMode}
                        onChange={e => setNewCustomer({
                          ...newCustomer,
                          preferences: { ...newCustomer.preferences, preferredInteractionMode: e.target.value }
                        })}
                      >
                        <option value="voice_first">Voice-first</option>
                        <option value="multimodal">Multimodal</option>
                        <option value="visual">Visual / Touch</option>
                      </select>
                    </label>
                  </div>

                  <div className="toggle-row">
                    <span>High contrast theme</span>
                    <input
                      type="checkbox"
                      checked={newCustomer.preferences.highContrast}
                      onChange={e => setNewCustomer({
                        ...newCustomer,
                        preferences: { ...newCustomer.preferences, highContrast: e.target.checked }
                      })}
                    />
                  </div>

                  <div className="section-heading">
                    <span>3. Saved Beneficiaries (Optional)</span>
                    <button
                      type="button"
                      className="text-btn"
                      onClick={() => setNewCustomer({
                        ...newCustomer,
                        beneficiaries: [
                          ...newCustomer.beneficiaries,
                          { nickname: '', accountHolderName: '', accountNumber: '', bankName: 'Access Bank' }
                        ]
                      })}
                    >
                      <Plus size={14} /> Add another
                    </button>
                  </div>

                  {newCustomer.beneficiaries.map((b, idx) => (
                    <div key={idx} className="beneficiary-item" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 8 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <b style={{ fontSize: 11 }}>Beneficiary #{idx + 1}</b>
                        {newCustomer.beneficiaries.length > 1 && (
                          <button
                            type="button"
                            className="text-btn"
                            style={{ color: '#dc2626' }}
                            onClick={() => setNewCustomer({
                              ...newCustomer,
                              beneficiaries: newCustomer.beneficiaries.filter((_, i) => i !== idx)
                            })}
                          >
                            <Trash2 size={13} /> Remove
                          </button>
                        )}
                      </div>
                      <div className="form-row">
                        <label>
                          Nickname (Spoken voice trigger)
                          <input
                            placeholder="e.g. Mama"
                            value={b.nickname}
                            onChange={e => {
                              const list = [...newCustomer.beneficiaries];
                              list[idx].nickname = e.target.value;
                              setNewCustomer({ ...newCustomer, beneficiaries: list });
                            }}
                          />
                        </label>
                        <label>
                          Account holder's name
                          <input
                            placeholder="e.g. Mary Nwosu"
                            value={b.accountHolderName}
                            onChange={e => {
                              const list = [...newCustomer.beneficiaries];
                              list[idx].accountHolderName = e.target.value;
                              setNewCustomer({ ...newCustomer, beneficiaries: list });
                            }}
                          />
                        </label>
                      </div>
                      <div className="form-row">
                        <label>
                          Account number
                          <input
                            placeholder="10 digits"
                            value={b.accountNumber}
                            onChange={e => {
                              const list = [...newCustomer.beneficiaries];
                              list[idx].accountNumber = e.target.value;
                              setNewCustomer({ ...newCustomer, beneficiaries: list });
                            }}
                          />
                        </label>
                        <label>
                          Bank name
                          <input
                            placeholder="e.g. Access Bank"
                            value={b.bankName}
                            onChange={e => {
                              const list = [...newCustomer.beneficiaries];
                              list[idx].bankName = e.target.value;
                              setNewCustomer({ ...newCustomer, beneficiaries: list });
                            }}
                          />
                        </label>
                      </div>
                    </div>
                  ))}

                  <button className="primary-btn full" type="submit">
                    <Plus size={17} /> Register customer & create NFC link
                  </button>
                </form>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Customer Management Modal */}
      {manageModal && selectedCustomerData && (
        <div className="modal-backdrop" onClick={() => setManageModal(false)}>
          <div className="modal wide" onClick={e => e.stopPropagation()}>
            <div className="modal-head">
              <div>
                <span className="eyebrow">CUSTOMER PROFILE & CONFIGURATION</span>
                <h2>{selectedCustomerData.customer.name}</h2>
              </div>
              <button className="icon-btn" onClick={() => setManageModal(false)}><X /></button>
            </div>

            <div className="modal-tabs">
              <button
                className={`modal-tab ${customerModalTab === 'overview' ? 'active' : ''}`}
                onClick={() => setCustomerModalTab('overview')}
              >
                Overview & NFC
              </button>
              <button
                className={`modal-tab ${customerModalTab === 'edit' ? 'active' : ''}`}
                onClick={() => setCustomerModalTab('edit')}
              >
                Edit details
              </button>
              <button
                className={`modal-tab ${customerModalTab === 'accessibility' ? 'active' : ''}`}
                onClick={() => setCustomerModalTab('accessibility')}
              >
                Accessibility ({selectedCustomerData.accessibilityPreferences?.textSize || 'Normal'})
              </button>
              <button
                className={`modal-tab ${customerModalTab === 'beneficiaries' ? 'active' : ''}`}
                onClick={() => setCustomerModalTab('beneficiaries')}
              >
                Beneficiaries ({selectedCustomerData.beneficiaries?.length || 0})
              </button>
            </div>

            <div className="modal-body">
              {customerModalTab === 'overview' && (
                <div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 18 }}>
                    <div className="stat-card" style={{ padding: 12 }}>
                      <span style={{ fontSize: 10, color: '#64748b' }}>Account reference</span>
                      <strong style={{ fontSize: 15, margin: '4px 0', fontFamily: 'monospace' }}>
                        {selectedCustomerData.customer.accountNumber}
                      </strong>
                    </div>
                    <div className="stat-card" style={{ padding: 12 }}>
                      <span style={{ fontSize: 10, color: '#64748b' }}>Demo balance</span>
                      <strong style={{ fontSize: 15, margin: '4px 0', color: '#16a34a' }}>
                        {selectedCustomerData.customer.formattedBalance}
                      </strong>
                    </div>
                    <div className="stat-card" style={{ padding: 12 }}>
                      <span style={{ fontSize: 10, color: '#64748b' }}>Status</span>
                      <div style={{ marginTop: 6 }}>
                        <span className={`status-pill ${selectedCustomerData.customer.status !== 'active' ? 'inactive' : ''}`}>
                          <i /> {selectedCustomerData.customer.status}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="section-heading">Biometric / Passkey Registration Status</div>
                  <div className="beneficiary-item">
                    <div>
                      <b>Platform authenticator passkey</b>
                      <span>
                        {selectedCustomerData.credentials?.length > 0
                          ? `Registered on customer device (${selectedCustomerData.credentials.length} credential active)`
                          : 'Not yet enrolled. Customer will be prompted on their initial NFC tap.'}
                      </span>
                    </div>
                    {selectedCustomerData.credentials?.length > 0 ? (
                      <span className="badge good"><ShieldCheck size={14} /> Passkey enrolled</span>
                    ) : (
                      <span className="badge pending">Awaiting enrolment</span>
                    )}
                  </div>

                  <div className="section-heading">NFC Tag Activation Link</div>
                  <p className="modal-copy">
                    Write this opaque token link to an NDEF tag or open directly on the customer's phone:
                  </p>
                  <div className="url-box">{selectedCustomerData.activationUrl}</div>
                  <div className="actions-group">
                    <button className="primary-btn" onClick={() => copyToClipboard(selectedCustomerData.activationUrl)}>
                      {copied ? <Check size={16} /> : <Copy size={16} />}
                      {copied ? 'Copied' : 'Copy NFC URL'}
                    </button>
                    <a
                      href={selectedCustomerData.activationUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="secondary-btn"
                      style={{ textDecoration: 'none' }}
                    >
                      <ExternalLink size={16} /> Open PWA
                    </a>
                    <button className="secondary-btn" onClick={() => handleRegenerateToken()}>
                      <RefreshCw size={14} /> Reissue token
                    </button>
                  </div>

                  <div className="section-heading" style={{ marginTop: 24 }}>Account Lifecycle Actions</div>
                  <div style={{ display: 'flex', gap: 10 }}>
                    <button
                      className={selectedCustomerData.customer.status === 'active' ? 'danger-btn' : 'primary-btn'}
                      onClick={() => promptToggleStatus(selectedCustomerData.customer)}
                    >
                      {selectedCustomerData.customer.status === 'active' ? <UserX size={15} /> : <UserCheck size={15} />}
                      {selectedCustomerData.customer.status === 'active' ? 'Deactivate customer account' : 'Reactivate customer account'}
                    </button>
                  </div>
                </div>
              )}

              {customerModalTab === 'edit' && (
                <form className="customer-form" onSubmit={handleUpdateCustomer}>
                  <label>
                    Customer full name
                    <input
                      required
                      value={editFormData.name}
                      onChange={e => setEditFormData({ ...editFormData, name: e.target.value })}
                    />
                  </label>
                  <div className="form-row">
                    <label>
                      Phone number
                      <input
                        value={editFormData.phone}
                        onChange={e => setEditFormData({ ...editFormData, phone: e.target.value })}
                      />
                    </label>
                    <label>
                      Email address
                      <input
                        type="email"
                        value={editFormData.email}
                        onChange={e => setEditFormData({ ...editFormData, email: e.target.value })}
                      />
                    </label>
                  </div>
                  <label>
                    Simulated balance (₦)
                    <input
                      type="number"
                      min="0"
                      value={editFormData.balance}
                      onChange={e => setEditFormData({ ...editFormData, balance: e.target.value })}
                    />
                  </label>
                  <button className="primary-btn full" type="submit">
                    <Check size={16} /> Save customer changes
                  </button>
                </form>
              )}

              {customerModalTab === 'accessibility' && (
                <form className="customer-form" onSubmit={handleUpdatePreferences}>
                  <div className="form-row">
                    <div className="toggle-row">
                      <span>Voice guidance</span>
                      <input
                        type="checkbox"
                        checked={editPrefsData.voiceGuidance}
                        onChange={e => setEditPrefsData({ ...editPrefsData, voiceGuidance: e.target.checked })}
                      />
                    </div>
                    <div className="toggle-row">
                      <span>Screen reader support</span>
                      <input
                        type="checkbox"
                        checked={editPrefsData.screenReader}
                        onChange={e => setEditPrefsData({ ...editPrefsData, screenReader: e.target.checked })}
                      />
                    </div>
                  </div>

                  <div className="form-row-3">
                    <label>
                      Speech rate
                      <select
                        value={editPrefsData.speechRate}
                        onChange={e => setEditPrefsData({ ...editPrefsData, speechRate: parseFloat(e.target.value) })}
                      >
                        <option value="0.8">0.8x (Slower)</option>
                        <option value="0.94">0.94x (Natural)</option>
                        <option value="1.0">1.0x (Normal)</option>
                        <option value="1.2">1.2x (Faster)</option>
                      </select>
                    </label>
                    <label>
                      Text size
                      <select
                        value={editPrefsData.textSize}
                        onChange={e => setEditPrefsData({ ...editPrefsData, textSize: e.target.value })}
                      >
                        <option value="normal">Normal</option>
                        <option value="large">Large</option>
                        <option value="extra-large">Extra Large</option>
                      </select>
                    </label>
                    <label>
                      Preferred mode
                      <select
                        value={editPrefsData.preferredInteractionMode}
                        onChange={e => setEditPrefsData({ ...editPrefsData, preferredInteractionMode: e.target.value })}
                      >
                        <option value="voice_first">Voice-first</option>
                        <option value="multimodal">Multimodal</option>
                        <option value="visual">Visual / Touch</option>
                      </select>
                    </label>
                  </div>

                  <div className="toggle-row">
                    <span>High contrast theme</span>
                    <input
                      type="checkbox"
                      checked={editPrefsData.highContrast}
                      onChange={e => setEditPrefsData({ ...editPrefsData, highContrast: e.target.checked })}
                    />
                  </div>

                  <button className="primary-btn full" type="submit">
                    <Sliders size={16} /> Update accessibility preferences
                  </button>
                </form>
              )}

              {customerModalTab === 'beneficiaries' && (
                <div>
                  <div className="section-heading">
                    <span>Registered Voice Beneficiaries</span>
                    {!showAddBen && (
                      <button className="text-btn" onClick={() => setShowAddBen(true)}>
                        <Plus size={14} /> Add beneficiary
                      </button>
                    )}
                  </div>

                  {showAddBen && (
                    <form className="customer-form" onSubmit={handleAddBeneficiary} style={{ marginBottom: 18, padding: 12, background: '#f8fafc', borderRadius: 9, border: '1px solid #e2e8f0' }}>
                      <b style={{ fontSize: 11 }}>Add New Beneficiary</b>
                      <div className="form-row">
                        <label>
                          Nickname (Spoken voice trigger) *
                          <input
                            required
                            placeholder="e.g. Mama"
                            value={newBen.nickname}
                            onChange={e => setNewBen({ ...newBen, nickname: e.target.value })}
                          />
                        </label>
                        <label>
                          Account holder's name
                          <input
                            placeholder="e.g. Mary Nwosu"
                            value={newBen.accountHolderName}
                            onChange={e => setNewBen({ ...newBen, accountHolderName: e.target.value })}
                          />
                        </label>
                      </div>
                      <div className="form-row">
                        <label>
                          Account number *
                          <input
                            required
                            placeholder="10 digits"
                            value={newBen.accountNumber}
                            onChange={e => setNewBen({ ...newBen, accountNumber: e.target.value })}
                          />
                        </label>
                        <label>
                          Bank name
                          <input
                            placeholder="e.g. Access Bank"
                            value={newBen.bankName}
                            onChange={e => setNewBen({ ...newBen, bankName: e.target.value })}
                          />
                        </label>
                      </div>
                      <div className="actions-group">
                        <button className="primary-btn" type="submit">
                          <Plus size={15} /> Save beneficiary
                        </button>
                        <button className="secondary-btn" type="button" onClick={() => setShowAddBen(false)}>
                          Cancel
                        </button>
                      </div>
                    </form>
                  )}

                  <div style={{ display: 'grid', gap: 8 }}>
                    {selectedCustomerData.beneficiaries?.map(b => (
                      <div key={b.id} className="beneficiary-item">
                        <div>
                          <b>"{b.nickname}" ({b.accountHolderName || b.nickname})</b>
                          <span>{b.bankName} · {b.accountNumber}</span>
                        </div>
                        <div className="actions-group">
                          <button
                            className="icon-btn"
                            title="Remove beneficiary"
                            style={{ width: 30, height: 30, color: '#dc2626' }}
                            onClick={() => promptDeleteBeneficiary(b)}
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                    ))}
                    {!selectedCustomerData.beneficiaries?.length && (
                      <div className="empty-state" style={{ padding: 25 }}>
                        <Users size={20} />
                        <b>No beneficiaries registered</b>
                        <p>Add a beneficiary with a friendly nickname (e.g. "Mama") for voice transfers.</p>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Dialog */}
      {confirmDialog.open && (
        <div className="modal-backdrop" onClick={() => setConfirmDialog({ ...confirmDialog, open: false })}>
          <div className="modal" style={{ maxWidth: 440 }} onClick={e => e.stopPropagation()}>
            <div className="modal-head">
              <h2>{confirmDialog.title}</h2>
              <button className="icon-btn" onClick={() => setConfirmDialog({ ...confirmDialog, open: false })}><X /></button>
            </div>
            <p className="modal-copy" style={{ marginBottom: 20 }}>
              {confirmDialog.message}
            </p>
            <div className="form-row">
              <button
                className={confirmDialog.danger ? 'danger-btn' : 'primary-btn'}
                onClick={async () => {
                  setConfirmDialog({ ...confirmDialog, open: false });
                  if (confirmDialog.onConfirm) await confirmDialog.onConfirm();
                }}
              >
                Confirm action
              </button>
              <button
                className="secondary-btn"
                onClick={() => setConfirmDialog({ ...confirmDialog, open: false })}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Compact, non-scrollable table for the Overview dashboard
function OverviewCustomerTable({ rows, onManage }) {
  return (
    <table className="compact">
      <thead>
        <tr>
          <th>CUSTOMER</th>
          <th>BIOMETRIC</th>
          <th>STATUS</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        {rows.map(c => (
          <tr key={c.id}>
            <td>
              <div className="customer-cell">
                <div className={`customer-avatar ${c.status !== 'active' ? 'danger' : ''}`}>
                  {c.name.split(' ').map(x => x[0]).slice(0, 2).join('')}
                </div>
                <div>
                  <b>{c.name}</b>
                  <small className="mono">{c.accountNumber}</small>
                </div>
              </div>
            </td>
            <td>
              {c.passkeyRegistered ? (
                <span className="badge good"><ShieldCheck size={12} /> Set</span>
              ) : (
                <span className="badge pending">None</span>
              )}
            </td>
            <td>
              <span className={`status-pill ${c.status !== 'active' ? 'inactive' : ''}`}>
                <i /> {c.status}
              </span>
            </td>
            <td style={{ textAlign: 'right' }}>
              <button className="row-action" onClick={() => onManage(c)} title="View & edit customer">
                <Eye size={13} /> View
              </button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// Full detailed table for the Customers directory
function FullCustomerTable({ rows, onManage, onIssue }) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>CUSTOMER</th>
            <th>ACCOUNT REF.</th>
            <th>BALANCE</th>
            <th>BIOMETRIC</th>
            <th>BENEFICIARIES</th>
            <th>STATUS</th>
            <th>ACTIONS</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(c => (
            <tr key={c.id}>
              <td>
                <div className="customer-cell">
                  <div className={`customer-avatar ${c.status !== 'active' ? 'danger' : ''}`}>
                    {c.name.split(' ').map(x => x[0]).slice(0, 2).join('')}
                  </div>
                  <div>
                    <b>{c.name}</b>
                    <small>{c.phone || c.email || 'Customer profile'}</small>
                  </div>
                </div>
              </td>
              <td className="mono">{c.accountNumber}</td>
              <td className="mono" style={{ fontWeight: 600 }}>{c.formattedBalance || money(c.balance)}</td>
              <td>
                {c.passkeyRegistered ? (
                  <span className="badge good"><ShieldCheck size={13} /> Passkey set</span>
                ) : (
                  <span className="badge pending">Not enrolled</span>
                )}
              </td>
              <td>
                <span className="badge info">{c.beneficiaryCount || 0} saved</span>
              </td>
              <td>
                <span className={`status-pill ${c.status !== 'active' ? 'inactive' : ''}`}>
                  <i /> {c.status}
                </span>
              </td>
              <td>
                <div className="actions-group">
                  <button className="row-action" onClick={() => onManage(c)} title="View & edit customer">
                    <Edit3 size={13} /> Manage
                  </button>
                  <button className="row-action secondary" onClick={() => onIssue(c)} title="View NFC token link">
                    <Link2 size={13} /> NFC
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {!rows.length && (
        <div className="empty-state">
          <Users size={28} />
          <b>No customers found</b>
          <p>Try another search or register a new customer profile.</p>
        </div>
      )}
    </div>
  );
}

createRoot(document.getElementById('root')).render(<App />);
