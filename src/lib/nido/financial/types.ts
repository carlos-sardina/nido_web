import type { MonthRange } from "./dates.ts";

export type ExpenseScope = "personal" | "shared";
export type DistributionMethod = "equal" | "percentage" | "fixed" | "income_based";
export type GoalType = "saving" | "purchase";
export type GoalStatus = "active" | "completed" | "archived";
export type RecurrenceFrequency = "weekly" | "biweekly" | "monthly" | "yearly";

export type CategoryRef = {
  id: string;
  name: string;
  icon: string | null;
};

export type MemberRef = {
  id: string;
  displayName: string;
};

export type ExpenseSplitRow = {
  id: string;
  expenseId: string;
  memberId: string;
  amount: number;
  percentage: number | null;
};

export type ExpenseRefundSplitRow = {
  id: string;
  refundId: string;
  memberId: string;
  amount: number;
  percentage: number | null;
};

export type ExpenseRefundRow = {
  id: string;
  expenseId: string;
  amount: number;
  occurredAt: string;
  createdBy: string;
  createdAt: string;
  splits: ExpenseRefundSplitRow[];
};

export type ExpenseRow = {
  id: string;
  householdId: string;
  categoryId: string;
  amount: number;
  description: string | null;
  occurredAt: string;
  payerId: string | null;
  scope: ExpenseScope;
  distributionMethod: DistributionMethod;
  recurringId: string | null;
  createdBy: string;
  createdAt: string;
  deletedAt: string | null;
  category: CategoryRef | null;
  payer: MemberRef | null;
  splits: ExpenseSplitRow[];
  refunds?: ExpenseRefundRow[];
};

export type IncomeRow = {
  id: string;
  householdId: string;
  memberId: string;
  categoryId: string;
  amount: number;
  description: string | null;
  occurredAt: string;
  recurringId: string | null;
  /** Previous-month Sueldo this row was copied from, if any. */
  copiedFromId?: string | null;
  createdBy: string;
  createdAt: string;
  deletedAt: string | null;
  category: CategoryRef | null;
  member: MemberRef | null;
};

export type RecurringIncomeRow = {
  id: string;
  householdId: string;
  memberId: string;
  amount: number;
  description: string | null;
  isActive: boolean;
  frequency: RecurrenceFrequency;
  endDate: string | null;
};

export type RecurringIncomeTemplate = RecurringIncomeRow & {
  categoryId: string;
  startDate: string;
  nextOccurrence: string;
  createdBy: string;
  dayOfMonth: number | null;
  category: CategoryRef | null;
};

export type BudgetRow = {
  id: string;
  householdId: string;
  memberId: string | null;
  categoryId: string;
  amount: number;
  period: "monthly";
  startDate: string;
  endDate: string;
  createdBy: string;
  createdAt: string;
  deletedAt: string | null;
  category: CategoryRef | null;
};

export type GoalContributionRow = {
  id: string;
  goalId: string;
  memberId: string;
  amount: number;
  contributedAt: string;
  createdBy: string;
  createdAt: string;
  deletedAt: string | null;
  member: MemberRef | null;
};

export type GoalRow = {
  id: string;
  householdId: string;
  name: string;
  description: string | null;
  goalType: GoalType;
  scope: ExpenseScope;
  targetAmount: number;
  targetDate: string | null;
  status: GoalStatus;
  createdBy: string;
  createdAt: string;
  contributions: GoalContributionRow[];
};

export type ActivityType = "expense" | "income" | "goal_contribution" | "refund";

export type ActivityItem = {
  id: string;
  type: ActivityType;
  sourceId: string;
  title: string;
  amount: number;
  date: string;
  createdAt: string | null;
  memberId: string | null;
  memberName: string | null;
  icon: string;
  metadata: {
    scope?: ExpenseScope;
    recurring?: boolean;
    categoryName?: string | null;
    goalId?: string | null;
    goalName?: string | null;
    expenseId?: string | null;
  };
};

export type ActivitySource =
  | { type: "expense"; expense: ExpenseRow }
  | { type: "income"; income: IncomeRow }
  | { type: "goal_contribution"; goal: GoalRow; contributionId: string };

export type GoalProgress = {
  id: string;
  name: string;
  goalType: GoalType;
  scope: ExpenseScope;
  status: GoalStatus;
  targetAmount: number;
  contributed: number;
  ratio: number;
  percent: number;
  targetDate: string | null;
  invalidTarget: boolean;
  completed: boolean;
};

/**
 * Derived budget consumption. Never persisted.
 * `consumed` is net: live expenses minus live refunds of those expenses.
 */
export type BudgetConsumption = {
  budgetAmount: number;
  consumed: number;
  remaining: number;
  /** Unbounded. 0 when consumed is 0. Null if budgetAmount <= 0. */
  percentage: number | null;
};

