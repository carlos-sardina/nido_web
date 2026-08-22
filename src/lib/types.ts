export type AppMode = "onboarding" | "app";
export type OStep   = "welcome"|"auth"|"select"|"join"|"c-type"|"c-name"|"c-invite"|
               "p-name"|"p-income"|"p-savings"|"p-expenses"|"p-contrib"|"nest-ready";
export type Tab     = "home"|"incomes"|"budget"|"goals"|"household"|"activity";
export type Model   = "equal"|"proportional";
export type Flow    = null|"expense"|"income"|"goal"|"contrib"|"budget";
export type ExpenseKind = "recurring" | "variable";

export type OnboardingExpense = {
  name: string;
  icon: string;
  selected: boolean;
  amount: string;
  type: "personal" | "shared";
  kind: ExpenseKind;
};

export interface OData {
  flow: "join"|"create"|null; nestType: string; nestEmoji: string; nestName: string;
  userName: string; salary: string; freelance: string; savings: string;
  savingsType: "personal" | "shared" | "both";
  savingsShared: string;
  expenses: OnboardingExpense[]; contrib: Model;
  _showAdd?: boolean; _emoji?: string; _cname?: string; _etype?: "personal"|"shared";
}
