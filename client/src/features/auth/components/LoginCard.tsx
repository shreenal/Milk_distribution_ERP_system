import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/shared/components/ui/card";

import LoginForm from "./LoginForm";

function LoginCard() {
  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle>Milk Distribution ERP</CardTitle>

        <CardDescription>
          Sign in to continue
        </CardDescription>
      </CardHeader>

      <LoginForm />
    </Card>
  );
}

export default LoginCard;