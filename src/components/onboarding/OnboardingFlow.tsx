"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Check, ChevronLeft, Link, QrCode, Sparkles,
} from "lucide-react";
import type { User } from "@supabase/supabase-js";
import { AuthPanel, type AuthView } from "@/components/auth/AuthPanel";
import { resolveNidoChoice } from "@/lib/auth/destination";
import { identityFromUser } from "@/lib/auth/identity";
import { createHousehold } from "@/lib/nido/household";
import { createInvitation } from "@/lib/nido/invitations";
import { updateMyDisplayName } from "@/lib/nido/profile";
import { extractInvitationToken, normalizeDisplayName, normalizeHouseholdName } from "@/lib/nido/rules";
import {
  clearOnboardingDraft,
  draftAfterHouseholdCreateAttempt,
  emptyOnboardingData,
  isOnboardingDraftStep,
  loadOnboardingDraft,
  saveOnboardingDraft,
} from "@/lib/onboarding/draft";
import {
  canStartExclusiveAction,
  divisionMethodHint,
  formatMoneyInput,
  hasSelectedExpense,
  normalizeCustomExpenseName,
  parseMoneyInput,
  personalExpenseTotal,
  validateCustomExpenseName,
  validateDisplayName,
  validateExpenseEntry,
  validateHouseholdName,
  validateIncome,
  validateOnboardingFinalize,
  validateSavings,
} from "@/lib/onboarding/validation";
import { EXP_SUGG, NEST_TYPES, NIDO_NAMES } from "@/lib/constants";
import { P } from "@/lib/palette";
import type { Model, OStep, OData } from "@/lib/types";
import { InviteQrModal } from "@/components/flows/InviteQrModal";
import { NidoHouse } from "@/components/shared/NidoHouse";
import { ExpenseEntryModal } from "@/components/onboarding/ExpenseEntryModal";
import { OBtn2 } from "@/components/onboarding/OBtn2";
import { OProgress2 } from "@/components/onboarding/OProgress2";
import { NidoSelectionScreen } from "@/components/onboarding/NidoSelectionScreen";

const CREATE_STEPS = 7;

