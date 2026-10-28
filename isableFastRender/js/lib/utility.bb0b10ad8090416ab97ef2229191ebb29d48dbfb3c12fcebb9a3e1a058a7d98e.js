/**
 * =================================================================
 * UTILITY LIBRARY
 * =================================================================
 * This file contains shared constants and helper functions that don't 
 * depend on any specific page logic. It acts like a "Shared Module" in VB.NET.
 */

// 1. NAMESPACE CHECK
// In VB.NET: Namespace AppServices
// We check if 'AppServices' exists globally. If not, we create it.
if (typeof window.AppServices === 'undefined') {
    window.AppServices = {};
}

// 2. IMMEDIATE FUNCTION (IIFE)
// This wrapper creates a private scope so variables don't leak out.
(function(NS) {
    
    // --- PRIVATE CONSTANTS ---
    // These are only visible inside this block.
    const MONTHS_MAP = {jan:0, feb:1, mar:2, apr:3, may:4, jun:5, jul:6, aug:7, sep:8, oct:9, nov:10, dec:11};
    const MONTHS_ARRAY = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

    // --- THE CLASS ---
    // Like 'Public Class Utility' in VB.NET
    class Utility {
        
        // Expose constants publicly
        static get Constants() {
            return { MONTHS_MAP, MONTHS_ARRAY };
        }

        // Helper: Get formatted date string for inputs
        static get LocalTimeHelper() {
            return {
                getLocalISOString: function() {
                    const now = new Date();
                    const offset = now.getTimezoneOffset() * 60000; 
                    return new Date(now.getTime() - offset).toISOString();
                }
            };
        }

        // Helper: Handle null/undefined strings safely
        // Like: String.IsNullOrEmpty check
        static safeString(val) {
            if (val !== null && val !== undefined) {
                return String(val).trim();
            }
            return '';
        }

        // Helper: Convert "001" to "1" for consistent IDs
        static normalizeFlat(val) {
            const s = Utility.safeString(val);
            const n = Number(s);
            // If it's a valid number, return it as string "1", else return original "Admin"
            if (s !== '' && !isNaN(n)) {
                return String(n);
            }
            return s;
        }
    }

    // 3. EXPORT
    // Attach the class to the Namespace so other files can see it.
    NS.Utility = Utility;

})(window.AppServices);