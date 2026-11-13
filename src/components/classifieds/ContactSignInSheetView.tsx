import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
export function ContactSignInSheetView({
  open,
  onOpenChange,
  isJob = false,
  email,
  password,
  busy,
  onEmail,
  onPassword,
  handleSubmit,
  handleGoogle,
  signupUrl,
  forgotUrl,
  rememberContact,
  appleAction,
  error,
  title,
  description,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isJob?: boolean;
  email: string;
  password: string;
  busy: boolean;
  onEmail: (value: string) => void;
  onPassword: (value: string) => void;
  handleSubmit: (event: React.FormEvent) => void;
  handleGoogle: () => void;
  signupUrl: string;
  forgotUrl: string;
  rememberContact: () => void;
  appleAction?: React.ReactNode;
  error?: string;
  title?: string;
  description?: string;
}) {
  const inputClass =
    "mt-1.5 h-12 w-full rounded-2xl border border-input bg-background px-4 text-[16px] outline-none focus-visible:ring-2 focus-visible:ring-ring";

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="max-h-[92dvh] overflow-y-auto rounded-t-[24px] px-5 pb-[calc(env(safe-area-inset-bottom)+1.5rem)] pt-6"
      >
        <SheetHeader className="text-left">
          <SheetTitle className="text-[20px] font-bold tracking-tight">
            {title ?? (isJob ? "Sign in to apply" : "Sign in to message the seller")}
          </SheetTitle>
          <SheetDescription className="text-[13px]">
            {description ??
              "You'll come right back to this listing with your message ready to send."}
          </SheetDescription>
        </SheetHeader>

        {error && (
          <p role="alert" className="mt-3 text-sm text-destructive">
            {error}
          </p>
        )}
        <button
          type="button"
          onClick={handleGoogle}
          disabled={busy}
          className="mt-5 flex h-12 w-full items-center justify-center gap-2 rounded-full border border-input bg-background text-[14.5px] font-semibold disabled:opacity-60"
        >
          Continue with Google
        </button>

        {appleAction}
        <div className="my-4 flex items-center gap-3 text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
          <span className="h-px flex-1 bg-border" /> or <span className="h-px flex-1 bg-border" />
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <label className="block text-[13px] font-medium">
            Email
            <input
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(event) => onEmail(event.target.value)}
              className={inputClass}
            />
          </label>
          <label className="block text-[13px] font-medium">
            Password
            <input
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(event) => onPassword(event.target.value)}
              className={inputClass}
            />
          </label>
          <button
            type="submit"
            disabled={busy}
            className="h-12 w-full rounded-full bg-primary text-[14.5px] font-semibold text-primary-foreground disabled:opacity-60"
          >
            {busy ? "Signing in…" : "Sign in"}
          </button>
        </form>

        <div className="mt-4 flex items-center justify-between text-[13px]">
          <a href={signupUrl} onClick={rememberContact} className="font-semibold text-primary">
            Create an account
          </a>
          <a href={forgotUrl} onClick={rememberContact} className="text-muted-foreground">
            Forgot password?
          </a>
        </div>
      </SheetContent>
    </Sheet>
  );
}
