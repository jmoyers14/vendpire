import { SignInButton } from "@clerk/react";
import { Button } from "../components/ui.tsx";

/**
 * The signed-out screen. Vendpire is an internal tool for one business, so this
 * is a door, not a marketing page: name, one line, sign in.
 */
export function LandingScreen() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-primary-900 px-4">
      <h1 className="font-display text-5xl font-extrabold tracking-wide text-gray-50">
        Vend<span className="text-primary-300">pire</span>
      </h1>
      <p className="mt-3 text-center text-primary-200">
        Count. Fill. Reconcile. Every machine, every week.
      </p>
      <SignInButton mode="modal">
        <Button className="mt-8">
          Sign in
        </Button>
      </SignInButton>
    </main>
  );
}
