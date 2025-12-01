// Place this file in 'assets/js/app.js'

document.addEventListener('alpine:init', () => {
    Alpine.data('maintenanceApp', () => ({
        // State Variables (Existing Financial/Flat Data)
        search: '',
        filterStatus: '',
        expandedFlatId: null,
        isLoading: false,
        error: null,
        flats: [],

        // State Variables (New Maintenance Data)
        showMaintenanceForm: false,
        maintenanceEntries: [], // Placeholder for local/fetched maintenance tickets
        maintenanceFormData: {
            apartment: '',
            issue: '',
            status: 'Pending',
        },

        // ******************************************************
        // ⬇️ API URL IS NOW IN HUGO'S CONFIG ⬇️
        // We retrieve it from the global window object set in baseof.html
        scriptUrl: window.API_URL || '',
        // ******************************************************

        async init() {
            // Note: We'll assume the main Google Script URL only handles the financial data.
            // A dedicated script URL would be needed for the new Maintenance Entry submission.
            await this.fetchAndJoinData(); 
            // If you had a separate API for maintenance tickets, you'd fetch them here too.
        },

        // EXISTING: Fetch Flats, Residents, Payments Data
        async fetchAndJoinData() {
            this.isLoading = true;
            this.error = null;
            try {
                if (!this.scriptUrl || this.scriptUrl.includes('YOUR_SCRIPT_URL_HERE')) {
                    throw new Error("API URL not configured in hugo.toml or baseof.html.");
                }

                const response = await fetch(this.scriptUrl);
                if (!response.ok) throw new Error("Failed to connect to Google Script");
                
                const data = await response.json();
                const flatsRaw = data.flats || [];
                const residentsRaw = data.residents || [];
                const paymentsRaw = data.payments || [];

                // JOIN LOGIC (UNCHANGED)
                this.flats = flatsRaw.map(flat => {
                    const flatResidents = residentsRaw.filter(r => String(r.FlatNo) === String(flat.FlatNo));
                    const flatPayments = paymentsRaw.filter(p => String(p.FlatNo) === String(flat.FlatNo));

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

        // NEW: Submit Maintenance Entry Logic (Client-side simulation)
        submitMaintenanceEntry() {
            // NOTE: In a static site, submitting to a Google Sheet requires 
            // a custom Google Apps Script endpoint or a service like SheetMonkey.
            // For now, this function only logs the data and resets the form.
            
            console.log("Submitting new maintenance entry:", this.maintenanceFormData);
            
            // SIMULATION: Add the new entry to a local list for immediate feedback
            const newEntry = {
                id: Date.now(),
                date: new Date().toLocaleDateString('en-IN'),
                ...this.maintenanceFormData,
            };
            this.maintenanceEntries.unshift(newEntry); // Add to local state

            // Reset form data and show success message
            this.maintenanceFormData = {
                apartment: '',
                issue: '',
                status: 'Pending',
            };
            this.showMaintenanceForm = false;
            alert('Maintenance entry submitted successfully (Simulation). Check console for data.');
        },

        // --- UI Helper Functions (UNCHANGED) ---
        toggleDetails(flatNo) {
            this.expandedFlatId = (this.expandedFlatId === flatNo) ? null : flatNo;
        },

        hasPendingDues(flat) {
            const monthlyPending = flat.maintenance_history.some(p => p.Status !== 'Paid');
            const adhocPending = flat.adhoc_history.some(p => p.Status !== 'Paid');
            return monthlyPending || adhocPending;
        },
        
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
                else if (this.filterStatus === 'Clear') matchesStatus = !this.hasPendingDues(flat) && this.hasAnyHistory(flat);

                return matchesSearch && matchesStatus;
            });
        }
    }));
});