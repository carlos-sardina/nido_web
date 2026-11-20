export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      budgets: {
        Row: {
          amount: number
          category_id: string
          created_at: string
          created_by: string
          deleted_at: string | null
          end_date: string
          household_id: string
          id: string
          member_id: string | null
          period: Database["public"]["Enums"]["budget_period"]
          start_date: string
          updated_at: string
        }
        Insert: {
          amount: number
          category_id: string
          created_at?: string
          created_by: string
          deleted_at?: string | null
          end_date: string
          household_id: string
          id?: string
          member_id?: string | null
          period?: Database["public"]["Enums"]["budget_period"]
          start_date: string
          updated_at?: string
        }
        Update: {
          amount?: number
          category_id?: string
          created_at?: string
          created_by?: string
          deleted_at?: string | null
          end_date?: string
          household_id?: string
          id?: string
          member_id?: string | null
          period?: Database["public"]["Enums"]["budget_period"]
          start_date?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "budgets_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "budgets_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "budgets_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "budgets_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      categories: {
        Row: {
          archived_at: string | null
          created_at: string
          created_by: string
          household_id: string
          icon: string | null
          id: string
          is_default: boolean
          name: string
          type: Database["public"]["Enums"]["category_type"]
          updated_at: string
        }
        Insert: {
          archived_at?: string | null
          created_at?: string
          created_by: string
          household_id: string
          icon?: string | null
          id?: string
          is_default?: boolean
          name: string
          type: Database["public"]["Enums"]["category_type"]
          updated_at?: string
        }
        Update: {
          archived_at?: string | null
          created_at?: string
          created_by?: string
          household_id?: string
          icon?: string | null
          id?: string
          is_default?: boolean
          name?: string
          type?: Database["public"]["Enums"]["category_type"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "categories_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "categories_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
        ]
      }
      expense_refund_splits: {
        Row: {
          amount: number
          created_at: string
          id: string
          member_id: string
          percentage: number | null
          refund_id: string
          updated_at: string
        }
        Insert: {
          amount: number
          created_at?: string
          id?: string
          member_id: string
          percentage?: number | null
          refund_id: string
          updated_at?: string
        }
        Update: {
          amount?: number
          created_at?: string
          id?: string
          member_id?: string
          percentage?: number | null
          refund_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "expense_refund_splits_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expense_refund_splits_refund_id_fkey"
            columns: ["refund_id"]
            isOneToOne: false
            referencedRelation: "expense_refunds"
            referencedColumns: ["id"]
          },
        ]
      }
      expense_refunds: {
        Row: {
          amount: number
          created_at: string
          created_by: string
          expense_id: string
          id: string
          occurred_at: string
          updated_at: string
        }
        Insert: {
          amount: number
          created_at?: string
          created_by: string
          expense_id: string
          id?: string
          occurred_at: string
          updated_at?: string
        }
        Update: {
          amount?: number
          created_at?: string
          created_by?: string
          expense_id?: string
          id?: string
          occurred_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "expense_refunds_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expense_refunds_expense_id_fkey"
            columns: ["expense_id"]
            isOneToOne: false
            referencedRelation: "expenses"
            referencedColumns: ["id"]
          },
        ]
      }
      expense_splits: {
        Row: {
          amount: number
          created_at: string
          expense_id: string
          id: string
          member_id: string
          percentage: number | null
          updated_at: string
        }
        Insert: {
          amount: number
          created_at?: string
          expense_id: string
          id?: string
          member_id: string
          percentage?: number | null
          updated_at?: string
        }
        Update: {
          amount?: number
          created_at?: string
          expense_id?: string
          id?: string
          member_id?: string
          percentage?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "expense_splits_expense_id_fkey"
            columns: ["expense_id"]
            isOneToOne: false
            referencedRelation: "expenses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expense_splits_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      expenses: {
        Row: {
          amount: number
          category_id: string
          created_at: string
          created_by: string
          deleted_at: string | null
          description: string | null
          distribution_method: Database["public"]["Enums"]["distribution_method"]
          household_id: string
          id: string
          occurred_at: string
          payer_id: string | null
          recurring_id: string | null
          scope: Database["public"]["Enums"]["expense_scope"]
          updated_at: string
        }
        Insert: {
          amount: number
          category_id: string
          created_at?: string
          created_by: string
          deleted_at?: string | null
          description?: string | null
          distribution_method: Database["public"]["Enums"]["distribution_method"]
          household_id: string
          id?: string
          occurred_at: string
          payer_id?: string | null
          recurring_id?: string | null
          scope: Database["public"]["Enums"]["expense_scope"]
          updated_at?: string
        }
        Update: {
          amount?: number
          category_id?: string
          created_at?: string
          created_by?: string
          deleted_at?: string | null
          description?: string | null
          distribution_method?: Database["public"]["Enums"]["distribution_method"]
          household_id?: string
          id?: string
          occurred_at?: string
          payer_id?: string | null
          recurring_id?: string | null
          scope?: Database["public"]["Enums"]["expense_scope"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "expenses_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_payer_id_fkey"
            columns: ["payer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_recurring_id_fkey"
            columns: ["recurring_id"]
            isOneToOne: false
            referencedRelation: "recurring_expenses"
            referencedColumns: ["id"]
          },
        ]
      }
      goal_contributions: {
        Row: {
          amount: number
          contributed_at: string
          created_at: string
          created_by: string
          deleted_at: string | null
          goal_id: string
          id: string
          member_id: string
        }
        Insert: {
          amount: number
          contributed_at: string
          created_at?: string
          created_by: string
          deleted_at?: string | null
          goal_id: string
          id?: string
          member_id: string
        }
        Update: {
          amount?: number
          contributed_at?: string
          created_at?: string
          created_by?: string
          deleted_at?: string | null
          goal_id?: string
          id?: string
          member_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "goal_contributions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "goal_contributions_goal_id_fkey"
            columns: ["goal_id"]
            isOneToOne: false
            referencedRelation: "goals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "goal_contributions_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      goals: {
        Row: {
          created_at: string
          created_by: string
          description: string | null
          goal_type: Database["public"]["Enums"]["goal_type"]
          household_id: string
          id: string
          name: string
          scope: Database["public"]["Enums"]["expense_scope"]
          status: Database["public"]["Enums"]["goal_status"]
          target_amount: number
          target_date: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by: string
          description?: string | null
          goal_type: Database["public"]["Enums"]["goal_type"]
          household_id: string
          id?: string
          name: string
          scope?: Database["public"]["Enums"]["expense_scope"]
          status?: Database["public"]["Enums"]["goal_status"]
          target_amount: number
          target_date?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          description?: string | null
          goal_type?: Database["public"]["Enums"]["goal_type"]
          household_id?: string
          id?: string
          name?: string
          scope?: Database["public"]["Enums"]["expense_scope"]
          status?: Database["public"]["Enums"]["goal_status"]
          target_amount?: number
          target_date?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "goals_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "goals_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
        ]
      }
      household_invitations: {
        Row: {
          accepted_at: string | null
          created_at: string
          email: string | null
          expires_at: string
          household_id: string
          id: string
          invited_by: string
          token: string
        }
        Insert: {
          accepted_at?: string | null
          created_at?: string
          email?: string | null
          expires_at: string
          household_id: string
          id?: string
          invited_by: string
          token: string
        }
        Update: {
          accepted_at?: string | null
          created_at?: string
          email?: string | null
          expires_at?: string
          household_id?: string
          id?: string
          invited_by?: string
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "household_invitations_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "household_invitations_invited_by_fkey"
            columns: ["invited_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      household_mutation_events: {
        Row: {
          action: Database["public"]["Enums"]["household_mutation_action"]
          actor_id: string
          amount: number | null
          created_at: string
          detail: string | null
          entity_id: string
          entity_type: Database["public"]["Enums"]["household_mutation_entity"]
          household_id: string
          icon: string | null
          id: string
          label: string
          occurred_at: string
          scope: Database["public"]["Enums"]["expense_scope"]
        }
        Insert: {
          action: Database["public"]["Enums"]["household_mutation_action"]
          actor_id: string
          amount?: number | null
          created_at?: string
          detail?: string | null
          entity_id: string
          entity_type: Database["public"]["Enums"]["household_mutation_entity"]
          household_id: string
          icon?: string | null
          id?: string
          label: string
          occurred_at?: string
          scope?: Database["public"]["Enums"]["expense_scope"]
        }
        Update: {
          action?: Database["public"]["Enums"]["household_mutation_action"]
          actor_id?: string
          amount?: number | null
          created_at?: string
          detail?: string | null
          entity_id?: string
          entity_type?: Database["public"]["Enums"]["household_mutation_entity"]
          household_id?: string
          icon?: string | null
          id?: string
          label?: string
          occurred_at?: string
          scope?: Database["public"]["Enums"]["expense_scope"]
        }
        Relationships: [
          {
            foreignKeyName: "household_mutation_events_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "household_mutation_events_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
        ]
      }
      household_members: {
        Row: {
          created_at: string
          household_id: string
          id: string
          joined_at: string
          left_at: string | null
          role: Database["public"]["Enums"]["household_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          household_id: string
          id?: string
          joined_at?: string
          left_at?: string | null
          role?: Database["public"]["Enums"]["household_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          household_id?: string
          id?: string
          joined_at?: string
          left_at?: string | null
          role?: Database["public"]["Enums"]["household_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "household_members_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "household_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      households: {
        Row: {
          created_at: string
          created_by: string
          default_split_method: Database["public"]["Enums"]["household_split_method"]
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by: string
          default_split_method?: Database["public"]["Enums"]["household_split_method"]
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          default_split_method?: Database["public"]["Enums"]["household_split_method"]
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "households_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      incomes: {
        Row: {
          amount: number
          category_id: string
          created_at: string
          created_by: string
          deleted_at: string | null
          description: string | null
          household_id: string
          id: string
          member_id: string
          occurred_at: string
          recurring_id: string | null
          copied_from_id: string | null
          updated_at: string
        }
        Insert: {
          amount: number
          category_id: string
          created_at?: string
          created_by: string
          deleted_at?: string | null
          description?: string | null
          household_id: string
          id?: string
          member_id: string
          occurred_at: string
          recurring_id?: string | null
          copied_from_id?: string | null
          updated_at?: string
        }
        Update: {
          amount?: number
          category_id?: string
          created_at?: string
          created_by?: string
          deleted_at?: string | null
          description?: string | null
          household_id?: string
          id?: string
          member_id?: string
          occurred_at?: string
          recurring_id?: string | null
          copied_from_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "incomes_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "incomes_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "incomes_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "incomes_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "incomes_recurring_id_fkey"
            columns: ["recurring_id"]
            isOneToOne: false
            referencedRelation: "recurring_incomes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "incomes_copied_from_id_fkey"
            columns: ["copied_from_id"]
            isOneToOne: false
            referencedRelation: "incomes"
            referencedColumns: ["id"]
          },
        ]
      }
      monthly_balance_confirmations: {
        Row: {
          confirmed_at: string
          household_id: string
          id: string
          month: number
          user_id: string
          year: number
        }
        Insert: {
          confirmed_at?: string
          household_id: string
          id?: string
          month: number
          user_id: string
          year: number
        }
        Update: {
          confirmed_at?: string
          household_id?: string
          id?: string
          month?: number
          user_id?: string
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "monthly_balance_confirmations_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "monthly_balance_confirmations_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          display_name: string
          id: string
          personal_visibility: Database["public"]["Enums"]["personal_visibility"]
          timezone: string
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          display_name: string
          id: string
          personal_visibility?: Database["public"]["Enums"]["personal_visibility"]
          timezone?: string
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string
          id?: string
          personal_visibility?: Database["public"]["Enums"]["personal_visibility"]
          timezone?: string
          updated_at?: string
        }
        Relationships: []
      }
      recurring_expense_splits: {
        Row: {
          amount: number
          created_at: string
          id: string
          member_id: string
          percentage: number | null
          recurring_expense_id: string
          updated_at: string
        }
        Insert: {
          amount: number
          created_at?: string
          id?: string
          member_id: string
          percentage?: number | null
          recurring_expense_id: string
          updated_at?: string
        }
        Update: {
          amount?: number
          created_at?: string
          id?: string
          member_id?: string
          percentage?: number | null
          recurring_expense_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "recurring_expense_splits_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recurring_expense_splits_recurring_expense_id_fkey"
            columns: ["recurring_expense_id"]
            isOneToOne: false
            referencedRelation: "recurring_expenses"
            referencedColumns: ["id"]
          },
        ]
      }
      recurring_expenses: {
        Row: {
          amount: number
          category_id: string
          created_at: string
          created_by: string
          description: string | null
          distribution_method: Database["public"]["Enums"]["distribution_method"]
          end_date: string | null
          frequency: Database["public"]["Enums"]["recurrence_frequency"]
          household_id: string
          id: string
          is_active: boolean
          next_occurrence: string
          payer_id: string
          scope: Database["public"]["Enums"]["expense_scope"]
          start_date: string
          updated_at: string
        }
        Insert: {
          amount: number
          category_id: string
          created_at?: string
          created_by: string
          description?: string | null
          distribution_method: Database["public"]["Enums"]["distribution_method"]
          end_date?: string | null
          frequency: Database["public"]["Enums"]["recurrence_frequency"]
          household_id: string
          id?: string
          is_active?: boolean
          next_occurrence: string
          payer_id: string
          scope: Database["public"]["Enums"]["expense_scope"]
          start_date: string
          updated_at?: string
        }
        Update: {
          amount?: number
          category_id?: string
          created_at?: string
          created_by?: string
          description?: string | null
          distribution_method?: Database["public"]["Enums"]["distribution_method"]
          end_date?: string | null
          frequency?: Database["public"]["Enums"]["recurrence_frequency"]
          household_id?: string
          id?: string
          is_active?: boolean
          next_occurrence?: string
          payer_id?: string
          scope?: Database["public"]["Enums"]["expense_scope"]
          start_date?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "recurring_expenses_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recurring_expenses_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recurring_expenses_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recurring_expenses_payer_id_fkey"
            columns: ["payer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      recurring_incomes: {
        Row: {
          amount: number
          category_id: string
          created_at: string
          created_by: string
          day_of_month: number | null
          description: string | null
          end_date: string | null
          frequency: Database["public"]["Enums"]["recurrence_frequency"]
          household_id: string
          id: string
          is_active: boolean
          member_id: string
          next_occurrence: string
          start_date: string
          updated_at: string
        }
        Insert: {
          amount: number
          category_id: string
          created_at?: string
          created_by: string
          day_of_month?: number | null
          description?: string | null
          end_date?: string | null
          frequency: Database["public"]["Enums"]["recurrence_frequency"]
          household_id: string
          id?: string
          is_active?: boolean
          member_id: string
          next_occurrence: string
          start_date: string
          updated_at?: string
        }
        Update: {
          amount?: number
          category_id?: string
          created_at?: string
          created_by?: string
          day_of_month?: number | null
          description?: string | null
          end_date?: string | null
          frequency?: Database["public"]["Enums"]["recurrence_frequency"]
          household_id?: string
          id?: string
          is_active?: boolean
          member_id?: string
          next_occurrence?: string
          start_date?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "recurring_incomes_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recurring_incomes_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recurring_incomes_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recurring_incomes_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      savings_balances: {
        Row: {
          amount: number
          created_at: string
          created_by: string
          household_id: string
          id: string
          member_id: string | null
          recorded_at: string
          updated_at: string
        }
        Insert: {
          amount: number
          created_at?: string
          created_by: string
          household_id: string
          id?: string
          member_id?: string | null
          recorded_at: string
          updated_at?: string
        }
        Update: {
          amount?: number
          created_at?: string
          created_by?: string
          household_id?: string
          id?: string
          member_id?: string | null
          recorded_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "savings_balances_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "savings_balances_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "savings_balances_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_cards: {
        Row: {
          id: string
          household_id: string
          owner_member_id: string
          label: string
          bank: string | null
          last_four: string | null
          cut_day: number
          payment_day: number
          created_by: string
          created_at: string
          updated_at: string
          deleted_at: string | null
        }
        Insert: {
          id?: string
          household_id: string
          owner_member_id: string
          label: string
          bank?: string | null
          last_four?: string | null
          cut_day: number
          payment_day: number
          created_by: string
          created_at?: string
          updated_at?: string
          deleted_at?: string | null
        }
        Update: {
          id?: string
          household_id?: string
          owner_member_id?: string
          label?: string
          bank?: string | null
          last_four?: string | null
          cut_day?: number
          payment_day?: number
          created_by?: string
          created_at?: string
          updated_at?: string
          deleted_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payment_cards_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_cards_owner_member_id_fkey"
            columns: ["owner_member_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_cards_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      purchases: {
        Row: {
          id: string
          household_id: string
          name: string
          emoji: string | null
          description: string | null
          store: string | null
          purchased_at: string
          gross_amount: number
          payment_method: Database["public"]["Enums"]["purchase_payment_method"]
          msi_months: number | null
          card_id: string | null
          created_by: string
          created_at: string
          updated_at: string
          deleted_at: string | null
        }
        Insert: {
          id?: string
          household_id: string
          name: string
          emoji?: string | null
          description?: string | null
          store?: string | null
          purchased_at: string
          gross_amount: number
          payment_method: Database["public"]["Enums"]["purchase_payment_method"]
          msi_months?: number | null
          card_id?: string | null
          created_by: string
          created_at?: string
          updated_at?: string
          deleted_at?: string | null
        }
        Update: {
          id?: string
          household_id?: string
          name?: string
          emoji?: string | null
          description?: string | null
          store?: string | null
          purchased_at?: string
          gross_amount?: number
          payment_method?: Database["public"]["Enums"]["purchase_payment_method"]
          msi_months?: number | null
          card_id?: string | null
          created_by?: string
          created_at?: string
          updated_at?: string
          deleted_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "purchases_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchases_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "payment_cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchases_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_shares: {
        Row: {
          id: string
          purchase_id: string
          member_id: string
          percent: number
          created_at: string
        }
        Insert: {
          id?: string
          purchase_id: string
          member_id: string
          percent: number
          created_at?: string
        }
        Update: {
          id?: string
          purchase_id?: string
          member_id?: string
          percent?: number
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "purchase_shares_purchase_id_fkey"
            columns: ["purchase_id"]
            isOneToOne: false
            referencedRelation: "purchases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_shares_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_installments: {
        Row: {
          id: string
          purchase_id: string
          installment_number: number
          due_date: string
          amount: number
          paid_at: string | null
          created_at: string
        }
        Insert: {
          id?: string
          purchase_id: string
          installment_number: number
          due_date: string
          amount: number
          paid_at?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          purchase_id?: string
          installment_number?: number
          due_date?: string
          amount?: number
          paid_at?: string | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "purchase_installments_purchase_id_fkey"
            columns: ["purchase_id"]
            isOneToOne: false
            referencedRelation: "purchases"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_bonuses: {
        Row: {
          id: string
          purchase_id: string
          bonus_type: Database["public"]["Enums"]["purchase_bonus_type"]
          label: string
          amount: number
          expected_at: string
          received_at: string | null
          notes: string | null
          created_by: string
          created_at: string
          updated_at: string
          deleted_at: string | null
        }
        Insert: {
          id?: string
          purchase_id: string
          bonus_type: Database["public"]["Enums"]["purchase_bonus_type"]
          label: string
          amount: number
          expected_at: string
          received_at?: string | null
          notes?: string | null
          created_by: string
          created_at?: string
          updated_at?: string
          deleted_at?: string | null
        }
        Update: {
          id?: string
          purchase_id?: string
          bonus_type?: Database["public"]["Enums"]["purchase_bonus_type"]
          label?: string
          amount?: number
          expected_at?: string
          received_at?: string | null
          notes?: string | null
          created_by?: string
          created_at?: string
          updated_at?: string
          deleted_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "purchase_bonuses_purchase_id_fkey"
            columns: ["purchase_id"]
            isOneToOne: false
            referencedRelation: "purchases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_bonuses_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_payments: {
        Row: {
          id: string
          purchase_id: string
          member_id: string
          amount: number
          paid_at: string
          kind: Database["public"]["Enums"]["purchase_payment_kind"]
          notes: string | null
          created_by: string
          created_at: string
          deleted_at: string | null
        }
        Insert: {
          id?: string
          purchase_id: string
          member_id: string
          amount: number
          paid_at: string
          kind: Database["public"]["Enums"]["purchase_payment_kind"]
          notes?: string | null
          created_by: string
          created_at?: string
          deleted_at?: string | null
        }
        Update: {
          id?: string
          purchase_id?: string
          member_id?: string
          amount?: number
          paid_at?: string
          kind?: Database["public"]["Enums"]["purchase_payment_kind"]
          notes?: string | null
          created_by?: string
          created_at?: string
          deleted_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "purchase_payments_purchase_id_fkey"
            columns: ["purchase_id"]
            isOneToOne: false
            referencedRelation: "purchases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_payments_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_payments_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_payment_installments: {
        Row: {
          payment_id: string
          installment_id: string
        }
        Insert: {
          payment_id: string
          installment_id: string
        }
        Update: {
          payment_id?: string
          installment_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "purchase_payment_installments_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "purchase_payments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_payment_installments_installment_id_fkey"
            columns: ["installment_id"]
            isOneToOne: false
            referencedRelation: "purchase_installments"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_audit_events: {
        Row: {
          id: string
          household_id: string
          purchase_id: string | null
          actor_id: string
          action: Database["public"]["Enums"]["purchase_audit_action"]
          entity_type: Database["public"]["Enums"]["purchase_audit_entity"]
          entity_id: string
          label: string
          amount: number | null
          icon: string | null
          detail: string | null
          meta: Json
          occurred_at: string
          created_at: string
        }
        Insert: {
          id?: string
          household_id: string
          purchase_id?: string | null
          actor_id: string
          action: Database["public"]["Enums"]["purchase_audit_action"]
          entity_type: Database["public"]["Enums"]["purchase_audit_entity"]
          entity_id: string
          label: string
          amount?: number | null
          icon?: string | null
          detail?: string | null
          meta?: Json
          occurred_at?: string
          created_at?: string
        }
        Update: {
          id?: string
          household_id?: string
          purchase_id?: string | null
          actor_id?: string
          action?: Database["public"]["Enums"]["purchase_audit_action"]
          entity_type?: Database["public"]["Enums"]["purchase_audit_entity"]
          entity_id?: string
          label?: string
          amount?: number | null
          icon?: string | null
          detail?: string | null
          meta?: Json
          occurred_at?: string
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "purchase_audit_events_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_audit_events_purchase_id_fkey"
            columns: ["purchase_id"]
            isOneToOne: false
            referencedRelation: "purchases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_audit_events_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      accept_invitation: {
        Args: { p_token: string }
        Returns: {
          created_at: string
          created_by: string
          default_split_method: Database["public"]["Enums"]["household_split_method"]
          id: string
          name: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "households"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      active_household_id_for_user: { Args: never; Returns: string }
      archive_category: { Args: { p_category_id: string }; Returns: string }
      archive_goal: { Args: { p_goal_id: string }; Returns: string }
      assert_active_household_member: {
        Args: { p_household_id: string; p_user_id: string }
        Returns: undefined
      }
      assert_category_in_household: {
        Args: {
          p_category_id: string
          p_expected_type?: Database["public"]["Enums"]["category_type"]
          p_household_id: string
        }
        Returns: undefined
      }
      assert_recurrence_frequency: {
        Args: {
          p_frequency: Database["public"]["Enums"]["recurrence_frequency"]
        }
        Returns: undefined
      }
      assert_recurring_expense_origin: {
        Args: { p_household_id: string; p_recurring_id: string }
        Returns: undefined
      }
      assert_recurring_income_origin: {
        Args: {
          p_household_id: string
          p_member_id: string
          p_recurring_id: string
        }
        Returns: undefined
      }
      can_mutate_expense: { Args: { p_expense_id: string }; Returns: boolean }
      can_mutate_recurring_expense: {
        Args: { p_recurring_expense_id: string }
        Returns: boolean
      }
      category_belongs_to_household: {
        Args: { p_category_id: string; p_household_id: string }
        Returns: boolean
      }
      clear_monthly_balance_confirmations: {
        Args: { p_household_id: string; p_occurred_at: string }
        Returns: undefined
      }
      confirm_monthly_balance: {
        Args: { p_month: number; p_year: number }
        Returns: boolean
      }
      create_budget: {
        Args: {
          p_amount: number
          p_category_id: string
          p_end_date: string
          p_household_id: string
          p_personal?: boolean
          p_start_date: string
        }
        Returns: string
      }
      create_category: {
        Args: {
          p_icon?: string
          p_name: string
          p_type: Database["public"]["Enums"]["category_type"]
        }
        Returns: string
      }
      create_expense: {
        Args: {
          p_amount: number
          p_category_id: string
          p_description: string
          p_household_id: string
          p_occurred_at: string
          p_payer_id: string
          p_scope: Database["public"]["Enums"]["expense_scope"]
          p_splits: Json
        }
        Returns: string
      }
      create_expense_refund: {
        Args: { p_amount: number; p_expense_id: string }
        Returns: string
      }
      create_goal: {
        Args: {
          p_description: string
          p_goal_type: Database["public"]["Enums"]["goal_type"]
          p_household_id: string
          p_name: string
          p_scope?: Database["public"]["Enums"]["expense_scope"]
          p_target_amount: number
          p_target_date: string
        }
        Returns: string
      }
      create_goal_contribution: {
        Args: { p_amount: number; p_contributed_at: string; p_goal_id: string }
        Returns: string
      }
      create_payment_card: {
        Args: {
          p_bank: string | null
          p_cut_day: number
          p_household_id: string
          p_label: string
          p_last_four: string | null
          p_owner_member_id: string
          p_payment_day: number
        }
        Returns: string
      }
      create_purchase: {
        Args: {
          p_bonuses: Json
          p_card_id: string | null
          p_description: string | null
          p_emoji?: string | null
          p_first_due_date: string | null
          p_gross_amount: number
          p_household_id: string
          p_msi_months: number | null
          p_name: string
          p_payment_method: Database["public"]["Enums"]["purchase_payment_method"]
          p_purchased_at: string
          p_shares: Json
          p_store: string | null
        }
        Returns: string
      }
      create_purchase_bonus: {
        Args: {
          p_amount: number
          p_bonus_type: Database["public"]["Enums"]["purchase_bonus_type"]
          p_expected_at: string
          p_label: string
          p_notes: string | null
          p_purchase_id: string
        }
        Returns: string
      }
      register_purchase_payments: {
        Args: {
          p_household_id: string
          p_items: Json
          p_member_id: string
          p_notes: string | null
          p_paid_at: string
        }
        Returns: string[]
      }
      soft_delete_purchase_payment: {
        Args: { p_payment_id: string }
        Returns: string
      }
      household_id_for_purchase_payment: {
        Args: { p_payment_id: string }
        Returns: string
      }
      create_household: {
        Args: { p_name: string }
        Returns: {
          created_at: string
          created_by: string
          default_split_method: Database["public"]["Enums"]["household_split_method"]
          id: string
          name: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "households"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      create_household_with_onboarding_income: {
        Args: {
          p_estimates?: Json
          p_income_amount: number
          p_name: string
          p_savings_personal?: number
          p_savings_shared?: number
          p_split_method?: Database["public"]["Enums"]["household_split_method"]
        }
        Returns: {
          created_at: string
          created_by: string
          default_split_method: Database["public"]["Enums"]["household_split_method"]
          id: string
          name: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "households"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      copy_forward_month_salaries: { Args: never; Returns: number }
      create_income: {
        Args: {
          p_amount: number
          p_category_id: string
          p_description: string
          p_household_id: string
          p_occurred_at: string
        }
        Returns: string
      }
      create_recurring_expense: {
        Args: {
          p_amount: number
          p_category_id: string
          p_description: string
          p_end_date: string
          p_frequency: Database["public"]["Enums"]["recurrence_frequency"]
          p_household_id: string
          p_scope: Database["public"]["Enums"]["expense_scope"]
          p_splits: Json
          p_start_date: string
        }
        Returns: string
      }
      create_recurring_income: {
        Args: {
          p_amount: number
          p_category_id: string
          p_description: string
          p_end_date: string
          p_frequency: Database["public"]["Enums"]["recurrence_frequency"]
          p_household_id: string
          p_start_date: string
        }
        Returns: string
      }
      default_expense_category_catalog: {
        Args: never
        Returns: {
          icon: string
          name: string
        }[]
      }
      default_income_category_catalog: {
        Args: never
        Returns: {
          icon: string
          name: string
        }[]
      }
      goal_accepts_contribution: {
        Args: { p_goal_id: string }
        Returns: boolean
      }
      goal_is_active: { Args: { p_goal_id: string }; Returns: boolean }
      goal_is_visible: { Args: { p_goal_id: string }; Returns: boolean }
      household_has_no_members: {
        Args: { p_household_id: string }
        Returns: boolean
      }
      household_id_for_expense: {
        Args: { p_expense_id: string }
        Returns: string
      }
      household_id_for_goal: { Args: { p_goal_id: string }; Returns: string }
      household_id_for_recurring_expense: {
        Args: { p_recurring_expense_id: string }
        Returns: string
      }
      is_active_household_member: {
        Args: { p_household_id: string }
        Returns: boolean
      }
      is_active_member_of: {
        Args: { p_household_id: string; p_user_id: string }
        Returns: boolean
      }
      is_household_created_by_current_user: {
        Args: { p_household_id: string }
        Returns: boolean
      }
      is_household_member: {
        Args: { p_household_id: string }
        Returns: boolean
      }
      is_household_owner: { Args: { p_household_id: string }; Returns: boolean }
      leave_household: { Args: never; Returns: undefined }
      lookup_invitation: {
        Args: { p_token: string }
        Returns: {
          household_name: string
          status: string
        }[]
      }
      materialize_recurring_expense: {
        Args: { p_occurred_at: string; p_recurring_id: string }
        Returns: string
      }
      materialize_recurring_income: {
        Args: { p_occurred_at: string; p_recurring_id: string }
        Returns: string
      }
      next_recurrence_date: {
        Args: {
          p_date: string
          p_day_of_month?: number
          p_frequency: Database["public"]["Enums"]["recurrence_frequency"]
        }
        Returns: string
      }
      nido_today: { Args: never; Returns: string }
      personal_finance_visible: {
        Args: { p_owner_id: string }
        Returns: boolean
      }
      remove_household_member: {
        Args: { p_target_user_id: string }
        Returns: undefined
      }
      rename_category: {
        Args: { p_category_id: string; p_name: string }
        Returns: string
      }
      set_recurring_expense_active: {
        Args: { p_is_active: boolean; p_recurring_id: string }
        Returns: string
      }
      set_recurring_income_active: {
        Args: { p_is_active: boolean; p_recurring_id: string }
        Returns: string
      }
      shares_household_with: { Args: { p_user_id: string }; Returns: boolean }
      soft_delete_budget: { Args: { p_budget_id: string }; Returns: string }
      soft_delete_expense: { Args: { p_expense_id: string }; Returns: string }
      soft_delete_payment_card: { Args: { p_card_id: string }; Returns: string }
      soft_delete_purchase: { Args: { p_purchase_id: string }; Returns: string }
      soft_delete_purchase_bonus: { Args: { p_bonus_id: string }; Returns: string }
      mark_purchase_installment_paid: {
        Args: { p_installment_id: string; p_paid_at: string | null }
        Returns: string
      }
      update_payment_card: {
        Args: {
          p_bank: string | null
          p_card_id: string
          p_cut_day: number
          p_label: string
          p_last_four: string | null
          p_owner_member_id: string
          p_payment_day: number
        }
        Returns: string
      }
      update_purchase: {
        Args: {
          p_card_id: string | null
          p_description: string | null
          p_first_due_date: string | null
          p_gross_amount: number
          p_msi_months: number | null
          p_name: string
          p_payment_method: Database["public"]["Enums"]["purchase_payment_method"]
          p_purchase_id: string
          p_purchased_at: string
          p_shares: Json
          p_store: string | null
        }
        Returns: string
      }
      update_purchase_bonus: {
        Args: {
          p_amount: number
          p_bonus_id: string
          p_expected_at: string
          p_label: string
          p_notes: string | null
          p_received_at: string | null
        }
        Returns: string
      }
      soft_delete_goal_contribution: {
        Args: { p_contribution_id: string }
        Returns: string
      }
      soft_delete_income: { Args: { p_income_id: string }; Returns: string }
      transfer_household_ownership: {
        Args: { p_new_owner_id: string }
        Returns: undefined
      }
      update_budget: {
        Args: {
          p_amount: number
          p_budget_id: string
          p_category_id: string
          p_end_date: string
          p_start_date: string
        }
        Returns: string
      }
      update_expense: {
        Args: {
          p_amount: number
          p_category_id: string
          p_description: string
          p_expense_id: string
          p_occurred_at: string
          p_payer_id: string
          p_scope: Database["public"]["Enums"]["expense_scope"]
          p_splits: Json
        }
        Returns: string
      }
      update_goal: {
        Args: {
          p_description: string
          p_goal_id: string
          p_goal_type: Database["public"]["Enums"]["goal_type"]
          p_name: string
          p_scope?: Database["public"]["Enums"]["expense_scope"]
          p_target_amount: number
          p_target_date: string
        }
        Returns: string
      }
      update_goal_contribution: {
        Args: {
          p_amount: number
          p_contributed_at: string
          p_contribution_id: string
        }
        Returns: string
      }
      update_household_default_split_method: {
        Args: {
          p_method: Database["public"]["Enums"]["household_split_method"]
        }
        Returns: {
          created_at: string
          created_by: string
          default_split_method: Database["public"]["Enums"]["household_split_method"]
          id: string
          name: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "households"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      update_household_name: {
        Args: { p_name: string }
        Returns: {
          created_at: string
          created_by: string
          default_split_method: Database["public"]["Enums"]["household_split_method"]
          id: string
          name: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "households"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      update_income: {
        Args: {
          p_amount: number
          p_category_id: string
          p_description: string
          p_income_id: string
          p_occurred_at: string
        }
        Returns: string
      }
      update_personal_visibility: {
        Args: {
          p_visibility: Database["public"]["Enums"]["personal_visibility"]
        }
        Returns: {
          avatar_url: string | null
          created_at: string
          display_name: string
          id: string
          personal_visibility: Database["public"]["Enums"]["personal_visibility"]
          timezone: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "profiles"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      update_recurring_expense: {
        Args: {
          p_amount: number
          p_category_id: string
          p_description: string
          p_end_date: string
          p_frequency: Database["public"]["Enums"]["recurrence_frequency"]
          p_recurring_id: string
          p_scope: Database["public"]["Enums"]["expense_scope"]
          p_splits: Json
        }
        Returns: string
      }
      update_recurring_income: {
        Args: {
          p_amount: number
          p_category_id: string
          p_description: string
          p_end_date: string
          p_frequency: Database["public"]["Enums"]["recurrence_frequency"]
          p_recurring_id: string
        }
        Returns: string
      }
      validate_recurring_expense_splits: {
        Args: {
          p_amount: number
          p_household_id: string
          p_payer_id: string
          p_scope: Database["public"]["Enums"]["expense_scope"]
          p_splits: Json
        }
        Returns: Database["public"]["Enums"]["distribution_method"]
      }
    }
    Enums: {
      budget_period: "monthly"
      category_type: "income" | "expense"
      distribution_method: "equal" | "percentage" | "fixed" | "income_based"
      expense_scope: "personal" | "shared"
      goal_status: "active" | "completed" | "archived"
      goal_type: "saving" | "purchase"
      household_mutation_action: "edited" | "deleted" | "archived" | "adjusted"
      household_mutation_entity:
        | "expense"
        | "budget"
        | "goal"
        | "goal_contribution"
        | "category"
        | "household"
        | "savings"
      household_role: "owner" | "member"
      household_split_method: "equal" | "proportional"
      personal_visibility: "nido" | "private"
      purchase_audit_action:
        | "created"
        | "updated"
        | "deleted"
        | "undone"
        | "marked_paid"
        | "marked_unpaid"
        | "received"
        | "unreceived"
      purchase_audit_entity:
        | "purchase"
        | "payment_card"
        | "purchase_payment"
        | "purchase_installment"
        | "purchase_bonus"
        | "purchase_share"
      purchase_bonus_type: "cashback" | "deferred_discount"
      purchase_payment_kind: "installment" | "payoff" | "capital"
      purchase_payment_method: "cash" | "msi"
      recurrence_frequency: "weekly" | "biweekly" | "monthly" | "yearly"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      budget_period: ["monthly"],
      category_type: ["income", "expense"],
      distribution_method: ["equal", "percentage", "fixed", "income_based"],
      expense_scope: ["personal", "shared"],
      goal_status: ["active", "completed", "archived"],
      goal_type: ["saving", "purchase"],
      household_mutation_action: ["edited", "deleted", "archived", "adjusted"],
      household_mutation_entity: [
        "expense",
        "budget",
        "goal",
        "goal_contribution",
        "category",
        "household",
        "savings",
      ],
      household_role: ["owner", "member"],
      household_split_method: ["equal", "proportional"],
      personal_visibility: ["nido", "private"],
      purchase_audit_action: [
        "created",
        "updated",
        "deleted",
        "undone",
        "marked_paid",
        "marked_unpaid",
        "received",
        "unreceived",
      ],
      purchase_audit_entity: [
        "purchase",
        "payment_card",
        "purchase_payment",
        "purchase_installment",
        "purchase_bonus",
        "purchase_share",
      ],
      purchase_bonus_type: ["cashback", "deferred_discount"],
      purchase_payment_kind: ["installment", "payoff", "capital"],
      purchase_payment_method: ["cash", "msi"],
      recurrence_frequency: ["weekly", "biweekly", "monthly", "yearly"],
    },
  },
} as const
