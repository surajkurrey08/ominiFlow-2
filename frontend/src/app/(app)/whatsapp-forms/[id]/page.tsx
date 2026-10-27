import { FormEditor } from "@/components/whatsapp-forms/form-editor";
import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Edit WhatsApp Form | Omniflow",
};

export default async function EditWhatsAppFormPage({ params }: { params: Promise<{ id: string }> }) {
  const resolved = await params;
  return <FormEditor id={resolved.id} />;
}

