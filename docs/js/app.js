document.addEventListener('alpine:init', () => {
    Alpine.data('maintenanceApp', () => ({
        // State Variables
        search: '',
        filterStatus: '',
        expandedFlatId: null,
        isLoading: false,
        error: null,
        flats: [],

        // ******************************************************
        // ⬇️ PASTE YOUR GOOGLE SCRIPT URL BELOW ⬇️
        scriptUrl: window.API_URL || '',
        // ******************************************************

        async init() {
            await this.fetchAndJoinData();
        },

        async fetchAndJoinData() {
            this.isLoading = true;
            this.error = null;
            try {
                if (this.scriptUrl.includes('YOUR_SCRIPT_URL_HERE')) {
                    throw new Error("Please update app.js with your Google Script URL.");
                }

                const response = await fetch(this.scriptUrl);
                if (!response.ok) throw new Error("Failed to connect to Google Script");
                
                const data = await response.json();

                const flatsRaw = data.flats || [];
                const residentsRaw = data.residents || [];
                const paymentsRaw = data.payments || [];

                // JOIN LOGIC
                this.flats = flatsRaw.map(flat => {
                    const flatResidents = residentsRaw.filter(r => 
                        String(r.FlatNo) === String(flat.FlatNo) 
                    );

                    const flatPayments = paymentsRaw.filter(p => 
                        String(p.FlatNo) === String(flat.FlatNo)
                    );

                    return {
                        ...flat,
                        residents: flatResidents.map(r => ({
                            name: r.Name, type: r.ResidentType, mobile: r.Phone, email: r.Email
                        })),
                        is_rented: flatResidents.some(r => r.ResidentType === 'Tenant'),
                        maintenance_history: flatPayments.filter(p => p.Category === 'Monthly'),
                        adhoc_history: flatPayments.filter(p => p.Category === 'Adhoc')
                    };
                });

            } catch (err) {
                console.error(err);
                this.error = err.message;
            } finally {
                this.isLoading = false;
            }
        },

        // --- UI Helper Functions ---
        toggleDetails(flatNo) {
            this.expandedFlatId = (this.expandedFlatId === flatNo) ? null : flatNo;
        },

        // Returns TRUE if any status is NOT 'Paid'
        hasPendingDues(flat) {
            const monthlyPending = flat.maintenance_history.some(p => p.Status !== 'Paid');
            const adhocPending = flat.adhoc_history.some(p => p.Status !== 'Paid');
            return monthlyPending || adhocPending;
        },
        
        // NEW: Returns TRUE if ANY payment history exists
        hasAnyHistory(flat) {
            return flat.maintenance_history.length > 0 || flat.adhoc_history.length > 0;
        },

        formatCurrency(amount) {
            if (!amount) return '₹0';
            return new Intl.NumberFormat('en-IN', {
                style: 'currency', currency: 'INR', maximumFractionDigits: 0
            }).format(amount);
        },

        get filteredFlats() {
            if (!this.flats.length) return [];
            return this.flats.filter(flat => {
                const term = (this.search || '').toLowerCase();
                
                const matchesSearch = 
                    String(flat.FlatNo).toLowerCase().includes(term) ||
                    flat.residents.some(r => r.name.toLowerCase().includes(term));

                let matchesStatus = true;
                if (this.filterStatus === 'Defaulter') matchesStatus = this.hasPendingDues(flat);
                // Condition for Clear: Must NOT have pending dues AND Must have historical records.
                else if (this.filterStatus === 'Clear') matchesStatus = !this.hasPendingDues(flat) && this.hasAnyHistory(flat);

                return matchesSearch && matchesStatus;
            });
        }
    }));
});