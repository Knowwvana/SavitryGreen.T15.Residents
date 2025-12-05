document.addEventListener('alpine:init', () => {
    window.societyApp = (api_url) => ({
        view: 'residents', 
        searchQuery: '',
        filterStatus: 'all',
        currentDate: '',
        
        activeResident: { flat: '', occupants: [], history: [], due: 0 },
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
                            type: r.Type || r.type || r.ResidentType || 'Owner'
                        }));

                    const history = rawPayments
                        .filter(p => this.getCleanFlatNo(p.FlatNo || p.flat) === flatKey)
                        .map(p => ({
                            date: p.PaymentDate || p.date,
                            amount: p.Amount || p.amount,
                            category: p.Category || p.category || 'Maintenance',
                            type: p.Type || 'Monthly',
                            // NEW: Map the Status field
                            status: p.Status || p.status || 'Pending' 
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
            this.view = 'history';
            window.scrollTo(0,0);
        },

        resetTxnForm() {
            this.txnSuccess = false;
            this.txnForm.amount = '';
            this.txnForm.remarks = '';
            this.txnForm.flatNo = ''; 
            this.txnForm.paymentDate = new Date().toISOString().slice(0, 16);
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