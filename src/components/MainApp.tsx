"use client";

import { useState } from "react";
import {
  BarChart2, Clock, Home, Plus, Target, Users, Wallet,
} from "lucide-react";
import { ActivityScreen } from "@/components/activity/ActivityScreen";
import { BalanceScreen } from "@/components/balance/BalanceScreen";
import { BudgetDetail } from "@/components/budget/BudgetDetail";
import { BudgetScreen } from "@/components/budget/BudgetScreen";
import { ExpenseDetail } from "@/components/expenses/ExpenseDetail";
import { ExpensesScreen } from "@/components/expenses/ExpensesScreen";
import { ActionSheet } from "@/components/flows/ActionSheet";
import { BudgetFlow } from "@/components/flows/BudgetFlow";
import { ContribFlow } from "@/components/flows/ContribFlow";
import { ExpenseFlow } from "@/components/flows/ExpenseFlow";
import { GoalFlow } from "@/components/flows/GoalFlow";
import { IncomeFlow } from "@/components/flows/IncomeFlow";
import { ProfilePanel } from "@/components/flows/ProfilePanel";
import { GoalDetail } from "@/components/goals/GoalDetail";
import { GoalsScreen } from "@/components/goals/GoalsScreen";
import { HomeScreen } from "@/components/home/HomeScreen";
import { HouseholdScreen } from "@/components/household/HouseholdScreen";
import { IncomeDetail } from "@/components/incomes/IncomeDetail";
import { IncomesScreen } from "@/components/incomes/IncomesScreen";
import { RecurringExpenseFlow } from "@/components/flows/RecurringExpenseFlow";
import { RecurringIncomeFlow } from "@/components/flows/RecurringIncomeFlow";
import { RecurringExpenseDetail } from "@/components/recurring/RecurringExpenseDetail";
import { RecurringExpensesScreen } from "@/components/recurring/RecurringExpensesScreen";
import { RecurringIncomeDetail } from "@/components/recurring/RecurringIncomeDetail";
import { RecurringIncomesScreen } from "@/components/recurring/RecurringIncomesScreen";
import { applyProfileDisplayName, identityFromUser } from "@/lib/auth/identity";
import { P } from "@/lib/palette";
import type { Flow, Tab } from "@/lib/types";
import type { User } from "@supabase/supabase-js";
import type {
  BudgetItemView,
  ExpenseRow,
  GoalContributionRow,
  GoalRow,
  IncomeRow,
  RecurringExpenseTemplate,
  RecurringIncomeTemplate,
} from "@/lib/nido/financial";
import { useDashboard } from "@/lib/nido/use-dashboard";
import type { Household, HouseholdMember, HouseholdMemberView, Profile } from "@/lib/nido/types";

