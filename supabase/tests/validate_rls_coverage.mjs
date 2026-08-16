#!/usr/bin/env node
/**
 * Static RLS coverage check.
 *
 * This does not execute policies and does not prove authorization behavior.
 * It only verifies that the RLS migration enables RLS on every foundation
 * table, declares the expected helpers, and does not leave a table without
 * policies or with a wide-open USING (true) / WITH CHECK (true).
 *
 * Run: node supabase/tests/validate_rls_coverage.mjs
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const foundationPath = path.join(
  root,
  "supabase/migrations/20260816000000_nido_foundation_schema.sql"
);
const rlsPath = path.join(
  root,
  "supabase/migrations/20260817000000_nido_rls.sql"
);

const foundation = fs.readFileSync(foundationPath, "utf8");
const rls = fs.readFileSync(rlsPath, "utf8");
const migrationsDir = path.join(root, "supabase/migrations");
const allMigrations = fs
  .readdirSync(migrationsDir)
  .filter((file) => file.endsWith(".sql"))
  .map((file) => fs.readFileSync(path.join(migrationsDir, file), "utf8"))
  .join("\n");

const errors = [];
const notices = [];

function fail(message) {
  errors.push(message);
}

const tables = [
  ...foundation.matchAll(/CREATE TABLE public\.([a-z_]+)/g),
].map((match) => match[1]);

if (tables.length === 0) {
  fail("No public tables found in the foundation migration.");
}

const expectedHelpers = [
  "is_household_member(p_household_id uuid)",
  "is_active_household_member(p_household_id uuid)",
  "is_household_owner(p_household_id uuid)",
  "is_active_member_of(",
  "shares_household_with(p_user_id uuid)",
  "household_id_for_expense(p_expense_id uuid)",
  "household_id_for_recurring_expense(",
  "household_id_for_goal(p_goal_id uuid)",
];

for (const helper of expectedHelpers) {
  if (!rls.includes(`FUNCTION public.${helper.split("(")[0]}`)) {
    fail(`Missing helper function public.${helper.split("(")[0]}`);
  }
}

const definerBlocks = [
  ...allMigrations.matchAll(
    /CREATE OR REPLACE FUNCTION public\.([a-z_]+)\([\s\S]*?AS \$\$/g
  ),
];

for (const block of definerBlocks) {
  const fn = block[1];
  const body = block[0];
  if (body.includes("SECURITY DEFINER") && !body.includes("SET search_path")) {
    fail(`SECURITY DEFINER function public.${fn} is missing SET search_path.`);
  }
}

const expectedPolicies = {
  profiles: ["SELECT", "UPDATE"],
  households: ["SELECT", "INSERT", "UPDATE", "DELETE"],
  household_members: ["SELECT", "INSERT"],
  household_invitations: ["SELECT", "INSERT", "DELETE"],
  categories: ["SELECT", "INSERT", "UPDATE"],
  recurring_incomes: ["SELECT", "INSERT", "UPDATE"],
  incomes: ["SELECT", "INSERT", "UPDATE"],
  recurring_expenses: ["SELECT", "INSERT", "UPDATE"],
  recurring_expense_splits: ["SELECT", "INSERT", "UPDATE", "DELETE"],
  expenses: ["SELECT", "INSERT", "UPDATE"],
  expense_splits: ["SELECT", "INSERT", "UPDATE", "DELETE"],
  budgets: ["SELECT", "INSERT", "UPDATE"],
  goals: ["SELECT", "INSERT", "UPDATE"],
  goal_contributions: ["SELECT", "INSERT", "UPDATE", "DELETE"],
};

const noClientWritePolicies = {
  household_members: ["UPDATE", "DELETE"],
  household_invitations: ["UPDATE"],
  profiles: ["INSERT", "DELETE"],
  categories: ["DELETE"],
  recurring_incomes: ["DELETE"],
  incomes: ["DELETE"],
  recurring_expenses: ["DELETE"],
  expenses: ["DELETE"],
  budgets: ["DELETE"],
  goals: ["DELETE"],
};

for (const table of tables) {
  const enable = new RegExp(
    `ALTER TABLE public\\.${table} ENABLE ROW LEVEL SECURITY;`
  );
  if (!enable.test(rls)) {
    fail(`RLS is not enabled on public.${table}.`);
  }

  const revoke = new RegExp(
    `REVOKE ALL ON TABLE public\\.${table} FROM PUBLIC, anon;`
  );
  if (!revoke.test(rls)) {
    fail(`public.${table} is not revoked from PUBLIC/anon.`);
  }

  const operations = expectedPolicies[table];
  if (!operations) {
    fail(`No expected-policy list for public.${table}.`);
    continue;
  }

  for (const operation of operations) {
    const policy = new RegExp(
      `CREATE POLICY [a-z0-9_]+\\s+ON public\\.${table}\\s+FOR ${operation}\\s+TO authenticated`,
      "i"
    );
    if (!policy.test(rls)) {
      fail(`Missing ${operation} policy for authenticated on public.${table}.`);
    }
  }

  const forbidden = noClientWritePolicies[table] ?? [];
  for (const operation of forbidden) {
    const policy = new RegExp(
      `CREATE POLICY [a-z0-9_]+\\s+ON public\\.${table}\\s+FOR ${operation}\\b`,
      "i"
    );
    if (policy.test(rls)) {
      fail(
        `Unexpected client ${operation} policy on public.${table}. This operation must stay service-layer or denied.`
      );
    }
  }
}

if (/USING\s*\(\s*true\s*\)/i.test(rls) || /WITH CHECK\s*\(\s*true\s*\)/i.test(rls)) {
  fail("Found a wide-open USING (true) or WITH CHECK (true) policy.");
}

if (!rls.includes("created_by = auth.uid()")) {
  fail("No policy requires created_by = auth.uid().");
}

if (!rls.includes("SECURITY DEFINER")) {
  fail("Expected SECURITY DEFINER membership helpers.");
}

if (rls.includes("FORCE ROW LEVEL SECURITY")) {
  notices.push(
    "FORCE ROW LEVEL SECURITY is present. Confirm this does not break SECURITY DEFINER integrity triggers."
  );
}

const missingTables = Object.keys(expectedPolicies).filter(
  (table) => !tables.includes(table)
);
for (const table of missingTables) {
  fail(`Expected table public.${table} was not found in the foundation schema.`);
}

if (errors.length > 0) {
  console.error("RLS coverage validation failed:\n");
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

console.log(`RLS coverage validation passed for ${tables.length} tables.`);
console.log(`Tables: ${tables.join(", ")}`);
if (notices.length > 0) {
  console.log("Notices:");
  for (const notice of notices) {
    console.log(`- ${notice}`);
  }
}
console.log(
  "This check does not execute SQL and does not prove runtime authorization."
);
