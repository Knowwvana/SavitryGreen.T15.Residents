const PAYMENT_SHEET_NAME = "Payments"; 
const ADMIN_SHEET_NAME = "Admins"; 

// 'Settings' is handled separately via getSettingsData
// NOTE: Admins sheet is EXCLUDED from DATA_SHEETS for security — passwords never sent to client
const DATA_SHEETS = ["Flats", "Residents", PAYMENT_SHEET_NAME, "Expenditure"];

// =================================================================
// 1. Response Helper
// =================================================================

function createJSONResponse(result) {
  return ContentService.createTextOutput(JSON.stringify(result))
    .setMimeType(ContentService.MimeType.JSON);
}

// =================================================================
// 2. GET Handler (Read Data)
// =================================================================

function doGet(e) {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var result = {};
    
    // Fetch generic list data
    DATA_SHEETS.forEach(function(sheetName) {
         result[sheetName.toLowerCase()] = getSheetData(ss, sheetName);
    });
    
    // Fetch Settings object specifically
    result.settings = getSettingsData(ss); 
    
    // Build list of all flat numbers for login dropdown
    var allFlats = (result.flats || []).map(function(f) { return String(f.FlatNo); });
    
    return createJSONResponse({ 
      success: true, 
      flats: result.flats, 
      residents: result.residents, 
      payments: result.payments,
      settings: result.settings,
      expenditure: result.expenditure,
      flatList: allFlats
    });

  } catch (error) {
    return createJSONResponse({ 
      success: false, 
      message: "Read Script Error: " + error.toString() 
    });
  }
}

// =================================================================
// 3. POST Handler (Create / Update)
// =================================================================

function doPost(e) {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    
    if (!e.postData || !e.postData.contents) {
      return createJSONResponse({ success: false, message: "No data received." });
    }
    
    var data = JSON.parse(e.postData.contents);
    
    if (data.action === 'ADD_EXPENSE') {
      return handleCreateExpense(ss, data);
    }
    
    if (data.action === 'ADMIN_LOGIN') {
      return handleAdminLogin(ss, data);
    }
    
    if (data.action === 'ADD_RESIDENT') {
      return handleAddResident(ss, data);
    }
    
    if (data.action === 'UPDATE_RESIDENT') {
      return handleUpdateResidentStatus(ss, data);
    }
    
    var sheet = ss.getSheetByName(PAYMENT_SHEET_NAME);
    if (!sheet) throw new Error("Sheet named '" + PAYMENT_SHEET_NAME + "' not found.");
    
    if (data.action === 'UPDATE') {
      return handleUpdate(sheet, data);
    } else {
      return handleCreate(sheet, data);
    }

  } catch (error) {
    return createJSONResponse({ success: false, message: "Script Error: " + error.toString() });
  }
}

// =================================================================
// 3b. Create Expense Handler
// =================================================================

function handleCreateExpense(ss, data) {
  if (!data.Title || !data.Amount) {
    return createJSONResponse({ success: false, message: "Missing required fields (Title, Amount)." });
  }
  
  var sheet = ss.getSheetByName("Expenditure");
  if (!sheet) throw new Error("Sheet named 'Expenditure' not found.");
  
  // Auto-generate ExpenseID if not provided
  var expenseId = data.ExpenseID;
  if (!expenseId) {
    var lastRow = sheet.getLastRow();
    expenseId = (lastRow > 1) ? (parseInt(sheet.getRange(lastRow, 1).getValue()) || 0) + 1 : 1;
  }
  
  // Format date: convert "2026-05-12" to "12.May.2026" to match existing sheet format
  var formattedDate = data.Date || '';
  if (formattedDate && formattedDate.indexOf('-') > -1) {
    try {
      var parts = formattedDate.split('-');
      var d = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
      var months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
      formattedDate = ('0' + d.getDate()).slice(-2) + '.' + months[d.getMonth()] + '.' + d.getFullYear();
    } catch (e) { /* keep original */ }
  }
  
  // MAP FIELDS TO COLUMNS: ExpenseID | Title | Type | Amount | Date | Remarks
  var newRow = [
    expenseId,
    data.Title,
    data.Type || 'Monthly',
    parseFloat(data.Amount),
    formattedDate,
    data.Remarks || ''
  ];
  
  sheet.appendRow(newRow);
  return createJSONResponse({ success: true, message: "Expense added successfully." });
}

// =================================================================
// 3c. Create Payment Handler
// =================================================================

