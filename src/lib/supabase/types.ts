/**
 * Database types for the Nido `public` schema.
 *
 * Source of truth: supabase/migrations/
 *   - 20260816000000_nido_foundation_schema.sql
 *   - 20260817000000_nido_rls.sql
 *
 * Status: hand-authored from those migrations. Supabase CLI was not
 * available in this environment, and no live project was linked. These
 * types are pending replacement by official generation.
 *
 * Do not treat this file as generated-from-a-live-database output.
 *
 * When a Supabase project is available, regenerate with:
 *
 *   npx supabase gen types typescript --project-id <project-id> --schema public > src/lib/supabase/types.ts
 *
 * Or, with a local Supabase stack:
 *
 *   npx supabase gen types typescript --local > src/lib/supabase/types.ts
 *
 * See docs/supabase.md.
 */

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          display_name: string;
          avatar_url: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          display_name: string;
          avatar_url?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          display_name?: string;
          avatar_url?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "profiles_id_fkey";
            columns: ["id"];
            isOneToOne: true;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      households: {
        Row: {
          id: string;
          name: string;
          created_by: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          created_by: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          created_by?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "households_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      household_members: {
        Row: {
          id: string;
          household_id: string;
          user_id: string;
          role: Database["public"]["Enums"]["household_role"];
          joined_at: string;
          left_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          household_id: string;
          user_id: string;
          role?: Database["public"]["Enums"]["household_role"];
          joined_at?: string;
          left_at?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          household_id?: string;
          user_id?: string;
          role?: Database["public"]["Enums"]["household_role"];
          joined_at?: string;
          left_at?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "household_members_household_id_fkey";
            columns: ["household_id"];
            isOneToOne: false;
            referencedRelation: "households";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "household_members_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      household_invitations: {
        Row: {
          id: string;
          household_id: string;
          invited_by: string;
          email: string | null;
          token: string;
          expires_at: string;
          accepted_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          household_id: string;
          invited_by: string;
          email?: string | null;
          token: string;
          expires_at: string;
          accepted_at?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          household_id?: string;
          invited_by?: string;
          email?: string | null;
          token?: string;
          expires_at?: string;
          accepted_at?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "household_invitations_household_id_fkey";
            columns: ["household_id"];
            isOneToOne: false;
            referencedRelation: "households";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "household_invitations_invited_by_fkey";
            columns: ["invited_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      categories: {
        Row: {
          id: string;
          household_id: string;
          name: string;
          icon: string | null;
          type: Database["public"]["Enums"]["category_type"];
          created_by: string;
          created_at: string;
          updated_at: string;
          archived_at: string | null;
        };
        Insert: {
          id?: string;
          household_id: string;
          name: string;
          icon?: string | null;
          type: Database["public"]["Enums"]["category_type"];
          created_by: string;
          created_at?: string;
          updated_at?: string;
          archived_at?: string | null;
        };
        Update: {
          id?: string;
          household_id?: string;
          name?: string;
          icon?: string | null;
          type?: Database["public"]["Enums"]["category_type"];
          created_by?: string;
          created_at?: string;
          updated_at?: string;
          archived_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "categories_household_id_fkey";
            columns: ["household_id"];
            isOneToOne: false;
            referencedRelation: "households";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "categories_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      recurring_incomes: {
        Row: {
          id: string;
          household_id: string;
          member_id: string;
          category_id: string;
          amount: number;
          description: string | null;
          frequency: Database["public"]["Enums"]["recurrence_frequency"];
          day_of_month: number | null;
          start_date: string;
          end_date: string | null;
          next_occurrence: string;
          is_active: boolean;
          created_by: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          household_id: string;
          member_id: string;
          category_id: string;
          amount: number;
          description?: string | null;
          frequency: Database["public"]["Enums"]["recurrence_frequency"];
          day_of_month?: number | null;
          start_date: string;
          end_date?: string | null;
          next_occurrence: string;
          is_active?: boolean;
          created_by: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          household_id?: string;
          member_id?: string;
          category_id?: string;
          amount?: number;
          description?: string | null;
          frequency?: Database["public"]["Enums"]["recurrence_frequency"];
          day_of_month?: number | null;
          start_date?: string;
          end_date?: string | null;
          next_occurrence?: string;
          is_active?: boolean;
          created_by?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "recurring_incomes_household_id_fkey";
            columns: ["household_id"];
            isOneToOne: false;
            referencedRelation: "households";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "recurring_incomes_member_id_fkey";
            columns: ["member_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "recurring_incomes_category_id_fkey";
            columns: ["category_id"];
            isOneToOne: false;
            referencedRelation: "categories";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "recurring_incomes_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      incomes: {
        Row: {
          id: string;
          household_id: string;
          member_id: string;
          category_id: string;
          amount: number;
          description: string | null;
          occurred_at: string;
          recurring_id: string | null;
          created_by: string;
          created_at: string;
          updated_at: string;
          deleted_at: string | null;
        };
        Insert: {
          id?: string;
          household_id: string;
          member_id: string;
          category_id: string;
          amount: number;
          description?: string | null;
          occurred_at: string;
          recurring_id?: string | null;
          created_by: string;
          created_at?: string;
          updated_at?: string;
          deleted_at?: string | null;
        };
        Update: {
          id?: string;
          household_id?: string;
          member_id?: string;
          category_id?: string;
          amount?: number;
          description?: string | null;
          occurred_at?: string;
          recurring_id?: string | null;
          created_by?: string;
          created_at?: string;
          updated_at?: string;
          deleted_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "incomes_household_id_fkey";
            columns: ["household_id"];
            isOneToOne: false;
            referencedRelation: "households";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "incomes_member_id_fkey";
            columns: ["member_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "incomes_category_id_fkey";
            columns: ["category_id"];
            isOneToOne: false;
            referencedRelation: "categories";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "incomes_recurring_id_fkey";
            columns: ["recurring_id"];
            isOneToOne: false;
            referencedRelation: "recurring_incomes";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "incomes_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      recurring_expenses: {
        Row: {
          id: string;
          household_id: string;
          category_id: string;
          amount: number;
          description: string | null;
          payer_id: string;
          scope: Database["public"]["Enums"]["expense_scope"];
          distribution_method: Database["public"]["Enums"]["distribution_method"];
          frequency: Database["public"]["Enums"]["recurrence_frequency"];
          start_date: string;
          end_date: string | null;
          next_occurrence: string;
          is_active: boolean;
          created_by: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          household_id: string;
          category_id: string;
          amount: number;
          description?: string | null;
          payer_id: string;
          scope: Database["public"]["Enums"]["expense_scope"];
          distribution_method: Database["public"]["Enums"]["distribution_method"];
          frequency: Database["public"]["Enums"]["recurrence_frequency"];
          start_date: string;
          end_date?: string | null;
          next_occurrence: string;
          is_active?: boolean;
          created_by: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          household_id?: string;
          category_id?: string;
          amount?: number;
          description?: string | null;
          payer_id?: string;
          scope?: Database["public"]["Enums"]["expense_scope"];
          distribution_method?: Database["public"]["Enums"]["distribution_method"];
          frequency?: Database["public"]["Enums"]["recurrence_frequency"];
          start_date?: string;
          end_date?: string | null;
          next_occurrence?: string;
          is_active?: boolean;
          created_by?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "recurring_expenses_household_id_fkey";
            columns: ["household_id"];
            isOneToOne: false;
            referencedRelation: "households";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "recurring_expenses_category_id_fkey";
            columns: ["category_id"];
            isOneToOne: false;
            referencedRelation: "categories";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "recurring_expenses_payer_id_fkey";
            columns: ["payer_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "recurring_expenses_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      recurring_expense_splits: {
        Row: {
          id: string;
          recurring_expense_id: string;
          member_id: string;
          amount: number;
          percentage: number | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          recurring_expense_id: string;
          member_id: string;
          amount: number;
          percentage?: number | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          recurring_expense_id?: string;
          member_id?: string;
          amount?: number;
          percentage?: number | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "recurring_expense_splits_recurring_expense_id_fkey";
            columns: ["recurring_expense_id"];
            isOneToOne: false;
            referencedRelation: "recurring_expenses";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "recurring_expense_splits_member_id_fkey";
            columns: ["member_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      expenses: {
        Row: {
          id: string;
          household_id: string;
          category_id: string;
          amount: number;
          description: string | null;
          occurred_at: string;
          payer_id: string;
          scope: Database["public"]["Enums"]["expense_scope"];
          distribution_method: Database["public"]["Enums"]["distribution_method"];
          recurring_id: string | null;
          created_by: string;
          created_at: string;
          updated_at: string;
          deleted_at: string | null;
        };
        Insert: {
          id?: string;
          household_id: string;
          category_id: string;
          amount: number;
          description?: string | null;
          occurred_at: string;
          payer_id: string;
          scope: Database["public"]["Enums"]["expense_scope"];
          distribution_method: Database["public"]["Enums"]["distribution_method"];
          recurring_id?: string | null;
          created_by: string;
          created_at?: string;
          updated_at?: string;
          deleted_at?: string | null;
        };
        Update: {
          id?: string;
          household_id?: string;
          category_id?: string;
          amount?: number;
          description?: string | null;
          occurred_at?: string;
          payer_id?: string;
          scope?: Database["public"]["Enums"]["expense_scope"];
          distribution_method?: Database["public"]["Enums"]["distribution_method"];
          recurring_id?: string | null;
          created_by?: string;
          created_at?: string;
          updated_at?: string;
          deleted_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "expenses_household_id_fkey";
            columns: ["household_id"];
            isOneToOne: false;
            referencedRelation: "households";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "expenses_category_id_fkey";
            columns: ["category_id"];
            isOneToOne: false;
            referencedRelation: "categories";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "expenses_payer_id_fkey";
            columns: ["payer_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "expenses_recurring_id_fkey";
            columns: ["recurring_id"];
            isOneToOne: false;
            referencedRelation: "recurring_expenses";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "expenses_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      expense_splits: {
        Row: {
          id: string;
          expense_id: string;
          member_id: string;
          amount: number;
          percentage: number | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          expense_id: string;
          member_id: string;
          amount: number;
          percentage?: number | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          expense_id?: string;
          member_id?: string;
          amount?: number;
          percentage?: number | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "expense_splits_expense_id_fkey";
            columns: ["expense_id"];
            isOneToOne: false;
            referencedRelation: "expenses";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "expense_splits_member_id_fkey";
            columns: ["member_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      budgets: {
        Row: {
          id: string;
          household_id: string;
          member_id: string | null;
          category_id: string;
          amount: number;
          period: Database["public"]["Enums"]["budget_period"];
          start_date: string;
          end_date: string;
          created_by: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          household_id: string;
          member_id?: string | null;
          category_id: string;
          amount: number;
          period?: Database["public"]["Enums"]["budget_period"];
          start_date: string;
          end_date: string;
          created_by: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          household_id?: string;
          member_id?: string | null;
          category_id?: string;
          amount?: number;
          period?: Database["public"]["Enums"]["budget_period"];
          start_date?: string;
          end_date?: string;
          created_by?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "budgets_household_id_fkey";
            columns: ["household_id"];
            isOneToOne: false;
            referencedRelation: "households";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "budgets_member_id_fkey";
            columns: ["member_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "budgets_category_id_fkey";
            columns: ["category_id"];
            isOneToOne: false;
            referencedRelation: "categories";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "budgets_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      goals: {
        Row: {
          id: string;
          household_id: string;
          name: string;
          description: string | null;
          goal_type: Database["public"]["Enums"]["goal_type"];
          target_amount: number;
          target_date: string | null;
          status: Database["public"]["Enums"]["goal_status"];
          created_by: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          household_id: string;
          name: string;
          description?: string | null;
          goal_type: Database["public"]["Enums"]["goal_type"];
          target_amount: number;
          target_date?: string | null;
          status?: Database["public"]["Enums"]["goal_status"];
          created_by: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          household_id?: string;
          name?: string;
          description?: string | null;
          goal_type?: Database["public"]["Enums"]["goal_type"];
          target_amount?: number;
          target_date?: string | null;
          status?: Database["public"]["Enums"]["goal_status"];
          created_by?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "goals_household_id_fkey";
            columns: ["household_id"];
            isOneToOne: false;
            referencedRelation: "households";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "goals_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      goal_contributions: {
        Row: {
          id: string;
          goal_id: string;
          member_id: string;
          amount: number;
          contributed_at: string;
          created_by: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          goal_id: string;
          member_id: string;
          amount: number;
          contributed_at: string;
          created_by: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          goal_id?: string;
          member_id?: string;
          amount?: number;
          contributed_at?: string;
          created_by?: string;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "goal_contributions_goal_id_fkey";
            columns: ["goal_id"];
            isOneToOne: false;
            referencedRelation: "goals";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "goal_contributions_member_id_fkey";
            columns: ["member_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "goal_contributions_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      assert_active_household_member: {
        Args: { p_household_id: string; p_user_id: string };
        Returns: undefined;
      };
      assert_category_in_household: {
        Args: {
          p_household_id: string;
          p_category_id: string;
          p_expected_type?: Database["public"]["Enums"]["category_type"];
        };
        Returns: undefined;
      };
      assert_recurring_expense_origin: {
        Args: { p_household_id: string; p_recurring_id: string };
        Returns: undefined;
      };
      assert_recurring_income_origin: {
        Args: {
          p_household_id: string;
          p_member_id: string;
          p_recurring_id: string;
        };
        Returns: undefined;
      };
      category_belongs_to_household: {
        Args: { p_category_id: string; p_household_id: string };
        Returns: boolean;
      };
      household_has_no_members: {
        Args: { p_household_id: string };
        Returns: boolean;
      };
      household_id_for_expense: {
        Args: { p_expense_id: string };
        Returns: string;
      };
      household_id_for_goal: {
        Args: { p_goal_id: string };
        Returns: string;
      };
      household_id_for_recurring_expense: {
        Args: { p_recurring_expense_id: string };
        Returns: string;
      };
      is_active_household_member: {
        Args: { p_household_id: string };
        Returns: boolean;
      };
      is_active_member_of: {
        Args: { p_household_id: string; p_user_id: string };
        Returns: boolean;
      };
      is_household_created_by_current_user: {
        Args: { p_household_id: string };
        Returns: boolean;
      };
      is_household_member: {
        Args: { p_household_id: string };
        Returns: boolean;
      };
      is_household_owner: {
        Args: { p_household_id: string };
        Returns: boolean;
      };
      shares_household_with: {
        Args: { p_user_id: string };
        Returns: boolean;
      };
    };
    Enums: {
      household_role: "owner" | "member";
      category_type: "income" | "expense";
      recurrence_frequency: "weekly" | "biweekly" | "monthly" | "yearly";
      expense_scope: "personal" | "shared";
      distribution_method: "equal" | "percentage" | "fixed" | "income_based";
      budget_period: "monthly";
      goal_type: "saving" | "purchase";
      goal_status: "active" | "completed" | "archived";
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {
      household_role: ["owner", "member"],
      category_type: ["income", "expense"],
      recurrence_frequency: ["weekly", "biweekly", "monthly", "yearly"],
      expense_scope: ["personal", "shared"],
      distribution_method: ["equal", "percentage", "fixed", "income_based"],
      budget_period: ["monthly"],
      goal_type: ["saving", "purchase"],
      goal_status: ["active", "completed", "archived"],
    },
  },
} as const;
