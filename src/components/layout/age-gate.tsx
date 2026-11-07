"use client";

import NextLink from "next/link";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";
import type { Dictionary } from "@/i18n/dictionaries/es";
import { AGE_COOKIE, setClientCookie } from "@/lib/preferences";

type Props = {
  labels: Dictionary["ageGate"];
  cookiesHref: string;
  // id del contenedor con el resto de la página, que se vuelve inerte mientras el gate está abierto.
  appId: string;
};

// Puerta +18. Se renderiza siempre en el HTML; si ya existe la cookie, ThemeScript marca
// <html data-age-ok> antes del pintado y el CSS la oculta, así que no parpadea.
function subscribe(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributeFilter: ["data-age-ok"] });
  return () => observer.disconnect();
}

const isVerified = () => document.documentElement.hasAttribute("data-age-ok");

export function AgeGate({ labels, cookiesHref, appId }: Props) {
  const [step, setStep] = useState<"ask" | "denied">("ask");
  const verified = useSyncExternalStore(subscribe, isVerified, () => false);
  const yesRef = useRef<HTMLButtonElement>(null);

  // Mientras el gate está abierto, el resto de la página no recibe foco ni clics.
  useEffect(() => {
    if (verified) return;
    const app = document.getElementById(appId);
    app?.setAttribute("inert", "");
    yesRef.current?.focus();
    return () => app?.removeAttribute("inert");
  }, [verified, appId]);

  if (verified) return null;

  function confirm() {
    setClientCookie(AGE_COOKIE, "1");
    document.documentElement.setAttribute("data-age-ok", "");
  }

  return (
    <div
      className="age-gate fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-overlay p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="age-gate-title"
      aria-describedby="age-gate-text"
    >
      <div className="w-full max-w-md rounded-card border border-border bg-surface p-6 shadow-overlay sm:p-8">
        {step === "ask" ? (
          <>
            <p className="text-sm font-semibold tracking-wide text-primary uppercase">
              {labels.title}
            </p>
            <h2 id="age-gate-title" className="mt-2 text-3xl font-semibold">
              {labels.question}
            </h2>
            <p id="age-gate-text" className="mt-3 text-muted">
              {labels.text}
            </p>
            <div className="mt-6 flex flex-col gap-3 sm:flex-row">
              <Button ref={yesRef} autoFocus size="lg" className="sm:flex-1" onClick={confirm}>
                {labels.yes}
              </Button>
              <Button
                size="lg"
                variant="secondary"
                className="sm:w-28"
                onClick={() => setStep("denied")}
              >
                {labels.no}
              </Button>
            </div>
          </>
        ) : (
          <>
            <h2 id="age-gate-title" className="text-3xl font-semibold">
              {labels.deniedTitle}
            </h2>
            <p id="age-gate-text" className="mt-3 text-muted">
              {labels.deniedText}
            </p>
            <Button
              autoFocus
              variant="secondary"
              className="mt-6"
              onClick={() => setStep("ask")}
            >
              {labels.back}
            </Button>
          </>
        )}
        <p className="mt-6 border-t border-border pt-4 text-sm text-muted">
          {labels.cookieNotice}{" "}
          <NextLink
            href={cookiesHref}
            target="_blank"
            className="font-medium text-primary underline underline-offset-4"
          >
            {labels.cookieLink}
          </NextLink>
        </p>
      </div>
    </div>
  );
}
