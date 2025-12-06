document.addEventListener('alpine:init', () => {
    window.societyApp = (api_url) => ({
        view: 'residents', 
        searchQuery: '',
        filterStatus: 'all',
        currentDate: '',
        
        // Correctly initialized with all sub-properties to prevent errors
        activeResident: { flat: '', occupants: [], history: [], due: 0, pendingList: [], stats: {} },
        residents: [],
        settings: {}, 
        isLoading: true,
        isSubmitting: false,
        txnSuccess: false,
        apiUrl: api_url,

        txnForm: {
            flatNo: '',
            amount: '',
            category: 'Monthly',
            title: '',
            month: '', // Will be set in init using local time
            paymentDate: '', // Will be set in init using local time
            method: 'UPI',
            remarks: ''
        },

        init() {
            // Set initial form values using local time logic
            this.txnForm.month = this.getLocalISOString().slice(0, 7);
            this.txnForm.paymentDate = this.getLocalISOString().slice(0, 16);
            
            this.updateDate();
            this.fetchData();
        },

        // NEW: Helper to get local time in ISO format (YYYY-MM-DDTHH:mm)
        // This fixes the issue where dates were defaulting to UTC (e.g., 7:41 AM instead of 1:11 PM)
        getLocalISOString() {
            const now = new Date();
            // Subtract the timezone offset to get the correct local time in ISO format
            const offset = now.getTimezoneOffset() * 60000; 
            return new Date(now.getTime() - offset).toISOString();
        },

        updateDate() {
            const date = new Date();
            const options = { weekday: 'short', month: 'short', day: 'numeric' };
            this.currentDate = date.toLocaleDateString('en-US', options).toUpperCase();
        },

        getCleanFlatNo(value) {
            if (!value) return '';
            const s = String(value).trim();
            const n = parseInt(s, 10);
            return isNaN(n) ? s : String(n); 
        },

        async fetchData() {
            this.isLoading = true;
            try {
                if (!this.apiUrl) throw new Error("API URL Missing");

                const response = await fetch(this.apiUrl + '?action=getData'); 
                const result = await response.json();
                
                console.log("Raw API Data:", result);

                const rawFlats = result.flats || [];
                const rawResidents = result.residents || [];
                const rawPayments = result.payments || [];
                this.settings = result.settings || {};

                this.residents = rawFlats.map((f, index) => {
                    const flatKey = this.getCleanFlatNo(f.FlatNo || f.flat);
                    const displayFlat = String(f.FlatNo || f.flat || '').trim();
                    
                    const occupants = rawResidents
                        .filter(r => this.getCleanFlatNo(r.FlatNo || r.flat) === flatKey)
                        .map(r => ({
                            name: r.Name || r.name || r.ResidentName || 'Unknown',
                            phone: r.Phone || r.Mobile || r.phone || '',
                            email: r.Email || r.email || '', 
                            type: r.Type || r.type || r.ResidentType || 'Owner'
                        }));

                    const history = rawPayments
                        .filter(p => this.getCleanFlatNo(p.FlatNo || p.flat) === flatKey)
                        .map(p => ({
                            id: p.PaymentID || p.id,
                            date: p.PaymentDate || p.date,
                            // Added p.month fallback
                            month: (p.Month || p.month || '').trim(), 
                            amount: parseFloat(p.Amount || p.amount || 0),
                            category: (p.Category || p.category || 'Maintenance').trim(),
                            // Added p.type fallback
                            type: (p.Type || p.type || 'Monthly').trim(),
                            status: (p.Status || p.status || 'Pending').trim(),
                            remarks: p.Remarks || p.remarks || '',
                            method: p.PaymentMethod || p.method || 'UPI'
                        }))
                        .sort((a, b) => new Date(b.date) - new Date(a.date));

                    const lastPayment = history.length > 0 ? history[0] : null;
                    const due = parseFloat(f.Due || f.Pending || 0);

                    return {
                        id: index,
                        flat: displayFlat,
                        occupants: occupants,
                        history: history,
                        lastPayment: lastPayment,
                        due: due,
                        isPaid: due <= 0,
                        searchStr: `${displayFlat} ${flatKey} ${occupants.map(o => o.name).join(' ')}`.toLowerCase()
                    };
                });

            } catch (error) {
                console.error("Fetch error:", error);
            } finally {
                this.isLoading = false;
            }
        },

        get filteredResidents() {
            let data = this.residents || [];
            if (this.filterStatus === 'paid') data = data.filter(r => r.isPaid);
            if (this.filterStatus === 'unpaid') data = data.filter(r => !r.isPaid);

            if (this.searchQuery !== '') {
                const q = this.searchQuery.toLowerCase();
                data = data.filter(r => r.searchStr.includes(q));
            }
            return data;
        },

        openHistory(resident) {
            this.activeResident = resident;
            
            // 1. Calculate Stats (Case-insensitive logic)
            const totalPaid = resident.history
                .filter(p => (p.status || '').toLowerCase() === 'paid')
                .reduce((sum, p) => sum + p.amount, 0);
                
            const pendingVal = resident.history
                .filter(p => {
                    const s = (p.status || '').toLowerCase();
                    return s !== 'paid' && s !== 'rejected';
                })
                .reduce((sum, p) => sum + p.amount, 0);

            this.activeResident.stats = {
                totalPaid: totalPaid,
                pendingValidation: pendingVal,
                currentDue: resident.due
            };

            // 2. Generate Pending Months List
            const startStr = this.settings.KeyValueMonthlyMaintainenceStartFrom || 'Sep-2025'; 
            const monthlyAmount = parseFloat(this.settings.MonthlyMaintainenceAmount || 150);
            
            this.activeResident.pendingList = this.calculatePendingMonths(startStr, monthlyAmount, resident.history);

            this.view = 'history';
            window.scrollTo(0,0);
        },

        // Helper to generate list of unpaid months
        calculatePendingMonths(startStr, amount, history) {
            const monthsMap = {Jan:0, Feb:1, Mar:2, Apr:3, May:4, Jun:5, Jul:6, Aug:7, Sep:8, Oct:9, Nov:10, Dec:11};
            const parts = startStr.split('-');
            if(parts.length !== 2) return [];

            let startMonth = monthsMap[parts[0].substr(0,3)];
            let startYear = parseInt(parts[1]);
            
            const now = new Date();
            const endYear = now.getFullYear();
            const endMonth = now.getMonth();
            
            let list = [];
            
            let currY = startYear;
            let currM = startMonth;

            while (currY < endYear || (currY === endYear && currM <= endMonth)) {
                const monthKey = `${currY}-${String(currM + 1).padStart(2, '0')}`;
                const monthName = Object.keys(monthsMap).find(key => monthsMap[key] === currM);
                const display = `${monthName} ${currY}`;

                // --- CHANGED LOGIC HERE ---
                // Robust check: 
                // 1. Case-insensitive for Status/Type
                // 2. Date-parsing using getFullYear/getMonth to avoid Timezone shifts (e.g. Sep 1 becoming Aug 31)
                const isPaid = history.some(p => {
                    const pType = (p.type || '').toLowerCase();
                    const pCat = (p.category || '').toLowerCase();
                    const pStatus = (p.status || '').toLowerCase();
                    
                    // Must be Monthly (Check Type OR Category) and (Paid OR Pending Validation)
                    if (pType !== 'monthly' && pCat !== 'monthly') return false;
                    if (pStatus !== 'paid' && pStatus !== 'pending validation') return false;

                    // 1. Direct String Match
                    if (p.month === monthKey) return true;

                    // 2. Date Object Match (Robust fallback for format differences, timezone safe)
                    try {
                        const d = new Date(p.month);
                        if (!isNaN(d.getTime())) {
                            // Construct YYYY-MM from local date components to avoid UTC shift
                            const dKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
                            if (dKey === monthKey) return true;
                        }
                    } catch(e) { /* ignore parse errors */ }
                    
                    return false;
                });

                if (!isPaid) {
                    list.push({
                        label: display,
                        value: monthKey,
                        amount: amount
                    });
                }

                currM++;
                if (currM > 11) {
                    currM = 0;
                    currY++;
                }
            }
            return list.reverse(); 
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
            // Use local time for the reset form as well
            this.txnForm.paymentDate = this.getLocalISOString().slice(0, 16);
        },

        async saveTransaction() {
            this.isSubmitting = true;
            const paymentId = Date.now().toString(); 
            const timestamp = new Date().toLocaleString();
            
            let finalTitle = this.txnForm.title;
            if (this.txnForm.category === 'Monthly') {
                finalTitle = `Maint: ${this.txnForm.month}`; 
            }

            const finalRemarks = `${this.txnForm.remarks} [Logged: ${timestamp}]`;

            const payload = {
                PaymentID: paymentId,
                FlatNo: this.txnForm.flatNo,
                Category: this.txnForm.category,
                Title: finalTitle,
                Month: this.txnForm.month,
                Amount: this.txnForm.amount,
                PaymentDate: this.txnForm.paymentDate.replace('T', ' '),
                PaymentMethod: this.txnForm.method,
                Status: 'Pending Validation',
                Remarks: finalRemarks
            };

            try {
                const response = await fetch(this.apiUrl + '?action=addPayment', {
                    method: 'POST',
                    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                    body: JSON.stringify(payload)
                });

                const result = await response.json();
                
                if (result.success) {
                    this.fetchData(); 
                    this.txnSuccess = true; 
                } else {
                    alert("Error: " + result.message);
                }

            } catch (error) {
                console.error("Submission Error:", error);
                this.txnSuccess = true; 
            } finally {
                this.isSubmitting = false;
            }
        }
    });
});