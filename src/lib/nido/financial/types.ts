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

export type ExpenseRow = {
  id: string;
  householdId: string;
  categoryId: string;
  amount: number;
  description: string | null;
  occurredAt: string;
  payerId: string;
  scope: ExpenseScope;
  distributionMethod: DistributionMethod;
  recurringId: string | null;
  createdBy: string;
  createdAt: string;
  deletedAt: string | null;
  category: CategoryRef | null;
  payer: MemberRef | null;
  splits: ExpenseSplitRow[];
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

export type RecurringExpenseRow = {
  id: string;
  householdId: string;
  amount: number;
  description: string | null;
  scope: ExpenseScope;
  isActive: boolean;
  frequency: RecurrenceFrequency;
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
  member: MemberRef | null;
};

export type GoalRow = {
  id: string;
  householdId: string;
  name: string;
  description: string | null;
  goalType: GoalType;
  targetAmount: number;
  targetDate: string | null;
  status: GoalStatus;
  createdBy: string;
  createdAt: string;
  contributions: GoalContributionRow[];
};

export type ActivityType = "expense" | "income" | "goal_contribution";

export type ActivityItem = {
  id: string;
  type: ActivityType;
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
    goalName?: string | null;
  };
};

export type GoalProgress = {
  id: string;
  name: string;
  goalType: GoalType;
  status: GoalStatus;
  targetAmount: number;
  contributed: number;
  ratio: number;
  percent: number;
  targetDate: string | null;
  invalidTarget: boolean;
  completed: boolean;
};

export type BudgetCategoryView = {
  categoryId: string;
  name: string;
  icon: string;
  budget: number;
  spent: number;
};

export type MonthBudgetView = {
  hasBudget: boolean;
  totalBudget: number;
  totalSpent: number;
  remaining: number;
  over: boolean;
  usagePercent: number | null;
  categories: BudgetCategoryView[];
};

export type HealthView =
  | {
      available: false;
    }
  | {
      available: true;
      score: number;
      label: string;
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

export type DashboardSnapshot = {
  householdId: string;
  range: MonthRange;
  expenses: ExpenseRow[];
  periodExpenses: ExpenseRow[];
  incomes: IncomeRow[];
  periodIncomes: IncomeRow[];
  recurringIncomes: RecurringIncomeRow[];
  recurringExpenses: RecurringExpenseRow[];
  budgets: BudgetRow[];
  goals: GoalRow[];
  contributions: GoalContributionRow[];
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
  activity: ActivityItem[];
  empty: {
    expenses: boolean;
    incomes: boolean;
    goals: boolean;
    activity: boolean;
    budget: boolean;
  };
};
