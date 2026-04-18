import { redirect } from "next/navigation";
import LoginForm from "./LoginForm";

export default function LoginPage() {
  if (process.env.AUTH_DISABLED === "true") {
    redirect("/");
  }
  return <LoginForm />;
}
