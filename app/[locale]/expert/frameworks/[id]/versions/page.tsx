import { redirect } from "next/navigation";

export default async function ExpertFrameworkVersionsRedirect({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { id } = await params;
  redirect(`/expert/frameworks/${id}`);
}