export function MainApp({
  user,
  household,
  membership,
  members,
  profile,
  onLogout,
  onNidoChanged,
  signingOut = false,
}: {
  user: User | null;
  household: Household;
  membership: HouseholdMember;
  members: HouseholdMemberView[];
  profile: Pick<Profile, "id" | "display_name" | "avatar_url" | "personal_visibility"> | null;
  onLogout: () => void;
  onNidoChanged: () => void;
  signingOut?: boolean;
}) {
  const [savedDisplayName, setSavedDisplayName] = useState<string | null>(null);
  const [savedVisibility, setSavedVisibility] = useState<Profile["personal_visibility"] | null>(null);
  const [householdPatch, setHouseholdPatch] = useState<Partial<Household>>({});
  const liveHousehold = { ...household, ...householdPatch };
  const identity = applyProfileDisplayName(
    identityFromUser(user),
    savedDisplayName ?? profile?.display_name,
  );
  const [tab, setTab]           = useState<Tab>("home");
  const [showSheet, setShowSheet] = useState(false);
  const [activeFlow, setActiveFlow] = useState<Flow>(null);
  const [profileOpen, setProfileOpen] = useState(false);
  const [selectedExpense, setSelectedExpense] = useState<ExpenseRow | null>(null);
  const [editingExpense, setEditingExpense] = useState<ExpenseRow | null>(null);
  const [selectedIncome, setSelectedIncome] = useState<IncomeRow | null>(null);
  const [editingIncome, setEditingIncome] = useState<IncomeRow | null>(null);
  const [selectedGoal, setSelectedGoal] = useState<GoalRow | null>(null);
  const [editingGoal, setEditingGoal] = useState<GoalRow | null>(null);
  const [editingContribution, setEditingContribution] = useState<GoalContributionRow | null>(null);
  const [showBudgets, setShowBudgets] = useState(false);
  const [showBalance, setShowBalance] = useState(false);
  const [selectedBudget, setSelectedBudget] = useState<BudgetItemView | null>(null);
  const [editingBudget, setEditingBudget] = useState<BudgetItemView | null>(null);
  const [showRecurringExpenses, setShowRecurringExpenses] = useState(false);
  const [showRecurringIncomes, setShowRecurringIncomes] = useState(false);
  const [selectedRecurringExpense, setSelectedRecurringExpense] = useState<RecurringExpenseTemplate | null>(null);
  const [selectedRecurringIncome, setSelectedRecurringIncome] = useState<RecurringIncomeTemplate | null>(null);
  const [editingRecurringExpense, setEditingRecurringExpense] = useState<RecurringExpenseTemplate | null>(null);
  const [editingRecurringIncome, setEditingRecurringIncome] = useState<RecurringIncomeTemplate | null>(null);
  const [creatingRecurringExpense, setCreatingRecurringExpense] = useState(false);
  const [creatingRecurringIncome, setCreatingRecurringIncome] = useState(false);
  const [recurringRefresh, setRecurringRefresh] = useState(0);
  const dashboard = useDashboard(household.id, members);
  const liveSelectedExpense = selectedExpense
    ? dashboard.model?.recentExpenses.find((row) => row.id === selectedExpense.id)
      ?? dashboard.model?.periodExpenses.find((row) => row.id === selectedExpense.id)
      ?? selectedExpense
    : null;
  const liveSelectedIncome = selectedIncome
    ? dashboard.model?.recentIncomes.find((row) => row.id === selectedIncome.id)
      ?? dashboard.model?.periodIncomes.find((row) => row.id === selectedIncome.id)
      ?? selectedIncome
    : null;
  const liveSelectedGoal = selectedGoal
    ? dashboard.model?.goals.find((row) => row.id === selectedGoal.id) ?? selectedGoal
    : null;
  const liveSelectedBudget = selectedBudget
    ? dashboard.model?.periodBudgets.find((row) => row.id === selectedBudget.id) ?? selectedBudget
    : null;

  const tabs = [
    { id: "home"      as Tab, icon: Home,      label: "Inicio"    },
    { id: "incomes"   as Tab, icon: Wallet,    label: "Ingresos"  },
    { id: "budget"    as Tab, icon: BarChart2, label: "Gastos"    },
    { id: "goals"     as Tab, icon: Target,    label: "Metas"    },
    { id: "household" as Tab, icon: Users,     label: "Hogar"    },
    { id: "activity"  as Tab, icon: Clock,     label: "Actividad"},
  ];

  const handleFlowDone = () => {
    setActiveFlow(null);
    setEditingExpense(null);
    setSelectedExpense(null);
    setEditingIncome(null);
    setSelectedIncome(null);
    setEditingGoal(null);
    setSelectedGoal(null);
    setEditingContribution(null);
    setEditingBudget(null);
    setSelectedBudget(null);
    setCreatingRecurringExpense(false);
    setCreatingRecurringIncome(false);
    setEditingRecurringExpense(null);
    setEditingRecurringIncome(null);
    setRecurringRefresh((value) => value + 1);
    void dashboard.refresh();
  };

  const openFlow = (flow: Flow) => {
    setShowSheet(false);
    setEditingExpense(null);
    setEditingIncome(null);
    setEditingGoal(null);
    setEditingContribution(null);
    setEditingBudget(null);
    setSelectedBudget(null);
    setActiveFlow(flow);
  };

  const openExpenseCreate = () => {
    setShowSheet(false);
    setSelectedExpense(null);
    setEditingExpense(null);
    setActiveFlow("expense");
  };

  const openIncomeCreate = () => {
    setShowSheet(false);
    setSelectedIncome(null);
    setEditingIncome(null);
    setActiveFlow("income");
  };

  const openGoalCreate = () => {
    setShowSheet(false);
    setSelectedGoal(null);
    setEditingGoal(null);
    setEditingContribution(null);
    setActiveFlow("goal");
  };

  const openBudgetCreate = () => {
    setShowSheet(false);
    setSelectedBudget(null);
    setEditingBudget(null);
    setActiveFlow("budget");
  };

  return (
    <div className="fixed inset-0 flex flex-col overflow-hidden overscroll-none"
      style={{ backgroundColor: P.bgL, fontFamily: "Figtree, sans-serif" }}>
        <div className="min-h-0 flex-1 overflow-hidden">
          {tab === "home"      && (
            <HomeScreen
              identity={identity}
              householdName={liveHousehold.name}
              dashboard={dashboard}
              onProfileOpen={() => setProfileOpen(true)}
              onNavigate={t => { setTab(t); setShowSheet(false); }}
              onOpenBudgets={() => setShowBudgets(true)}
              onCreateBudget={openBudgetCreate}
              onOpenBalance={() => setShowBalance(true)}
              currentUserId={user?.id ?? null}
            />
          )}
          {tab === "incomes"   && (
            <IncomesScreen
              dashboard={dashboard}
              members={members}
              onOpenIncome={setSelectedIncome}
              onRegisterIncome={openIncomeCreate}
              onOpenRecurring={() => setShowRecurringIncomes(true)}
            />
          )}
          {tab === "budget"    && (
            <ExpensesScreen
              dashboard={dashboard}
              members={members}
              onOpenExpense={setSelectedExpense}
              onRegisterExpense={openExpenseCreate}
              onOpenRecurring={() => setShowRecurringExpenses(true)}
            />
          )}
          {tab === "goals"     && (
            <GoalsScreen
              dashboard={dashboard}
              onOpenGoal={setSelectedGoal}
              onCreateGoal={openGoalCreate}
            />
          )}
          {tab === "household" && (
            <HouseholdScreen
              household={liveHousehold}
              membership={membership}
              members={members}
              onOwnershipTransferred={onNidoChanged}
              onRefresh={onNidoChanged}
              onHouseholdUpdated={(next) => setHouseholdPatch({
                name: next.name,
                default_split_method: next.default_split_method,
              })}
            />
          )}
          {tab === "activity"  && (
            <ActivityScreen
              dashboard={dashboard}
              onOpenExpense={setSelectedExpense}
              onOpenIncome={setSelectedIncome}
              onOpenGoal={setSelectedGoal}
              onRegisterExpense={openExpenseCreate}
              onRegisterIncome={openIncomeCreate}
              onRegisterContribution={() => openFlow("contrib")}
            />
          )}
        </div>

        {/* Bottom nav */}
        <div className="flex-shrink-0 border-t" style={{ backgroundColor: "rgba(255,252,250,0.96)", backdropFilter: "blur(20px)", borderColor: P.border, paddingBottom: "1.25rem" }}>
          <div className="flex items-center justify-around pt-1.5">
            {tabs.map(({ id, icon: Icon, label }) => (
              <button key={id} onClick={() => { setTab(id); setShowSheet(false); }}
                className="flex flex-col items-center gap-0.5 px-2 py-1 transition-all">
                <div className="w-10 h-9 flex items-center justify-center rounded-2xl transition-all"
                  style={{ backgroundColor: tab === id ? P.brnDk : "transparent" }}>
                  <Icon size={18} style={{ color: tab === id ? "#fff" : P.muted }} />
                </div>
                <span className="text-[9px] font-semibold" style={{ color: tab === id ? P.brnDk : P.muted }}>{label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* FAB */}
        <button
          type="button"
          aria-label="Agregar"
          onClick={() => setShowSheet(true)}
          className="absolute flex items-center justify-center transition-all active:scale-95 z-20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          style={{ bottom: "6.5rem", right: "1.25rem", width: "3.25rem", height: "3.25rem",
            backgroundColor: P.brnDk, borderRadius: "1rem",
            boxShadow: `0 8px 24px rgba(102,90,72,0.45)` }}>
          <Plus size={22} color="white" />
        </button>

        {/* Action sheet */}
        {showSheet && (
          <ActionSheet
            onSelect={openFlow}
            onClose={() => setShowSheet(false)}
          />
        )}

        {liveSelectedExpense && activeFlow !== "expense" && (
          <ExpenseDetail
            expense={liveSelectedExpense}
            members={members}
            currentUserId={user?.id ?? null}
            onClose={() => setSelectedExpense(null)}
            onEdit={() => {
              setEditingExpense(liveSelectedExpense);
              setSelectedExpense(null);
              setActiveFlow("expense");
            }}
            onDeleted={handleFlowDone}
            onRefunded={() => void dashboard.refresh()}
          />
        )}

        {liveSelectedIncome && activeFlow !== "income" && (
          <IncomeDetail
            income={liveSelectedIncome}
            members={members}
            currentUserId={user?.id ?? null}
            onClose={() => setSelectedIncome(null)}
            onEdit={() => {
              setEditingIncome(liveSelectedIncome);
              setSelectedIncome(null);
              setActiveFlow("income");
            }}
            onDeleted={handleFlowDone}
          />
        )}

        {liveSelectedGoal && activeFlow !== "goal" && activeFlow !== "contrib" && (
          <GoalDetail
            goal={liveSelectedGoal}
            members={members}
            currentUserId={user?.id ?? null}
            onClose={() => setSelectedGoal(null)}
            onEdit={() => {
              setEditingGoal(liveSelectedGoal);
              setSelectedGoal(liveSelectedGoal);
              setActiveFlow("goal");
            }}
            onEditContribution={(contribution) => {
              setEditingContribution(contribution);
              setActiveFlow("contrib");
            }}
            onArchived={handleFlowDone}
            onContributionChanged={() => {
              void dashboard.refresh();
            }}
          />
        )}

        {showBalance && (
          <BalanceScreen
            householdId={liveHousehold.id}
            members={members}
            onClose={() => setShowBalance(false)}
          />
        )}

        {showBudgets && activeFlow !== "budget" && !liveSelectedBudget && (
          <BudgetScreen
            dashboard={dashboard}
            currentUserId={user?.id ?? null}
            onClose={() => setShowBudgets(false)}
            onOpenBudget={setSelectedBudget}
            onCreateBudget={openBudgetCreate}
          />
        )}

        {liveSelectedBudget && activeFlow !== "budget" && (
          <BudgetDetail
            budget={liveSelectedBudget}
            currentUserId={user?.id ?? null}
            onClose={() => setSelectedBudget(null)}
            onEdit={() => {
              setEditingBudget(liveSelectedBudget);
              setSelectedBudget(null);
              setActiveFlow("budget");
            }}
            onDeleted={handleFlowDone}
          />
        )}

        {activeFlow === "expense" && (
          <ExpenseFlow
            householdId={liveHousehold.id}
            members={members}
            defaultSplitMethod={liveHousehold.default_split_method}
            expense={editingExpense}
            onClose={() => {
              setActiveFlow(null);
              setEditingExpense(null);
            }}
            onDone={handleFlowDone}
          />
        )}

        {activeFlow === "income" && (
          <IncomeFlow
            householdId={household.id}
            members={members}
            income={editingIncome}
            onClose={() => {
              setActiveFlow(null);
              setEditingIncome(null);
            }}
            onDone={handleFlowDone}
          />
        )}

        {activeFlow === "budget" && (
          <BudgetFlow
            householdId={household.id}
            members={members}
            budget={editingBudget}
            onClose={() => {
              setActiveFlow(null);
              setEditingBudget(null);
            }}
            onDone={handleFlowDone}
          />
        )}

        {activeFlow === "goal" && (
          <GoalFlow
            householdId={household.id}
            members={members}
            goal={editingGoal}
            onClose={() => {
              setActiveFlow(null);
              setEditingGoal(null);
            }}
            onDone={handleFlowDone}
          />
        )}

        {showRecurringExpenses && !creatingRecurringExpense && !editingRecurringExpense && !selectedRecurringExpense && (
          <RecurringExpensesScreen
            householdId={household.id}
            refreshKey={recurringRefresh}
            onClose={() => setShowRecurringExpenses(false)}
            onCreate={() => setCreatingRecurringExpense(true)}
            onOpen={setSelectedRecurringExpense}
          />
        )}

        {showRecurringIncomes && !creatingRecurringIncome && !editingRecurringIncome && !selectedRecurringIncome && (
          <RecurringIncomesScreen
            householdId={household.id}
            refreshKey={recurringRefresh}
            onClose={() => setShowRecurringIncomes(false)}
            onCreate={() => setCreatingRecurringIncome(true)}
            onOpen={setSelectedRecurringIncome}
          />
        )}

        {selectedRecurringExpense && !editingRecurringExpense && (
          <RecurringExpenseDetail
            template={selectedRecurringExpense}
            currentUserId={user?.id ?? null}
            onClose={() => setSelectedRecurringExpense(null)}
            onEdit={() => {
              setEditingRecurringExpense(selectedRecurringExpense);
              setSelectedRecurringExpense(null);
            }}
            onChanged={() => {
              setSelectedRecurringExpense(null);
              setRecurringRefresh((value) => value + 1);
              void dashboard.refresh();
            }}
          />
        )}

        {selectedRecurringIncome && !editingRecurringIncome && (
          <RecurringIncomeDetail
            template={selectedRecurringIncome}
            currentUserId={user?.id ?? null}
            onClose={() => setSelectedRecurringIncome(null)}
            onEdit={() => {
              setEditingRecurringIncome(selectedRecurringIncome);
              setSelectedRecurringIncome(null);
            }}
            onChanged={() => {
              setSelectedRecurringIncome(null);
              setRecurringRefresh((value) => value + 1);
              void dashboard.refresh();
            }}
          />
        )}

        {(creatingRecurringExpense || editingRecurringExpense) && (
          <RecurringExpenseFlow
            householdId={household.id}
            members={members}
            template={editingRecurringExpense}
            onClose={() => {
              setCreatingRecurringExpense(false);
              setEditingRecurringExpense(null);
            }}
            onDone={() => {
              setCreatingRecurringExpense(false);
              setEditingRecurringExpense(null);
              setRecurringRefresh((value) => value + 1);
              void dashboard.refresh();
            }}
          />
        )}

        {(creatingRecurringIncome || editingRecurringIncome) && (
          <RecurringIncomeFlow
            householdId={household.id}
            members={members}
            template={editingRecurringIncome}
            onClose={() => {
              setCreatingRecurringIncome(false);
              setEditingRecurringIncome(null);
            }}
            onDone={() => {
              setCreatingRecurringIncome(false);
              setEditingRecurringIncome(null);
              setRecurringRefresh((value) => value + 1);
              void dashboard.refresh();
            }}
          />
        )}

        {activeFlow === "contrib" && (
          <ContribFlow
            householdId={household.id}
            members={members}
            goals={dashboard.model?.goals ?? []}
            contribution={editingContribution}
            loading={!dashboard.model && dashboard.isLoading}
            onClose={() => {
              setActiveFlow(null);
              setEditingContribution(null);
            }}
            onDone={() => {
              setActiveFlow(null);
              setEditingContribution(null);
              void dashboard.refresh();
            }}
            onCreateGoal={openGoalCreate}
          />
        )}

        {/* Profile panel */}
        {profileOpen && (
          <ProfilePanel
            identity={identity}
            personalVisibility={savedVisibility ?? profile?.personal_visibility ?? "nido"}
            householdName={liveHousehold.name}
            role={membership.role}
            isLastOwner={membership.role === "owner" && members.filter((row) => row.role === "owner").length <= 1}
            hasOtherActiveMembers={members.some((row) => row.userId !== membership.user_id)}
            signingOut={signingOut}
            onClose={() => setProfileOpen(false)}
            onLogout={onLogout}
            onLeft={onNidoChanged}
            onDisplayNameSaved={setSavedDisplayName}
            onVisibilitySaved={setSavedVisibility}
            onRefresh={async () => {
              await onNidoChanged();
              await dashboard.refresh();
            }}
          />
        )}
    </div>
  );
}
