import { createHash } from "node:crypto";

/** Só o hash do token de convite é armazenado; o token em claro vai apenas no e-mail. */
export const hashToken = (t: string) => createHash("sha256").update(t).digest("hex");
