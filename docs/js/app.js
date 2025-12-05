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
        apiUrl: api_url,

        init() {
            this.updateDate();
            this.fetchData();
        },

        updateDate() {
            const date = new Date();
            const options = { weekday: 'short', month: 'short', day: 'numeric' };
            this.currentDate = date.toLocaleDateString('en-US', options).toUpperCase();
        },

        // HELPER: Removes zeros to ensure "001" matches "1"
        getCleanFlatNo(value) {
            if (!value) return '';
            // Convert to string, trim whitespace, parse to int to remove zeros, then back to string
            // "001" -> 1 -> "1"
            // "101" -> 101 -> "101"
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
                
                // Debugging: Check your console to see the raw data!
                console.log("Raw API Data:", result);

                const rawFlats = result.flats || [];
                const rawResidents = result.residents || [];
                const rawPayments = result.payments || [];
                this.settings = result.settings || {};

                // MERGE DATA
                this.residents = rawFlats.map((f, index) => {
                    // 1. Normalize the Flat ID from the Master List
                    const flatKey = this.getCleanFlatNo(f.FlatNo || f.flat);
                    const displayFlat = String(f.FlatNo || f.flat || '').trim(); // Keep original for display (e.g. "001")
                    
                    // 2. Find Occupants (Match using clean flat number)
                    const occupants = rawResidents
                        .filter(r => this.getCleanFlatNo(r.FlatNo || r.flat) === flatKey)
                        .map(r => ({
                            name: r.Name || r.name || r.ResidentName || 'Unknown',
                            phone: r.Phone || r.Mobile || r.phone || '',
                            // Map 'ResidentType' column correctly
                            type: r.Type || r.type || r.ResidentType || 'Owner'
                        }));

                    // 3. Find History (Match using clean flat number)
                    const history = rawPayments
                        .filter(p => this.getCleanFlatNo(p.FlatNo || p.flat) === flatKey)
                        .map(p => ({
                            date: p.PaymentDate || p.date,
                            amount: p.Amount || p.amount,
                            category: p.Category || p.category || 'Maintenance',
                            type: p.Type || 'Monthly'
                        }))
                        .sort((a, b) => new Date(b.date) - new Date(a.date));

                    const lastPayment = history.length > 0 ? history[0] : null;
                    const due = parseFloat(f.Due || f.Pending || 0);

                    return {
                        id: index,
                        flat: displayFlat, // Show "001" on screen, but we used "1" for matching
                        occupants: occupants,
                        history: history,
                        lastPayment: lastPayment,
                        due: due,
                        isPaid: due <= 0,
                        // Search includes normalized keys so searching "1" finds "001"
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
        }
    });
});