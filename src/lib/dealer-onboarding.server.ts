/* eslint-disable @typescript-eslint/no-explicit-any -- migration-backed onboarding */
import type { DealerOnboardingInput } from "./dealer-onboarding-contract";
/** Owner identity, business profile and feed attribution; no password or invitation email. */
export async function onboardDealer(admin: any, actor: string, data: DealerOnboardingInput) {
  const lookup = async () => {
    const r = await admin.rpc("dealer_onboarding_owner", {
      _email: data.ownerEmail,
      _actor: actor,
    });
    if (r.error) throw Error(r.error.message);
    return r.data as string | null;
  };
  let owner = await lookup();
  let created = false;
  if (!owner) {
    const r = await admin.auth.admin.createUser({
      email: data.ownerEmail,
      email_confirm: false,
      user_metadata: { display_name: data.displayName },
    });
    if (r.error || !r.data?.user) {
      owner = await lookup();
      if (!owner) throw Error("Could not prepare the dealership login.");
    } else {
      owner = r.data.user.id;
      created = true;
    }
  }
  if (created) {
    const profile = await admin
      .from("profiles")
      .upsert(
        { id: owner, display_name: data.displayName, avatar_url: data.logoUrl },
        { onConflict: "id" },
      );
    if (profile.error) throw Error("Could not prepare the dealership account profile.");
  }
  const r = await admin.rpc("complete_dealer_onboarding", {
    _owner: owner,
    _actor: actor,
    _profile: data,
    _source: data.sourceId ?? null,
  });
  if (r.error) throw Error(r.error.message);
  return {
    dealerId: r.data as string,
    ownerUserId: owner!,
    accountCreated: created,
    invitationSent: false,
  };
}
