import { SignInButton } from "@clerk/react";

/**
 * The signed-out screen. Vendpire is an internal tool for one business, so this
 * is a door, not a marketing page: name, one line, sign in.
 */
export function LandingScreen() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-primary-900 px-4">
      <h1 className="font-heading text-5xl font-bold tracking-wide text-grey-50">
        Vend<span className="text-primary-300">pire</span>
      </h1>
      <p className="mt-3 text-center text-primary-200">
        Count. Fill. Reconcile. Every machine, every week.
      </p>
      <SignInButton mode="modal">
        <button
          type="button"
          className="mt-8 rounded-md bg-primary-500 px-6 py-2.5 font-medium text-white transition-colors hover:bg-primary-400"
        >
          Sign in
        </button>
      </SignInButton>
    </main>
  );
}
