import { redirect } from "next/navigation";

import { signInAction } from "@/app/(auth)/actions";
import { AuthForm } from "@/components/auth/AuthForm";
import { getViewer } from "@/lib/auth";

export const metadata = { title: "Sign in" };

const CALLBACK_ERRORS: Record<string, string> = {
  missing_code: "That sign-in link was incomplete. Try again.",
  exchange_failed: "That sign-in link has expired. Try again.",
};

export default async function SignInPage({ searchParams }: PageProps<"/sign-in">) {
  if (await getViewer()) redirect("/play/trees");

  const { error } = await searchParams;
  const notice = typeof error === "string" ? CALLBACK_ERRORS[error] : undefined;

  return <AuthForm mode="sign-in" action={signInAction} notice={notice} />;
}
