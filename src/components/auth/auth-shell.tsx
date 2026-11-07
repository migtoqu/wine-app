import type { ReactNode } from "react";
import { Container } from "@/components/layout/container";
import { Card, CardBody } from "@/components/ui";

// Marco común de login, registro, recuperar y restablecer. El título y la intro
// son estáticos (shell prerenderizado); el formulario puede llegar en streaming.
export function AuthShell({
  title,
  intro,
  children,
  footer,
}: {
  title: string;
  intro: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <Container className="max-w-md py-12 sm:py-16">
      <h1 className="text-3xl font-semibold tracking-tight">{title}</h1>
      <p className="mt-2 text-muted">{intro}</p>
      <Card className="mt-6">
        <CardBody className="flex flex-col gap-5">{children}</CardBody>
      </Card>
      {footer && <div className="mt-6 flex flex-col gap-2 text-sm text-muted">{footer}</div>}
    </Container>
  );
}

// Hueco del formulario mientras llega (misma altura aproximada para no saltar).
export function FormFallback({ fields = 2 }: { fields?: number }) {
  return (
    <div aria-hidden className="flex flex-col gap-5">
      {Array.from({ length: fields }, (_, i) => (
        <div key={i} className="flex flex-col gap-1.5">
          <div className="h-5 w-24 rounded bg-surface-2" />
          <div className="h-11 rounded-control bg-surface-2" />
        </div>
      ))}
      <div className="h-11 rounded-control bg-surface-2" />
    </div>
  );
}
