#!/usr/bin/env node
/**
 * Static check for the development data reset script.
 *
 * This does not connect to Supabase and does not execute SQL.
 *
 * Run: node supabase/tests/validate_reset_dev_data.mjs
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const scriptPath = path.join(root, "supabase/tests/reset_dev_data.sql");

const errors = [];

function fail(message) {
  errors.push(message);
}

if (!fs.existsSync(scriptPath)) {
  console.error("Reset script validation failed:\n");
  console.error("- supabase/tests/reset_dev_data.sql does not exist.");
  process.exit(1);
}

const sql = fs.readFileSync(scriptPath, "utf8");
const sqlBody = sql
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/--[^\n]*/g, "");

const expectedProjectRef = "pxfdvhavcddqmhuljxlf";
const applicationTables = [
  "profiles",
  "households",
  "household_members",
  "household_invitations",
  "categories",
  "recurring_incomes",
  "incomes",
  "recurring_expenses",
  "recurring_expense_splits",
  "expenses",
  "expense_splits",
  "budgets",
  "goals",
  "goal_contributions",
];

if (!sql.includes(expectedProjectRef)) {
  fail(`Script does not reference the expected development project ${expectedProjectRef}.`);
}

if (!sql.includes("nido_dev")) {
  fail("Script does not mention the expected development project name nido_dev.");
}

if (!/\bBEGIN\s*;/i.test(sqlBody)) {
  fail("Script does not contain BEGIN;");
}

if (!/\bCOMMIT\s*;/i.test(sqlBody)) {
  fail("Script does not contain COMMIT;");
}

if (/\bDROP\s+TABLE\b/i.test(sqlBody)) {
  fail("Script contains DROP TABLE.");
}

if (/\bDROP\s+SCHEMA\b/i.test(sqlBody)) {
  fail("Script contains DROP SCHEMA.");
}

if (/\bTRUNCATE\b[\s\S]*\bCASCADE\b/i.test(sqlBody)) {
  fail("Script contains TRUNCATE ... CASCADE.");
}

if (/\bDISABLE\s+TRIGGER\b/i.test(sqlBody)) {
  fail("Script contains DISABLE TRIGGER.");
}

if (/\bALTER\s+TABLE\b[\s\S]*\bDISABLE\s+ROW\s+LEVEL\s+SECURITY\b/i.test(sqlBody)) {
  fail("Script contains ALTER TABLE ... DISABLE ROW LEVEL SECURITY.");
}

for (const table of applicationTables) {
  if (!sql.includes(table)) {
    fail(`Script does not reference application table ${table}.`);
  }
}

if (!sql.includes("auth.users")) {
  fail("Script does not reference auth.users.");
}

if (errors.length > 0) {
  console.error("Reset script validation failed:\n");
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

console.log("Reset script validation passed.");
console.log(`File: ${path.relative(root, scriptPath)}`);
console.log(`Development project: nido_dev / ${expectedProjectRef}`);
console.log(`Application tables checked: ${applicationTables.length}`);
console.log("This check does not execute SQL and does not connect to Supabase.");
