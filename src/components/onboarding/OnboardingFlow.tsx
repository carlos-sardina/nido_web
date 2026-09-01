"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Check, Link, QrCode, Sparkles,
} from "lucide-react";
import type { User } from "@supabase/supabase-js";
import { AuthPanel, type AuthView } from "@/components/auth/AuthPanel";
import { CONFIRM_EMAIL_HEADING } from "@/lib/auth/credentials";
import { resolveNidoChoice } from "@/lib/auth/destination";
import { identityFromUser, isFallbackDisplayName, suggestedOnboardingDisplayName } from "@/lib/auth/identity";
import { createHouseholdFromOnboarding } from "@/lib/nido/household";
import { planOnboardingFinances } from "@/lib/onboarding/financial-plan";
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
  validateSavings,
} from "@/lib/onboarding/validation";
import { EXP_SUGG, NEST_TYPES, NIDO_NAMES } from "@/lib/constants";
import { DEFAULT_CATEGORY_EMOJI, resolveCategoryIcon } from "@/lib/nido/financial/category-icon";
import { P } from "@/lib/palette";
import type { Model, OStep, OData } from "@/lib/types";
import { InviteQrModal } from "@/components/flows/InviteQrModal";
import { NidoHouse } from "@/components/shared/NidoHouse";
import { ExpenseEntryModal } from "@/components/onboarding/ExpenseEntryModal";
import { OProgress2 } from "@/components/onboarding/OProgress2";
import { NidoSelectionScreen } from "@/components/onboarding/NidoSelectionScreen";
import { Button } from "@/components/nido/Button";
import { ChoiceCard, SectionLabel } from "@/components/nido/ChoiceCard";
import { CategoryCreateFields } from "@/components/nido/CategoryEmojiField";
import { Field, FieldError, FieldLabel, HelperText, MoneyField, TextInput } from "@/components/nido/Field";
import { BackLink, FlowScreen, ScreenFooter, ScreenIntro } from "@/components/nido/Screen";
import { Text } from "@/components/nido/Typography";

const CREATE_STEPS = 7;

