import { useState, useEffect } from "react";
import type { MyAccount } from "@/lib/account.functions";
import type { ContactPreferences } from "@/lib/account-center.functions";
export function useAccountProfileDraft(
  account: MyAccount,
  contactPreferences?: ContactPreferences,
) {
  const [displayName, setDisplayName] = useState(account.displayName ?? "");
  const [market, setMarket] = useState(account.homeResortCode ?? "");
  const [intent, setIntent] = useState(account.primaryIntent ?? "");
  const [allowPhone, setAllowPhone] = useState(contactPreferences?.allowPhone ?? false);
  const [allowText, setAllowText] = useState(contactPreferences?.allowText ?? false);
  const [allowEmail, setAllowEmail] = useState(contactPreferences?.allowEmail ?? true);
  const [showButtons, setShowButtons] = useState(contactPreferences?.showContactButtons ?? true);
  const [allowInternalMessages, setAllowInternalMessages] = useState(
    contactPreferences?.allowInternalMessages ?? true,
  );
  useEffect(() => {
    if (!contactPreferences) return;
    setAllowPhone(contactPreferences.allowPhone);
    setAllowText(contactPreferences.allowText);
    setAllowEmail(contactPreferences.allowEmail);
    setShowButtons(contactPreferences.showContactButtons);
    setAllowInternalMessages(contactPreferences.allowInternalMessages);
  }, [contactPreferences]);
  return {
    displayName,
    setDisplayName,
    market,
    setMarket,
    intent,
    setIntent,
    allowPhone,
    setAllowPhone,
    allowText,
    setAllowText,
    allowEmail,
    setAllowEmail,
    showButtons,
    setShowButtons,
    allowInternalMessages,
    setAllowInternalMessages,
  };
}
