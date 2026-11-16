import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "rolldown";
import React from "react";
import { render } from "@react-email/render";
import { decodeHTML } from "entities";

const root = process.cwd();
const output = resolve(root, ".output/signup-email");
await mkdir(output, { recursive: true });
await build({
  input: resolve(root, "src/lib/email-templates/signup.tsx"),
  platform: "node",
  external: ["react", "@react-email/components"],
  output: { file: resolve(output, "signup.mjs"), format: "esm" },
});
const { SignupEmail, SIGNUP_EMAIL_SUBJECT } = await import(
  pathToFileURL(resolve(output, "signup.mjs"))
);
const props = {
  siteName: "Bluebird Marketplace",
  siteUrl: "https://onbluebird.com",
  recipient: "reader@example.test",
};
const token = "{{ .ConfirmationURL }}";
const html = await render(React.createElement(SignupEmail, { ...props, confirmationUrl: token }));
assert.equal(
  html.split(token).length - 1,
  1,
  "Keep the exact Auth-generated action placeholder once",
);
assert(!/<(?:script|form|iframe)\b/i.test(html));
assert(Buffer.byteLength(html) < 20000, "Keep the transactional email small");
const confirmationUrl =
  "https://udxxfuticbxwiehoepeg.supabase.co/auth/v1/verify?token=synthetic-preview-only&type=signup&redirect_to=com.onbluebird.marketplace%3A%2F%2Fauth%2Fcallback";
const element = React.createElement(SignupEmail, { ...props, confirmationUrl });
const preview = await render(element);
const links = [...preview.matchAll(/href="([^"]+)"/g)].map((m) => decodeHTML(m[1]));
assert.equal(
  links.filter((url) => url === confirmationUrl).length,
  1,
  "Preserve the provider URL, token and mobile return destination exactly",
);
assert(
  links.every((url) =>
    [confirmationUrl, "https://onbluebird.com", "https://onbluebird.com/contact"].includes(url),
  ),
);
const text = await render(element, { plainText: true });
assert(text.includes(confirmationUrl), "Plain-text clients retain the original confirmation link");
assert(text.includes("ignore this email"));
await mkdir(resolve(root, "supabase/templates"), { recursive: true });
await writeFile(resolve(root, "supabase/templates/confirm-signup.html"), html + "\n");
await writeFile(
  resolve(root, "supabase/templates/confirm-signup.subject.txt"),
  SIGNUP_EMAIL_SUBJECT + "\n",
);
await writeFile(resolve(output, "preview.html"), preview);
await writeFile(resolve(output, "preview.txt"), text);
console.log(
  JSON.stringify({
    subject: SIGNUP_EMAIL_SUBJECT,
    bytes: Buffer.byteLength(html),
    confirmationPlaceholderPreserved: true,
    providerLinkPreserved: true,
    plainTextLinkPreserved: true,
    preview: resolve(output, "preview.html"),
  }),
);
