// exportUtils.ts - Generate PDF and Excel reports for deposits, meals, expenses, and member statistics
import * as FileSystem from "expo-file-system/legacy";
import { Deposit } from "./types";

// ==================== TYPES ====================
type Member = {
  id: string;
  name: string;
  email: string;
  role: string;
};

type MealEntry = {
  memberId: string;
  memberName: string;
  breakfast: number;
  lunch: number;
  dinner: number;
  date: string;
  createdAt: any;
};

type MealSummary = {
  memberId: string;
  memberName: string;
  breakfast: number;
  lunch: number;
  dinner: number;
  total: number;
};

type MemberStatistic = {
  id: string;
  name: string;
  meal: number;
  deposit: number;
  commonCharge: number;
  guestMealCost: number;
  mealCost: number;
  totalCost: number;
  balance: number;
};

// ==================== MEMBER STATISTICS EXPORTS ====================

/**
 * Generate PDF report for member statistics
 */
export const generateMemberStatsPDF = async (
  memberStats: MemberStatistic[],
  monthYear: string
): Promise<string> => {
  try {
    const monthName = getMonthName(monthYear);
    const generatedDate = formatDateTime(new Date());

    // Calculate totals
    const totals = {
      meals: memberStats.reduce((sum, m) => sum + m.meal, 0),
      deposits: memberStats.reduce((sum, m) => sum + m.deposit, 0),
      commonCharges: memberStats.reduce((sum, m) => sum + m.commonCharge, 0),
      guestMealCosts: memberStats.reduce((sum, m) => sum + (m.guestMealCost || 0), 0),
      mealCosts: memberStats.reduce((sum, m) => sum + m.mealCost, 0),
      totalCosts: memberStats.reduce((sum, m) => sum + m.totalCost, 0),
      balances: memberStats.reduce((sum, m) => sum + m.balance, 0),
    };

    // Create HTML content for PDF
    const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body {
      font-family: Arial, sans-serif;
      padding: 30px;
      color: #1e293b;
    }
    .header {
      text-align: center;
      margin-bottom: 30px;
      border-bottom: 3px solid #6366f1;
      padding-bottom: 20px;
    }
    .header h1 {
      color: #6366f1;
      margin: 0 0 10px 0;
      font-size: 28px;
    }
    .header p {
      color: #64748b;
      margin: 5px 0;
      font-size: 14px;
    }
    .summary-cards {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 15px;
      margin-bottom: 30px;
    }
    .summary-card {
      background: #f8fafc;
      padding: 15px;
      border-radius: 8px;
      border-left: 4px solid #6366f1;
    }
    .summary-card .label {
      color: #64748b;
      font-size: 12px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin-bottom: 5px;
    }
    .summary-card .value {
      font-size: 24px;
      font-weight: bold;
      color: #1e293b;
    }
    .summary-card.positive {
      border-left-color: #10b981;
    }
    .summary-card.positive .value {
      color: #10b981;
    }
    .summary-card.negative {
      border-left-color: #ef4444;
    }
    .summary-card.negative .value {
      color: #ef4444;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 20px;
      font-size: 11px;
    }
    th {
      background: #1e293b;
      color: white;
      padding: 10px 6px;
      text-align: right;
      font-weight: 600;
      font-size: 10px;
      white-space: nowrap;
    }
    th:first-child {
      text-align: left;
    }
    td {
      padding: 10px 6px;
      border-bottom: 1px solid #e2e8f0;
      text-align: right;
    }
    td:first-child {
      text-align: left;
      font-weight: 600;
      color: #1e293b;
    }
    tr:nth-child(even) {
      background: #f8fafc;
    }
    tr:hover {
      background: #f1f5f9;
    }
    .balance-positive {
      color: #10b981;
      font-weight: bold;
    }
    .balance-negative {
      color: #ef4444;
      font-weight: bold;
    }
    .total-row {
      font-weight: bold;
      background: #e0e7ff !important;
      border-top: 2px solid #6366f1;
    }
    .total-row td {
      padding: 12px 6px;
      font-size: 12px;
      color: #1e293b;
    }
    .footer {
      margin-top: 30px;
      padding-top: 20px;
      border-top: 1px solid #e2e8f0;
      text-align: center;
      color: #94a3b8;
      font-size: 11px;
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>Member Statistics Report</h1>
    <p><strong>${monthName}</strong></p>
    <p>Generated on ${generatedDate}</p>
  </div>

  <div class="summary-cards">
    <div class="summary-card">
      <div class="label">Total Members</div>
      <div class="value">${memberStats.length}</div>
    </div>
    <div class="summary-card">
      <div class="label">Total Meals</div>
      <div class="value">${totals.meals}</div>
    </div>
    <div class="summary-card">
      <div class="label">Total Deposits</div>
      <div class="value">₹${totals.deposits.toFixed(1)}</div>
    </div>
    <div class="summary-card">
      <div class="label">Common Charges</div>
      <div class="value">₹${totals.commonCharges.toFixed(1)}</div>
    </div>
    <div class="summary-card">
      <div class="label">Total Costs</div>
      <div class="value">₹${totals.totalCosts.toFixed(1)}</div>
    </div>
    <div class="summary-card ${totals.balances >= 0 ? 'positive' : 'negative'}">
      <div class="label">Net Balance</div>
      <div class="value">₹${totals.balances.toFixed(1)}</div>
    </div>
  </div>

  <table>
    <thead>
      <tr>
        <th>Member Name</th>
        <th>Meals</th>
        <th>Deposit</th>
        <th>Common</th>
        <th>Guest Meal</th>
        <th>Meal Cost</th>
        <th>Total Cost</th>
        <th>Balance</th>
      </tr>
    </thead>
    <tbody>
      ${memberStats
        .map(
          (member) => `
        <tr>
          <td>${member.name}</td>
          <td>${member.meal}</td>
          <td>₹${member.deposit.toFixed(1)}</td>
          <td>₹${member.commonCharge.toFixed(1)}</td>
          <td>₹${(member.guestMealCost || 0).toFixed(1)}</td>
          <td>₹${member.mealCost.toFixed(1)}</td>
          <td>₹${member.totalCost.toFixed(1)}</td>
          <td class="${member.balance >= 0 ? 'balance-positive' : 'balance-negative'}">
            ₹${member.balance.toFixed(1)}
          </td>
        </tr>
      `
        )
        .join("")}
      <tr class="total-row">
        <td>Total:</td>
        <td>${totals.meals}</td>
        <td>₹${totals.deposits.toFixed(1)}</td>
        <td>₹${totals.commonCharges.toFixed(1)}</td>
        <td>₹${totals.guestMealCosts.toFixed(1)}</td>
        <td>₹${totals.mealCosts.toFixed(1)}</td>
        <td>₹${totals.totalCosts.toFixed(1)}</td>
        <td class="${totals.balances >= 0 ? 'balance-positive' : 'balance-negative'}">
          ₹${totals.balances.toFixed(1)}
        </td>
      </tr>
    </tbody>
  </table>

  <div class="footer">
    <p>This report was automatically generated by the Mess Management System</p>
    <p>Total Members: ${memberStats.length} | Generated: ${generatedDate}</p>
  </div>
</body>
</html>
    `;

    // Convert HTML to PDF using expo-print
    const Print = await import("expo-print");
    const { uri } = await Print.printToFileAsync({
      html: htmlContent,
      base64: false,
    });

    return uri;
  } catch (error) {
    console.error("Error generating PDF:", error);
    throw new Error("Failed to generate PDF report");
  }
};

/**
 * Generate Excel/CSV report for member statistics
 */
export const generateMemberStatsExcel = async (
  memberStats: MemberStatistic[],
  monthYear: string
): Promise<string> => {
  try {
    const monthName = getMonthName(monthYear);
    const generatedDate = formatDateTime(new Date());

    // Calculate totals
    const totals = {
      meals: memberStats.reduce((sum, m) => sum + m.meal, 0),
      deposits: memberStats.reduce((sum, m) => sum + m.deposit, 0),
      commonCharges: memberStats.reduce((sum, m) => sum + m.commonCharge, 0),
      guestMealCosts: memberStats.reduce((sum, m) => sum + (m.guestMealCost || 0), 0),
      mealCosts: memberStats.reduce((sum, m) => sum + m.mealCost, 0),
      totalCosts: memberStats.reduce((sum, m) => sum + m.totalCost, 0),
      balances: memberStats.reduce((sum, m) => sum + m.balance, 0),
    };

    // Create CSV content
    let csvContent = "";

    // Header
    csvContent += `Member Statistics Report\n`;
    csvContent += `${monthName}\n`;
    csvContent += `Generated on: ${generatedDate}\n`;
    csvContent += `\n`;
    csvContent += `Summary\n`;
    csvContent += `Total Members: ${memberStats.length}\n`;
    csvContent += `Total Meals: ${totals.meals}\n`;
    csvContent += `Total Deposits: ₹${totals.deposits.toFixed(1)}\n`;
    csvContent += `Total Common Charges: ₹${totals.commonCharges.toFixed(1)}\n`;
    csvContent += `Total Guest Meal Costs: ₹${totals.guestMealCosts.toFixed(1)}\n`;
    csvContent += `Total Meal Costs: ₹${totals.mealCosts.toFixed(1)}\n`;
    csvContent += `Total Costs: ₹${totals.totalCosts.toFixed(1)}\n`;
    csvContent += `Net Balance: ₹${totals.balances.toFixed(1)}\n`;
    csvContent += `\n`;

    // Table headers
    csvContent += `Member Name,Meals,Deposit,Common Charge,Guest Meal,Meal Cost,Total Cost,Balance\n`;

    // Data rows
    memberStats.forEach((member) => {
      const name = member.name.replace(/,/g, ";"); // Escape commas
      csvContent += `"${name}",${member.meal},${member.deposit.toFixed(1)},${member.commonCharge.toFixed(1)},${(member.guestMealCost || 0).toFixed(1)},${member.mealCost.toFixed(1)},${member.totalCost.toFixed(1)},${member.balance.toFixed(1)}\n`;
    });

    // Total row
    csvContent += `Total:,${totals.meals},${totals.deposits.toFixed(1)},${totals.commonCharges.toFixed(1)},${totals.guestMealCosts.toFixed(1)},${totals.mealCosts.toFixed(1)},${totals.totalCosts.toFixed(1)},${totals.balances.toFixed(1)}\n`;

    // Save to file
    const fileUri = `${FileSystem.cacheDirectory}member_stats_${monthYear}.csv`;
    await FileSystem.writeAsStringAsync(fileUri, csvContent, {
      encoding: FileSystem.EncodingType.UTF8,
    });

    return fileUri;
  } catch (error) {
    console.error("Error generating Excel:", error);
    throw new Error("Failed to generate Excel report");
  }
};

// ==================== DEPOSIT EXPORTS ====================

/**
 * Generate PDF report for deposits
 */
export const generateDepositPDF = async (
  deposits: Deposit[],
  monthYear: string,
  total: number
): Promise<string> => {
  try {
    const monthName = getMonthName(monthYear);
    const generatedDate = formatDateTime(new Date());

    // Sort deposits by date
    const sortedDeposits = [...deposits].sort((a, b) =>
      new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    );

    // Create HTML content for PDF
    const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body {
      font-family: Arial, sans-serif;
      padding: 40px;
      color: #1e293b;
    }
    .header {
      text-align: center;
      margin-bottom: 30px;
      border-bottom: 3px solid #6366f1;
      padding-bottom: 20px;
    }
    .header h1 {
      color: #6366f1;
      margin: 0 0 10px 0;
      font-size: 28px;
    }
    .header p {
      color: #64748b;
      margin: 5px 0;
      font-size: 14px;
    }
    .summary {
      background: #f1f5f9;
      padding: 20px;
      border-radius: 8px;
      margin-bottom: 30px;
      text-align: center;
    }
    .summary .total {
      font-size: 36px;
      font-weight: bold;
      color: #10b981;
      margin: 10px 0;
    }
    .summary .label {
      color: #64748b;
      font-size: 14px;
      text-transform: uppercase;
      letter-spacing: 1px;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 20px;
    }
    th {
      background: #1e293b;
      color: white;
      padding: 12px;
      text-align: left;
      font-weight: 600;
      font-size: 14px;
    }
    td {
      padding: 12px;
      border-bottom: 1px solid #e2e8f0;
      font-size: 14px;
    }
    tr:nth-child(even) {
      background: #f8fafc;
    }
    tr:hover {
      background: #f1f5f9;
    }
    .amount {
      font-weight: bold;
      color: #10b981;
      text-align: right;
    }
    .total-row {
      font-weight: bold;
      background: #e0e7ff !important;
      border-top: 2px solid #6366f1;
    }
    .total-row td {
      padding: 15px 12px;
      font-size: 16px;
    }
    .footer {
      margin-top: 40px;
      padding-top: 20px;
      border-top: 1px solid #e2e8f0;
      text-align: center;
      color: #94a3b8;
      font-size: 12px;
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>Deposit Report</h1>
    <p><strong>${monthName}</strong></p>
    <p>Generated on ${generatedDate}</p>
  </div>

  <div class="summary">
    <div class="label">Total Deposits</div>
    <div class="total">₹${total.toLocaleString("en-IN")}</div>
  </div>

  <table>
    <thead>
      <tr>
        <th>Date</th>
        <th>Member Name</th>
        <th>Amount</th>
      </tr>
    </thead>
    <tbody>
      ${sortedDeposits
        .map(
          (deposit) => `
        <tr>
          <td>${formatDateOnly(deposit.createdAt)}</td>
          <td>${deposit.memberName}</td>
          <td class="amount">₹${deposit.amount.toLocaleString("en-IN")}</td>
        </tr>
      `
        )
        .join("")}
      <tr class="total-row">
        <td colspan="2" style="text-align: right;">Total:</td>
        <td class="amount">₹${total.toLocaleString("en-IN")}</td>
      </tr>
    </tbody>
  </table>

  <div class="footer">
    <p>This report was automatically generated by the Mess Management System</p>
  </div>
</body>
</html>
    `;

    // Convert HTML to PDF using expo-print
    const Print = await import("expo-print");
    const { uri } = await Print.printToFileAsync({
      html: htmlContent,
      base64: false,
    });

    return uri;
  } catch (error) {
    console.error("Error generating PDF:", error);
    throw new Error("Failed to generate PDF report");
  }
};

/**
 * Generate Excel/CSV report for deposits
 */
export const generateDepositExcel = async (
  deposits: Deposit[],
  monthYear: string,
  total: number
): Promise<string> => {
  try {
    const monthName = getMonthName(monthYear);
    const generatedDate = formatDateTime(new Date());

    // Sort deposits by date
    const sortedDeposits = [...deposits].sort((a, b) =>
      new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    );

    // Create CSV content
    let csvContent = "";

    // Header
    csvContent += `Deposit Report\n`;
    csvContent += `${monthName}\n`;
    csvContent += `Generated on: ${generatedDate}\n`;
    csvContent += `\n`;
    csvContent += `Total Deposits: ₹${total.toLocaleString("en-IN")}\n`;
    csvContent += `\n`;

    // Table headers
    csvContent += `Date,Member Name,Amount\n`;

    // Data rows
    sortedDeposits.forEach((deposit) => {
      const date = formatDateOnly(deposit.createdAt);
      const name = deposit.memberName.replace(/,/g, ";"); // Escape commas
      const amount = deposit.amount;
      csvContent += `${date},"${name}",${amount}\n`;
    });

    // Total row
    csvContent += `,,\n`;
    csvContent += `Total:,,${total}\n`;

    // Save to file
    const fileUri = `${FileSystem.cacheDirectory}deposit_report_${monthYear}.csv`;
    await FileSystem.writeAsStringAsync(fileUri, csvContent, {
      encoding: FileSystem.EncodingType.UTF8,
    });

    return fileUri;
  } catch (error) {
    console.error("Error generating Excel:", error);
    throw new Error("Failed to generate Excel report");
  }
};

// ==================== MEAL EXPORTS ====================

/**
 * Generate PDF report for meals
 */
export const generateMealPDF = async (
  meals: Record<string, MealEntry>,
  members: Member[],
  monthKey: string,
  totalDays: number
): Promise<string> => {
  try {
    const monthName = getMonthName(monthKey);
    const generatedDate = formatDateTime(new Date());

    // Calculate summary for each member
    const mealSummaries = calculateMealSummaries(meals, members, monthKey, totalDays);

    // Calculate grand totals
    const grandTotals = {
      breakfast: mealSummaries.reduce((sum, m) => sum + m.breakfast, 0),
      lunch: mealSummaries.reduce((sum, m) => sum + m.lunch, 0),
      dinner: mealSummaries.reduce((sum, m) => sum + m.dinner, 0),
      total: mealSummaries.reduce((sum, m) => sum + m.total, 0),
    };

    // Create HTML content for PDF
    const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body {
      font-family: Arial, sans-serif;
      padding: 40px;
      color: #1e293b;
    }
    .header {
      text-align: center;
      margin-bottom: 30px;
      border-bottom: 3px solid #6366f1;
      padding-bottom: 20px;
    }
    .header h1 {
      color: #6366f1;
      margin: 0 0 10px 0;
      font-size: 28px;
    }
    .header p {
      color: #64748b;
      margin: 5px 0;
      font-size: 14px;
    }
    .summary {
      background: #f1f5f9;
      padding: 20px;
      border-radius: 8px;
      margin-bottom: 30px;
      text-align: center;
    }
    .summary .total {
      font-size: 36px;
      font-weight: bold;
      color: #6366f1;
      margin: 10px 0;
    }
    .summary .label {
      color: #64748b;
      font-size: 14px;
      text-transform: uppercase;
      letter-spacing: 1px;
    }
    .meal-breakdown {
      display: flex;
      justify-content: space-around;
      margin-top: 15px;
      padding-top: 15px;
      border-top: 1px solid #cbd5e1;
    }
    .meal-breakdown-item {
      text-align: center;
    }
    .meal-breakdown-item .label {
      font-size: 12px;
      color: #64748b;
      margin-bottom: 5px;
    }
    .meal-breakdown-item .value {
      font-size: 20px;
      font-weight: bold;
      color: #6366f1;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 20px;
    }
    th {
      background: #1e293b;
      color: white;
      padding: 12px;
      text-align: left;
      font-weight: 600;
      font-size: 14px;
    }
    th:first-child {
      text-align: left;
    }
    th:not(:first-child) {
      text-align: center;
    }
    td {
      padding: 12px;
      border-bottom: 1px solid #e2e8f0;
      font-size: 14px;
    }
    td:first-child {
      font-weight: 600;
      color: #1e293b;
    }
    td:not(:first-child) {
      text-align: center;
      color: #475569;
    }
    tr:nth-child(even) {
      background: #f8fafc;
    }
    tr:hover {
      background: #f1f5f9;
    }
    .total-row {
      font-weight: bold;
      background: #e0e7ff !important;
      border-top: 2px solid #6366f1;
    }
    .total-row td {
      padding: 15px 12px;
      font-size: 16px;
      color: #1e293b;
    }
    .footer {
      margin-top: 40px;
      padding-top: 20px;
      border-top: 1px solid #e2e8f0;
      text-align: center;
      color: #94a3b8;
      font-size: 12px;
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>Meal Entry Report</h1>
    <p><strong>${monthName}</strong></p>
    <p>Generated on ${generatedDate}</p>
  </div>

  <div class="summary">
    <div class="label">Total Meals</div>
    <div class="total">${grandTotals.total}</div>
    <div class="meal-breakdown">
      <div class="meal-breakdown-item">
        <div class="label">🌅 Breakfast</div>
        <div class="value">${grandTotals.breakfast}</div>
      </div>
      <div class="meal-breakdown-item">
        <div class="label">☀️ Lunch</div>
        <div class="value">${grandTotals.lunch}</div>
      </div>
      <div class="meal-breakdown-item">
        <div class="label">🌙 Dinner</div>
        <div class="value">${grandTotals.dinner}</div>
      </div>
    </div>
  </div>

  <table>
    <thead>
      <tr>
        <th>Member Name</th>
        <th>Breakfast</th>
        <th>Lunch</th>
        <th>Dinner</th>
        <th>Total</th>
      </tr>
    </thead>
    <tbody>
      ${mealSummaries
        .map(
          (member) => `
        <tr>
          <td>${member.memberName}</td>
          <td>${member.breakfast}</td>
          <td>${member.lunch}</td>
          <td>${member.dinner}</td>
          <td style="font-weight: bold; color: #6366f1;">${member.total}</td>
        </tr>
      `
        )
        .join("")}
      <tr class="total-row">
        <td>Total:</td>
        <td>${grandTotals.breakfast}</td>
        <td>${grandTotals.lunch}</td>
        <td>${grandTotals.dinner}</td>
        <td>${grandTotals.total}</td>
      </tr>
    </tbody>
  </table>

  <div class="footer">
    <p>This report was automatically generated by the Mess Management System</p>
  </div>
</body>
</html>
    `;

    // Convert HTML to PDF using expo-print
    const Print = await import("expo-print");
    const { uri } = await Print.printToFileAsync({
      html: htmlContent,
      base64: false,
    });

    return uri;
  } catch (error) {
    console.error("Error generating PDF:", error);
    throw new Error("Failed to generate PDF report");
  }
};

/**
 * Generate Excel/CSV report for meals
 */
export const generateMealExcel = async (
  meals: Record<string, MealEntry>,
  members: Member[],
  monthKey: string,
  totalDays: number
): Promise<string> => {
  try {
    const monthName = getMonthName(monthKey);
    const generatedDate = formatDateTime(new Date());

    // Calculate summary for each member
    const mealSummaries = calculateMealSummaries(meals, members, monthKey, totalDays);

    // Calculate grand totals
    const grandTotals = {
      breakfast: mealSummaries.reduce((sum, m) => sum + m.breakfast, 0),
      lunch: mealSummaries.reduce((sum, m) => sum + m.lunch, 0),
      dinner: mealSummaries.reduce((sum, m) => sum + m.dinner, 0),
      total: mealSummaries.reduce((sum, m) => sum + m.total, 0),
    };

    // Create CSV content
    let csvContent = "";

    // Header
    csvContent += `Meal Entry Report\n`;
    csvContent += `${monthName}\n`;
    csvContent += `Generated on: ${generatedDate}\n`;
    csvContent += `\n`;
    csvContent += `Total Meals: ${grandTotals.total}\n`;
    csvContent += `Breakfast: ${grandTotals.breakfast}, Lunch: ${grandTotals.lunch}, Dinner: ${grandTotals.dinner}\n`;
    csvContent += `\n`;

    // Table headers
    csvContent += `Member Name,Breakfast,Lunch,Dinner,Total\n`;

    // Data rows
    mealSummaries.forEach((member) => {
      const name = member.memberName.replace(/,/g, ";"); // Escape commas
      csvContent += `"${name}",${member.breakfast},${member.lunch},${member.dinner},${member.total}\n`;
    });

    // Total row
    csvContent += `Total:,${grandTotals.breakfast},${grandTotals.lunch},${grandTotals.dinner},${grandTotals.total}\n`;

    // Save to file
    const fileUri = `${FileSystem.cacheDirectory}meal_report_${monthKey}.csv`;
    await FileSystem.writeAsStringAsync(fileUri, csvContent, {
      encoding: FileSystem.EncodingType.UTF8,
    });

    return fileUri;
  } catch (error) {
    console.error("Error generating Excel:", error);
    throw new Error("Failed to generate Excel report");
  }
};

// ==================== EXPENSE EXPORTS ====================

type ExpenseItem = {
  id: string;
  amount: number;
  purpose: string;
  date: string;
  isCommon: boolean;
  edited: boolean;
  createdAt: any;
  updatedAt?: any;
};

/**
 * Generate PDF report for expenses
 */
export const generateExpensePDF = async (
  expenses: ExpenseItem[],
  monthYear: string,
  total: number
): Promise<string> => {
  try {
    const monthName = getMonthName(monthYear);
    const generatedDate = formatDateTime(new Date());

    // Sort expenses by date
    const sortedExpenses = [...expenses].sort((a, b) =>
      new Date(a.createdAt?.toDate()).getTime() - new Date(b.createdAt?.toDate()).getTime()
    );

    // Create HTML content for PDF
    const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body {
      font-family: Arial, sans-serif;
      padding: 40px;
      color: #1e293b;
    }
    .header {
      text-align: center;
      margin-bottom: 30px;
      border-bottom: 3px solid #ef4444;
      padding-bottom: 20px;
    }
    .header h1 {
      color: #ef4444;
      margin: 0 0 10px 0;
      font-size: 28px;
    }
    .header p {
      color: #64748b;
      margin: 5px 0;
      font-size: 14px;
    }
    .summary {
      background: #f1f5f9;
      padding: 20px;
      border-radius: 8px;
      margin-bottom: 30px;
      text-align: center;
    }
    .summary .total {
      font-size: 36px;
      font-weight: bold;
      color: #ef4444;
      margin: 10px 0;
    }
    .summary .label {
      color: #64748b;
      font-size: 14px;
      text-transform: uppercase;
      letter-spacing: 1px;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 20px;
    }
    th {
      background: #1e293b;
      color: white;
      padding: 12px;
      text-align: left;
      font-weight: 600;
      font-size: 14px;
    }
    td {
      padding: 12px;
      border-bottom: 1px solid #e2e8f0;
      font-size: 14px;
    }
    tr:nth-child(even) {
      background: #f8fafc;
    }
    tr:hover {
      background: #f1f5f9;
    }
    .amount {
      font-weight: bold;
      color: #ef4444;
      text-align: right;
    }
    .common-badge {
      background: #3b82f6;
      color: white;
      padding: 4px 10px;
      border-radius: 12px;
      font-size: 11px;
      font-weight: 600;
      display: inline-block;
    }
    .total-row {
      font-weight: bold;
      background: #fee2e2 !important;
      border-top: 2px solid #ef4444;
    }
    .total-row td {
      padding: 15px 12px;
      font-size: 16px;
    }
    .footer {
      margin-top: 40px;
      padding-top: 20px;
      border-top: 1px solid #e2e8f0;
      text-align: center;
      color: #94a3b8;
      font-size: 12px;
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>Expenses Report</h1>
    <p><strong>${monthName}</strong></p>
    <p>Generated on ${generatedDate}</p>
  </div>

  <div class="summary">
    <div class="label">Total Expenses</div>
    <div class="total">₹${total.toLocaleString("en-IN")}</div>
  </div>

  <table>
    <thead>
      <tr>
        <th>Date</th>
        <th>Purpose</th>
        <th>Type</th>
        <th>Amount</th>
      </tr>
    </thead>
    <tbody>
      ${sortedExpenses
        .map(
          (expense) => `
        <tr>
          <td>${formatDateOnly(expense.createdAt?.toDate() || new Date())}</td>
          <td>${expense.purpose}</td>
          <td>${expense.isCommon ? '<span class="common-badge">Common</span>' : 'Non-Common'}</td>
          <td class="amount">₹${expense.amount.toLocaleString("en-IN")}</td>
        </tr>
      `
        )
        .join("")}
      <tr class="total-row">
        <td colspan="3" style="text-align: right;">Total:</td>
        <td class="amount">₹${total.toLocaleString("en-IN")}</td>
      </tr>
    </tbody>
  </table>

  <div class="footer">
    <p>This report was automatically generated by the Mess Management System</p>
  </div>
</body>
</html>
    `;

    // Convert HTML to PDF using expo-print
    const Print = await import("expo-print");
    const { uri } = await Print.printToFileAsync({
      html: htmlContent,
      base64: false,
    });

    return uri;
  } catch (error) {
    console.error("Error generating PDF:", error);
    throw new Error("Failed to generate PDF report");
  }
};

/**
 * Generate Excel/CSV report for expenses
 */
export const generateExpenseExcel = async (
  expenses: ExpenseItem[],
  monthYear: string,
  total: number
): Promise<string> => {
  try {
    const monthName = getMonthName(monthYear);
    const generatedDate = formatDateTime(new Date());

    // Sort expenses by date
    const sortedExpenses = [...expenses].sort((a, b) =>
      new Date(a.createdAt?.toDate()).getTime() - new Date(b.createdAt?.toDate()).getTime()
    );

    // Create CSV content
    let csvContent = "";

    // Header
    csvContent += `Expenses Report\n`;
    csvContent += `${monthName}\n`;
    csvContent += `Generated on: ${generatedDate}\n`;
    csvContent += `\n`;
    csvContent += `Total Expenses: ₹${total.toLocaleString("en-IN")}\n`;
    csvContent += `\n`;

    // Table headers
    csvContent += `Date,Purpose,Type,Amount\n`;

    // Data rows
    sortedExpenses.forEach((expense) => {
      const date = formatDateOnly(expense.createdAt?.toDate() || new Date());
      const purpose = expense.purpose.replace(/,/g, ";"); // Escape commas
      const type = expense.isCommon ? "Common" : "Non-Common";
      const amount = expense.amount;
      csvContent += `${date},"${purpose}",${type},${amount}\n`;
    });

    // Total row
    csvContent += `,,,\n`;
    csvContent += `Total:,,,${total}\n`;

    // Save to file
    const fileUri = `${FileSystem.cacheDirectory}expense_report_${monthYear}.csv`;
    await FileSystem.writeAsStringAsync(fileUri, csvContent, {
      encoding: FileSystem.EncodingType.UTF8,
    });

    return fileUri;
  } catch (error) {
    console.error("Error generating Excel:", error);
    throw new Error("Failed to generate Excel report");
  }
};

// ==================== HELPER FUNCTIONS ====================

const calculateMealSummaries = (
  meals: Record<string, MealEntry>,
  members: Member[],
  monthKey: string,
  totalDays: number
): MealSummary[] => {
  const { year, month } = parseMonthKey(monthKey);

  return members.map((member) => {
    let breakfast = 0;
    let lunch = 0;
    let dinner = 0;

    for (let day = 1; day <= totalDays; day++) {
      const dateKey = getDateKey(monthKey, day);
      const entryId = `${member.id}_${dateKey}`;
      const entry = meals[entryId];

      if (entry) {
        breakfast += entry.breakfast || 0;
        lunch += entry.lunch || 0;
        dinner += entry.dinner || 0;
      }
    }

    return {
      memberId: member.id,
      memberName: member.name,
      breakfast,
      lunch,
      dinner,
      total: breakfast + lunch + dinner,
    };
  });
};

const parseMonthKey = (key: string) => {
  const [y, m] = key.split("-").map(Number);
  return { year: y, month: m - 1 };
};

const getDateKey = (monthKey: string, day: number): string => {
  const { year, month } = parseMonthKey(monthKey);
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
};

const getMonthName = (yearMonth: string): string => {
  const [year, month] = yearMonth.split("-");
  const date = new Date(parseInt(year), parseInt(month) - 1);
  return date.toLocaleString("en-IN", { month: "long", year: "numeric" });
};

const formatDateTime = (date: Date): string => {
  return date.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
};

const formatDateOnly = (date: Date): string => {
  return date.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
};