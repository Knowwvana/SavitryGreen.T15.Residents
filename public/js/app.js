document.addEventListener('alpine:init', () => {
    window.societyApp = (api_url) => ({
        view: 'residents', // Default view
        searchQuery: '',
        filterStatus: 'all',
        currentDate: '',
        
        activeResident: { flat: '', occupants: [], history: [], due: 0 },
        residents: [],
        settings: {}, 
        isLoading: true,
        apiUrl: api_url,

        init() {
            this.updateDate();
            this.fetchData();
        },

        updateDate() {
            const date = new Date();
            // Format: "FRI, DEC 5"
            const options = { weekday: 'short', month: 'short', day: 'numeric' };
            this.currentDate = date.toLocaleDateString('en-US', options).toUpperCase();
        },

        async fetchData() {
            this.isLoading = true;
            try {
                if (!this.apiUrl) throw new Error("API URL Missing");

                const response = await fetch(this.apiUrl + '?action=getData'); 
                const result = await response.json();
                
                const rawFlats = result.flats || [];
                const rawResidents = result.residents || [];
                const rawPayments = result.payments || [];
                this.settings = result.settings || {};

                // MERGE DATA
                this.residents = rawFlats.map((f, index) => {
                    const flatNo = String(f.FlatNo || f.flat || '').trim();
                    
                    // Occupants
                    const occupants = rawResidents
                        .filter(r => String(r.FlatNo || r.flat).trim() === flatNo)
                        .map(r => ({
                            name: r.Name || r.name || 'Unknown',
                            phone: r.Phone || r.Mobile || r.phone || '',
                            type: r.Type || r.type || 'Owner'
                        }));

                    // Payment History & Last Payment Logic
                    const history = rawPayments
                        .filter(p => String(p.FlatNo || p.flat).trim() === flatNo)
                        .map(p => ({
                            date: p.PaymentDate || p.date,
                            amount: p.Amount || p.amount,
                            category: p.Category || p.category || 'Maintenance',
                            type: p.Type || 'Monthly'
                        }))
                        // Sort by date descending (newest first)
                        .sort((a, b) => new Date(b.date) - new Date(a.date));

                    const lastPayment = history.length > 0 ? history[0] : null;

                    const due = parseFloat(f.Due || f.Pending || 0);

                    return {
                        id: index,
                        flat: flatNo,
                        occupants: occupants,
                        history: history,
                        lastPayment: lastPayment,
                        due: due,
                        isPaid: due <= 0,
                        searchStr: `${flatNo} ${occupants.map(o => o.name).join(' ')}`.toLowerCase()
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
        }
    });
});