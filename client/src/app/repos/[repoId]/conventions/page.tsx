import { getTranslations } from "next-intl/server";
import { AppShell } from "@/components/app-shell";
import { ConventionsView } from "./_components/ConventionsView";

export default async function ConventionsRoute({ params }: { params: Promise<{ repoId: string }> }) {
  const [{ repoId }, t] = await Promise.all([params, getTranslations("conventions.page")]);
  return (
    <AppShell crumb={[{ label: t("crumbLab") }, { label: t("crumbConventions") }]}>
      <ConventionsView key={repoId} repoId={repoId} />
    </AppShell>
  );
}
