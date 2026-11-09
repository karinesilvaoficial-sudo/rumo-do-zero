import { publicAuthConfig } from "../auth-config";
import { RecoverForm } from "../auth-forms";

export const metadata = { title: "Recuperar senha" };

export default function Page() {
  return <RecoverForm cfg={publicAuthConfig()} />;
}
