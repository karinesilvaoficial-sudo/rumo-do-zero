import { publicAuthConfig } from "../auth-config";
import { ResetForm } from "../auth-forms";

export const metadata = { title: "Nova senha" };

export default function Page() {
  return <ResetForm cfg={publicAuthConfig()} />;
}
