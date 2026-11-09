import { describe, expect, it } from "vitest";
import { estimateSpeechSeconds, mp3Seconds, normalizeForSpeech } from "./speech";

describe("speech normalization", () => {
  it("money, percent, dates and ids", () => {
    expect(normalizeForSpeech("Saldo de R$ 1.234,56 em 05/11/2026, alta de 2,5%")).toBe("Saldo de 1.234 reais e 56 centavos em 5 de novembro de 2026, alta de 2,5 por cento");
    expect(normalizeForSpeech("Resultado −R$ 10,00")).toBe("Resultado menos 10 reais");
    expect(normalizeForSpeech("id 3f2a1b4c-1111-2222-3333-444455556666 chave sk_live_abcdefghijkl")).toBe("id chave");
    expect(normalizeForSpeech("**Atenção**: vence 10/12")).toBe("Atenção : vence 10 de dezembro");
  });
  it("durations", () => {
    expect(mp3Seconds(16000 * 10)).toBe(10);
    expect(estimateSpeechSeconds("um dois três")).toBe(3);
    expect(estimateSpeechSeconds(Array(230).fill("palavra").join(" "))).toBe(120);
  });
});
