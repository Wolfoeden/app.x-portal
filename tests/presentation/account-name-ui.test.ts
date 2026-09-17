import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { AccountNameDialog, AuthDialog } from "@/components/chat/dialogs";

const noop = () => undefined;

function inputTag(markup: string, id: string) {
  return markup.match(new RegExp(`<input[^>]*id="${id}"[^>]*>`))?.[0] ?? "";
}

describe("account name in the interface", () => {
  it("asks for the name when an account is created by e-mail", () => {
    const markup = renderToStaticMarkup(
      createElement(AuthDialog, {
        initialMode: "register",
        onClose: noop,
        onAuthenticated: noop,
        showToast: noop,
      }),
    );

    expect(markup).toContain('<label for="register-name">Vor- und Nachname</label>');
    expect(inputTag(markup, "register-name")).toMatch(/autocomplete="name"/iu);
    expect(inputTag(markup, "register-name")).toContain("required");
  });

  it("does not ask for a name when signing in", () => {
    const markup = renderToStaticMarkup(
      createElement(AuthDialog, {
        initialMode: "login",
        onClose: noop,
        onAuthenticated: noop,
        showToast: noop,
      }),
    );

    expect(markup).not.toContain("register-name");
  });

  it("prefills the current name and saves only a change", () => {
    const markup = renderToStaticMarkup(
      createElement(AccountNameDialog, {
        currentName: "Erika Mustermann",
        onClose: noop,
        onSave: async () => undefined,
      }),
    );

    expect(inputTag(markup, "account-name")).toContain('value="Erika Mustermann"');
    expect(markup).toMatch(/<button class="primary-action" type="submit" disabled="">Speichern<\/button>/);
  });
});