export type BudgetCategoryView = {
  categoryId: string;
  name: string;
  icon: string;
  budget: number;
  spent: number;
  /** Spend in this category with no Nido budget for the month. */
  unbudgeted: boolean;
};

export type BudgetItemView = {
  id: string;
  householdId: string;
  categoryId: string;
  name: string;
  icon: string;
  amount: number;
  spent: number;
  remaining: number;
  usagePercent: number | null;
  over: boolean;
  nearLimit: boolean;
  startDate: string;
  endDate: string;
  createdBy: string;
  deletedAt: string | null;
  memberId: string | null;
  memberName: string | null;
};

export type MonthBudgetView = {
  hasBudget: boolean;
  totalBudget: number;
  totalSpent: number;
  remaining: number;
  over: boolean;
  usagePercent: number | null;
  categories: BudgetCategoryView[];
  /** Spend that counts in the monthly total but has no budget row. */
  unbudgetedCategories: BudgetCategoryView[];
  items: BudgetItemView[];
};

export type HealthTone = "excellent" | "stable" | "attention" | "critical" | "pending";

export type HealthView =
  | {
      available: false;
    }
  | {
      available: true;
      score: number | null;
      label: string;
      tone: HealthTone;
      hint: string | null;
      tips: string[];
      savingsRatePercent: number | null;
      emergencyMonths: number | null;
      budgetUsagePercent: number | null;
      activeGoalCount: number;
    };

export type FeaturedGoalView = {
  id: string;
  name: string;
  contributed: number;
  targetAmount: number;
  percent: number;
  invalidTarget: boolean;
  emergencyMonths: number | null;
};

/**
 * Derived monthly balance. Never persisted.
 * Settlements are obligations, not recorded payments.
 * `paid` is the overlay after every active member confirmed.
 */
export type MonthlyBalanceStatus = "empty" | "settled" | "unsettled" | "paid";

export type MonthlyBalanceConfirmation = {
  householdId: string;
  year: number;
  month: number;
  userId: string;
  confirmedAt: string;
};

export type MonthlyBalancePayment = {
  paid: boolean;
  confirmedUserIds: string[];
  pendingUserIds: string[];
};

export type MemberIncomeView = {
  memberId: string;
  displayName: string;
  amount: number;
};

export type MemberBalanceView = {
  memberId: string;
  displayName: string;
  paid: number;
  owed: number;
  balance: number;
};

export type DerivedSettlement = {
  fromMemberId: string;
  fromName: string;
  toMemberId: string;
  toName: string;
  amount: number;
};

export type MonthlyBalance = {
  range: MonthRange;
  status: MonthlyBalanceStatus;
  incomeTotal: number;
  memberIncomes: MemberIncomeView[];
  sharedGross: number;
  sharedNet: number;
  members: MemberBalanceView[];
  settlements: DerivedSettlement[];
  payment?: MonthlyBalancePayment;
};

/**
 * Live facts for Home / Gastos / Ingresos / presupuestos / salud / actividad / balance.
 *
 * Do **not** add `recurring_expenses` here. Expense templates were removed from
 * the product. Leftover DB rows must never enter spent, health, budgets,
 * activity, or balance. Confirmed `expenses` (even with `recurringId` set)
 * still count. `recurringIncomes` stay for income templates and income-based
 * split basis only — they are not period income.
 */
export type DashboardSnapshot = {
  householdId: string;
  range: MonthRange;
  expenses: ExpenseRow[];
  periodExpenses: ExpenseRow[];
  incomes: IncomeRow[];
  periodIncomes: IncomeRow[];
  recurringIncomes: RecurringIncomeRow[];
  budgets: BudgetRow[];
  goals: GoalRow[];
  contributions: GoalContributionRow[];
  balanceConfirmations: MonthlyBalanceConfirmation[];
  sharedHistoryExpenses: ExpenseRow[];
};

export type DashboardViewModel = {
  range: MonthRange;
  greeting: string;
  periodIncome: number;
  periodSpent: number;
  hasAnyFinancialData: boolean;
  health: HealthView;
  budget: MonthBudgetView;
  featuredGoal: FeaturedGoalView | null;
  activeGoals: GoalProgress[];
  goals: GoalRow[];
  activity: ActivityItem[];
  periodExpenses: ExpenseRow[];
  periodIncomes: IncomeRow[];
  recentExpenses: ExpenseRow[];
  recentIncomes: IncomeRow[];
  periodBudgets: BudgetItemView[];
  monthlyBalance: MonthlyBalance;
  outstandingBalanceMonths: MonthlyBalance[];
  empty: {
    expenses: boolean;
    incomes: boolean;
    goals: boolean;
    activity: boolean;
    budget: boolean;
  };
};