function handleCreate(sheet, data) {
  if (!data.FlatNo || !data.Amount) {
    return createJSONResponse({ success: false, message: "Missing required fields." });
  }

  // MAP FIELDS TO COLUMNS (Order Matters)
  // 1.PaymentID, 2.FlatNo, 3.Category, 4.Title, 5.Month, 6.Amount, 7.PayDate, 8.Method, 9.Status, 10.ValBy, 11.ValTime, 12.Remarks, 13.ValComments, 14.EntryAddedDate
  var newRow = [
    data.PaymentID || new Date().getTime(),
    data.FlatNo,
    data.Category || 'Monthly',
    data.Title || '',
    data.Month || '',
    data.Amount,
    data.PaymentDate,
    data.PaymentMethod,
    data.Status || 'Paid',         
    data.ValidatedBy || '',        
    data.ValidationTime || '',     
    data.Remarks || '', 
    data.ValidationComments || '', 
    data.EntryAddedDate || ''      
  ];
  
  sheet.appendRow(newRow);
  return createJSONResponse({ success: true, message: "Payment added successfully." });
}

// =================================================================
// 3d. Update Payment Handler
// =================================================================

function handleUpdate(sheet, data) {
  var paymentId = data.PaymentID;
  if (!paymentId) return createJSONResponse({ success: false, message: "Missing PaymentID." });

  var range = sheet.getDataRange();
  var values = range.getValues();
  var headers = values[0].map(function(h) { return h.toString().trim(); });
  
  var colMap = {};
  headers.forEach(function(h, i) { colMap[h] = i + 1; });

  if (!colMap["PaymentID"]) return createJSONResponse({ success: false, message: "Column 'PaymentID' not found." });

  var rowIndex = -1;
  for (var i = 1; i < values.length; i++) {
    if (String(values[i][colMap["PaymentID"] - 1]) === String(paymentId)) {
      rowIndex = i + 1;
      break;
    }
  }
  
  if (rowIndex === -1) return createJSONResponse({ success: false, message: "Payment ID not found." });

  if (data.Status && colMap["Status"]) sheet.getRange(rowIndex, colMap["Status"]).setValue(data.Status);
  if (data.ValidatedBy && colMap["ValidatedBy"]) sheet.getRange(rowIndex, colMap["ValidatedBy"]).setValue(data.ValidatedBy);
  if (data.ValidationTime && colMap["ValidationTime"]) sheet.getRange(rowIndex, colMap["ValidationTime"]).setValue(data.ValidationTime);
  if (data.ValidationComments && colMap["ValidationComments"]) sheet.getRange(rowIndex, colMap["ValidationComments"]).setValue(data.ValidationComments);
  
  return createJSONResponse({ success: true, message: "Status updated successfully." });
}

// =================================================================
// 3e. Admin Login Handler (Server-Side Auth)
// =================================================================

function handleAdminLogin(ss, data) {
  if (!data.username || !data.password) {
    return createJSONResponse({ success: false, message: "Username and password are required." });
  }
  
  var sheet = ss.getSheetByName(ADMIN_SHEET_NAME);
  if (!sheet) return createJSONResponse({ success: false, message: "Admin configuration not found." });
  
  var allData = sheet.getDataRange().getValues();
  if (allData.length <= 1) return createJSONResponse({ success: false, message: "No admin accounts configured." });
  
  var headers = allData[0].map(function(h) { return h.toString().trim(); });
  var userCol = headers.indexOf("AdminUserName");
  var passCol = headers.indexOf("AdminPassword");
  
  if (userCol === -1 || passCol === -1) {
    return createJSONResponse({ success: false, message: "Admin sheet structure invalid." });
  }
  
  for (var i = 1; i < allData.length; i++) {
    var sheetUser = String(allData[i][userCol]).trim();
    var sheetPass = String(allData[i][passCol]).trim();
    if (sheetUser === data.username && sheetPass === data.password) {
      // Return admin name only — NEVER return password
      return createJSONResponse({ success: true, adminName: sheetUser });
    }
  }
  
  return createJSONResponse({ success: false, message: "Invalid credentials." });
}

// =================================================================
// 3f. Add Resident Handler (Self-Registration)
// =================================================================

