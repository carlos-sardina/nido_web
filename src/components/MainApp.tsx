"use client";

import { useState } from "react";
import {
  BarChart2, Clock, Home, Plus, Target, Users,
} from "lucide-react";
import { ActivityScreen } from "@/components/activity/ActivityScreen";
import { ExpenseDetail } from "@/components/expenses/ExpenseDetail";
import { ExpensesScreen } from "@/components/expenses/ExpensesScreen";
import { ActionSheet } from "@/components/flows/ActionSheet";
import { ComingSoon } from "@/components/flows/ComingSoon";
import { ExpenseFlow } from "@/components/flows/ExpenseFlow";
import { GoalFlow } from "@/components/flows/GoalFlow";
import { ProfilePanel } from "@/components/flows/ProfilePanel";
import { GoalDetail } from "@/components/goals/GoalDetail";
import { GoalsScreen } from "@/components/goals/GoalsScreen";
import { HomeScreen } from "@/components/home/HomeScreen";
import { HouseholdScreen } from "@/components/household/HouseholdScreen";
import { applyProfileDisplayName, identityFromUser } from "@/lib/auth/identity";
import { P } from "@/lib/palette";
import type { Flow, Model, Tab } from "@/lib/types";
import type { User } from "@supabase/supabase-js";
import type { ExpenseRow, GoalRow } from "@/lib/nido/financial";
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
  const [selectedGoal, setSelectedGoal] = useState<GoalRow | null>(null);
  const [editingGoal, setEditingGoal] = useState<GoalRow | null>(null);
  const dashboard = useDashboard(household.id, members);

  const tabs = [
    { id: "home"      as Tab, icon: Home,     label: "Inicio"    },
    { id: "budget"    as Tab, icon: BarChart2, label: "Gastos"   },
    { id: "goals"     as Tab, icon: Target,    label: "Metas"    },
    { id: "household" as Tab, icon: Users,     label: "Hogar"    },
    { id: "activity"  as Tab, icon: Clock,     label: "Actividad"},
  ];

  const handleFlowDone = () => {
    setActiveFlow(null);
    setEditingExpense(null);
    setSelectedExpense(null);
    setEditingGoal(null);
    setSelectedGoal(null);
    void dashboard.refresh();
  };

  const openFlow = (flow: Flow) => {
    setShowSheet(false);
    setEditingExpense(null);
    setEditingGoal(null);
    setActiveFlow(flow);
  };

  const openExpenseCreate = () => {
    setShowSheet(false);
    setSelectedExpense(null);
    setEditingExpense(null);
    setActiveFlow("expense");
  };

  const openGoalCreate = () => {
    setShowSheet(false);
    setSelectedGoal(null);
    setEditingGoal(null);
    setActiveFlow("goal");
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
            />
          )}
          {tab === "activity"  && <ActivityScreen />}
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

        {selectedGoal && activeFlow !== "goal" && (
          <GoalDetail
            goal={selectedGoal}
            members={members}
            currentUserId={user?.id ?? null}
            onClose={() => setSelectedGoal(null)}
            onEdit={() => {
              setEditingGoal(selectedGoal);
              setSelectedGoal(null);
              setActiveFlow("goal");
            }}
            onArchived={handleFlowDone}
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
          <ComingSoon onClose={() => setActiveFlow(null)} />
        )}

        {/* Profile panel */}
        {profileOpen && (
          <ProfilePanel
            identity={identity}
            householdName={household.name}
            role={membership.role}
            signingOut={signingOut}
            onClose={() => setProfileOpen(false)}
            onLogout={onLogout}
            onLeft={onNidoChanged}
          />
        )}
    </div>
  );
}
