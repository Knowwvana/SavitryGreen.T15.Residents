document.addEventListener('alpine:init', () => {
    window.societyApp = (api_url) => ({
        view: 'residents', 
        searchQuery: '',
        filterStatus: 'all',
        currentDate: '',
        
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
            month: new Date().toISOString().slice(0, 7),
            paymentDate: new Date().toISOString().slice(0, 16),
            method: 'UPI',
            remarks: ''
        },

        init() {
            this.updateDate();
            this.fetchData();
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
                            email: r.Email || r.email || '', // NEW: Capture Email
                            type: r.Type || r.type || r.ResidentType || 'Owner'
                        }));

                    const history = rawPayments
                        .filter(p => this.getCleanFlatNo(p.FlatNo || p.flat) === flatKey)
                        .map(p => ({
                            id: p.PaymentID || p.id,
                            date: p.PaymentDate || p.date,
                            month: p.Month || '', // NEW: Capture Month (e.g. "2025-12")
                            amount: parseFloat(p.Amount || p.amount || 0),
                            category: p.Category || p.category || 'Maintenance',
                            type: p.Type || 'Monthly',
                            status: p.Status || p.status || 'Pending',
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
            
            // 1. Calculate Stats
            const totalPaid = resident.history
                .filter(p => p.status === 'Paid')
                .reduce((sum, p) => sum + p.amount, 0);
                
            const pendingVal = resident.history
                .filter(p => p.status !== 'Paid' && p.status !== 'Rejected')
                .reduce((sum, p) => sum + p.amount, 0);

            this.activeResident.stats = {
                totalPaid: totalPaid,
                pendingValidation: pendingVal,
                currentDue: resident.due
            };

            // 2. Generate Pending Months List
            // Default to 'Sep-2025' and 150 if settings missing
            const startStr = this.settings.KeyValueMonthlyMaintainenceStartFrom || 'Sep-2025'; 
            const monthlyAmount = parseFloat(this.settings.MonthlyMaintainenceAmount || 150);
            
            this.activeResident.pendingList = this.calculatePendingMonths(startStr, monthlyAmount, resident.history);

            this.view = 'history';
            window.scrollTo(0,0);
        },

        // Helper to generate list of unpaid months
        calculatePendingMonths(startStr, amount, history) {
            // Parse "Sep-2025"
            const monthsMap = {Jan:0, Feb:1, Mar:2, Apr:3, May:4, Jun:5, Jul:6, Aug:7, Sep:8, Oct:9, Nov:10, Dec:11};
            const parts = startStr.split('-');
            if(parts.length !== 2) return [];

            let startMonth = monthsMap[parts[0].substr(0,3)];
            let startYear = parseInt(parts[1]);
            
            const now = new Date();
            const endYear = now.getFullYear();
            const endMonth = now.getMonth();
            
            let list = [];
            
            // Iterate month by month from Start Date to Now
            let currY = startYear;
            let currM = startMonth;

            while (currY < endYear || (currY === endYear && currM <= endMonth)) {
                // Format: "2025-09" (matches HTML input type="month")
                const monthKey = `${currY}-${String(currM + 1).padStart(2, '0')}`;
                
                // Display: "Sep 2025"
                const monthName = Object.keys(monthsMap).find(key => monthsMap[key] === currM);
                const display = `${monthName} ${currY}`;

                // Check if Paid in History
                // Look for a payment that is 'Monthly', 'Paid', and matches the month key
                const isPaid = history.some(p => 
                    p.type === 'Monthly' && 
                    p.status === 'Paid' && 
                    p.month === monthKey
                );

                if (!isPaid) {
                    list.push({
                        label: display,
                        value: monthKey,
                        amount: amount
                    });
                }

                // Increment
                currM++;
                if (currM > 11) {
                    currM = 0;
                    currY++;
                }
            }
            return list.reverse(); // Show newest pending first
        },

        // Open Add Entry with Pre-filled data
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
            this.txnForm.paymentDate = new Date().toISOString().slice(0, 16);
        },

        async saveTransaction() {
            // ... (Existing saveTransaction Logic) ...
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