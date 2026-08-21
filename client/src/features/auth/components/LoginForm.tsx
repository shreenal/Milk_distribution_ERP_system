import { useState } from "react";
import { useNavigate } from "react-router-dom";

import { useAuthStore } from "../store/authStore";

import { Button } from "@/shared/components/ui/button";
import {
  CardContent,
  CardFooter,
} from "@/shared/components/ui/card";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";

function LoginForm() {
  const navigate = useNavigate();
  const login = useAuthStore((state) => state.login);

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  async function handleLogin(
    e: React.FormEvent<HTMLFormElement>
  ) {
    e.preventDefault();

    try {
      setError("");

      await login(username, password);

      navigate("/masters");
    } catch {
      setError("Invalid username or password");
    }
  }

  return (
    <form onSubmit={handleLogin} className="contents">
      <CardContent>
        <div className="flex flex-col gap-6">
          <div className="grid gap-2">
            <Label htmlFor="username">
              Username
            </Label>

            <Input
              id="username"
              value={username}
              onChange={(e) =>
                setUsername(e.target.value)
              }
              placeholder="Enter username"
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="password">
              Password
            </Label>

            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) =>
                setPassword(e.target.value)
              }
              placeholder="Enter password"
            />
          </div>

          {error && (
            <p className="text-sm text-destructive">
              {error}
            </p>
          )}
        </div>
      </CardContent>

      <CardFooter>
        <Button type="submit" className="w-full">
          Login
        </Button>
      </CardFooter>
    </form>
  );
}

export default LoginForm;