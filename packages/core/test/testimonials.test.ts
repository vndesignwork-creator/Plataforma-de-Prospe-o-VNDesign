import { describe, expect, it } from "vitest";
import {
  TestimonialSubmitSchema,
  isTestimonialShowable,
  testimonialAuthorLine,
} from "../src";

describe("testemunhos", () => {
  it("valida o que o cliente envia", () => {
    const ok = TestimonialSubmitSchema.safeParse({
      rating: "5",
      quote: "  Muito bom trabalho!  ",
      author_name: "Cliente",
      can_publish: true,
    });
    expect(ok.success && ok.data).toMatchObject({
      rating: 5,
      quote: "Muito bom trabalho!",
      author_role: null,
      can_publish: true,
    });
    expect(
      TestimonialSubmitSchema.safeParse({
        rating: 6,
        quote: "Muito bom trabalho!",
        author_name: "X",
      }).success,
    ).toBe(false);
    expect(
      TestimonialSubmitSchema.safeParse({
        rating: 4,
        quote: "Curto",
        author_name: "X",
      }).success,
    ).toBe(false);
    expect(
      TestimonialSubmitSchema.safeParse({
        rating: 4,
        quote: "Muito bom trabalho!",
        author_name: "  ",
      }).success,
    ).toBe(false);
  });

  it("só vai para as propostas com autorização, marcado e 4 ou 5 estrelas", () => {
    const base = {
      status: "recebido" as const,
      can_publish: true,
      featured: true,
      rating: 5,
      quote: "Ótimo.",
    };
    expect(isTestimonialShowable(base)).toBe(true);
    expect(isTestimonialShowable({ ...base, can_publish: false })).toBe(false);
    expect(isTestimonialShowable({ ...base, featured: false })).toBe(false);
    expect(isTestimonialShowable({ ...base, rating: 3 })).toBe(false);
    expect(isTestimonialShowable({ ...base, status: "pendente" })).toBe(false);
    expect(isTestimonialShowable({ ...base, quote: " " })).toBe(false);
  });

  it("linha do autor sem repetir a empresa", () => {
    expect(
      testimonialAuthorLine(
        { author_name: "Ana", author_role: "Gerente" },
        "Café Central",
      ),
    ).toBe("Ana, Gerente · Café Central");
    expect(
      testimonialAuthorLine(
        { author_name: "Ana", author_role: "Gerente, Café Central" },
        "Café Central",
      ),
    ).toBe("Ana, Gerente, Café Central");
    expect(
      testimonialAuthorLine(
        { author_name: null, author_role: null },
        "Café Central",
      ),
    ).toBe("Café Central");
  });
});
