import type { Metadata } from "next";
import { Container } from "@/components/layout/container";
import { getDictionary } from "@/i18n/server";

// Placeholder: la gestión de invitaciones, usuarios y contenido llegará en otra sesión.
export async function generateMetadata(): Promise<Metadata> {
  const { settings } = await getDictionary();
  return { title: settings.adminTitle };
}

export default async function AdminPage() {
  const { settings } = await getDictionary();
  return (
    <Container className="py-12">
      <h1 className="text-3xl font-semibold tracking-tight">{settings.adminTitle}</h1>
      <p className="mt-4 max-w-prose text-muted">{settings.adminText}</p>
    </Container>
  );
}