export function OnboardingFlow({
  onComplete,
  user,
  entry = "welcome",
  onLogout,
}: {
  onComplete: () => void;
  user: User | null;
  entry?: "welcome" | "select";
  onLogout?: () => void;
}) {
  const router = useRouter();
  const restored = useRef(false);
  const ids = useId();
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
  const fieldErrorId = `${ids}-field-error`;

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
    setData(p => {
      const keepTypedName =
        Boolean(p.userName.trim()) &&
        !isFallbackDisplayName({ displayName: p.userName, email: identity?.email });
      return {
        ...p,
        flow: choice,
        userName: keepTypedName ? p.userName : suggestedOnboardingDisplayName(identity),
      };
    });
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
          userName: isFallbackDisplayName({
            displayName: draft.data.userName,
            email: user.email,
          })
            ? ""
            : draft.data.userName,
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
    const displayName = normalizeDisplayName(
      data.userName || suggestedOnboardingDisplayName(identity),
    );
    if (!displayName) {
      return { ok: false as const, error: { message: "Ingresa el nombre que verán los demás miembros." } };
    }
    return updateMyDisplayName(displayName);
  };

  const ensureHouseholdCreated = async (): Promise<string | null> => {
    if (createdHouseholdId) return createdHouseholdId;

    const plan = planOnboardingFinances(data);
    if (plan.ok === false) {
      setNidoError(plan.error);
      return null;
    }

    if (plan.plan.householdName !== data.nestName) {
      setData((prev) => ({ ...prev, nestName: plan.plan.householdName }));
    }

    const nameResult = await persistDisplayName();
    if (nameResult.ok === false) {
      setNidoError(nameResult.error.message);
      return null;
    }

    const result = await createHouseholdFromOnboarding({
      name: plan.plan.householdName,
      incomeAmount: plan.plan.income.amount ?? 0,
      splitMethod: plan.plan.splitMethod,
      savingsPersonal: plan.plan.savingsPersonal.persist ? plan.plan.savingsPersonal.amount : null,
      savingsShared: plan.plan.savingsShared.persist ? plan.plan.savingsShared.amount : null,
      estimates: plan.plan.estimates,
    });
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
    authView === "confirm-email" ? CONFIRM_EMAIL_HEADING
      : authView === "forgot" ? "Recupera tu acceso"
        : authView === "login" ? "Iniciar sesión"
          : "Crea tu cuenta";
  const authSub =
    authView === "confirm-email" ? null
      : authView === "forgot" ? "Te enviaremos un enlace para restablecer la contraseña."
        : authView === "login" ? "Usa el correo con el que te registraste."
          : "Ingresa tu correo y elige una contraseña.";

  return (
    <FlowScreen
      lockViewport={step === "p-expenses"}
      footer={step === "p-expenses" ? (
        <ScreenFooter>
          <Button
            disabled={!expCanContinue}
            onClick={() => expCanContinue && goTo("p-contrib")}
          >
            Continuar
          </Button>
        </ScreenFooter>
      ) : undefined}
    >
          {step === "welcome" && (
            <div className="flex flex-col flex-1">
              <div className="flex-1 flex flex-col items-center justify-center">
                <NidoHouse />
                <ScreenIntro
                  className="mt-6"
                  align="center"
                  titleSize="display"
                  title="Bienvenido"
                  brand={
                    <>
                      El lugar donde las personas construyen
                      <br />
                      su patrimonio juntas.
                    </>
                  }
                  description="Crea una cuenta o inicia sesión para continuar."
                />
              </div>
              <div className="space-y-3 mt-8">
                <Button onClick={() => openAuth("signup")}>Crear cuenta</Button>
                <Button variant="secondary" onClick={() => openAuth("login")}>Iniciar sesión</Button>
              </div>
            </div>
          )}

          {step === "auth" && (
            <div className="flex flex-col flex-1">
              <BackLink onClick={() => goTo("welcome")} />
              <div className="flex-1 flex flex-col justify-center">
                <ScreenIntro className="mb-8" align="center" title={authHeading} description={authSub} />
                {authError && <FieldError className="mb-4 text-center">{authError}</FieldError>}
                <AuthPanel
                  initialView={authView === "login" || authView === "forgot" ? authView : "signup"}
                  onAuthenticated={() => undefined}
                  onViewChange={setAuthView}
                />
              </div>
            </div>
          )}

          {step === "select" && (
            <NidoSelectionScreen
              onCreate={() => applyNidoChoice("create")}
              onJoin={() => applyNidoChoice("join")}
              onLogout={onLogout}
            />
          )}

          {step === "join" && (
            <div>
              <BackLink onClick={() => goTo(user ? "select" : "auth")} />
              <ScreenIntro
                className="mb-8"
                title="Únete a un Nido"
                description="Pega el enlace o el token de invitación. Solo puedes pertenecer a un Nido."
              />
              <Field className="mb-6">
                <FieldLabel htmlFor={`${ids}-join`}>Enlace o token de invitación</FieldLabel>
                <TextInput
                  id={`${ids}-join`}
                  placeholder="https://…/join/…"
                  value={joinCode}
                  filled={Boolean(joinToken)}
                  invalid={Boolean(joinCode) && !joinToken}
                  onChange={e => setJoinCode(e.target.value)}
                />
              </Field>
              {joinCode && !joinToken && (
                <FieldError className="mb-4">No reconocimos ese enlace o token.</FieldError>
              )}
              <Button
                onClick={() => joinToken && router.push(`/join/${encodeURIComponent(joinToken)}`)}
                disabled={!joinToken}
              >
                Continuar
              </Button>
            </div>
          )}

          {step === "c-type" && (
            <div>
              <BackLink onClick={() => goTo(user ? "select" : "welcome")} />
              <ScreenIntro
                className="mb-8"
                title="¿Qué tipo de Nido es?"
                description="Esto nos ayuda a configurarlo mejor."
              />
              <div className="grid grid-cols-4 gap-2 mb-8">
                {NEST_TYPES.map(nt => (
                  <button
                    key={nt.label}
                    type="button"
                    onClick={() => set("nestType", nt.label)}
                    aria-pressed={data.nestType === nt.label}
                    className="flex flex-col items-center gap-2 py-4 rounded-2xl border-2 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    style={{
                      borderColor: data.nestType === nt.label ? P.brnDk : "transparent",
                      backgroundColor: data.nestType === nt.label ? P.sagePl : P.sub,
                    }}
                  >
                    <span className="text-h2" aria-hidden="true">{nt.emoji}</span>
                    <span className="text-caption font-semibold text-foreground">{nt.label}</span>
                  </button>
                ))}
              </div>
              <Button onClick={() => { if (data.nestType) goTo("c-name"); }} disabled={!data.nestType}>
                Continuar
              </Button>
            </div>
          )}

          {step === "c-name" && (
            <div>
              <BackLink onClick={() => goTo(user ? "select" : "auth")} />
              <OProgress2 step={1} total={CREATE_STEPS} />
              <ScreenIntro
                className="mb-8"
                emoji="🪺"
                title="Dale nombre a tu Nido"
                description="Elige un nombre que represente el espacio que están construyendo juntos. Todavía no se crea nada."
              />
              <Field className="mb-4">
                <FieldLabel htmlFor={`${ids}-nest`}>Nombre del Nido</FieldLabel>
                <TextInput
                  id={`${ids}-nest`}
                  placeholder="Casa Roma, Depa 502…"
                  value={data.nestName}
                  filled={Boolean(data.nestName)}
                  invalid={Boolean(fieldError)}
                  aria-describedby={fieldError ? fieldErrorId : undefined}
                  onChange={e => set("nestName", e.target.value)}
                />
              </Field>
              <div className="flex flex-wrap gap-2 mb-8">
                {NIDO_NAMES.map(n => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => set("nestName", n)}
                    className="text-caption font-medium px-3 h-8 rounded-full border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    style={{ borderColor: P.border, backgroundColor: P.sub, color: P.muted }}
                  >
                    {n}
                  </button>
                ))}
              </div>
              {fieldError && <FieldError id={fieldErrorId} className="mb-4">{fieldError}</FieldError>}
              <Button
                onClick={() => {
                  const invalid = validateHouseholdName(data.nestName);
                  if (invalid) { setFieldError(invalid); return; }
                  const normalized = normalizeHouseholdName(data.nestName);
                  if (normalized) set("nestName", normalized);
                  goTo("p-name");
                }}
                disabled={!data.nestName.trim()}
              >
                Continuar
              </Button>
            </div>
          )}

          {step === "c-invite" && (
            <div>
              <BackLink onClick={() => goTo("p-contrib")} />
              <OProgress2 step={7} total={CREATE_STEPS} />
              <ScreenIntro
                className="mb-6"
                title="Invita a los miembros"
                description="Puedes invitar ahora o hacerlo después. Crear tu Nido no espera a que alguien acepte."
              />
              <div className="flex justify-center mb-6"><NidoHouse /></div>
              {nidoError && <FieldError className="mb-4">{nidoError}</FieldError>}
              <div className="space-y-3 mb-8">
                <ChoiceCard
                  icon={<Link size={16} style={{ color: P.sageDk }} />}
                  title={submitting ? "Creando tu Nido…" : inviteCopied ? "Enlace copiado" : "Invitar por enlace"}
                  description="Comparte este enlace con la persona que quieres invitar."
                  disabled={submitting}
                  onClick={() => { void handleCreateInvite(); }}
                />
                <ChoiceCard
                  icon={<QrCode size={16} style={{ color: P.sageDk }} />}
                  title="Invitar por QR"
                  description="Muestra un código para unirse al Nido."
                  disabled={submitting}
                  onClick={async () => {
                    const url = inviteUrl ?? await handleCreateInvite();
                    if (url) setShowQrInvite(true);
                  }}
                />
              </div>
              <Button
                onClick={() => { void handleCreateNido(); }}
                disabled={submitting}
                loading={submitting}
              >
                {submitting ? "Creando tu Nido…" : createdHouseholdId ? "Entrar a mi Nido 🪺" : "Crear mi Nido 🪺"}
              </Button>
            </div>
          )}

          {isPers && (
            <div className={step === "p-expenses" ? "flex min-h-0 flex-1 flex-col" : undefined}>
              <div className={step === "p-expenses" ? "shrink-0" : undefined}>
                <BackLink onClick={() => goTo(data.flow==="join"&&step==="p-name"?"join":PERSONAL[pIdx-1]||"c-name")} />
                <OProgress2 step={pIdx+2} total={CREATE_STEPS} />
                {step === "p-expenses" && (
                  <ScreenIntro
                    className="mb-4"
                    title="Gastos mensuales estimados"
                    description="Toca un gasto para agregar el monto mensual y definir si es personal o compartido."
                  />
                )}
              </div>

              {step === "p-name" && (
                <>
                  <ScreenIntro
                    className="mb-6"
                    title="¿Cómo te llamas?"
                    description="Este es el nombre que verán los demás miembros de tu Nido."
                  />
                  <div className="flex justify-center mb-6">
                    <div
                      className="w-20 h-20 rounded-full flex items-center justify-center text-h1 font-bold text-white shadow-md overflow-hidden"
                      style={{ backgroundColor: P.brnDk }}
                    >
                      {identity?.avatarUrl
                        ? <img src={identity.avatarUrl} alt="" className="w-full h-full object-cover" />
                        : (data.userName ? data.userName[0].toUpperCase() : "?")}
                    </div>
                  </div>
                  <Field className="mb-2">
                    <FieldLabel htmlFor={`${ids}-user`}>Tu nombre</FieldLabel>
                    <TextInput
                      id={`${ids}-user`}
                      placeholder="Carlos Sardina"
                      value={data.userName}
                      filled={Boolean(data.userName)}
                      invalid={Boolean(fieldError)}
                      aria-describedby={fieldError ? fieldErrorId : undefined}
                      onChange={e => set("userName", e.target.value)}
                    />
                  </Field>
                  <HelperText className="mb-8">Puedes cambiarlo después.</HelperText>
                  {fieldError && <FieldError id={fieldErrorId} className="mb-4">{fieldError}</FieldError>}
                  <Button
                    onClick={() => {
                      const invalid = validateDisplayName(data.userName);
                      if (invalid) { setFieldError(invalid); return; }
                      const normalized = normalizeDisplayName(data.userName);
                      if (normalized) set("userName", normalized);
                      goTo("p-income");
                    }}
                    disabled={!data.userName.trim()}
                  >
                    Continuar
                  </Button>
                </>
              )}
              {step === "p-income" && (
                <>
                  <ScreenIntro
                    className="mb-8"
                    title="¿Cuánto ganas al mes?"
                    description="Esta información es privada y solo se utiliza para calcular cómo repartir los gastos del Nido."
                  />
                  <div className="mb-2">
                    <MoneyField
                      id={`${ids}-salary`}
                      label="Ingreso mensual neto"
                      placeholder="40,000"
                      value={formatMoneyInput(data.salary)}
                      invalid={Boolean(fieldError)}
                      describedBy={fieldError ? fieldErrorId : undefined}
                      onChange={(value) => set("salary", value)}
                    />
                  </div>
                  <HelperText className="mb-8">Puedes cambiarlo después.</HelperText>
                  {fieldError && <FieldError id={fieldErrorId} className="mb-4">{fieldError}</FieldError>}
                  <Button
                    onClick={() => {
                      const invalid = validateIncome(data.salary);
                      if (invalid) { setFieldError(invalid); return; }
                      goTo("p-savings");
                    }}
                    disabled={!data.salary}
                  >
                    Continuar
                  </Button>
                </>
              )}
              {step === "p-savings" && (
                <>
                  <ScreenIntro
                    className="mb-6"
                    title="¿Cuánto tienes ahorrado?"
                    description="Puedes registrar tus ahorros personales y los que ya comparten como hogar."
                  />
                  <div className="mb-4">
                    <MoneyField
                      id={`${ids}-savings`}
                      label="Ahorros personales"
                      placeholder="0.00"
                      value={formatMoneyInput(data.savings)}
                      invalid={Boolean(fieldError)}
                      describedBy={fieldError ? fieldErrorId : undefined}
                      onChange={(value) => set("savings", value)}
                    />
                  </div>
                  <div className="mb-2">
                    <MoneyField
                      id={`${ids}-savings-shared`}
                      label="Ahorros compartidos"
                      placeholder="0.00"
                      value={formatMoneyInput(data.savingsShared)}
                      invalid={Boolean(fieldError)}
                      describedBy={fieldError ? fieldErrorId : undefined}
                      onChange={(value) => set("savingsShared", value)}
                    />
                  </div>
                  <HelperText className="mb-8">Ambos son opcionales.</HelperText>
                  {fieldError && <FieldError id={fieldErrorId} className="mb-4">{fieldError}</FieldError>}
                  <Button
                    onClick={() => {
                      const invalid = validateSavings(data.savings, data.savingsShared);
                      if (invalid) { setFieldError(invalid); return; }
                      goTo("p-expenses");
                    }}
                  >
                    Continuar
                  </Button>
                </>
              )}
              {step === "p-expenses" && (() => {
                const showAddCustom = data._showAdd ?? false;
                const setShowAddCustom = (v: boolean) => setData(p => ({ ...p, _showAdd: v }));
                const customEmoji = data._emoji ?? DEFAULT_CATEGORY_EMOJI;
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
                  const n = [...data.expenses, { name, icon: resolveCategoryIcon(customEmoji), selected: false, amount: "", type: customEtype, kind: "variable" as const, custom: true }];
                  setData(p => ({ ...p, expenses: n, _showAdd: false, _cname: "", _emoji: DEFAULT_CATEGORY_EMOJI, _etype: "personal" } as OData));
                };

                const renderExpense = (exp: OData["expenses"][number], i: number) => {
                  const done = exp.selected && !!exp.amount;
                  return (
                    <button
                      key={`${exp.name}-${i}`}
                      type="button"
                      onClick={() => setExpEditIdx(i)}
                      className="w-full flex items-center gap-3 p-4 rounded-2xl border-2 transition-all text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      style={{
                        borderColor: done ? P.brnDk : P.sub,
                        backgroundColor: P.card,
                      }}
                    >
                      <div
                        className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0"
                        style={{ backgroundColor: done ? P.brnDk : "transparent", border: `2px solid ${done ? P.brnDk : P.sub}` }}
                      >
                        {done && <Check size={12} color="#fff" />}
                      </div>
                      <span className="text-body-sm flex-shrink-0" aria-hidden="true">{exp.icon}</span>
                      <span className="text-label font-medium flex-1 text-left truncate text-foreground">{exp.name}</span>
                      {done && (
                        <>
                          <span className="text-label font-bold flex-shrink-0 text-foreground">
                            ${(parseMoneyInput(exp.amount) ?? 0).toLocaleString("es-MX")}
                          </span>
                          <span className="text-body-sm flex-shrink-0 ml-1" aria-hidden="true">
                            {exp.type === "personal" ? "👤" : "🏠"}
                          </span>
                          <span className="sr-only">
                            {exp.type === "personal" ? "Personal" : "Compartido"}
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
                  <div
                    className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain pb-6"
                    role="region"
                    aria-label="Lista de gastos mensuales"
                  >
                    <SectionLabel>Recurrentes / fijos</SectionLabel>
                    <div className="space-y-2 mb-6">
                      {recurring.map(({ exp, i }) => renderExpense(exp, i))}
                    </div>

                    <SectionLabel>Variables</SectionLabel>
                    <div className="space-y-2 mb-4">
                      {variable.map(({ exp, i }) => renderExpense(exp, i))}
                    </div>

                    {!showAddCustom ? (
                      <button
                        type="button"
                        onClick={() => setShowAddCustom(true)}
                        className="w-full flex items-center gap-2 h-14 px-4 rounded-2xl border-2 border-dashed mb-4 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        style={{ borderColor: P.border, backgroundColor: "transparent", color: P.muted }}
                      >
                        <span className="text-body" aria-hidden="true">➕</span>
                        <span className="text-sm font-semibold">Agregar otro gasto</span>
                      </button>
                    ) : (
                      <div className="rounded-2xl border-2 p-4 mb-4 space-y-4" style={{ borderColor: P.brnDk, backgroundColor: P.sagePl }}>
                        <SectionLabel>Nuevo gasto personalizado</SectionLabel>
                        <CategoryCreateFields
                          emoji={customEmoji}
                          onEmojiChange={setCustomEmoji}
                          name={customName}
                          onNameChange={setCustomName}
                          namePlaceholder="Nombre del gasto (ej. Masajes)"
                          onNameKeyDown={(event) => {
                            if (event.key === "Enter") {
                              event.preventDefault();
                              addCustom();
                            }
                          }}
                        />
                        <div className="flex gap-2">
                          {([{ val: "personal" as const, label: "Personal", emoji: "👤" }, { val: "shared" as const, label: "Compartido", emoji: "🏠" }]).map(t => (
                            <button
                              key={t.val}
                              type="button"
                              onClick={() => setCustomEtype(t.val)}
                              aria-pressed={customEtype === t.val}
                              className="flex items-center gap-1 px-3 h-8 rounded-full text-caption font-semibold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                              style={{ backgroundColor: customEtype === t.val ? P.brnDk : P.card, color: customEtype === t.val ? "#fff" : P.muted }}
                            >
                              <span aria-hidden="true">{t.emoji}</span>{t.label}
                            </button>
                          ))}
                        </div>
                        <div className="flex gap-2">
                          <Button
                            variant="ghost"
                            size="compact"
                            onClick={() => { setShowAddCustom(false); setFieldError(null); }}
                          >
                            Cancelar
                          </Button>
                          <Button
                            size="compact"
                            onClick={addCustom}
                            disabled={!customName.trim()}
                          >
                            Agregar
                          </Button>
                        </div>
                        {fieldError && <FieldError>{fieldError}</FieldError>}
                      </div>
                    )}
                  </div>
                );
              })()}
              {step === "p-contrib" && (
                <>
                  <ScreenIntro
                    className="mb-6"
                    title="¿Cómo dividir los gastos?"
                    description="Puedes cambiarlo cuando quieras. Los datos de otras personas se podrán completar después."
                  />
                  <div className="space-y-3 mb-6">
                    {([
                      { id:"equal" as Model,        emoji:"⚖️", label:"Por partes iguales",         sub:"Los gastos compartidos se dividen en partes iguales.", badge:"Ideal para roomies" },
                      { id:"proportional" as Model, emoji:"📊", label:"Proporcional al ingreso",     sub:"Cada persona aporta según su porcentaje del ingreso total.", badge:"Ideal para parejas" },
                    ] as const).map(opt => (
                      <ChoiceCard
                        key={opt.id}
                        icon={<span aria-hidden="true">{opt.emoji}</span>}
                        title={opt.label}
                        description={opt.sub}
                        selected={data.contrib === opt.id}
                        badge={
                          <span className="text-[9px] font-bold rounded-full px-2 py-1 flex-shrink-0 text-center leading-tight max-w-[4.75rem]" style={{ backgroundColor: P.brnDk, color:"#fff" }}>
                            {opt.badge}
                          </span>
                        }
                        onClick={() => set("contrib", opt.id)}
                      />
                    ))}
                  </div>
                  {contribHint && (
                    <HelperText className="mb-4">{contribHint}</HelperText>
                  )}
                  {nidoError && (
                    <FieldError className="mb-4">{nidoError}</FieldError>
                  )}
                  <Button onClick={() => goTo("c-invite")}>
                    Continuar
                  </Button>
                </>
              )}
            </div>
          )}

          {step === "nest-ready" && (
            <div className="flex flex-col flex-1">
              <div className="flex-1 flex flex-col items-center justify-center text-center">
                <NidoHouse />
                <ScreenIntro
                  className="mt-6"
                  align="center"
                  title="¡Tu Nido está listo!"
                  description="Puedes entrar ahora e invitar a más personas cuando quieras."
                />
                <div className="w-full p-4 rounded-2xl flex gap-2 mt-6" style={{ backgroundColor: P.sagePl }}>
                  <Sparkles size={16} style={{ color: P.sageDk, flexShrink:0, marginTop:2 }} />
                  <Text size="caption" className="leading-relaxed text-left">
                    Un Nido puede ser de una persona o de muchas.
                  </Text>
                </div>
              </div>
              <Button className="mt-8" onClick={onComplete}>Entrar a mi Nido 🪺</Button>
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
    </FlowScreen>
  );
}
