/** A deliberate setup check to the signed-in operator's own verified mailbox. */
export async function sendDealerEmailTest(
  admin: {
    auth: {
      admin: {
        getUserById: (id: string) => Promise<{
          data: {
            user: {
              email?: string;
              email_confirmed_at?: string;
              app_metadata?: { managed_import?: boolean };
            } | null;
          };
          error: unknown;
        }>;
      };
    };
  },
  userId: string,
  send: (
    name: string,
    to: string,
    options: { templateData: Record<string, string>; idempotencyKey: string },
  ) => Promise<{ sent: boolean }>,
  testId: string,
) {
  const { data, error } = await admin.auth.admin.getUserById(userId);
  const user = data?.user;
  if (
    error ||
    !user?.email_confirmed_at ||
    !user.email?.includes("@") ||
    user.email.endsWith(".invalid") ||
    user.app_metadata?.managed_import
  ) {
    throw Error("Use your own verified Bluebird account to send a setup test.");
  }
  const result = await send("marketplace-message", user.email, {
    templateData: {
      itemName: "Bluebird email connection test",
      message: `This is a private setup check for Bluebird's notification emails. Test reference: ${testId}`,
      conversationPath: "/account?section=messages",
    },
    idempotencyKey: `dealer-email-test-${testId}`,
  });
  if (!result.sent) throw Error("The email provider did not accept this setup test.");
  return { accepted: true as const, testId };
}
