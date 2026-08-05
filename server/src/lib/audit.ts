import prisma from '../prisma.js';

export interface Line { heading: string; amount: number; }
export interface AuditReport {
  currency: string;
  generatedAt: Date;
  incomeExpenditure: {
    income: Line[];
    discounts: number;
    totalIncome: number;
    expenditure: Line[];
    totalExpenditure: number;
    surplus: number;
  };
  balanceSheet: {
    assets: Line[];
    totalAssets: number;
    fund: Line[];
    liabilities: Line[];
    totalFundLiabilities: number;
  };
  memo: { billed: number; collected: number };
}

const HEAD_ORDER = ['Monthly Tuition Fee', 'Annual Charge', 'Computer Fee', 'Transportation Charge', 'Exam Fee', 'Miscellaneous Charges'];

/** Compute the NFRS-style Income & Expenditure statement + Balance Sheet from live data. */
export async function computeAudit(): Promise<AuditReport> {
  const invoices = await prisma.feeInvoice.findMany({ include: { items: true, payments: true } });
  const incomeByHead: Record<string, number> = {};
  for (const h of HEAD_ORDER) incomeByHead[h] = 0;
  let fines = 0, discounts = 0, collected = 0, billed = 0;
  for (const inv of invoices) {
    for (const it of inv.items) incomeByHead[it.description] = (incomeByHead[it.description] || 0) + it.amount;
    const gross = inv.items.reduce((a, i) => a + i.amount, 0);
    fines += inv.fine;
    discounts += inv.discount;
    billed += gross + inv.fine - inv.discount;
    collected += inv.payments.reduce((a, p) => a + p.amount, 0);
  }
  const known = HEAD_ORDER.filter((h) => incomeByHead[h] > 0).map((h) => ({ heading: h, amount: incomeByHead[h] }));
  const custom = Object.entries(incomeByHead).filter(([h, v]) => v > 0 && !HEAD_ORDER.includes(h)).map(([heading, amount]) => ({ heading, amount }));
  const income: Line[] = [...known, ...custom];
  if (fines > 0) income.push({ heading: 'Late Fee / Fine', amount: fines });
  const totalIncome = billed;

  const expenses = await prisma.expense.findMany({ include: { category: true } });
  const expByCat: Record<string, number> = {};
  for (const e of expenses) { const name = e.category?.name || 'Other'; expByCat[name] = (expByCat[name] || 0) + e.amount; }
  const payrollNet = (await prisma.payslip.findMany()).reduce((a, p) => a + p.netPay, 0);
  const salaryExpense = (expByCat['Salary'] || 0) + payrollNet;
  delete expByCat['Salary'];
  const expenditure: Line[] = [
    { heading: 'Salaries & Wages', amount: salaryExpense },
    ...Object.entries(expByCat).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]).map(([heading, amount]) => ({ heading, amount })),
  ].filter((e) => e.amount > 0);
  const totalExpenditure = expenditure.reduce((a, e) => a + e.amount, 0);
  const surplus = totalIncome - totalExpenditure;

  const cash = collected - totalExpenditure;
  const receivable = billed - collected;
  const totalAssets = cash + receivable;
  const fund = surplus;

  return {
    currency: 'NPR',
    generatedAt: new Date(),
    incomeExpenditure: { income, discounts, totalIncome, expenditure, totalExpenditure, surplus },
    balanceSheet: {
      assets: [
        { heading: 'Cash & Bank Balance', amount: cash },
        { heading: 'Fees Receivable', amount: receivable },
      ],
      totalAssets,
      fund: [{ heading: 'Accumulated Fund (Surplus/Deficit)', amount: fund }],
      liabilities: [],
      totalFundLiabilities: fund,
    },
    memo: { billed, collected },
  };
}
