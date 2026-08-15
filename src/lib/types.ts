import type { EXP_SUGG } from "./constants";

export type AppMode = "onboarding" | "app";
export type OStep   = "welcome"|"auth"|"join"|"c-type"|"c-name"|"c-invite"|
               "p-name"|"p-income"|"p-savings"|"p-expenses"|"p-contrib"|"nest-ready";
export type Tab     = "home"|"budget"|"goals"|"household"|"activity";
export type Model   = "equal"|"proportional"|"capacity";
export type Flow    = null|"expense"|"goal"|"contrib";

export interface OData {
  flow: "join"|"create"|null; nestType: string; nestEmoji: string; nestName: string;
  userName: string; salary: string; freelance: string; savings: string;
  savingsType: "personal" | "shared" | "both";
  savingsShared: string;
  expenses: typeof EXP_SUGG; contrib: Model;
  _showAdd?: boolean; _emoji?: string; _cname?: string; _etype?: "personal"|"shared";
}
