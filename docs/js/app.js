/**
 * =================================================================
 * SOCIETY MANAGEMENT APP - MAIN LOGIC ENGINE
 * =================================================================
 */

document.addEventListener('alpine:init', () => {

    /**
     * -----------------------------------------------------------------
     * MODULE 1: APP SERVICES (Private Logic Layer)
     * -----------------------------------------------------------------
     */
    const AppServices = (() => {

        // --- CONSTANTS ---
        const MONTHS_MAP = {jan:0, feb:1, mar:2, apr:3, may:4, jun:5, jul:6, aug:7, sep:8, oct:9, nov:10, dec:11};
        const MONTHS_ARRAY = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

        // --- UTILITIES ---
        const LocalTimeHelper = {
            getLocalISOString: function() {
                const now = new Date();
                const offset = now.getTimezoneOffset() * 60000; 
                return new Date(now.getTime() - offset).toISOString();
            }
        };

        const safeString = (val) => String(val !== null && val !== undefined ? val : '').trim();

        const normalizeFlat = (val) => {
            const s = safeString(val);
            const n = Number(s);
            return (s !== '' && !isNaN(n)) ? String(n) : s;
        };

        // --- DOMAIN MODELS ---

        class Settings {
            constructor(data) {
                this._config = {};

                // ... (Existing Date Parsing Logic) ...
                const formatMonthString = (dateValue) => {
                    if (!dateValue) return 'Sep-2025';
                    if (typeof dateValue === 'string' && (dateValue.includes('T') || dateValue.includes('Z'))) {
                        try {
                            const d = new Date(dateValue);
                            const monthName = MONTHS_ARRAY[d.getMonth()];
                            return `${monthName}-${d.getFullYear()}`;
                        } catch (e) {
                            return String(dateValue);
                        }
                    }
                    return String(dateValue);
                };

                if (Array.isArray(data)) {
                    data.forEach(row => {
                        const key = safeString(row.Key || row.key || row.Name || row.name);
                        let val = row.Value || row.value;
                        if (key.toLowerCase().includes('startfrom')) val = formatMonthString(val);
                        if (key) {
                            this._config[key] = val;
                            this._config[key.toLowerCase()] = val;
                        }
                    });
                } else if (typeof data === 'object' && data !== null) {
                    Object.keys(data).forEach(key => {
                        const cleanKey = safeString(key);
                        let val = data[key];
                        if (cleanKey.toLowerCase().includes('startfrom')) val = formatMonthString(val);
                        this._config[cleanKey] = val;
                        this._config[cleanKey.toLowerCase()] = val;
                    });
                }
            }

            get societyName() { return this._config['SocietyName'] || this._config['societyname'] || 'Green Valley Heights'; }
            get societyAddress() { return this._config['SocietyAddress'] || this._config['societyaddress'] || 'Sector 42, Maintenance Drive'; }
            get monthlyFee() { return parseFloat(this._config['MonthlyMaintainenceAmount'] || this._config['monthlymaintainenceamount'] || 150); }
            get startMonthStr() { return this._config['MonthlyMaintainenceStartFrom'] || this._config['monthlymaintainencestartfrom'] || 'Sep-2025'; }
            
            // Compatibility
            get SocietyName() { return this.societyName; }
            get SocietyAddress() { return this.societyAddress; }
            get KeyValueMonthlyMaintainenceStartFrom() { return this.startMonthStr; }
            get MonthlyMaintainenceAmount() { return this.monthlyFee; }
        }

        class Payment {
            constructor(data) {
                this.id = data.PaymentID || data.id;
                this.amount = parseFloat(data.Amount || data.amount || 0);
                this.status = safeString(data.Status || data.status || 'Pending');
                this.type = safeString(data.Type || data.type || 'Monthly');
                this.category = safeString(data.Category || data.category || 'Maintenance');
                this.remarks = safeString(data.Remarks || data.remarks);
                this.method = safeString(data.PaymentMethod || data.method || 'UPI');
                
                this.rawDate = data.PaymentDate || data.date;
                this.rawMonth = data.Month || data.month;
                this.flatNo = normalizeFlat(data.FlatNo || data.flat);
            }

            get monthKey() {
                if (!this.rawMonth) return '';
                if (/^\d{4}-\d{2}$/.test(this.rawMonth)) return this.rawMonth;
                try {
                    const d = new Date(this.rawMonth);
                    if (!isNaN(d.getTime())) {
                        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
                    }
                } catch(e) {}
                return '';
            }

            get isPaidStrict() { return this.status.toLowerCase() === 'paid'; }
            get isInReview() { const s = this.status.toLowerCase(); return s !== 'paid' && s !== 'rejected'; }
            get isPaidOrPendingValidation() { 
                const s = this.status.toLowerCase();
                return s === 'paid' || s === 'pending validation'; 
            }
            get isMonthly() { return this.type.toLowerCase() === 'monthly' || this.category.toLowerCase() === 'monthly'; }
        }

        class Resident {
            constructor(flatData, rawResidentData, paymentHistory) {
                this.flat = normalizeFlat(flatData.FlatNo || flatData.flat);
                this.due = parseFloat(flatData.Due || flatData.Pending || 0);
                
                this.occupants = (rawResidentData || []).map(r => ({
                    name: safeString(r.Name || r.name || 'Unknown'),
                    phone: safeString(r.Phone || r.Mobile),
                    email: safeString(r.Email || r.email), 
                    type: safeString(r.Type || r.ResidentType || 'Owner')
                }));

                this.history = paymentHistory || []; 
                this.lastPayment = this.history.length > 0 ? this.history[0] : null; 
            }

            getPendingMonthsList(settings) {
                const startStr = settings.startMonthStr;
                const monthlyAmount = settings.monthlyFee;

                const parts = startStr.split('-');
                if (parts.length !== 2) return [];

                let startMonth = MONTHS_MAP[parts[0].trim().toLowerCase().substring(0, 3)];
                let startYear = parseInt(parts[1]);

                if (startMonth === undefined) return [];
                
                const now = new Date();
                const endYear = now.getFullYear();
                const endMonth = now.getMonth();
                
                let list = [];
                let currY = startYear;
                let currM = startMonth;
                let safety = 0;

                while ((currY < endYear || (currY === endYear && currM <= endMonth)) && safety < 120) {
                    const monthKey = `${currY}-${String(currM + 1).padStart(2, '0')}`;

                    const isPaid = this.history.some(p => 
                        p.isMonthly && p.isPaidOrPendingValidation && p.monthKey === monthKey
                    );

                    if (!isPaid) {
                        list.push({ label: `${MONTHS_ARRAY[currM]} ${currY}`, value: monthKey, amount: monthlyAmount });
                    }

                    currM++;
                    if (currM > 11) { currM = 0; currY++; }
                    safety++;
                }
                return list.reverse(); 
            }
        }

        // --- REPOSITORY LAYER ---

        class SocietyRepository {
            constructor(apiUrl) {
                this.apiUrl = apiUrl;
                this.residents = [];
                this.admins = []; // New Store for Admins
                this.settings = new Settings({});
                this.isLoading = false;
            }

            async fetchData() {
                this.isLoading = true;
                try {
                    if (!this.apiUrl) throw new Error("API URL Missing");

                    const response = await fetch(this.apiUrl + '?action=getData'); 
                    const result = await response.json();

                    const rawFlats = result.flats || [];
                    const rawResidents = result.residents || [];
                    const rawPayments = result.payments || [];
                    
                    this.settings = new Settings(result.settings);
                    this.admins = result.admins || []; // Hydrate admins list

                    const allPayments = (result.payments || []).map(p => new Payment(p));
                    
                    this.residents = (rawFlats || []).map((f, index) => {
                        try {
                            const matchKey = normalizeFlat(f.FlatNo || f.flat);
                            
                            const residentPayments = allPayments
                                .filter(p => p.flatNo === matchKey)
                                .sort((a, b) => new Date(b.rawDate) - new Date(a.rawDate));

                            const residentData = rawResidents.filter(r => normalizeFlat(r.FlatNo || r.flat) === matchKey);
                            const resident = new Resident(f, residentData, residentPayments);

                            resident.id = index;
                            resident.searchStr = `${resident.flat} ${resident.occupants.map(o => o.name).join(' ')}`.toLowerCase();
                            
                            const pendingList = resident.getPendingMonthsList(this.settings);
                            resident.totalPendingDue = pendingList.reduce((sum, m) => sum + m.amount, 0);
                            resident.isPaid = resident.totalPendingDue <= 0;

                            return resident;
                        } catch (e) {
                            return null;
                        }
                    }).filter(r => r !== null);

                    return true;
                } catch (error) {
                    console.error("Fetch API Error:", error);
                    return false; 
                } finally {
                    this.isLoading = false;
                }
            }

            async addPayment(formData) {
                // ... (Same as before)
                const paymentId = Date.now().toString(); 
                const timestamp = new Date().toLocaleString();
                let finalTitle = formData.title;
                if (formData.category === 'Monthly') finalTitle = `Maint: ${formData.month}`; 

                const payload = {
                    PaymentID: paymentId,
                    FlatNo: formData.flatNo,
                    Category: formData.category,
                    Title: finalTitle,
                    Month: formData.month,
                    Amount: formData.amount,
                    PaymentDate: formData.paymentDate.replace('T', ' '),
                    PaymentMethod: formData.method,
                    Status: 'Pending Validation',
                    Remarks: `${formData.remarks} [Logged: ${timestamp}]`
                };

                try {
                    const response = await fetch(this.apiUrl + '?action=addPayment', {
                        method: 'POST',
                        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                        body: JSON.stringify(payload)
                    });
                    const result = await response.json();
                    return result.success;
                } catch (error) {
                    console.error("Add Payment Error:", error);
                    return false;
                }
            }

            // NEW: Approve Payment (Update Status with Admin Info)
            async updatePaymentStatus(paymentId, newStatus, adminName, comments) {
                const timestamp = new Date().toLocaleString();
                const payload = {
                    action: 'UPDATE',
                    PaymentID: paymentId,
                    Status: newStatus,
                    ValidatedBy: adminName,
                    ValidationTime: timestamp,
                    ValidationComments: comments || ''
                };

                try {
                    const response = await fetch(this.apiUrl + '?action=updatePayment', {
                        method: 'POST',
                        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                        body: JSON.stringify(payload)
                    });
                    const result = await response.json();
                    return result.success;
                } catch (error) {
                    console.error("Update Payment Error:", error);
                    return false;
                }
            }
        }
        
        return { SocietyRepository, LocalTimeHelper, Resident, Settings };
    })();

    // --- VIEW MODEL ---
    window.societyApp = (api_url) => ({
        repository: new AppServices.SocietyRepository(api_url),
        getLocalISOString: AppServices.LocalTimeHelper.getLocalISOString,

        view: 'home', 
        searchQuery: '',
        filterStatus: 'all',
        currentDate: '',
        isLoading: true, 
        isSubmitting: false,
        txnSuccess: false,
        
        residents: [],
        settings: {}, 
        
        activeResident: { flat: '...', occupants: [], history: [], due: 0, pendingList: [], stats: { totalPaid: 0, pendingValidation: 0, currentDue: 0 } }, 
        txnForm: { flatNo: '', amount: '', category: 'Monthly', title: '', month: '', paymentDate: '', method: 'UPI', remarks: '' },

        // ADMIN STATE
        admin: {
            isLoggedIn: false,
            currentUser: null,
            username: '',
            password: '',
            error: ''
        },

        init() {
            this.updateDate();
            this.resetTxnForm();
            this.fetchAndHydrate();
        },

        async fetchAndHydrate() {
            this.isLoading = true;
            await this.repository.fetchData();
            this.residents = this.repository.residents;
            this.settings = this.repository.settings;
            this.isLoading = false; 
        },

        // --- DASHBOARD STATISTICS ---
        get dashboardStats() {
            const stats = {
                flatsCount: this.residents.length,
                ownersCount: 0,
                tenantsCount: 0,
                totalCollection: 0,
                monthlyCollection: 0,
                adhocCollection: 0,
                currMonthCollection: 0, 
                prevMonthCollection: 0, 
                recentTransactions: [],
                cashInHand: 0, expenses: 0
            };

            this.residents.forEach(r => {
                r.occupants.forEach(o => {
                    if (o.type.toLowerCase() === 'owner') stats.ownersCount++;
                    if (o.type.toLowerCase() === 'tenant') stats.tenantsCount++;
                });
            });

            const now = new Date();
            const currentY = now.getFullYear();
            const currentM = now.getMonth();
            const prevDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
            const prevY = prevDate.getFullYear();
            const prevM = prevDate.getMonth();

            const allPayments = this.residents.flatMap(r => r.history);
            
            allPayments.forEach(p => {
                if (p.isPaidOrPendingValidation) { 
                    stats.totalCollection += p.amount;
                    if (p.isMonthly) stats.monthlyCollection += p.amount;
                    else stats.adhocCollection += p.amount;

                    try {
                        const pDate = new Date(p.rawDate);
                        if (!isNaN(pDate.getTime())) {
                            const pY = pDate.getFullYear();
                            const pMonth = pDate.getMonth();
                            if (pY === currentY && pMonth === currentM) stats.currMonthCollection += p.amount;
                            if (pY === prevY && pMonth === prevM) stats.prevMonthCollection += p.amount;
                        }
                    } catch(e) {}
                }
            });

            stats.recentTransactions = allPayments
                .sort((a, b) => new Date(b.rawDate) - new Date(a.rawDate))
                .slice(0, 5)
                .map(txn => this.mapTransactionForDisplay(txn));

            return stats;
        },

        // --- ADMIN VALIDATION LOGIC ---
        
        get pendingValidationList() {
            const allPayments = this.residents.flatMap(r => r.history);
            return allPayments
                .filter(p => p.status === 'Pending Validation')
                .sort((a, b) => new Date(b.rawDate) - new Date(a.rawDate))
                .map(txn => this.mapTransactionForDisplay(txn));
        },

        get pendingStats() {
            const list = this.pendingValidationList;
            return {
                count: list.length,
                totalAmount: list.reduce((sum, p) => sum + p.amount, 0)
            };
        },

        login() {
            this.admin.error = '';
            // Match against repository.admins list
            const foundAdmin = this.repository.admins.find(
                a => (a.AdminUserName || a.adminusername) === this.admin.username && 
                     (String(a.AdminPassword || a.adminpassword)) === this.admin.password
            );

            if (foundAdmin) {
                this.admin.isLoggedIn = true;
                this.admin.currentUser = this.admin.username;
                this.admin.password = ''; 
            } else {
                this.admin.error = 'Invalid Credentials';
            }
        },

        logout() {
            this.admin.isLoggedIn = false;
            this.admin.currentUser = null;
            this.view = 'home';
        },

        async approvePayment(paymentId) {
            this.isSubmitting = true;
            const adminName = this.admin.currentUser || 'Admin';
            const success = await this.repository.updatePaymentStatus(paymentId, 'Paid', adminName, 'Approved via App');
            
            if (success) {
                await this.fetchAndHydrate();
            } else {
                alert("Failed to update status.");
            }
            this.isSubmitting = false;
        },

        // UI HELPER
        mapTransactionForDisplay(txn) {
            const resident = this.residents.find(r => r.flat === txn.flatNo);
            let displayResidentName = "Unknown Resident";
            let payerType = "Owner"; 

            if (resident && resident.occupants.length > 0) {
                const tenant = resident.occupants.find(o => o.type.toLowerCase() === 'tenant');
                const owner = resident.occupants.find(o => o.type.toLowerCase() === 'owner');
                
                if (txn.isMonthly && tenant) {
                    displayResidentName = tenant.name;
                    payerType = "Tenant";
                } else if (owner) {
                    displayResidentName = owner.name;
                    payerType = "Owner";
                } else {
                    displayResidentName = resident.occupants[0].name;
                }
            } else if (resident) {
                displayResidentName = `Flat ${resident.flat}`;
            }

            let displayPaymentFor = txn.category;
            if (txn.isMonthly) {
                try {
                    const d = new Date(txn.rawMonth);
                    if (!isNaN(d.getTime())) {
                        displayPaymentFor = d.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
                    } else {
                        const parts = txn.monthKey.split('-');
                        if (parts.length === 2) {
                            const temp = new Date(parseInt(parts[0]), parseInt(parts[1])-1, 1);
                            displayPaymentFor = temp.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
                        }
                    }
                } catch(e) {}
            }

            const fullDateTime = new Date(txn.rawDate).toLocaleString('en-GB', {
                day: 'numeric', month: 'short', year: 'numeric', 
                hour: '2-digit', minute: '2-digit', hour12: true
            }).toUpperCase();

            return {
                ...txn,
                isMonthly: txn.isMonthly,
                displayFlat: resident ? resident.flat : txn.flatNo,
                displayResidentName: displayResidentName,
                displayPaymentFor: displayPaymentFor,
                fullDateTime: fullDateTime,
                payerType: payerType
            };
        },

        updateDate() {
            const date = new Date();
            this.currentDate = date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }).toUpperCase();
        },

        calculatePendingMonths(startStr, amount, history) {
            const tempResident = new AppServices.Resident({}, [], history);
            const tempSettings = new AppServices.Settings({
                MonthlyMaintainenceStartFrom: startStr,
                MonthlyMaintainenceAmount: amount
            });
            return tempResident.getPendingMonthsList(tempSettings);
        },

        get filteredResidents() {
            let data = this.residents || [];
            if (this.filterStatus === 'paid') data = data.filter(r => r.isPaid);
            if (this.filterStatus === 'unpaid') data = data.filter(r => !r.isPaid);
            if (this.searchQuery) data = data.filter(r => r.searchStr.includes(this.searchQuery.toLowerCase()));
            return data;
        },

        openHistory(resident) {
            this.activeResident = resident;
            const totalPaid = resident.history.filter(p => p.isPaidStrict).reduce((sum, p) => sum + p.amount, 0);
            const pendingVal = resident.history.filter(p => p.isInReview).reduce((sum, p) => sum + p.amount, 0);
            const pendingList = resident.getPendingMonthsList(this.settings);
            this.activeResident.stats = { totalPaid: totalPaid, pendingValidation: pendingVal, currentDue: resident.totalPendingDue };
            this.activeResident.pendingList = pendingList; 
            this.view = 'history';
            window.scrollTo(0,0);
        },

        payPending(monthIso, amount) {
            this.resetTxnForm();
            this.txnForm.flatNo = this.activeResident.flat;
            this.txnForm.category = 'Monthly';
            this.txnForm.month = monthIso;
            this.txnForm.amount = amount;
            this.view = 'add';
        },

        resetTxnForm() {
            this.txnSuccess = false;
            this.txnForm.amount = '';
            this.txnForm.remarks = '';
            this.txnForm.flatNo = ''; 
            const iso = this.getLocalISOString();
            this.txnForm.paymentDate = iso.slice(0, 16);
            this.txnForm.month = iso.slice(0, 7);
        },

        async saveTransaction() {
            this.isSubmitting = true;
            const success = await this.repository.addPayment(this.txnForm);
            if (success) { await this.fetchAndHydrate(); this.txnSuccess = true; } 
            else { this.txnSuccess = false; }
            this.isSubmitting = false;
        }
    });
});