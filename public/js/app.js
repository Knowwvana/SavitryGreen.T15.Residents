document.addEventListener('alpine:init', () => {
    Alpine.data('maintenanceApp', () => ({
        // State
        search: '',
        filterStatus: '',
        expandedFlatId: null,
        isLoading: false,
        error: null,
        flats: [],

        // ******************************************************
        // ⬇️ PASTE YOUR GOOGLE SCRIPT URL BELOW ⬇️
        scriptUrl: 'https://script.google.com/macros/s/AKfycbzTsme-44gpz7guPHurfAitDxRKhYMcA9a0UfxfCPLcl_5X4fC4gE1L20bEf5KRaiBoTg/exec', 
        // ******************************************************

        async init() {
            await this.fetchAndJoinData();
        },

        async fetchAndJoinData() {
            this.isLoading = true;
            this.error = null;
            try {
                if (this.scriptUrl.includes('PASTE_YOUR')) {
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
                    // 1. Find Residents (Active Only)
                    const flatResidents = residentsRaw.filter(r => 
                        String(r.FlatNo) === String(flat.FlatNo) && 
                        String(r.IsActive).toUpperCase() === 'TRUE'
                    );

                    // 2. Find Payments
                    const flatPayments = paymentsRaw.filter(p => 
                        String(p.FlatNo) === String(flat.FlatNo)
                    );

                    return {
                        ...flat,
                        
                        // Map Resident Columns
                        residents: flatResidents.map(r => ({
                            name: r.Name,
                            type: r.ResidentType,
                            mobile: r.Phone,
                            email: r.Email
                        })),

                        // Determine if rented
                        is_rented: flatResidents.some(r => r.ResidentType === 'Tenant'),

                        // Split Payments (Using your specific column names)
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

        toggleDetails(flatNo) {
            this.expandedFlatId = (this.expandedFlatId === flatNo) ? null : flatNo;
        },

        hasPendingDues(flat) {
            const monthlyPending = flat.maintenance_history.some(p => p.Status === 'Pending');
            const adhocPending = flat.adhoc_history.some(p => p.Status === 'Pending');
            return monthlyPending || adhocPending;
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
                else if (this.filterStatus === 'Clear') matchesStatus = !this.hasPendingDues(flat);

                return matchesSearch && matchesStatus;
            });
        }
    }));
});