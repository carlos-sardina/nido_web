"use client";

import { useEffect, useState } from "react";
import {
  Check, ChevronLeft, Link, QrCode, Sparkles,
} from "lucide-react";
import type { User } from "@supabase/supabase-js";
import { identityFromUser } from "@/lib/auth/identity";
import { savePendingOnboardingFlow, takePendingOnboardingFlow } from "@/lib/auth/pending-flow";
import { signInWithGoogle } from "@/lib/auth/session";
import { EXP_SUGG, NEST_TYPES, NIDO_NAMES } from "@/lib/constants";
import { P } from "@/lib/palette";
import type { Model, OStep, OData } from "@/lib/types";
import { InviteQrModal } from "@/components/flows/InviteQrModal";
import { NidoHouse } from "@/components/shared/NidoHouse";
import { ExpenseEntryModal } from "@/components/onboarding/ExpenseEntryModal";
import { OBtn2 } from "@/components/onboarding/OBtn2";
import { OProgress2 } from "@/components/onboarding/OProgress2";

export function OnboardingFlow({ onComplete, user }: { onComplete: () => void; user: User | null }) {
  const [step, setStep] = useState<OStep>("welcome");
  const [data, setData] = useState<OData>({
    flow: null, nestType: "", nestEmoji: "🏠", nestName: "",
    userName: "", salary: "", freelance: "", savings: "",
    savingsType: "personal", savingsShared: "",
    expenses: EXP_SUGG.map(e => ({ ...e })), contrib: "capacity",
  });
  const [joinCode, setJoinCode] = useState("");
  const [expEditIdx, setExpEditIdx] = useState<number | null>(null);
  const [showQrInvite, setShowQrInvite] = useState(false);
  const [oauthStarting, setOauthStarting] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const identity = identityFromUser(user);
  const set = (k: keyof OData, v: OData[keyof OData]) => setData(p => ({ ...p, [k]: v }));

  const applyAuthenticatedIdentity = (flow: "create" | "join") => {
    setData(p => ({
      ...p,
      flow,
      // Local onboarding draft only. Not written to profiles in this phase.
      userName: p.userName || identity?.displayName || "",
    }));
    setStep(flow === "join" ? "join" : "c-name");
  };

  const startCreate = () => {
    if (user) {
      applyAuthenticatedIdentity("create");
      return;
    }
    set("flow", "create");
    setStep("auth");
  };

  const startJoin = () => {
    if (user) {
      applyAuthenticatedIdentity("join");
      return;
    }
    set("flow", "join");
    setStep("auth");
  };

  const handleGoogle = async () => {
    setAuthError(null);
    setOauthStarting(true);
    try {
      savePendingOnboardingFlow(data.flow === "join" ? "join" : "create");
      const { error } = await signInWithGoogle();
      if (error) {
        console.error("Google OAuth failed", error);
        setAuthError("No pudimos iniciar sesión con Google. Inténtalo de nuevo.");
        setOauthStarting(false);
      }
    } catch (error) {
      console.error("Google OAuth failed", error);
      setAuthError("No pudimos iniciar sesión con Google. Inténtalo de nuevo.");
      setOauthStarting(false);
    }
  };

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const hadAuthError = params.get("auth") === "error";
    if (hadAuthError) {
      window.history.replaceState({}, "", window.location.pathname);
    }

    if (!user) {
      if (hadAuthError) {
        setAuthError("No pudimos iniciar sesión con Google. Inténtalo de nuevo.");
        setStep("auth");
      }
      return;
    }

    const pending = takePendingOnboardingFlow();
    if (pending) {
      applyAuthenticatedIdentity(pending);
      return;
    }

    if (step === "auth") {
      applyAuthenticatedIdentity(data.flow === "join" ? "join" : "create");
    }
    // Resume after OAuth or skip Google when a session already exists.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const PERSONAL: OStep[] = ["p-name","p-income","p-savings","p-expenses","p-contrib"];
  const pIdx = PERSONAL.indexOf(step);
  const isPers = pIdx >= 0;

  const expCanContinue = data.expenses.some(e => e.selected);

  const handleExpConfirm = (amount: string, type: "personal" | "shared") => {
    if (expEditIdx === null) return;
    setData(p => {
      const expenses = [...p.expenses];
      expenses[expEditIdx] = { ...expenses[expEditIdx], selected: true, amount, type };
      return { ...p, expenses };
    });
    setExpEditIdx(null);
  };

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
                </div>
              </div>
              <div className="space-y-3">
                <OBtn2 label="🪺 Crear un nuevo Nido" onClick={startCreate} />
                <OBtn2 label="👋 Unirme a un Nido"   onClick={startJoin} variant="secondary" />
                <p className="text-center text-[11px] leading-relaxed pt-1" style={{ color: P.muted }}>Puedes pertenecer a múltiples Nidos.<br />Ideal para parejas, roommates, familias y más.</p>
              </div>
            </div>
          )}

          {step === "auth" && (
            <div className="flex flex-col h-full">
              <button onClick={() => setStep("welcome")} className="flex items-center gap-1 mb-2" style={{ color: P.muted }}>
                <ChevronLeft size={16}/><span className="text-xs font-medium">Atrás</span>
              </button>
              <div className="flex-1 flex flex-col justify-center">
                {/* Brand */}
                <div className="text-center mb-8">
                  <p className="text-xs font-semibold mb-1" style={{ color: P.muted }}>
                    {data.flow === "create" ? "Crear un nuevo Nido" : "Unirme a un Nido"}
                  </p>
                  <h2 className="text-3xl font-bold" style={{ fontFamily: "Fraunces, serif", color: P.text }}>Bienvenido</h2>
                  <p className="text-xs mt-1.5" style={{ color: P.muted }}>Usa tu cuenta para continuar</p>
                </div>

                {/* Google button */}
                <button
                  onClick={oauthStarting ? undefined : handleGoogle}
                  disabled={oauthStarting}
                  className="w-full flex items-center justify-center gap-3 py-3.5 rounded-2xl border-2 mb-4 transition-all active:scale-[0.98] font-semibold text-sm"
                  style={{ backgroundColor: "#FFFFFF", borderColor: "rgba(47,42,40,0.15)", color: P.text, opacity: oauthStarting ? 0.7 : 1, cursor: oauthStarting ? "not-allowed" : "pointer" }}>
                  {/* Google G */}
                  <svg width="20" height="20" viewBox="0 0 48 48">
                    <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
                    <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
                    <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
                    <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.18 1.48-4.97 2.31-8.16 2.31-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
                    <path fill="none" d="M0 0h48v48H0z"/>
                  </svg>
                  {oauthStarting ? "Conectando…" : "Continuar con Google"}
                </button>
                {authError && (
                  <p className="text-center text-[11px] mb-4 leading-relaxed" style={{ color: P.danger }}>
                    {authError}
                  </p>
                )}
              </div>

              {/* Legal */}
              <p className="text-center text-[10px] pb-2 leading-relaxed" style={{ color: P.muted }}>
                Al continuar aceptas los{" "}
                <span style={{ color: P.brnDk }}>Términos de uso</span> y la{" "}
                <span style={{ color: P.brnDk }}>Política de privacidad</span>.
              </p>
            </div>
          )}

          {step === "join" && (
            <div>
              <button onClick={() => setStep(user ? "welcome" : "auth")} className="mb-4 flex items-center gap-1" style={{ color: P.muted }}><ChevronLeft size={16}/><span className="text-xs font-medium">Atrás</span></button>
              <h2 className="text-2xl font-bold mb-1" style={{ fontFamily: "Fraunces, serif", color: P.text }}>Únete a un Nido</h2>
              <p className="text-xs mb-6" style={{ color: P.muted }}>Alguien ya creó un Nido para ti.</p>
              <label className="text-xs font-semibold mb-2 block" style={{ color: P.muted }}>Código de invitación</label>
              <input className="w-full py-3.5 px-4 rounded-2xl text-center text-2xl font-bold tracking-[0.3em] border-2 outline-none mb-4"
                style={{ backgroundColor: P.card, borderColor: joinCode ? P.brnDk : P.sub, color: P.text, fontFamily: "Fraunces, serif" }}
                placeholder="· · · · · ·" maxLength={6} value={joinCode} onChange={e => setJoinCode(e.target.value.toUpperCase())} />
              <div className="flex gap-2 mb-6">
                <button className="flex-1 py-3 rounded-2xl flex items-center justify-center gap-2 border text-xs font-semibold"
                  style={{ borderColor: P.border, backgroundColor: P.card, color: P.text }}><Link size={16} style={{ color: P.brnDk }}/>Desde enlace</button>
              </div>
              <OBtn2 label="Unirme al Nido" onClick={() => setStep("p-name")} disabled={joinCode.length < 6} />
            </div>
          )}

          {step === "c-type" && (
            <div>
              <button onClick={() => setStep("welcome")} className="mb-4 flex items-center gap-1" style={{ color: P.muted }}><ChevronLeft size={16}/><span className="text-xs font-medium">Atrás</span></button>
              <h2 className="text-2xl font-bold mb-1" style={{ fontFamily: "Fraunces, serif", color: P.text }}>¿Qué tipo de Nido es?</h2>
              <p className="text-xs mb-6" style={{ color: P.muted }}>Esto nos ayuda a configurarlo mejor.</p>
              <div className="grid grid-cols-4 gap-2 mb-6">
                {NEST_TYPES.map(nt => (
                  <button key={nt.label} onClick={() => set("nestType", nt.label)}
                    className="flex flex-col items-center gap-1.5 py-4 rounded-2xl border-2 transition-all"
                    style={{ borderColor: data.nestType === nt.label ? P.brnDk : "transparent", backgroundColor: data.nestType === nt.label ? P.sagePl : P.sub }}>
                    <span className="text-2xl">{nt.emoji}</span>
                    <span className="text-[9px] font-semibold" style={{ color: P.text }}>{nt.label}</span>
                  </button>
                ))}
              </div>
              <OBtn2 label="Continuar" onClick={() => { if(data.nestType) setStep("c-name"); }} />
            </div>
          )}

          {step === "c-name" && (
            <div>
              <button onClick={() => setStep(user ? "welcome" : "auth")} className="mb-4 flex items-center gap-1" style={{ color: P.muted }}><ChevronLeft size={16}/><span className="text-xs font-medium">Atrás</span></button>
              <OProgress2 step={1} total={6} />
              <h2 className="text-2xl font-bold mb-1" style={{ fontFamily: "Fraunces, serif", color: P.text }}>Dale nombre a tu Nido</h2>
              <p className="text-xs mb-6" style={{ color: P.muted }}>Algo que lo haga sentir especial.</p>
              <input className="w-full py-4 px-4 rounded-2xl text-lg font-semibold border-2 outline-none mb-2 transition-all"
                style={{ backgroundColor: P.card, borderColor: data.nestName ? P.brnDk : P.sub, color: P.text }}
                placeholder="Casa Roma, Depa 502…" value={data.nestName} onChange={e => set("nestName",e.target.value)} />
              <div className="flex flex-wrap gap-2 mb-6">
                {NIDO_NAMES.map(n => (
                  <button key={n} onClick={() => set("nestName",n)}
                    className="text-xs font-medium px-3 py-1.5 rounded-full border"
                    style={{ borderColor: P.border, backgroundColor: P.sub, color: P.muted }}>{n}</button>
                ))}
              </div>
              <OBtn2 label="Continuar" onClick={() => setStep("p-name")} disabled={!data.nestName} />
            </div>
          )}

          {step === "c-invite" && (
            <div>
              <button onClick={() => setStep("p-contrib")} className="mb-4 flex items-center gap-1" style={{ color: P.muted }}><ChevronLeft size={16}/><span className="text-xs font-medium">Atrás</span></button>
              <h2 className="text-2xl font-bold mb-1" style={{ fontFamily: "Fraunces, serif", color: P.text }}>Invita a los miembros</h2>
              <p className="text-xs mb-4" style={{ color: P.muted }}>Pueden unirse ahora o más tarde.</p>
              <div className="flex justify-center mb-6"><NidoHouse /></div>
              <div className="space-y-2 mb-6">
                <button className="w-full flex items-center gap-3 p-4 rounded-2xl border text-left"
                  style={{ borderColor: P.border, backgroundColor: P.card }}>
                  <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ backgroundColor: P.sagePl }}>
                    <Link size={16} style={{ color: P.sageDk }} />
                  </div>
                  <div>
                    <p className="text-xs font-semibold" style={{ color: P.text }}>Invitar por enlace</p>
                    <p className="text-[10px]" style={{ color: P.muted }}>Comparte un link directo</p>
                  </div>
                </button>
                <button onClick={() => setShowQrInvite(true)}
                  className="w-full flex items-center gap-3 p-4 rounded-2xl border text-left"
                  style={{ borderColor: P.border, backgroundColor: P.card }}>
                  <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ backgroundColor: P.sagePl }}>
                    <QrCode size={16} style={{ color: P.sageDk }} />
                  </div>
                  <div>
                    <p className="text-xs font-semibold" style={{ color: P.text }}>Invitar por QR</p>
                    <p className="text-[10px]" style={{ color: P.muted }}>Escanea para unirse al Nido</p>
                  </div>
                </button>
              </div>
              <OBtn2 label="Crear mi Nido 🪺" onClick={() => setStep("nest-ready")} />
            </div>
          )}

          {isPers && (
            <div>
              <button onClick={() => setStep(data.flow==="join"&&step==="p-name"?"join":PERSONAL[pIdx-1]||"c-name")}
                className="mb-4 flex items-center gap-1" style={{ color: P.muted }}><ChevronLeft size={16}/><span className="text-xs font-medium">Atrás</span></button>
              <OProgress2 step={pIdx+2} total={6} />

              {step === "p-name" && (
                <>
                  <h2 className="text-2xl font-bold mb-1" style={{ fontFamily: "Fraunces, serif", color: P.text }}>¿Cómo te llamas?</h2>
                  <p className="text-xs mb-5" style={{ color: P.muted }}>Tu nombre aparecerá en el Nido. Puedes editarlo.</p>
                  {/* Google badge */}
                  <div className="flex items-center gap-2 mb-5 px-3 py-2 rounded-2xl" style={{ backgroundColor: P.sub }}>
                    <svg width="14" height="14" viewBox="0 0 48 48" className="flex-shrink-0">
                      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
                      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
                      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
                      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.18 1.48-4.97 2.31-8.16 2.31-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
                    </svg>
                    <p className="text-[11px]" style={{ color: P.muted }}>
                      Conectado como <span className="font-semibold" style={{ color: P.text }}>{identity?.email ?? "tu cuenta de Google"}</span>
                    </p>
                  </div>
                  <div className="flex justify-center mb-5">
                    <div className="w-20 h-20 rounded-full flex items-center justify-center text-3xl font-bold text-white shadow-md overflow-hidden"
                      style={{ backgroundColor: P.brnDk }}>
                      {identity?.avatarUrl
                        ? <img src={identity.avatarUrl} alt="" className="w-full h-full object-cover" />
                        : (data.userName ? data.userName[0].toUpperCase() : "?")}
                    </div>
                  </div>
                  <input className="w-full py-4 px-4 rounded-2xl text-base font-semibold border-2 outline-none mb-6"
                    style={{ backgroundColor: P.card, borderColor: data.userName ? P.brnDk : "rgba(47,42,40,0.15)", color: P.text }}
                    placeholder="Tu nombre" value={data.userName} onChange={e => set("userName",e.target.value)} />
                  <OBtn2 label="Continuar" onClick={() => setStep("p-income")} disabled={!data.userName} />
                </>
              )}
              {step === "p-income" && (
                <>
                  <h2 className="text-2xl font-bold mb-1" style={{ fontFamily: "Fraunces, serif", color: P.text }}>¿De cuánto es tu ingreso?</h2>
                  <p className="text-xs mb-6" style={{ color: P.muted }}>Esta información es privada y solo la usa Nido para calcular aportaciones.</p>
                  <div className="mb-4">
                    <label className="text-xs font-semibold mb-1.5 block" style={{ color: P.muted }}>Ingreso mensual</label>
                    <input className="w-full py-3.5 px-4 rounded-2xl text-base border-2 outline-none"
                      style={{ backgroundColor: P.card, borderColor: data.salary ? P.brnDk : P.sub, color: P.text }}
                      placeholder="$40,000" type="number"
                      value={data.salary}
                      onChange={e => set("salary", e.target.value)} />
                  </div>
                  <OBtn2 label="Continuar" onClick={() => setStep("p-savings")} disabled={!data.salary} />
                </>
              )}
              {step === "p-savings" && (() => {
                const fmt = (v: string) => {
                  const n = v.replace(/[^0-9.]/g,"");
                  if (!n) return "";
                  const [int, dec] = n.split(".");
                  const intFmt = parseInt(int||"0").toLocaleString("es-MX");
                  return dec !== undefined ? `${intFmt}.${dec.slice(0,2)}` : intFmt;
                };
                const rawPersonal = data.savings.replace(/[^0-9.]/g,"");
                const rawShared   = data.savingsShared.replace(/[^0-9.]/g,"");
                return (
                  <>
                    <h2 className="text-2xl font-bold mb-1" style={{ fontFamily: "Fraunces, serif", color: P.text }}>¿Tienes ahorros?</h2>
                    <p className="text-xs mb-5" style={{ color: P.muted }}>Ambos campos son opcionales — llena los que apliquen.</p>

                    <p className="text-[9px] font-semibold uppercase tracking-widest mb-2" style={{ color: P.muted }}>Ahorros personales</p>
                    <div className="rounded-2xl border-2 px-4 py-3 flex items-center gap-1 mb-3"
                      style={{ backgroundColor: P.card, borderColor: rawPersonal ? P.brnDk : P.sub }}>
                      <span className="text-base font-normal flex-shrink-0" style={{ color: P.muted }}>$</span>
                      <input className="flex-1 text-base bg-transparent outline-none"
                        style={{ color: P.text }}
                        type="text" inputMode="decimal" placeholder="0.00"
                        value={fmt(data.savings)}
                        onChange={e => set("savings", e.target.value.replace(/[^0-9.]/g,""))} />
                    </div>

                    <p className="text-[9px] font-semibold uppercase tracking-widest mb-2" style={{ color: P.muted }}>Ahorros compartidos</p>
                    <div className="rounded-2xl border-2 px-4 py-3 flex items-center gap-1 mb-6"
                      style={{ backgroundColor: P.card, borderColor: rawShared ? P.brnDk : P.sub }}>
                      <span className="text-base font-normal flex-shrink-0" style={{ color: P.muted }}>$</span>
                      <input className="flex-1 text-base bg-transparent outline-none"
                        style={{ color: P.text }}
                        type="text" inputMode="decimal" placeholder="0.00"
                        value={fmt(data.savingsShared)}
                        onChange={e => set("savingsShared", e.target.value.replace(/[^0-9.]/g,""))} />
                    </div>

                    <OBtn2 label="Continuar" onClick={() => setStep("p-expenses")} />
                  </>
                );
              })()}
              {step === "p-expenses" && (() => {
                const showAddCustom = data._showAdd ?? false;
                const setShowAddCustom = (v: boolean) => setData(p => ({ ...p, _showAdd: v }));
                const customEmoji = data._emoji ?? "💳";
                const setCustomEmoji = (v: string) => setData(p => ({ ...p, _emoji: v }));
                const customName = data._cname ?? "";
                const setCustomName = (v: string) => setData(p => ({ ...p, _cname: v }));
                const customEtype = data._etype ?? "personal";
                const setCustomEtype = (v: "personal"|"shared") => setData(p => ({ ...p, _etype: v }));

                const canContinue = data.expenses.some(e => e.selected);

                const addCustom = () => {
                  if (!customName.trim()) return;
                  const n = [...data.expenses, { name: customName.trim(), icon: customEmoji, selected: false, amount: "", type: customEtype }];
                  setData(p => ({ ...p, expenses: n, _showAdd: false, _cname: "", _emoji: "💳", _etype: "personal" } as OData));
                };

                const QUICK_EMOJIS = ["💳","🎓","🏋️","🛍️","💅","🍺","🐱","🐕","🏥","✈️","📚","🎮","🧘","🚲","🎸"];
                const isQuickEmoji = QUICK_EMOJIS.includes(customEmoji);
                const setEmojiFromInput = (value: string) => {
                  if (!value) { setCustomEmoji("💳"); return; }
                  setCustomEmoji([...value].pop() ?? "💳");
                };

                return (
                  <>
                    <h2 className="text-2xl font-bold mb-1" style={{ fontFamily: "Fraunces, serif", color: P.text }}>Gastos del nido</h2>
                    <p className="text-xs mb-4" style={{ color: P.muted }}>Toca un gasto para agregar el monto y definir si es personal o compartido.</p>

                    {/* Expense rows */}
                    <div className="space-y-2 mb-3">
                      {data.expenses.map((exp, i) => {
                        const done = exp.selected && !!exp.amount;
                        return (
                          <button key={`${exp.name}-${i}`}
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
                                  ${parseInt(exp.amount).toLocaleString("es-MX")}
                                </span>
                                <span className="text-sm flex-shrink-0 ml-1">
                                  {exp.type === "personal" ? "👤" : "🏠"}
                                </span>
                              </>
                            )}
                          </button>
                        );
                      })}
                    </div>

                    {/* Add custom expense */}
                    {!showAddCustom ? (
                      <button onClick={() => setShowAddCustom(true)}
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
                            <button key={e} onClick={() => setCustomEmoji(e)}
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
                            <button key={t.val} onClick={() => setCustomEtype(t.val)}
                              className="flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-semibold transition-all"
                              style={{ backgroundColor: customEtype === t.val ? P.brnDk : P.card, color: customEtype === t.val ? "#fff" : P.muted }}>
                              <span>{t.emoji}</span>{t.label}
                            </button>
                          ))}
                        </div>
                        <div className="flex gap-2">
                          <button onClick={() => setShowAddCustom(false)}
                            className="flex-1 py-2.5 rounded-xl text-xs font-semibold border"
                            style={{ borderColor: P.border, backgroundColor: P.card, color: P.muted }}>
                            Cancelar
                          </button>
                          <button onClick={addCustom} disabled={!customName.trim()}
                            className="flex-1 py-2.5 rounded-xl text-xs font-semibold transition-all"
                            style={{ backgroundColor: customName.trim() ? P.brnDk : P.sub, color: customName.trim() ? "#fff" : P.muted }}>
                            Agregar
                          </button>
                        </div>
                      </div>
                    )}

                  </>
                );
              })()}
              {step === "p-contrib" && (
                <>
                  <h2 className="text-2xl font-bold mb-1" style={{ fontFamily: "Fraunces, serif", color: P.text }}>¿Cómo dividir los gastos?</h2>
                  <p className="text-xs mb-5" style={{ color: P.muted }}>Puedes cambiarlo cuando quieras.</p>
                  <div className="space-y-2 mb-6">
                    {([
                      { id:"equal" as Model,        emoji:"⚖️", label:"Por partes iguales",         sub:"Los gastos se dividirán en partes iguales entre los miembros del nido" },
                      { id:"proportional" as Model, emoji:"📊", label:"Proporcional al ingreso",     sub:"Según cuánto gana cada quien" },
                      { id:"capacity" as Model,     emoji:"💡", label:"Capacidad de aportación",     sub:"Cada quien aporta según lo que le sobra después de cubrir sus gastos fijos personales", rec:true },
                    ] as const).map(opt => (
                      <button key={opt.id} onClick={() => set("contrib",opt.id)}
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
                  <OBtn2 label="Finalizar nido 🪺" onClick={() => setStep(data.flow === "create" ? "c-invite" : "nest-ready")} />
                </>
              )}
            </div>
          )}

          {step === "nest-ready" && (
            <div className="flex flex-col h-full">
              <div className="flex-1 flex flex-col items-center justify-center text-center">
                <NidoHouse />
                <h2 className="text-2xl font-bold mt-4 mb-1" style={{ fontFamily: "Fraunces, serif", color: P.text }}>¡Tu Nido está casi listo!</h2>
                <p className="text-xs mb-6" style={{ color: P.muted }}>Solo falta un miembro por configurar.</p>
                <div className="w-full bg-white rounded-3xl p-4 mb-6 text-left shadow-sm">
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-7 h-7 rounded-full flex items-center justify-center text-sm" style={{ backgroundColor: P.sub }}>⏳</div>
                    <span className="text-xs font-semibold" style={{ color: P.text }}>Esperando a:</span>
                  </div>
                  <div className="flex items-center justify-between p-3 rounded-2xl" style={{ backgroundColor: P.sub }}>
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-full bg-[#5BA4CF] flex items-center justify-center text-white text-xs font-bold">CR</div>
                      <div>
                        <p className="text-xs font-semibold" style={{ color: P.text }}>Carlos</p>
                        <p className="text-[10px]" style={{ color: P.muted }}>Completar perfil · ~2 min</p>
                      </div>
                    </div>
                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: "#D4AC4E" }} />
                  </div>
                </div>
                <div className="w-full p-3 rounded-2xl flex gap-2 mb-2" style={{ backgroundColor: P.sagePl }}>
                  <Sparkles size={13} style={{ color: P.sageDk, flexShrink:0, marginTop:1 }} />
                  <p className="text-[10px] leading-relaxed" style={{ color: P.text }}>Tu Nido funciona aunque Carlos no haya completado su perfil todavía.</p>
                </div>
              </div>
              <OBtn2 label="Entrar a mi Nido 🪺" onClick={onComplete} />
            </div>
          )}
        </div>

        {/* Fixed continue bar for p-expenses */}
        {step === "p-expenses" && (
          <div className="flex-shrink-0 px-6 pb-6 pt-3 border-t" style={{ backgroundColor: P.bgL, borderColor: P.border }}>
            <button onClick={() => expCanContinue && setStep("p-contrib")}
              className="w-full py-4 rounded-2xl font-semibold text-sm transition-all active:scale-[0.98]"
              style={{ backgroundColor: expCanContinue ? P.brnDk : P.sub, color: expCanContinue ? "#fff" : P.muted, cursor: expCanContinue ? "pointer" : "not-allowed" }}>
              Continuar
            </button>
          </div>
        )}

        {/* Expense entry modal */}
        {expEditIdx !== null && (
          <ExpenseEntryModal
            exp={data.expenses[expEditIdx]}
            onConfirm={handleExpConfirm}
            onClose={() => setExpEditIdx(null)}
          />
        )}

        {showQrInvite && (
          <InviteQrModal
            inviteUrl={`https://nido.app/join/${(data.nestName || "nido").toLowerCase().replace(/\s+/g, "-")}`}
            nestName={data.nestName}
            onClose={() => setShowQrInvite(false)}
          />
        )}
    </div>
  );
}
