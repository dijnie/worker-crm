import { AuthShell } from "@/components/auth/auth-shell";
import { getWorkspaceDictionary } from "@/lib/i18n/workspace-locale";

export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  const { auth: copy } = await getWorkspaceDictionary();
  return <AuthShell homepageLabel={copy.homepageLabel}>{children}</AuthShell>;
}