export function OnboardingFlow({
  onComplete,
  user,
  entry = "welcome",
}: {
  onComplete: () => void;
  user: User | null;
  entry?: "welcome" | "select";
}) {
  const router = useRouter();
  const restored = useRef(false);
  const [step, setStep] = useState<OStep>(entry === "select" ? "select" : "welcome");
  const [authView, setAuthView] = useState<AuthView>("signup");
  const [data, setData] = useState<OData>(() => ({
    ...emptyOnboardingData(),
    expenses: EXP_SUGG.map((expense) => ({ ...expense })),
  }));
  const [joinCode, setJoinCode] = useState("");
  const [expEditIdx, setExpEditIdx] = useState<number | null>(null);
  const [showQrInvite, setShowQrInvite] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [nidoError, setNidoError] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const [createdHouseholdId, setCreatedHouseholdId] = useState<string | null>(null);
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [inviteCopied, setInviteCopied] = useState(false);
  const identity = identityFromUser(user);
  const set = (k: keyof OData, v: OData[keyof OData]) => setData(p => ({ ...p, [k]: v }));

  const goTo = (next: OStep) => {
    setFieldError(null);
    setNidoError(null);
    setStep(next);
    if (typeof window !== "undefined") {
      window.history.pushState({ nidoOnboardingStep: next }, "");
    }
  };

  const applyNidoChoice = (choice: "create" | "join") => {
    const dest = resolveNidoChoice(choice);
    setData(p => ({
      ...p,
      flow: choice,
      userName: p.userName || identity?.displayName || "",
    }));
    goTo(dest.kind === "join_code" ? "join" : "c-name");
  };

  const openAuth = (view: Exclude<AuthView, "confirm-email">) => {
    setAuthView(view);
    goTo("auth");
  };

  useEffect(() => {
    const onPop = (event: PopStateEvent) => {
      const next = event.state?.nidoOnboardingStep;
      if (typeof next === "string") {
        setStep(next as OStep);
        setFieldError(null);
        setNidoError(null);
      }
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  useEffect(() => {
    if (!user || !isOnboardingDraftStep(step)) return;
    saveOnboardingDraft({ step, data, joinCode });
  }, [user, step, data, joinCode]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const hadAuthError = params.get("auth") === "error";
    if (hadAuthError) {
      window.history.replaceState({}, "", window.location.pathname);
    }

    if (!user) {
      restored.current = false;
      if (hadAuthError) {
        setAuthError("No pudimos completar la autenticación. Inténtalo de nuevo.");
        setAuthView("login");
        setStep("auth");
        return;
      }
      setStep((current) => (current === "welcome" || current === "auth" ? current : "welcome"));
      return;
    }

    if (!restored.current) {
      restored.current = true;
      const draft = loadOnboardingDraft();
      if (draft && draft.step !== "select") {
        setData({
          ...draft.data,
          expenses: draft.data.expenses.length > 0
            ? draft.data.expenses
            : EXP_SUGG.map((expense) => ({ ...expense })),
        });
        setJoinCode(draft.joinCode);
        setStep(draft.step);
        return;
      }
    }

    setStep((current) => (current === "welcome" || current === "auth" ? "select" : current));
    // After login/confirmation, never infer create vs join — only leave landing/auth.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const PERSONAL: OStep[] = ["p-name","p-income","p-savings","p-expenses","p-contrib"];
  const pIdx = PERSONAL.indexOf(step);
  const isPers = pIdx >= 0;
  const expCanContinue = hasSelectedExpense(data);
  const joinToken = extractInvitationToken(joinCode);
  const contribHint = divisionMethodHint({
    method: data.contrib,
    income: data.salary,
    personalExpenseTotal: personalExpenseTotal(data),
  });

  const persistDisplayName = async () => {
    const displayName = normalizeDisplayName(data.userName || identity?.displayName || "");
    if (!displayName) {
      return { ok: false as const, error: { message: "Ingresa el nombre que verán los demás miembros." } };
    }
    return updateMyDisplayName(displayName);
  };

  const ensureHouseholdCreated = async (): Promise<string | null> => {
    if (createdHouseholdId) return createdHouseholdId;

    const invalid = validateOnboardingFinalize(data);
    if (invalid) {
      setNidoError(invalid);
      return null;
    }

    const normalizedNestName = normalizeHouseholdName(data.nestName);
    if (normalizedNestName && normalizedNestName !== data.nestName) {
      setData((prev) => ({ ...prev, nestName: normalizedNestName }));
    }

    const nameResult = await persistDisplayName();
    if (nameResult.ok === false) {
      setNidoError(nameResult.error.message);
      return null;
    }

    const result = await createHousehold({ name: normalizedNestName ?? data.nestName });
    if (result.ok === false) {
      setNidoError(result.error.message);
      if (result.error.code === "already_in_nido") onComplete();
      return null;
    }

    setCreatedHouseholdId(result.data.id);
    if (draftAfterHouseholdCreateAttempt(true) === "clear") {
      clearOnboardingDraft();
    }
    return result.data.id;
  };

  const handleCreateNido = async () => {
    if (!canStartExclusiveAction(submitting) || submittingRef.current) return;
    submittingRef.current = true;
    setNidoError(null);
    setSubmitting(true);
    try {
      const householdId = await ensureHouseholdCreated();
      if (householdId) onComplete();
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  };

  const handleCreateInvite = async () => {
    if (!canStartExclusiveAction(submitting) || submittingRef.current) return null;
    submittingRef.current = true;
    setNidoError(null);
    setInviteCopied(false);
    setSubmitting(true);
    try {
      const householdId = await ensureHouseholdCreated();
      if (!householdId) return null;
      const result = await createInvitation({ householdId });
      if (result.ok === false) {
        setNidoError(result.error.message);
        return null;
      }
      setInviteUrl(result.data.url);
      try {
        await navigator.clipboard.writeText(result.data.url);
        setInviteCopied(true);
      } catch {
        setInviteCopied(false);
      }
      return result.data.url;
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  };

  const handleExpConfirm = (amount: string, type: "personal" | "shared") => {
    if (expEditIdx === null) return;
    const invalid = validateExpenseEntry({ amount, type });
    if (invalid) return;
    setData(p => {
      const expenses = [...p.expenses];
      expenses[expEditIdx] = { ...expenses[expEditIdx], selected: true, amount, type };
      return { ...p, expenses };
    });
    setExpEditIdx(null);
  };

  const authHeading =
    authView === "confirm-email" ? "Revisa tu correo"
      : authView === "forgot" ? "Recupera tu acceso"
        : "Bienvenido";
  const authSub =
    authView === "confirm-email" ? null
      : authView === "forgot" ? "Te enviaremos un enlace para restablecer la contraseña."
        : "Crea una cuenta o inicia sesión para continuar";

  return (
    <div className="relative min-h-screen flex flex-col overflow-hidden" style={{ backgroundColor: P.bgL, fontFamily: "Figtree, sans-serif" }}>
        <div className="flex-1 min-h-0 overflow-y-auto [&::-webkit-scrollbar]:hidden px-6 pt-4 pb-8">

          {step === "welcome" && (
            <div className="flex flex-col h-full">
              <div className="flex-1 flex flex-col items-center justify-center">
                <NidoHouse />
                <div className="text-center mt-2 mb-8">
                  <h1 className="text-4xl font-bold mb-2" style={{ fontFamily: "Fraunces, serif", color: P.text }}>Nido</h1>
                  <p className="text-sm leading-relaxed" style={{ color: P.muted }}>El lugar donde las personas construyen<br />su patrimonio juntas.</p>
                  <p className="text-xs leading-relaxed mt-3" style={{ color: P.muted }}>Una forma sencilla de organizar sus ingresos, gastos y metas en un mismo lugar.</p>
                </div>
              </div>
              <div className="space-y-3">
                <OBtn2 label="Crear cuenta" onClick={() => openAuth("signup")} />
                <OBtn2 label="Iniciar sesión" onClick={() => openAuth("login")} variant="secondary" />
                <p className="text-center text-[11px] leading-relaxed pt-1" style={{ color: P.muted }}>Ideal para parejas, roommates, familias y más.</p>
              </div>
            </div>
          )}

          {step === "auth" && (
            <div className="flex flex-col h-full">
              <button type="button" onClick={() => goTo("welcome")} className="flex items-center gap-1 mb-2" style={{ color: P.muted }}>
                <ChevronLeft size={16}/><span className="text-xs font-medium">Atrás</span>
              </button>
              <div className="flex-1 flex flex-col justify-center">
                <div className="text-center mb-8">
                  <p className="text-xs font-semibold mb-1" style={{ color: P.muted }}>Nido</p>
                  <h2 className="text-3xl font-bold" style={{ fontFamily: "Fraunces, serif", color: P.text }}>{authHeading}</h2>
                  {authSub && (
                    <p className="text-xs mt-1.5 mb-6" style={{ color: P.muted }}>{authSub}</p>
                  )}
                </div>

                {authError && (
                  <p className="text-center text-[11px] mb-4 leading-relaxed" style={{ color: P.danger }}>
                    {authError}
                  </p>
                )}
                <AuthPanel
                  initialView={authView === "login" || authView === "forgot" ? authView : "signup"}
                  onAuthenticated={() => undefined}
                  onViewChange={setAuthView}
                />
              </div>

              <p className="text-center text-[10px] pb-2 leading-relaxed" style={{ color: P.muted }}>
                Al continuar aceptas los{" "}
                <span style={{ color: P.brnDk }}>Términos de uso</span> y la{" "}
                <span style={{ color: P.brnDk }}>Política de privacidad</span>.
              </p>
            </div>
          )}

          {step === "select" && (
            <NidoSelectionScreen
              onCreate={() => applyNidoChoice("create")}
              onJoin={() => applyNidoChoice("join")}
            />
          )}

          {step === "join" && (
            <div>
              <button type="button" onClick={() => goTo(user ? "select" : "auth")} className="mb-4 flex items-center gap-1" style={{ color: P.muted }}><ChevronLeft size={16}/><span className="text-xs font-medium">Atrás</span></button>
              <h2 className="text-2xl font-bold mb-1" style={{ fontFamily: "Fraunces, serif", color: P.text }}>Únete a un Nido</h2>
              <p className="text-xs mb-6" style={{ color: P.muted }}>Pega el enlace o el token de invitación. Solo puedes pertenecer a un Nido.</p>
              <label className="text-xs font-semibold mb-2 block" style={{ color: P.muted }}>Enlace o token de invitación</label>
              <input className="w-full py-3.5 px-4 rounded-2xl text-sm font-semibold border-2 outline-none mb-4"
                style={{ backgroundColor: P.card, borderColor: joinToken ? P.brnDk : P.sub, color: P.text }}
                placeholder="https://…/join/…" value={joinCode} onChange={e => setJoinCode(e.target.value)} />
              {joinCode && !joinToken && (
                <p className="text-[11px] mb-4" style={{ color: P.danger }}>No reconocimos ese enlace o token.</p>
              )}
              <OBtn2
                label="Continuar"
                onClick={() => joinToken && router.push(`/join/${encodeURIComponent(joinToken)}`)}
                disabled={!joinToken}
              />
            </div>
          )}

          {step === "c-type" && (
            <div>
              <button type="button" onClick={() => goTo(user ? "select" : "welcome")} className="mb-4 flex items-center gap-1" style={{ color: P.muted }}><ChevronLeft size={16}/><span className="text-xs font-medium">Atrás</span></button>
              <h2 className="text-2xl font-bold mb-1" style={{ fontFamily: "Fraunces, serif", color: P.text }}>¿Qué tipo de Nido es?</h2>
              <p className="text-xs mb-6" style={{ color: P.muted }}>Esto nos ayuda a configurarlo mejor.</p>
              <div className="grid grid-cols-4 gap-2 mb-6">
                {NEST_TYPES.map(nt => (
                  <button key={nt.label} type="button" onClick={() => set("nestType", nt.label)}
                    className="flex flex-col items-center gap-1.5 py-4 rounded-2xl border-2 transition-all"
                    style={{ borderColor: data.nestType === nt.label ? P.brnDk : "transparent", backgroundColor: data.nestType === nt.label ? P.sagePl : P.sub }}>
                    <span className="text-2xl">{nt.emoji}</span>
                    <span className="text-[9px] font-semibold" style={{ color: P.text }}>{nt.label}</span>
                  </button>
                ))}
              </div>
              <OBtn2 label="Continuar" onClick={() => { if(data.nestType) goTo("c-name"); }} />
            </div>
          )}

          {step === "c-name" && (
            <div>
              <button type="button" onClick={() => goTo(user ? "select" : "auth")} className="mb-4 flex items-center gap-1" style={{ color: P.muted }}><ChevronLeft size={16}/><span className="text-xs font-medium">Atrás</span></button>
              <OProgress2 step={1} total={CREATE_STEPS} />
              <h2 className="text-2xl font-bold mb-1" style={{ fontFamily: "Fraunces, serif", color: P.text }}>Dale nombre a tu Nido</h2>
              <p className="text-xs mb-6" style={{ color: P.muted }}>Algo que lo haga sentir especial. Todavía no se crea nada.</p>
              <input className="w-full py-4 px-4 rounded-2xl text-lg font-semibold border-2 outline-none mb-2 transition-all"
                style={{ backgroundColor: P.card, borderColor: data.nestName ? P.brnDk : P.sub, color: P.text }}
                placeholder="Casa Roma, Depa 502…" value={data.nestName} onChange={e => set("nestName",e.target.value)} />
              <div className="flex flex-wrap gap-2 mb-6">
                {NIDO_NAMES.map(n => (
                  <button key={n} type="button" onClick={() => set("nestName",n)}
                    className="text-xs font-medium px-3 py-1.5 rounded-full border"
                    style={{ borderColor: P.border, backgroundColor: P.sub, color: P.muted }}>{n}</button>
                ))}
              </div>
              {fieldError && <p className="text-[11px] mb-3" style={{ color: P.danger }}>{fieldError}</p>}
              <OBtn2 label="Continuar" onClick={() => {
                const invalid = validateHouseholdName(data.nestName);
                if (invalid) { setFieldError(invalid); return; }
                const normalized = normalizeHouseholdName(data.nestName);
                if (normalized) set("nestName", normalized);
                goTo("p-name");
              }} disabled={!data.nestName.trim()} />
            </div>
          )}

          {step === "c-invite" && (
            <div>
              <button type="button" onClick={() => goTo("p-contrib")} className="mb-4 flex items-center gap-1" style={{ color: P.muted }}><ChevronLeft size={16}/><span className="text-xs font-medium">Atrás</span></button>
              <OProgress2 step={7} total={CREATE_STEPS} />
              <h2 className="text-2xl font-bold mb-1" style={{ fontFamily: "Fraunces, serif", color: P.text }}>Invita a los miembros</h2>
              <p className="text-xs mb-4" style={{ color: P.muted }}>Puedes invitar ahora o hacerlo después. Crear tu Nido no espera a que alguien acepte.</p>
              <div className="flex justify-center mb-6"><NidoHouse /></div>
              {nidoError && (
                <p className="text-[11px] mb-3 leading-relaxed" style={{ color: P.danger }}>{nidoError}</p>
              )}
              <div className="space-y-2 mb-6">
                <button
                  type="button"
                  disabled={submitting}
                  onClick={() => { void handleCreateInvite(); }}
                  className="w-full flex items-center gap-3 p-4 rounded-2xl border text-left"
                  style={{ borderColor: P.border, backgroundColor: P.card, opacity: submitting ? 0.7 : 1 }}>
                  <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ backgroundColor: P.sagePl }}>
                    <Link size={16} style={{ color: P.sageDk }} />
                  </div>
                  <div>
                    <p className="text-xs font-semibold" style={{ color: P.text }}>
                      {submitting ? "Creando tu Nido…" : inviteCopied ? "Enlace copiado" : "Invitar por enlace"}
                    </p>
                    <p className="text-[10px]" style={{ color: P.muted }}>Genera y copia un link. No se envía correo todavía.</p>
                  </div>
                </button>
                <button
                  type="button"
                  disabled={submitting}
                  onClick={async () => {
                    const url = inviteUrl ?? await handleCreateInvite();
                    if (url) setShowQrInvite(true);
                  }}
                  className="w-full flex items-center gap-3 p-4 rounded-2xl border text-left"
                  style={{ borderColor: P.border, backgroundColor: P.card, opacity: submitting ? 0.7 : 1 }}>
                  <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ backgroundColor: P.sagePl }}>
                    <QrCode size={16} style={{ color: P.sageDk }} />
                  </div>
                  <div>
                    <p className="text-xs font-semibold" style={{ color: P.text }}>Invitar por QR</p>
                    <p className="text-[10px]" style={{ color: P.muted }}>Muestra el enlace para unirse al Nido</p>
                  </div>
                </button>
              </div>
              {inviteUrl && (
                <p className="text-[10px] break-all mb-4" style={{ color: P.muted }}>{inviteUrl}</p>
              )}
              <OBtn2
                label={submitting ? "Creando tu Nido…" : createdHouseholdId ? "Entrar a mi Nido 🪺" : "Crear mi Nido 🪺"}
                onClick={() => { void handleCreateNido(); }}
                disabled={submitting}
              />
            </div>
          )}

          {isPers && (
            <div>
              <button type="button" onClick={() => goTo(data.flow==="join"&&step==="p-name"?"join":PERSONAL[pIdx-1]||"c-name")}
                className="mb-4 flex items-center gap-1" style={{ color: P.muted }}><ChevronLeft size={16}/><span className="text-xs font-medium">Atrás</span></button>
              <OProgress2 step={pIdx+2} total={CREATE_STEPS} />

              {step === "p-name" && (
                <>
                  <h2 className="text-2xl font-bold mb-1" style={{ fontFamily: "Fraunces, serif", color: P.text }}>¿Cómo te llamas?</h2>
                  <p className="text-xs mb-5" style={{ color: P.muted }}>Este es el nombre que verán los demás miembros de tu Nido.</p>
                  {identity?.email && (
                    <div className="flex items-center gap-2 mb-5 px-3 py-2 rounded-2xl" style={{ backgroundColor: P.sub }}>
                      <p className="text-[11px]" style={{ color: P.muted }}>
                        Conectado como <span className="font-semibold" style={{ color: P.text }}>{identity.email}</span>
                      </p>
                    </div>
                  )}
                  <div className="flex justify-center mb-5">
                    <div className="w-20 h-20 rounded-full flex items-center justify-center text-3xl font-bold text-white shadow-md overflow-hidden"
                      style={{ backgroundColor: P.brnDk }}>
                      {identity?.avatarUrl
                        ? <img src={identity.avatarUrl} alt="" className="w-full h-full object-cover" />
                        : (data.userName ? data.userName[0].toUpperCase() : "?")}
                    </div>
                  </div>
                  <input className="w-full py-4 px-4 rounded-2xl text-base font-semibold border-2 outline-none mb-2"
                    style={{ backgroundColor: P.card, borderColor: data.userName ? P.brnDk : "rgba(47,42,40,0.15)", color: P.text }}
                    placeholder="Carlos Sardina" value={data.userName} onChange={e => set("userName",e.target.value)} />
                  <p className="text-[11px] mb-6" style={{ color: P.muted }}>Puedes cambiarlo después.</p>
                  {fieldError && <p className="text-[11px] mb-3" style={{ color: P.danger }}>{fieldError}</p>}
                  <OBtn2 label="Continuar" onClick={() => {
                    const invalid = validateDisplayName(data.userName);
                    if (invalid) { setFieldError(invalid); return; }
                    const normalized = normalizeDisplayName(data.userName);
                    if (normalized) set("userName", normalized);
                    goTo("p-income");
                  }} disabled={!data.userName.trim()} />
                </>
              )}
              {step === "p-income" && (
                <>
                  <h2 className="text-2xl font-bold mb-1" style={{ fontFamily: "Fraunces, serif", color: P.text }}>¿Cuánto ganas al mes?</h2>
                  <p className="text-xs mb-6" style={{ color: P.muted }}>Esta información es privada y solo se utiliza para calcular cómo repartir los gastos del Nido.</p>
                  <div className="mb-2">
                    <label className="text-xs font-semibold mb-1.5 block" style={{ color: P.muted }}>Ingreso mensual neto</label>
                    <div className="rounded-2xl border-2 px-4 py-3.5 flex items-center gap-1"
                      style={{ backgroundColor: P.card, borderColor: data.salary ? P.brnDk : P.sub }}>
                      <span className="text-base font-normal flex-shrink-0" style={{ color: P.muted }}>$</span>
                      <input className="flex-1 text-base bg-transparent outline-none"
                        style={{ color: P.text }}
                        type="text" inputMode="decimal" placeholder="40,000"
                        value={formatMoneyInput(data.salary)}
                        onChange={e => set("salary", e.target.value.replace(/[^0-9.]/g,""))} />
                    </div>
                  </div>
                  <p className="text-[11px] mb-6" style={{ color: P.muted }}>Puedes cambiarlo después.</p>
                  {fieldError && <p className="text-[11px] mb-3" style={{ color: P.danger }}>{fieldError}</p>}
                  <OBtn2 label="Continuar" onClick={() => {
                    const invalid = validateIncome(data.salary);
                    if (invalid) { setFieldError(invalid); return; }
                    goTo("p-savings");
                  }} disabled={!data.salary} />
                </>
              )}
              {step === "p-savings" && (
                <>
                  <h2 className="text-2xl font-bold mb-1" style={{ fontFamily: "Fraunces, serif", color: P.text }}>¿Cuánto tienes ahorrado?</h2>
                  <p className="text-xs mb-5" style={{ color: P.muted }}>Puedes registrar tus ahorros personales y los que ya comparten como hogar.</p>

                  <p className="text-[9px] font-semibold uppercase tracking-widest mb-2" style={{ color: P.muted }}>Ahorros personales</p>
                  <div className="rounded-2xl border-2 px-4 py-3 flex items-center gap-1 mb-3"
                    style={{ backgroundColor: P.card, borderColor: data.savings ? P.brnDk : P.sub }}>
                    <span className="text-base font-normal flex-shrink-0" style={{ color: P.muted }}>$</span>
                    <input className="flex-1 text-base bg-transparent outline-none"
                      style={{ color: P.text }}
                      type="text" inputMode="decimal" placeholder="0.00"
                      value={formatMoneyInput(data.savings)}
                      onChange={e => set("savings", e.target.value.replace(/[^0-9.]/g,""))} />
                  </div>

                  <p className="text-[9px] font-semibold uppercase tracking-widest mb-2" style={{ color: P.muted }}>Ahorros compartidos</p>
                  <div className="rounded-2xl border-2 px-4 py-3 flex items-center gap-1 mb-2"
                    style={{ backgroundColor: P.card, borderColor: data.savingsShared ? P.brnDk : P.sub }}>
                    <span className="text-base font-normal flex-shrink-0" style={{ color: P.muted }}>$</span>
                    <input className="flex-1 text-base bg-transparent outline-none"
                      style={{ color: P.text }}
                      type="text" inputMode="decimal" placeholder="0.00"
                      value={formatMoneyInput(data.savingsShared)}
                      onChange={e => set("savingsShared", e.target.value.replace(/[^0-9.]/g,""))} />
                  </div>
                  <p className="text-[11px] mb-6" style={{ color: P.muted }}>Ambos son opcionales.</p>
                  {fieldError && <p className="text-[11px] mb-3" style={{ color: P.danger }}>{fieldError}</p>}
                  <OBtn2 label="Continuar" onClick={() => {
                    const invalid = validateSavings(data.savings, data.savingsShared);
                    if (invalid) { setFieldError(invalid); return; }
                    goTo("p-expenses");
                  }} />
                </>
              )}
              {step === "p-expenses" && (() => {
                const showAddCustom = data._showAdd ?? false;
                const setShowAddCustom = (v: boolean) => setData(p => ({ ...p, _showAdd: v }));
                const customEmoji = data._emoji ?? "💳";
                const setCustomEmoji = (v: string) => setData(p => ({ ...p, _emoji: v }));
                const customName = data._cname ?? "";
                const setCustomName = (v: string) => setData(p => ({ ...p, _cname: v }));
                const customEtype = data._etype ?? "personal";
                const setCustomEtype = (v: "personal"|"shared") => setData(p => ({ ...p, _etype: v }));

                const addCustom = () => {
                  const nameError = validateCustomExpenseName(customName);
                  if (nameError) { setFieldError(nameError); return; }
                  if (customEtype !== "personal" && customEtype !== "shared") {
                    setFieldError("Elige si el gasto es personal o compartido.");
                    return;
                  }
                  const name = normalizeCustomExpenseName(customName);
                  if (!name) return;
                  setFieldError(null);
                  const n = [...data.expenses, { name, icon: customEmoji, selected: false, amount: "", type: customEtype, kind: "variable" as const }];
                  setData(p => ({ ...p, expenses: n, _showAdd: false, _cname: "", _emoji: "💳", _etype: "personal" } as OData));
                };

                const QUICK_EMOJIS = ["💳","🎓","🏋️","🛍️","💅","🍺","🐱","🐕","🏥","✈️","📚","🎮","🧘","🚲","🎸"];
                const isQuickEmoji = QUICK_EMOJIS.includes(customEmoji);
                const setEmojiFromInput = (value: string) => {
                  if (!value) { setCustomEmoji("💳"); return; }
                  setCustomEmoji([...value].pop() ?? "💳");
                };

                const renderExpense = (exp: OData["expenses"][number], i: number) => {
                  const done = exp.selected && !!exp.amount;
                  return (
                    <button key={`${exp.name}-${i}`} type="button"
                      onClick={() => setExpEditIdx(i)}
                      className="w-full flex items-center gap-3 p-3.5 rounded-2xl border-2 transition-all text-left"
                      style={{
                        borderColor: done ? P.brnDk : "rgba(47,42,40,0.15)",
                        backgroundColor: P.card,
                      }}>
                      <div className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0"
                        style={{ backgroundColor: done ? P.brnDk : "transparent", border: `2px solid ${done ? P.brnDk : "rgba(47,42,40,0.2)"}` }}>
                        {done && <Check size={12} color="#fff" />}
                      </div>
                      <span className="text-sm flex-shrink-0">{exp.icon}</span>
                      <span className="text-xs font-medium flex-1 text-left truncate" style={{ color: P.text }}>{exp.name}</span>
                      {done && (
                        <>
                          <span className="text-xs font-bold flex-shrink-0" style={{ color: P.text }}>
                            ${(parseMoneyInput(exp.amount) ?? 0).toLocaleString("es-MX")}
                          </span>
                          <span className="text-sm flex-shrink-0 ml-1">
                            {exp.type === "personal" ? "👤" : "🏠"}
                          </span>
                        </>
                      )}
                    </button>
                  );
                };

                const recurring = data.expenses
                  .map((exp, i) => ({ exp, i }))
                  .filter(({ exp }) => exp.kind !== "variable");
                const variable = data.expenses
                  .map((exp, i) => ({ exp, i }))
                  .filter(({ exp }) => exp.kind === "variable");

                return (
                  <>
                    <h2 className="text-2xl font-bold mb-1" style={{ fontFamily: "Fraunces, serif", color: P.text }}>Gastos mensuales estimados</h2>
                    <p className="text-xs mb-4" style={{ color: P.muted }}>Toca un gasto para agregar el monto mensual y definir si es personal o compartido.</p>

                    <p className="text-[9px] font-semibold uppercase tracking-widest mb-2" style={{ color: P.muted }}>Recurrentes / fijos</p>
                    <div className="space-y-2 mb-4">
                      {recurring.map(({ exp, i }) => renderExpense(exp, i))}
                    </div>

                    <p className="text-[9px] font-semibold uppercase tracking-widest mb-2" style={{ color: P.muted }}>Variables</p>
                    <div className="space-y-2 mb-3">
                      {variable.map(({ exp, i }) => renderExpense(exp, i))}
                    </div>

                    {!showAddCustom ? (
                      <button type="button" onClick={() => setShowAddCustom(true)}
                        className="w-full flex items-center gap-2 py-3 px-4 rounded-2xl border-2 border-dashed mb-3 transition-all"
                        style={{ borderColor: P.border, backgroundColor: "transparent", color: P.muted }}>
                        <span className="text-base">➕</span>
                        <span className="text-xs font-semibold">Agregar otro gasto</span>
                      </button>
                    ) : (
                      <div className="rounded-2xl border-2 p-4 mb-3" style={{ borderColor: P.brnDk, backgroundColor: P.sagePl }}>
                        <p className="text-[9px] font-semibold uppercase tracking-widest mb-3" style={{ color: P.muted }}>Nuevo gasto personalizado</p>
                        <div className="flex gap-1.5 overflow-x-auto [&::-webkit-scrollbar]:hidden mb-3 pb-0.5">
                          {QUICK_EMOJIS.map(e => (
                            <button key={e} type="button" onClick={() => setCustomEmoji(e)}
                              className="flex-shrink-0 w-9 h-9 rounded-xl flex items-center justify-center text-lg transition-all"
                              style={{ backgroundColor: customEmoji === e ? P.brnDk + "20" : P.card, border: `2px solid ${customEmoji === e ? P.brnDk : "transparent"}` }}>
                              {e}
                            </button>
                          ))}
                          <input
                            type="text"
                            aria-label="Otro emoji"
                            placeholder="＋"
                            className="flex-shrink-0 w-9 h-9 rounded-xl text-lg text-center outline-none border-2 transition-all"
                            style={{
                              backgroundColor: !isQuickEmoji ? P.brnDk + "20" : P.card,
                              borderColor: !isQuickEmoji ? P.brnDk : "transparent",
                              color: P.text,
                            }}
                            value={!isQuickEmoji ? customEmoji : ""}
                            onChange={e => setEmojiFromInput(e.target.value)}
                          />
                        </div>
                        <div className="flex gap-2 mb-3">
                          <input
                            type="text"
                            aria-label="Emoji del gasto"
                            className="w-10 h-10 rounded-xl text-xl text-center outline-none border-2 flex-shrink-0"
                            style={{ backgroundColor: P.card, borderColor: P.brnDk, color: P.text }}
                            value={customEmoji}
                            onChange={e => setEmojiFromInput(e.target.value)}
                          />
                          <input
                            className="flex-1 rounded-xl px-3 py-2 text-xs font-medium outline-none border-2"
                            style={{ backgroundColor: P.card, borderColor: customName ? P.brnDk : P.border, color: P.text }}
                            placeholder="Nombre del gasto (ej. Masajes)"
                            value={customName}
                            onChange={e => setCustomName(e.target.value)}
                          />
                        </div>
                        <div className="flex gap-1.5 mb-3">
                          {([{ val: "personal" as const, label: "Personal", emoji: "👤" }, { val: "shared" as const, label: "Compartido", emoji: "🏠" }]).map(t => (
                            <button key={t.val} type="button" onClick={() => setCustomEtype(t.val)}
                              className="flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-semibold transition-all"
                              style={{ backgroundColor: customEtype === t.val ? P.brnDk : P.card, color: customEtype === t.val ? "#fff" : P.muted }}>
                              <span>{t.emoji}</span>{t.label}
                            </button>
                          ))}
                        </div>
                        <div className="flex gap-2">
                          <button type="button" onClick={() => { setShowAddCustom(false); setFieldError(null); }}
                            className="flex-1 py-2.5 rounded-xl text-xs font-semibold border"
                            style={{ borderColor: P.border, backgroundColor: P.card, color: P.muted }}>
                            Cancelar
                          </button>
                          <button type="button" onClick={addCustom} disabled={!customName.trim()}
                            className="flex-1 py-2.5 rounded-xl text-xs font-semibold transition-all"
                            style={{ backgroundColor: customName.trim() ? P.brnDk : P.sub, color: customName.trim() ? "#fff" : P.muted }}>
                            Agregar
                          </button>
                        </div>
                        {fieldError && <p className="text-[11px] mt-2" style={{ color: P.danger }}>{fieldError}</p>}
                      </div>
                    )}

                  </>
                );
              })()}
              {step === "p-contrib" && (
                <>
                  <h2 className="text-2xl font-bold mb-1" style={{ fontFamily: "Fraunces, serif", color: P.text }}>¿Cómo dividir los gastos?</h2>
                  <p className="text-xs mb-5" style={{ color: P.muted }}>Puedes cambiarlo cuando quieras. Los datos de otras personas se podrán completar después.</p>
                  <div className="space-y-2 mb-4">
                    {([
                      { id:"equal" as Model,        emoji:"⚖️", label:"Por partes iguales",         sub:"Los gastos compartidos se dividen en partes iguales." },
                      { id:"proportional" as Model, emoji:"📊", label:"Proporcional al ingreso",     sub:"Cada persona aporta según su porcentaje del ingreso total." },
                      { id:"capacity" as Model,     emoji:"💡", label:"Capacidad de aportación",     sub:"Cada persona aporta según lo que le queda después de cubrir sus gastos personales.", rec:true },
                    ] as const).map(opt => (
                      <button key={opt.id} type="button" onClick={() => set("contrib",opt.id)}
                        className="w-full flex items-center gap-3 p-4 rounded-2xl border-2 text-left transition-all"
                        style={{ borderColor: data.contrib===opt.id ? P.brnDk : "rgba(47,42,40,0.15)", backgroundColor: P.card }}>
                        <span className="text-xl flex-shrink-0">{opt.emoji}</span>
                        <div className="flex-1">
                          <p className="text-xs font-semibold" style={{ color: P.text }}>{opt.label}</p>
                          <p className="text-[9px]" style={{ color: P.muted }}>{opt.sub}</p>
                        </div>
                        {"rec" in opt && opt.rec && (
                          <span className="text-[9px] font-bold rounded-full px-2 py-0.5" style={{ backgroundColor: P.brnDk, color:"#fff" }}>✦ IDEAL</span>
                        )}
                      </button>
                    ))}
                  </div>
                  {contribHint && (
                    <p className="text-[11px] mb-3 leading-relaxed" style={{ color: P.muted }}>{contribHint}</p>
                  )}
                  {nidoError && (
                    <p className="text-[11px] mb-3 leading-relaxed" style={{ color: P.danger }}>{nidoError}</p>
                  )}
                  <OBtn2
                    label="Continuar"
                    onClick={() => goTo("c-invite")}
                  />
                </>
              )}
            </div>
          )}

          {step === "nest-ready" && (
            <div className="flex flex-col h-full">
              <div className="flex-1 flex flex-col items-center justify-center text-center">
                <NidoHouse />
                <h2 className="text-2xl font-bold mt-4 mb-1" style={{ fontFamily: "Fraunces, serif", color: P.text }}>¡Tu Nido está listo!</h2>
                <p className="text-xs mb-6" style={{ color: P.muted }}>Puedes entrar ahora e invitar a más personas cuando quieras.</p>
                <div className="w-full p-3 rounded-2xl flex gap-2 mb-2" style={{ backgroundColor: P.sagePl }}>
                  <Sparkles size={13} style={{ color: P.sageDk, flexShrink:0, marginTop:1 }} />
                  <p className="text-[10px] leading-relaxed" style={{ color: P.text }}>Un Nido puede ser de una persona o de muchas. Los datos financieros de esta pantalla siguen siendo de demostración.</p>
                </div>
              </div>
              <OBtn2 label="Entrar a mi Nido 🪺" onClick={onComplete} />
            </div>
          )}
        </div>

        {step === "p-expenses" && (
          <div className="flex-shrink-0 px-6 pb-6 pt-3 border-t" style={{ backgroundColor: P.bgL, borderColor: P.border }}>
            <button type="button" onClick={() => expCanContinue && goTo("p-contrib")}
              className="w-full py-4 rounded-2xl font-semibold text-sm transition-all active:scale-[0.98]"
              style={{ backgroundColor: expCanContinue ? P.brnDk : P.sub, color: expCanContinue ? "#fff" : P.muted, cursor: expCanContinue ? "pointer" : "not-allowed" }}>
              Continuar
            </button>
          </div>
        )}

        {expEditIdx !== null && (
          <ExpenseEntryModal
            exp={data.expenses[expEditIdx]}
            onConfirm={handleExpConfirm}
            onClose={() => setExpEditIdx(null)}
          />
        )}

        {showQrInvite && inviteUrl && (
          <InviteQrModal
            inviteUrl={inviteUrl}
            nestName={data.nestName}
            onClose={() => setShowQrInvite(false)}
          />
        )}
    </div>
  );
}
