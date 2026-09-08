import { redirect } from "next/navigation";

import { signUpAction } from "@/app/(auth)/actions";
import { AuthForm } from "@/components/auth/AuthForm";
import { getViewer } from "@/lib/auth";

export const metadata = { title: "Create an account" };

export default async function SignUpPage() {
  if (await getViewer()) redirect("/play/trees");

  return <AuthForm mode="sign-up" action={signUpAction} />;
}
