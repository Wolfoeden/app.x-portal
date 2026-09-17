import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { AccountSummary } from "@/components/chat/account";
import { AuthDialog } from "@/components/chat/dialogs";
import { previewUsage } from "@/components/chat/preview-fixtures";

const noop = () => undefined;

function inputTag(markup: string, id: string) {
  return markup.match(new RegExp(`<input[^>]*id="${id}"[^>]*>`))?.[0] ?? "";
}

function summary(props: { displayName: string; isAccountUser: boolean; renamable: boolean }) {
  return renderToStaticMarkup(
    createElement(AccountSummary, {
      usage: previewUsage,
      displayName: props.displayName,
      email: props.isAccountUser ? "erika@example.com" : "Anfrage bleibt in diesem Browser",
      isAccountUser: props.isAccountUser,
      onRename: props.renamable ? async () => undefined : undefined,
      onMoreCredits: noop,
    }),
  );
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

  it("shows an account's name above the e-mail address as something to click and edit", () => {
    const markup = summary({ displayName: "erika", isAccountUser: true, renamable: true });

    expect(markup).toMatch(
      /<button class="account-name-button" type="button" title="Name ändern">erika<\/button><span>erika@example.com<\/span>/u,
    );
  });

  it("keeps a guest's label plain", () => {
    const markup = summary({ displayName: "Ohne Konto", isAccountUser: false, renamable: false });

    expect(markup).toContain("<strong>Ohne Konto</strong>");
    expect(markup).not.toContain("account-name-button");
  });

  it("leaves out the start-credit explanation", () => {
    const markup = summary({ displayName: "erika", isAccountUser: true, renamable: true });

    expect(markup).not.toContain("keine monatliche Auffüllung");
  });
});
