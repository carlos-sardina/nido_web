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
    PostgrestVersion: "14.15"
  }
  public: {
    Tables: {
      budgets: {
        Row: {
          amount: number
          category_id: string
          created_at: string
          created_by: string
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
          payer_id: string
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
          payer_id: string
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
          payer_id?: string
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
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by: string
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
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
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          display_name: string
          id: string
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          display_name: string
          id: string
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string
          id?: string
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
      category_belongs_to_household: {
        Args: { p_category_id: string; p_household_id: string }
        Returns: boolean
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
      create_goal: {
        Args: {
          p_description: string
          p_goal_type: Database["public"]["Enums"]["goal_type"]
          p_household_id: string
          p_name: string
          p_target_amount: number
          p_target_date: string
        }
        Returns: string
      }
      create_goal_contribution: {
        Args: { p_amount: number; p_contributed_at: string; p_goal_id: string }
        Returns: string
      }
      create_household: {
        Args: { p_name: string }
        Returns: {
          created_at: string
          created_by: string
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
      default_expense_category_catalog: {
        Args: never
        Returns: {
          icon: string
          name: string
        }[]
      }
      goal_is_active: { Args: { p_goal_id: string }; Returns: boolean }
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
      shares_household_with: { Args: { p_user_id: string }; Returns: boolean }
      soft_delete_expense: { Args: { p_expense_id: string }; Returns: string }
      soft_delete_goal_contribution: {
        Args: { p_contribution_id: string }
        Returns: string
      }
      update_expense: {
        Args: {
          p_amount: number
          p_category_id: string
          p_description: string
          p_expense_id: string
          p_occurred_at: string
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
    }
    Enums: {
      budget_period: "monthly"
      category_type: "income" | "expense"
      distribution_method: "equal" | "percentage" | "fixed" | "income_based"
      expense_scope: "personal" | "shared"
      goal_status: "active" | "completed" | "archived"
      goal_type: "saving" | "purchase"
      household_role: "owner" | "member"
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
      household_role: ["owner", "member"],
      recurrence_frequency: ["weekly", "biweekly", "monthly", "yearly"],
    },
  },
} as const