function handleAddResident(ss, data) {
  if (!data.FlatNo || !data.Name || !data.Phone) {
    return createJSONResponse({ success: false, message: "Flat Number, Name, and Phone are required." });
  }
  if (String(data.Name).trim().length < 4) {
    return createJSONResponse({ success: false, message: "Name must be at least 4 characters." });
  }
  var phoneDigits = String(data.Phone).trim().replace(/\D/g, '');
  if (phoneDigits.length !== 10) {
    return createJSONResponse({ success: false, message: "Mobile number must be exactly 10 digits." });
  }
  
  var sheet = ss.getSheetByName("Residents");
  if (!sheet) throw new Error("Sheet named 'Residents' not found.");
  
  // Duplicate check: same FlatNo + Phone should not exist
  var allData = sheet.getDataRange().getValues();
  var headers = allData[0].map(function(h) { return h.toString().trim(); });
  var flatCol = headers.indexOf("FlatNo");
  var phoneCol = headers.indexOf("Phone");
  
  if (flatCol !== -1 && phoneCol !== -1) {
    for (var i = 1; i < allData.length; i++) {
      var existingFlat = String(allData[i][flatCol]).trim();
      var existingPhone = String(allData[i][phoneCol]).trim().replace(/\s/g, '');
      var inputFlat = String(data.FlatNo).trim();
      var inputPhone = String(data.Phone).trim().replace(/\s/g, '');
      if (existingFlat === inputFlat && existingPhone === inputPhone) {
        return createJSONResponse({ success: false, message: "A resident with this Flat and Phone already exists." });
      }
    }
  }
  
  // Auto-generate ResidentId
  var lastRow = sheet.getLastRow();
  var residentId = 1;
  if (lastRow > 1) {
    var idCol = headers.indexOf("ResidentId");
    if (idCol !== -1) {
      residentId = (parseInt(allData[lastRow - 1][idCol]) || 0) + 1;
    } else {
      residentId = lastRow;
    }
  }
  
  // MAP FIELDS TO COLUMNS: ResidentId | FlatNo | Name | Email | Phone | ResidentType | IsActive
  var newRow = [
    residentId,
    data.FlatNo,
    data.Name,
    data.Email || '',
    data.Phone,
    data.ResidentType || 'Owner',
    false  // IsActive = false until admin approves
  ];
  
  sheet.appendRow(newRow);
  return createJSONResponse({ success: true, message: "Registration submitted! An admin will validate your entry shortly." });
}

// =================================================================
// 3g. Update Resident Status Handler (Admin Validation)
// =================================================================

function handleUpdateResidentStatus(ss, data) {
  if (!data.ResidentId) {
    return createJSONResponse({ success: false, message: "Missing ResidentId." });
  }
  
  var sheet = ss.getSheetByName("Residents");
  if (!sheet) throw new Error("Sheet named 'Residents' not found.");
  
  var range = sheet.getDataRange();
  var values = range.getValues();
  var headers = values[0].map(function(h) { return h.toString().trim(); });
  
  var colMap = {};
  headers.forEach(function(h, i) { colMap[h] = i + 1; });
  
  if (!colMap["ResidentId"]) return createJSONResponse({ success: false, message: "Column 'ResidentId' not found." });
  if (!colMap["IsActive"]) return createJSONResponse({ success: false, message: "Column 'IsActive' not found." });
  
  var rowIndex = -1;
  for (var i = 1; i < values.length; i++) {
    if (String(values[i][colMap["ResidentId"] - 1]) === String(data.ResidentId)) {
      rowIndex = i + 1;
      break;
    }
  }
  
  if (rowIndex === -1) return createJSONResponse({ success: false, message: "Resident ID not found." });
  
  var newStatus = data.IsActive || 'Active';
  sheet.getRange(rowIndex, colMap["IsActive"]).setValue(newStatus === 'Active' ? true : newStatus);
  
  return createJSONResponse({ success: true, message: "Resident status updated successfully." });
}

// =================================================================
// 4. Helpers
// =================================================================

function getSheetData(ss, sheetName) {
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) return [];
  
  var data = sheet.getDataRange().getValues();
  if (data.length <= 1) return [];
  
  var headers = data[0].map(function(h) { return h.toString().trim(); });
  var rows = data.slice(1);
  
  return rows.map(function(row) {
    var obj = {};
    headers.forEach(function(header, index) {
      if (header) obj[header] = row[index];
    });
    return obj;
  });
}

function getSettingsData(ss) {
  var sheet = ss.getSheetByName("Settings");
  if (!sheet) return {};
  
  var data = sheet.getDataRange().getValues();
  var settings = {};
  
  // Settings format: Key in Col A, Value in Col B
  for (var i = 1; i < data.length; i++) {
    var key = data[i][0];
    var val = data[i][1];
    if (key) settings[key] = val;
  }
  return settings;
}