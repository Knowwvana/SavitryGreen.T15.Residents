document.addEventListener('alpine:init', () => {
    
    // =================================================================
    // === PRIVATE UTILITY FUNCTIONS ===
    // =================================================================

    const DataFetcher = async (url, method, payload = null) => {
        if (!url || url.includes('PASTE_YOUR_REAL_URL_HERE')) {
            console.warn("API URL not configured. Using dummy data for display.");
            // Return empty structure to prevent crash if URL isn't set
            return { flats: [], residents: [], payments: [] };
        }

        const options = { method: method };
        
        if (method === 'POST') {
            options.headers = { 'Content-Type': 'text/plain' }; 
            options.body = JSON.stringify(payload);
        }
        
        const response = await fetch(url, options);

        if (!response.ok) {
            throw new Error(`Server responded with status: ${response.status}`);
        }

        const data = await response.json(); 

        if (data.success === false) {
            throw new Error(data.message || (method === 'GET' ? 'Script Read Error' : 'Script Write Error'));
        }
        return data;
    };

    const _preparePayload = (formData, entryTitle) => {
        return {
            PaymentID: new Date().getTime(),
            FlatNo: String(formData.FlatNo),
            Category: formData.Category,
            Title: entryTitle,
            Month: formData.Month,
            Amount: Number(formData.Amount),
            PaymentDate: formData.PaymentDate,
            PaymentMethod: formData.PaymentMethod,
            Status: formData.Status,
            Remarks: formData.Remarks,
        };
    };
    
    // =================================================================
    // === ALPINE DATA COMPONENT: maintenanceApp ===
    // =================================================================

    Alpine.data('maintenanceApp', () => ({
        
        // --- Core State Variables ---
        sidebarCollapsed: false,
        mobileSidebarOpen: false,
        isLoading: false,
        isSubmitting: false,
        showSuccessMessage: false, // New state for success alert
        progress: 0, // New state for progress bar
        error: null,
        flats: [], 
        search: '',
        filter: 'all', // 'all', 'paid', 'unpaid'
        expandedFlatId: null,
        scriptUrl: window.API_URL || '',
        
        currentDate: new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }),

        // --- New Maintenance Entry Form Data ---
        maintenanceFormData: {
            FlatNo: '', Category: 'Monthly', Title: '', Month: '', Amount: null,
            PaymentDate: '', PaymentMethod: 'UPI', Status: 'Paid', Remarks: '',
        },

        // --- Initialization ---
        async init() {
            this.setInitialDates();
            await this.fetchAndJoinData();
        },

        toggleSidebar() {
            this.sidebarCollapsed = !this.sidebarCollapsed;
        },

        // --- FORM HELPERS ---
        setInitialDates() {
            const today = new Date().toISOString().split('T')[0];
            const currentMonth = new Date().toISOString().slice(0, 7); // YYYY-MM
            
            if (!this.maintenanceFormData.PaymentDate) this.maintenanceFormData.PaymentDate = today;
            if (!this.maintenanceFormData.Month) this.maintenanceFormData.Month = currentMonth;
        },

        // --- SUBMISSION HANDLER ---
        async submitMaintenanceEntry() {
            this.isSubmitting = true;
            this.error = null;
            this.showSuccessMessage = false;
            this.progress = 10; // Start progress

            // 1. Validation
            if (!this.maintenanceFormData.FlatNo || !this.maintenanceFormData.Amount) {
                this.error = "Flat Number and Amount are required.";
                this.isSubmitting = false;
                this.progress = 0;
                return;
            }

            this.progress = 30; // Validation done

            // 2. Logic for Title
            let entryTitle = this.maintenanceFormData.Title;
            if (this.maintenanceFormData.Category === 'Monthly') {
                entryTitle = 'Maint: ' + this.maintenanceFormData.Month;
            } else if (this.maintenanceFormData.Category === 'Adhoc' && !entryTitle) {
                this.error = "Adhoc entries require a Title/Purpose.";
                this.isSubmitting = false;
                this.progress = 0;
                return;
            }

            this.progress = 50; // Payload ready

            // 3. Prepare Payload
            const payload = _preparePayload(this.maintenanceFormData, entryTitle);

            // 4. Send Data
            try {
                // Simulate progress for better UX before the actual fetch
                let progressInterval = setInterval(() => {
                    if (this.progress < 80) this.progress += 10;
                }, 200);

                await DataFetcher(this.scriptUrl, 'POST', payload);
                
                clearInterval(progressInterval);
                this.progress = 100; // Complete

                // Show Success
                this.showSuccessMessage = true;
                
                // Reset Form
                this.maintenanceFormData = {
                    FlatNo: '', Category: 'Monthly', Title: '', Month: '', Amount: null,
                    PaymentDate: '', PaymentMethod: 'UPI', Status: 'Paid', Remarks: '',
                };
                this.setInitialDates();
                
                // Refresh Data to reflect changes
                await this.fetchAndJoinData();
                
                // Hide success message after 3 seconds
                setTimeout(() => {
                    this.showSuccessMessage = false;
                    this.progress = 0;
                }, 3000);
                
            } catch (e) {
                console.error(e);
                this.error = e.message;
                this.progress = 0;
            } finally {
                this.isSubmitting = false;
            }
        },

        // --- GET: Fetch & Join Data ---
        async fetchAndJoinData() {
            this.isLoading = true;
            this.error = null;
            try {
                const data = await DataFetcher(this.scriptUrl, 'GET');

                const flatsRaw = data.flats || [];
                const residentsRaw = data.residents || [];
                
                // Sanitize Payments: Ensure every payment has a strictly unique ID.
                const paymentsRaw = (data.payments || []).map((p, idx) => ({
                    ...p,
                    PaymentID: p.PaymentID ? `${p.PaymentID}-${idx}` : `pay-gen-${idx}-${Date.now()}` 
                }));

                const colors = ['bg-primary', 'bg-success', 'bg-warning', 'bg-info', 'bg-danger', 'bg-secondary'];

                this.flats = flatsRaw.map((flat, index) => {
                    const safeFlatNo = String(flat.FlatNo || `Unknown-${index}`);
                    const flatResidents = residentsRaw.filter(r => String(r.FlatNo) === safeFlatNo);
                    const flatPayments = paymentsRaw.filter(p => String(p.FlatNo) === safeFlatNo);

                    // Calculate Total Pending Dues
                    const pendingAmount = flatPayments
                        .filter(p => p.Status !== 'Paid')
                        .reduce((sum, p) => sum + (Number(p.Amount) || 0), 0);

                    // Get Primary Resident Name
                    const primaryName = flatResidents.length > 0 ? flatResidents[0].Name : 'Unknown';
                    
                    // Generate Initials
                    const initials = primaryName.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();

                    return {
                        ...flat,
                        FlatNo: safeFlatNo, // Ensure string for consistent searching
                        residents: flatResidents.map(r => ({
                            name: r.Name, type: r.ResidentType, mobile: r.Phone, email: r.Email
                        })),
                        primaryName: primaryName,
                        primaryPhone: flatResidents.length > 0 ? flatResidents[0].Phone : '-',
                        primaryEmail: flatResidents.length > 0 ? flatResidents[0].Email : '-',
                        
                        // UI Helpers
                        initials: initials,
                        colorClass: colors[index % colors.length],
                        is_rented: flatResidents.some(r => r.ResidentType === 'Tenant'),
                        
                        // Financials
                        totalDues: pendingAmount,
                        status: pendingAmount > 0 ? 'Pending' : 'Paid',
                        
                        // History
                        maintenance_history: flatPayments.filter(p => p.Category === 'Monthly'),
                        adhoc_history: flatPayments.filter(p => p.Category === 'Adhoc')
                    };
                });
            } catch (err) {
                console.error("Fetch Error:", err);
                this.error = err.message;
            } finally {
                this.isLoading = false;
            }
        },

        // --- UI UTILITIES ---
        toggleDetails(flatNo) {
            this.expandedFlatId = (this.expandedFlatId === flatNo) ? null : flatNo;
        },

        formatCurrency(amount) {
            if (!amount) return '₹0';
            return new Intl.NumberFormat('en-IN', {
                style: 'currency', currency: 'INR', maximumFractionDigits: 0
            }).format(amount);
        },

        // --- COMPUTED PROPERTIES ---
        get filteredFlats() {
            if (!this.flats.length) return [];
            return this.flats.filter(flat => {
                const term = (this.search || '').toLowerCase();
                
                // Search Logic
                const matchesSearch = 
                    flat.FlatNo.toLowerCase().includes(term) ||
                    (flat.primaryName && flat.primaryName.toLowerCase().includes(term));

                // Filter Logic
                let matchesFilter = true;
                if (this.filter === 'paid') matchesFilter = flat.status === 'Paid';
                else if (this.filter === 'unpaid') matchesFilter = flat.status === 'Pending'; // 'Pending' matches the status set in map

                return matchesSearch && matchesFilter;
            });
        }
    }));
});