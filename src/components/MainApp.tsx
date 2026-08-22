"use client";

import { useState } from "react";
import {
  BarChart2, Clock, Home, Plus, Target, Users, Wallet,
} from "lucide-react";
import { ActivityScreen } from "@/components/activity/ActivityScreen";
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
import { applyProfileDisplayName, identityFromUser } from "@/lib/auth/identity";
import { P } from "@/lib/palette";
import type { Flow, Model, Tab } from "@/lib/types";
import type { User } from "@supabase/supabase-js";
import type { BudgetItemView, ExpenseRow, GoalContributionRow, GoalRow, IncomeRow } from "@/lib/nido/financial";
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
  profile: Pick<Profile, "id" | "display_name" | "avatar_url"> | null;
  onLogout: () => void;
  onNidoChanged: () => void;
  signingOut?: boolean;
}) {
  const identity = applyProfileDisplayName(identityFromUser(user), profile?.display_name);
  const [tab, setTab]           = useState<Tab>("home");
  const [model, setModel]       = useState<Model>("capacity");
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
  const [selectedBudget, setSelectedBudget] = useState<BudgetItemView | null>(null);
  const [editingBudget, setEditingBudget] = useState<BudgetItemView | null>(null);
  const dashboard = useDashboard(household.id, members);
  const liveSelectedIncome = selectedIncome
    ? dashboard.model?.periodIncomes.find((row) => row.id === selectedIncome.id) ?? selectedIncome
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
    <div className="relative min-h-screen flex flex-col overflow-hidden"
      style={{ backgroundColor: P.bgL, fontFamily: "Figtree, sans-serif" }}>
        <div className="flex-1 overflow-hidden">
          {tab === "home"      && (
            <HomeScreen
              identity={identity}
              householdName={household.name}
              dashboard={dashboard}
              onProfileOpen={() => setProfileOpen(true)}
              onNavigate={t => { setTab(t); setShowSheet(false); }}
              onOpenBudgets={() => setShowBudgets(true)}
              onCreateBudget={openBudgetCreate}
            />
          )}
          {tab === "incomes"   && (
            <IncomesScreen
              dashboard={dashboard}
              members={members}
              onOpenIncome={setSelectedIncome}
              onRegisterIncome={openIncomeCreate}
            />
          )}
          {tab === "budget"    && (
            <ExpensesScreen
              dashboard={dashboard}
              members={members}
              onOpenExpense={setSelectedExpense}
              onRegisterExpense={openExpenseCreate}
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
              household={household}
              membership={membership}
              members={members}
              model={model}
              setModel={setModel}
              onOwnershipTransferred={onNidoChanged}
            />
          )}
          {tab === "activity"  && (
            <ActivityScreen dashboard={dashboard} />
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

        {selectedExpense && activeFlow !== "expense" && (
          <ExpenseDetail
            expense={selectedExpense}
            members={members}
            currentUserId={user?.id ?? null}
            onClose={() => setSelectedExpense(null)}
            onEdit={() => {
              setEditingExpense(selectedExpense);
              setSelectedExpense(null);
              setActiveFlow("expense");
            }}
            onDeleted={handleFlowDone}
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

        {showBudgets && activeFlow !== "budget" && !liveSelectedBudget && (
          <BudgetScreen
            dashboard={dashboard}
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
            householdId={household.id}
            members={members}
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
            householdName={household.name}
            role={membership.role}
            isLastOwner={membership.role === "owner" && members.filter((row) => row.role === "owner").length <= 1}
            hasOtherActiveMembers={members.some((row) => row.userId !== membership.user_id)}
            signingOut={signingOut}
            onClose={() => setProfileOpen(false)}
            onLogout={onLogout}
            onLeft={onNidoChanged}
          />
        )}
    </div>
  );
}
