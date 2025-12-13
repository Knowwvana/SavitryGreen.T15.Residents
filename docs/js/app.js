/**
 * =================================================================
 * SOCIETY MANAGEMENT APP - MAIN LOGIC ENGINE
 * =================================================================
 */

document.addEventListener('alpine:init', () => {

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
                this._config = data || {}; 

                const formatMonthString = (dateValue) => {
                    if (!dateValue) return 'Sep-2025';
                    if (typeof dateValue === 'string' && (dateValue.includes('T') || dateValue.includes('Z'))) {
                        try {
                            const d = new Date(dateValue);
                            const monthName = MONTHS_ARRAY[d.getMonth()];
                            return `${monthName}-${d.getFullYear()}`;
                        } catch (e) { return String(dateValue); }
                    }
                    return String(dateValue);
                };

                if (this._config.MonthlyMaintainenceStartFrom) {
                    this._config.MonthlyMaintainenceStartFrom = formatMonthString(this._config.MonthlyMaintainenceStartFrom);
                }
            }

            get societyName() { return this._config.SocietyName || 'Green Valley Heights'; }
            get societyAddress() { return this._config.SocietyAddress || 'Sector 42, Maintenance Drive'; }
            get monthlyFee() { return parseFloat(this._config.MonthlyMaintainenceAmount || 150); }
            get startMonthStr() { return this._config.MonthlyMaintainenceStartFrom || 'Sep-2025'; }
            
            get SocietyName() { return this.societyName; }
            get SocietyAddress() { return this.societyAddress; }
        }

        class Payment {
            constructor(data) {
                this.id = (data.PaymentID && String(data.PaymentID).trim() !== "") 
                          ? String(data.PaymentID) 
                          : ('temp_' + Math.random().toString(36).substr(2, 9));
                
                this.amount = parseFloat(data.Amount || 0);
                this.status = safeString(data.Status || 'Pending');
                this.category = safeString(data.Category || 'Maintenance');
                this.title = safeString(data.Title);
                this.remarks = safeString(data.Remarks);
                this.method = safeString(data.PaymentMethod || 'UPI');
                
                this.validatedBy = safeString(data.ValidatedBy);
                this.validationTime = safeString(data.ValidationTime);
                this.validationComments = safeString(data.ValidationComments);
                
                this.rawDate = data.PaymentDate;
                this.rawMonth = data.Month;
                this.flatNo = normalizeFlat(data.FlatNo);

                this.type = (this.category.toLowerCase() === 'monthly') ? 'Monthly' : this.category;
            }

            get monthKey() {
                if (!this.rawMonth) return '';
                if (/^\d{4}-\d{2}$/.test(this.rawMonth)) return this.rawMonth;
                try {
                    const d = new Date(this.rawMonth);
                    const adjustedDate = new Date(d.getTime() + 12 * 60 * 60 * 1000);
                    if (!isNaN(adjustedDate.getTime())) {
                        return `${adjustedDate.getFullYear()}-${String(adjustedDate.getMonth() + 1).padStart(2, '0')}`;
                    }
                } catch(e) {}
                return '';
            }

            get isPaidStrict() { return this.status.toLowerCase() === 'paid'; }
            get isInReview() { const s = this.status.toLowerCase(); return s !== 'paid' && s !== 'rejected'; }
            get isPaidOrPendingValidation() { const s = this.status.toLowerCase(); return s === 'paid' || s === 'pending validation'; }
            get isMonthly() { return this.category.toLowerCase() === 'monthly'; }
        }

        class Resident {
            constructor(flatData, rawResidentData, paymentHistory) {
                this.flat = normalizeFlat(flatData.FlatNo);
                this.due = parseFloat(flatData.Due || 0);
                
                const nFlat = parseInt(this.flat);
                let floorVal = !isNaN(nFlat) ? Math.floor(nFlat / 100) : 0;
                this.floor = (floorVal === 0) ? 'Ground' : String(floorVal);
                this.tower = '15'; 

                this.occupants = (rawResidentData || []).map(r => ({
                    name: safeString(r.Name || 'Unknown'),
                    phone: safeString(r.Phone),
                    email: safeString(r.Email), 
                    type: safeString(r.ResidentType || 'Owner')
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
                    const isPaid = this.history.some(p => p.isMonthly && p.isPaidOrPendingValidation && p.monthKey === monthKey);
                    if (!isPaid) list.push({ label: `${MONTHS_ARRAY[currM]} ${currY}`, value: monthKey, amount: monthlyAmount });
                    currM++;
                    if (currM > 11) { currM = 0; currY++; }
                    safety++;
                }
                return list.reverse(); 
            }
        }

        class SocietyRepository {
            constructor(apiUrl) {
                this.apiUrl = apiUrl;
                this.residents = [];
                this.admins = [];
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
                    this.admins = result.admins || []; 

                    const allPayments = rawPayments.map(p => new Payment(p));
                    
                    this.residents = rawFlats.map((f, index) => {
                        try {
                            const matchKey = normalizeFlat(f.FlatNo);
                            const residentPayments = allPayments.filter(p => p.flatNo === matchKey)
                                .sort((a, b) => new Date(b.rawDate) - new Date(a.rawDate));
                            const residentData = rawResidents.filter(r => normalizeFlat(r.FlatNo) === matchKey);
                            const resident = new Resident(f, residentData, residentPayments);
                            
                            resident.id = index;
                            resident.searchStr = `${resident.flat} ${resident.occupants.map(o => o.name).join(' ')}`.toLowerCase();
                            
                            const pendingList = resident.getPendingMonthsList(this.settings);
                            resident.totalPendingDue = pendingList.reduce((sum, m) => sum + m.amount, 0);
                            resident.isPaid = resident.totalPendingDue <= 0;

                            return resident;
                        } catch (e) { return null; }
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
                const paymentId = Date.now().toString(); 
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
                    Remarks: formData.remarks 
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
        historyQuery: '',
        pageM: 1,
        pageA: 1,
        limit: 10,
        txnForm: { flatNo: '', amount: '', category: 'Monthly', title: '', month: '', paymentDate: '', method: 'UPI', remarks: '' },

        // --- UPDATED DASHBOARD STATS STRUCTURE ---
        dashboardStats: {
            flatsCount: 0, ownersCount: 0, tenantsCount: 0, totalCollection: 0,
            
            // Monthly Section
            monthlyTotal: 0,
            monthlyBreakdown: [], // [{ label: 'Oct 2025', amount: 5000 }]
            monthlySpent: 0,
            monthlyCashInHand: 0,

            // Adhoc Section
            adhocTotal: 0,
            adhocBreakdown: [], // [{ label: 'Renovation', amount: 2000 }]
            adhocSpent: 0,
            adhocCashInHand: 0,

            pendingValidationTotal: 0,
            recentTransactions: [], 
            totalSpent: 0, cashInHand: 0
        },

        admin: {
            isLoggedIn: false, currentUser: null, username: '', password: '', error: '', tab: 'pending', showSuccessModal: false, searchPending: '', searchHistory: ''
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
            this.calculateDashboardStats(); 
            this.isLoading = false; 
        },

        // Getters for History
        get filteredMonthly() {
            if (!this.activeResident || !this.activeResident.history) return [];
            const q = (this.historyQuery || '').toLowerCase();
            return this.activeResident.history.filter(h => h.isMonthly && (!q || (String(h.amount)+h.method+h.remarks+(h.rawMonth||'')).toLowerCase().includes(q)));
        },
        get paginatedMonthly() {
            const start = (this.pageM - 1) * this.limit;
            return this.filteredMonthly.slice(start, start + this.limit);
        },
        get totalPagesM() { return Math.ceil(this.filteredMonthly.length / this.limit) || 1; },

        get filteredAdhoc() {
            if (!this.activeResident || !this.activeResident.history) return [];
            const q = (this.historyQuery || '').toLowerCase();
            return this.activeResident.history.filter(h => !h.isMonthly && (!q || (h.category+(h.title||'')+String(h.amount)+h.method+h.remarks).toLowerCase().includes(q)));
        },
        get paginatedAdhoc() {
            const start = (this.pageA - 1) * this.limit;
            return this.filteredAdhoc.slice(start, start + this.limit);
        },
        get totalPagesA() { return Math.ceil(this.filteredAdhoc.length / this.limit) || 1; },

        calculateDashboardStats() {
             const stats = {
                flatsCount: this.residents.length,
                ownersCount: 0, tenantsCount: 0,
                totalCollection: 0, totalSpent: 0, cashInHand: 0,
                
                monthlyTotal: 0, monthlyBreakdown: [], monthlySpent: 0, monthlyCashInHand: 0,
                adhocTotal: 0, adhocBreakdown: [], adhocSpent: 0, adhocCashInHand: 0,
                
                pendingValidationTotal: 0, recentTransactions: []
            };

            if (!this.residents || this.residents.length === 0) {
                this.dashboardStats = stats;
                return;
            }

            this.residents.forEach(r => {
                r.occupants.forEach(o => {
                    if (o.type.toLowerCase() === 'owner') stats.ownersCount++;
                    if (o.type.toLowerCase() === 'tenant') stats.tenantsCount++;
                });
            });

             const uniquePayments = new Map();
             this.residents.forEach(r => { r.history.forEach(p => { if (p.id) uniquePayments.set(p.id, p); }); });
             const allPayments = Array.from(uniquePayments.values());
            
             // Helpers for breakdown
             const monthlyMap = {};
             const adhocMap = {};

             allPayments.forEach(p => {
                if (p.status.toLowerCase() === 'pending validation') stats.pendingValidationTotal += p.amount;
                if (p.isPaidOrPendingValidation) {
                     stats.totalCollection += p.amount;
                     if(p.isMonthly) {
                        stats.monthlyTotal += p.amount;
                        // Aggregate Monthly
                        let mLabel = "Unknown";
                        try {
                            if (p.rawMonth) {
                                const d = new Date(p.rawMonth);
                                mLabel = d.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' }); 
                            } else {
                                const d = new Date(p.rawDate);
                                mLabel = d.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' });
                            }
                        } catch(e) {}
                        monthlyMap[mLabel] = (monthlyMap[mLabel] || 0) + p.amount;
                     }
                     else {
                        stats.adhocTotal += p.amount;
                        // Aggregate Adhoc by Title/Category
                        const title = p.title || p.category || 'Other';
                        adhocMap[title] = (adhocMap[title] || 0) + p.amount;
                     }
                }
             });

             // Convert Maps to Arrays for Dashboard
             stats.monthlyBreakdown = Object.keys(monthlyMap).map(k => ({ label: k, amount: monthlyMap[k] }));
             stats.adhocBreakdown = Object.keys(adhocMap).map(k => ({ label: k, amount: adhocMap[k] }));

             // Calc Cash in Hand (Assuming 0 expense for now, or update if expense logic exists)
             stats.monthlyCashInHand = stats.monthlyTotal - stats.monthlySpent;
             stats.adhocCashInHand = stats.adhocTotal - stats.adhocSpent;
             stats.cashInHand = stats.monthlyCashInHand + stats.adhocCashInHand;

             stats.recentTransactions = allPayments.sort((a,b) => new Date(b.rawDate) - new Date(a.rawDate)).slice(0,50).map(txn => this.mapTransactionForDisplay(txn));
             this.dashboardStats = stats;
        },

        openResidentByFlat(flatNo) {
            const resident = this.residents.find(r => r.flat === flatNo);
            if (resident) this.openHistory(resident);
        },
        // ... (Keep other getters/methods like pendingValidationList, login, etc. SAME as before) ...
         get pendingValidationList() {
            if (!this.residents) return [];
            const allPayments = this.residents.flatMap(r => r.history);
            const unique = new Map();
            allPayments.forEach(p => unique.set(p.id, p));
            return Array.from(unique.values()).filter(p => p.status === 'Pending Validation').sort((a, b) => new Date(b.rawDate) - new Date(a.rawDate)).map(txn => this.mapTransactionForDisplay(txn));
        },
        get filteredPendingList() {
            const list = this.pendingValidationList;
            const q = (this.admin.searchPending || '').toLowerCase();
            if (!q) return list;
            return list.filter(txn => txn.displayResidentName.toLowerCase().includes(q) || txn.displayFlat.toLowerCase().includes(q) || txn.remarks.toLowerCase().includes(q));
        },
        get pendingStats() {
            const list = this.pendingValidationList;
            return { count: list.length, totalAmount: list.reduce((sum, p) => sum + p.amount, 0) };
        },
        get adminHistoryList() {
             if (!this.residents) return [];
            const allPayments = this.residents.flatMap(r => r.history);
            const unique = new Map();
            allPayments.forEach(p => unique.set(p.id, p));
            return Array.from(unique.values()).filter(p => p.isPaidStrict).sort((a, b) => new Date(b.rawDate) - new Date(a.rawDate)).slice(0, 50).map(txn => this.mapTransactionForDisplay(txn));
        },
        get filteredHistoryList() {
            const list = this.adminHistoryList;
            const q = (this.admin.searchHistory || '').toLowerCase();
            if (!q) return list;
            return list.filter(txn => txn.displayResidentName.toLowerCase().includes(q) || txn.displayFlat.toLowerCase().includes(q) || (txn.validatedBy && txn.validatedBy.toLowerCase().includes(q)));
        },
        get adminHistoryTotal() {
             if (!this.residents) return 0;
             const allPayments = this.residents.flatMap(r => r.history);
             const unique = new Map();
             allPayments.forEach(p => unique.set(p.id, p));
            return Array.from(unique.values()).filter(p => p.isPaidStrict).reduce((sum, p) => sum + p.amount, 0);
        },
        get adminHistoryCount() {
             if (!this.residents) return 0;
             const allPayments = this.residents.flatMap(r => r.history);
             const unique = new Map();
             allPayments.forEach(p => unique.set(p.id, p));
            return Array.from(unique.values()).filter(p => p.isPaidStrict).length;
        },

        login() {
            this.admin.error = '';
            const foundAdmin = this.repository.admins.find(a => (a.AdminUserName) === this.admin.username && (String(a.AdminPassword)) === this.admin.password);
            if (foundAdmin) { this.admin.isLoggedIn = true; this.admin.currentUser = this.admin.username; this.admin.password = ''; } 
            else { this.admin.error = 'Invalid Credentials'; }
        },
        logout() { this.admin.isLoggedIn = false; this.admin.currentUser = null; this.view = 'home'; },
        async handleApprove(paymentId) {
            this.isSubmitting = true;
            const adminName = this.admin.currentUser || 'Admin';
            const success = await this.repository.updatePaymentStatus(paymentId, 'Paid', adminName, 'Approved via App');
            if (success) { await this.fetchAndHydrate(); this.admin.showSuccessModal = true; setTimeout(() => { this.admin.showSuccessModal = false; }, 2000); } 
            else { alert("Failed to update status."); }
            this.isSubmitting = false;
        },

        mapTransactionForDisplay(txn) {
            const resident = this.residents.find(r => r.flat === txn.flatNo);
            let displayResidentName = "Unknown";
            let payerType = "Owner"; 
            let residentPhone = ""; 

            if (resident && resident.occupants.length > 0) {
                const tenant = resident.occupants.find(o => o.type.toLowerCase() === 'tenant');
                const owner = resident.occupants.find(o => o.type.toLowerCase() === 'owner');
                if (txn.isMonthly && tenant) { displayResidentName = tenant.name; payerType = "Tenant"; residentPhone = tenant.phone; } 
                else if (owner) { displayResidentName = owner.name; payerType = "Owner"; residentPhone = owner.phone; } 
                else { displayResidentName = resident.occupants[0].name; residentPhone = resident.occupants[0].phone; }
            } else if (resident) {
                displayResidentName = "Unknown";
            }

            let displayPaymentFor = txn.category;
            if (txn.isMonthly) {
                try {
                    const d = new Date(txn.rawMonth);
                    if (!isNaN(d.getTime())) displayPaymentFor = d.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
                    else {
                        const parts = txn.monthKey.split('-');
                        if (parts.length === 2) {
                            const temp = new Date(parseInt(parts[0]), parseInt(parts[1])-1, 1);
                            displayPaymentFor = temp.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
                        }
                    }
                } catch(e) {}
            }

            const fullDateTime = new Date(txn.rawDate).toLocaleString('en-GB', {
                day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true
            }).toUpperCase();

            let methodIcon = 'bi-credit-card-2-front-fill';
            let methodColor = 'text-primary';
            const m = txn.method.toLowerCase();
            if(m.includes('upi') || m.includes('gpay') || m.includes('paytm')) { methodIcon = 'bi-qr-code'; methodColor = 'text-primary'; } 
            else if (m.includes('cash')) { methodIcon = 'bi-cash-stack'; methodColor = 'text-success'; } 
            else if (m.includes('bank') || m.includes('neft') || m.includes('cheque')) { methodIcon = 'bi-bank2'; methodColor = 'text-secondary'; }

            let displayValidationTime = txn.validationTime || 'N/A';
            if (txn.validationTime) {
                try {
                    const vDate = new Date(txn.validationTime);
                    if (!isNaN(vDate.getTime())) displayValidationTime = vDate.toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true }).toUpperCase();
                } catch (e) {}
            }

            return {
                id: txn.id, 
                ...txn,
                isMonthly: txn.isMonthly,
                displayFlat: resident ? resident.flat : txn.flatNo,
                displayResidentName: displayResidentName,
                displayPaymentFor: displayPaymentFor,
                fullDateTime: fullDateTime,
                displayValidationTime: displayValidationTime,
                payerType: payerType,
                residentPhone: residentPhone, 
                methodIcon: methodIcon, 
                methodColor: methodColor 
            };
        },

        updateDate() {
            const date = new Date();
            this.currentDate = date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }).toUpperCase();
        },
        calculatePendingMonths(startStr, amount, history) {
            const tempResident = new AppServices.Resident({}, [], history);
            const tempSettings = new AppServices.Settings({ MonthlyMaintainenceStartFrom: startStr, MonthlyMaintainenceAmount: amount });
            return tempResident.getPendingMonthsList(tempSettings);
        },
        
        get filteredResidents() {
            let data = this.residents || [];
            if (this.filterStatus === 'paid') data = data.filter(r => r.isPaid);
            if (this.filterStatus === 'unpaid') data = data.filter(r => !r.isPaid);
            if (this.filterStatus === 'pending') {
                data = data.filter(r => r.history.some(p => p.status.toLowerCase() === 'pending validation'));
            }

            if (this.searchQuery) data = data.filter(r => r.searchStr.includes(this.searchQuery.toLowerCase()));
            return data;
        },
       openHistory(resident) {
            const totalPaid = resident.history.filter(p => p.isPaidStrict && p.isMonthly).reduce((sum, p) => sum + p.amount, 0);
            const pendingVal = resident.history.filter(p => p.isInReview && p.isMonthly).reduce((sum, p) => sum + p.amount, 0);
            
            const pendingList = resident.getPendingMonthsList(this.settings);
            
            resident.stats = { 
                totalPaid: totalPaid, 
                pendingValidation: pendingVal, 
                currentDue: resident.totalPendingDue 
            };
            resident.pendingList = pendingList; 
            
            this.activeResident = resident;
            
            // RESET PAGINATION ON OPEN
            this.historyQuery = '';
            this.pageM = 1;
            this.pageA = 1;

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