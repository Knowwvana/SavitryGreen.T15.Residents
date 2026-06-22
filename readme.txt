================================================================================
  Savitry Greens - Tower 15 Residents App
  Change Log & Deployment Tracker
================================================================================

--------------------------------------------------------------------------------
Date: 12-May-2026
Branch: feature/addExpenses (deployed to remote main via git push origin feature/addExpenses:main)
--------------------------------------------------------------------------------

Changes Made:

1. ADD EXPENSE FEATURE (End-to-End)
   - Added "Add Expense" tab in Admin Portal (validate.html)
   - Expense form with fields: Amount, Title/Description, Expense Type (Monthly/Adhoc), Date, Remarks
   - Added addExpense() method in SocietyRepository (app.js) to POST expense data to Google Apps Script
   - Added expenseForm state, resetExpenseForm(), saveExpense() handler in Alpine component (app.js)
   - Updated Google Apps Script doPost() to handle ADD_EXPENSE action
   - New handleCreateExpense() function in Apps Script saves to "Expenditure" sheet
   - Success screen with "Add Another Expense" and "Back to Approvals" options
   - Blue theme applied to all Add Expense controls (matching app primary color)

2. RECENT ACTIVITY PAGINATION (Dashboard)
   - Dashboard Recent Activity now shows 10 records per page (was showing all)
   - Sorted by PaymentDate in descending order (newest first)
   - Added recentPage, recentLimit state variables (app.js)
   - Added paginatedRecentTransactions and recentTotalPages getters (app.js)
   - Added Prev/Next pagination controls with blue buttons (dashboard.html)
   - Pagination only visible when more than 1 page exists

3. UI STYLING UPDATES
   - Add Expense tab button: blue (bg-primary) instead of red
   - Record Expense header card removed from form
   - Form header card, icons, amount symbol, buttons all use blue/primary theme
   - Adhoc type toggle uses bg-info instead of bg-warning
   - Pagination buttons: compact blue (btn-primary), centered with page counter

Files Modified:
   - assets/js/app.js
   - layouts/partials/mobile/validate.html
   - layouts/partials/mobile/dashboard.html
   - Google Apps Script (manually updated and redeployed by admin)

Branch Status:
   - LOCAL main branch: OLD code (not updated)
   - LOCAL feature/addExpenses: UPDATED code with all changes above
   - REMOTE origin/main: UPDATED (pushed from feature/addExpenses)
   - GitHub Pages: Serving from docs/ folder on remote main

Notes:
   - Google Apps Script must be redeployed with a NEW version for doPost changes to take effect
   - Hugo build output goes to docs/ folder (publishDir = "docs" in hugo.toml)
   - To rebuild for deployment: run "hugo" from project root, then commit docs/ and push
