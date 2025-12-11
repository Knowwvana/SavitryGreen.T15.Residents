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
                // We expect data to be the direct settings object from JSON
                this._config = data || {}; 

                // Date Formatting Helper for Start Date
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

                // Format the start date immediately on load
                if (this._config.MonthlyMaintainenceStartFrom) {
                    this._config.MonthlyMaintainenceStartFrom = formatMonthString(this._config.MonthlyMaintainenceStartFrom);
                }
            }

            // Direct Mapping to JSON Keys
            get societyName() { return this._config.SocietyName || 'Green Valley Heights'; }
            get societyAddress() { return this._config.SocietyAddress || 'Sector 42, Maintenance Drive'; }
            get monthlyFee() { return parseFloat(this._config.MonthlyMaintainenceAmount || 150); }
            get startMonthStr() { return this._config.MonthlyMaintainenceStartFrom || 'Sep-2025'; }

            // Compatibility for UI templates
            get SocietyName() { return this.societyName; }
            get SocietyAddress() { return this.societyAddress; }
            get KeyValueMonthlyMaintainenceStartFrom() { return this.startMonthStr; }
            get MonthlyMaintainenceAmount() { return this.monthlyFee; }
        }

        class Payment {
            constructor(data) {
                // Strict 1-to-1 Mapping to JSON keys
                this.id = data.PaymentID;
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

                // Derived Property
                this.type = (this.category.toLowerCase() === 'monthly') ? 'Monthly' : this.category;
            }

            get monthKey() {
                if (!this.rawMonth) return '';
                if (/^\d{4}-\d{2}$/.test(this.rawMonth)) return this.rawMonth;
                try {
                    const d = new Date(this.rawMonth);
                    if (!isNaN(d.getTime())) return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
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
                // Strict Mapping
                this.flat = normalizeFlat(flatData.FlatNo);
                this.due = parseFloat(flatData.Due || 0); 
                
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
                            
                            // Note: isPaid is true if dues are 0.
                            // Payments with 'Pending Validation' status count as 'Paid' for this calculation
                            // so the user doesn't see a due amount, but we will filter them in the list view.
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
        txnForm: { flatNo: '', amount: '', category: 'Monthly', title: '', month: '', paymentDate: '', method: 'UPI', remarks: '' },

        admin: {
            isLoggedIn: false,
            currentUser: null,
            username: '',
            password: '',
            error: '',
            tab: 'pending', 
            showSuccessModal: false,
            searchPending: '',
            searchHistory: ''
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
                monthlyTotal: 0,
                monthlyCurrent: 0,
                monthlyLast: 0,
                monthlyPrevPrev: 0,
                adhocTotal: 0,
                adhocCurrent: 0,
                adhocLast: 0,
                adhocPrevPrev: 0,
                receivedToday: 0,
                receivedThisWeek: 0,
                receivedThisMonth: 0,
                receivedLastMonth: 0,
                receivedPrevPrevMonth: 0,
                pendingValidationTotal: 0,
                currentMonthLabel: '',
                lastMonthLabel: '',
                prevPrevMonthLabel: '',
                recentTransactions: [],
                totalSpent: 0,
                cashInHand: 0
            };

            this.residents.forEach(r => {
                r.occupants.forEach(o => {
                    if (o.type.toLowerCase() === 'owner') stats.ownersCount++;
                    if (o.type.toLowerCase() === 'tenant') stats.tenantsCount++;
                });
            });

            // Date Keys for Target Month Calculation
            const now = new Date();
            const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

            const currentY = now.getFullYear();
            const currentM = now.getMonth();
            const currentMonthKey = `${currentY}-${String(currentM + 1).padStart(2, '0')}`;
            stats.currentMonthLabel = `${MONTHS[currentM]}-${currentY}`;

            const prevDate = new Date(currentY, currentM - 1, 1);
            const prevY = prevDate.getFullYear();
            const prevM = prevDate.getMonth();
            const prevMonthKey = `${prevY}-${String(prevM + 1).padStart(2, '0')}`;
            stats.lastMonthLabel = `${MONTHS[prevM]}-${prevY}`;

            const prevPrevDate = new Date(currentY, currentM - 2, 1);
            const prevPrevY = prevPrevDate.getFullYear();
            const prevPrevM = prevPrevDate.getMonth();
            const prevPrevMonthKey = `${prevPrevY}-${String(prevPrevM + 1).padStart(2, '0')}`;
            stats.prevPrevMonthLabel = `${MONTHS[prevPrevM]}-${prevPrevY}`;

            // Date Helpers for Cash Flow
            const todayStart = new Date(now);
            todayStart.setHours(0,0,0,0);
            
            const day = now.getDay(); 
            const diff = now.getDate() - day + (day === 0 ? -6 : 1); 
            const startOfWeek = new Date(now);
            startOfWeek.setDate(diff);
            startOfWeek.setHours(0,0,0,0);

            const allPayments = this.residents.flatMap(r => r.history);
            
            allPayments.forEach(p => {
                if (p.status.toLowerCase() === 'pending validation') {
                    stats.pendingValidationTotal += p.amount;
                }

                if (p.isPaidOrPendingValidation) { 
                    stats.totalCollection += p.amount;

                    if (p.isMonthly) {
                        stats.monthlyTotal += p.amount;
                        if (p.monthKey === currentMonthKey) stats.monthlyCurrent += p.amount;
                        if (p.monthKey === prevMonthKey) stats.monthlyLast += p.amount;
                        if (p.monthKey === prevPrevMonthKey) stats.monthlyPrevPrev += p.amount;
                    } else {
                        stats.adhocTotal += p.amount;
                        if (p.monthKey === currentMonthKey) stats.adhocCurrent += p.amount;
                        if (p.monthKey === prevMonthKey) stats.adhocLast += p.amount;
                        if (p.monthKey === prevPrevMonthKey) stats.adhocPrevPrev += p.amount;
                    }

                    try {
                        const pDate = new Date(p.rawDate);
                        if (!isNaN(pDate.getTime())) {
                            const pY = pDate.getFullYear();
                            const pMonth = pDate.getMonth();
                            const pDateStart = new Date(pDate);
                            pDateStart.setHours(0,0,0,0);
                            
                            if (pY === currentY && pMonth === currentM) stats.receivedThisMonth += p.amount;
                            if (pY === prevY && pMonth === prevM) stats.receivedLastMonth += p.amount;
                            if (pY === prevPrevY && pMonth === prevPrevM) stats.receivedPrevPrevMonth += p.amount;
                            if (pDateStart.getTime() === todayStart.getTime()) stats.receivedToday += p.amount;
                            if (pDateStart >= startOfWeek) stats.receivedThisWeek += p.amount;
                        }
                    } catch(e) {}
                }
            });

            stats.recentTransactions = allPayments
                .sort((a, b) => new Date(b.rawDate) - new Date(a.rawDate))
                .slice(0, 50) 
                .map(txn => this.mapTransactionForDisplay(txn));

            return stats;
        },

        openResidentByFlat(flatNo) {
            const resident = this.residents.find(r => r.flat === flatNo);
            if (resident) this.openHistory(resident);
        },

        get pendingValidationList() {
            const allPayments = this.residents.flatMap(r => r.history);
            return allPayments.filter(p => p.status === 'Pending Validation').sort((a, b) => new Date(b.rawDate) - new Date(a.rawDate)).map(txn => this.mapTransactionForDisplay(txn));
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
            const allPayments = this.residents.flatMap(r => r.history);
            return allPayments.filter(p => p.isPaidStrict).sort((a, b) => new Date(b.rawDate) - new Date(a.rawDate)).slice(0, 50).map(txn => this.mapTransactionForDisplay(txn));
        },
        get filteredHistoryList() {
            const list = this.adminHistoryList;
            const q = (this.admin.searchHistory || '').toLowerCase();
            if (!q) return list;
            return list.filter(txn => txn.displayResidentName.toLowerCase().includes(q) || txn.displayFlat.toLowerCase().includes(q) || (txn.validatedBy && txn.validatedBy.toLowerCase().includes(q)));
        },
        get adminHistoryTotal() {
            return this.residents.flatMap(r => r.history).filter(p => p.isPaidStrict).reduce((sum, p) => sum + p.amount, 0);
        },
        get adminHistoryCount() {
            return this.residents.flatMap(r => r.history).filter(p => p.isPaidStrict).length;
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
            
            // Helper function to check for pending transactions
            const hasPending = (r) => r.history.some(p => p.status.toLowerCase() === 'pending validation');

            if (this.filterStatus === 'paid') {
                // Paid = Zero Due AND No Pending Validation
                data = data.filter(r => r.isPaid && !hasPending(r));
            } else if (this.filterStatus === 'unpaid') {
                // Unpaid = Has Dues (r.isPaid is false)
                data = data.filter(r => !r.isPaid);
            } else if (this.filterStatus === 'pending') {
                // Pending = Has Pending Validation (regardless of dues)
                data = data.filter(r => hasPending(r));
            }

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