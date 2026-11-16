import type { MouseEventHandler } from "react";

/** Guidance also covers older Apple accounts with no stored revocation token.
 * This is optional provider cleanup, never a condition for deleting Bluebird data. */
export function AppleDeletionNotice({
  onClick,
}: {
  onClick?: MouseEventHandler<HTMLParagraphElement>;
}) {
  return (
    <p className="text-sm leading-relaxed text-muted-foreground" onClick={onClick}>
      If you used Sign in with Apple, also remove Bluebird from your Apple Account’s Sign in with
      Apple settings. Follow{" "}
      <a
        href="https://support.apple.com/en-us/102571"
        target="_blank"
        rel="noopener noreferrer"
        className="font-medium underline underline-offset-4"
      >
        Apple’s instructions
      </a>
      . Your Bluebird account deletion continues even if you don’t complete this step.
    </p>
  );
}
