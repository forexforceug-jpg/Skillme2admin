import { useState } from "react";
import { useLogin } from "@refinedev/core";

export function Login() {
  const { mutate: login, isPending: isLoading } = useLogin();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    login({ email, password });
  };

  return (
    <div style={{
      minHeight: "100vh",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      background: "#061019",
      color: "#fff",
      fontFamily: "Inter, sans-serif",
    }}>
      <form onSubmit={onSubmit} style={{
        width: 360,
        padding: 32,
        background: "#0A1B2A",
        border: "1px solid rgba(255,255,255,0.1)",
        borderRadius: 12,
      }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, marginBottom: 8 }}>Skillme2 Admin</h1>
        <p style={{ fontSize: 13, color: "rgba(255,255,255,0.6)", marginBottom: 24 }}>
          Sign in with your admin account.
        </p>

        <label style={{ display: "block", marginBottom: 12 }}>
          <span style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.14em", color: "rgba(255,255,255,0.5)" }}>Email</span>
          <input
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            required
            style={{
              width: "100%", padding: "10px 12px", marginTop: 4,
              background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.15)",
              borderRadius: 8, color: "#fff", fontSize: 14,
            }}
          />
        </label>

        <label style={{ display: "block", marginBottom: 20 }}>
          <span style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.14em", color: "rgba(255,255,255,0.5)" }}>Password</span>
          <input
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            required
            style={{
              width: "100%", padding: "10px 12px", marginTop: 4,
              background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.15)",
              borderRadius: 8, color: "#fff", fontSize: 14,
            }}
          />
        </label>

        <button
          type="submit"
          disabled={isLoading}
          style={{
            width: "100%", padding: "12px",
            background: "#C9A24A", color: "#030A12",
            border: "none", borderRadius: 8,
            fontSize: 14, fontWeight: 700, cursor: "pointer",
          }}
        >
          {isLoading ? "Signing in…" : "Sign In"}
        </button>
      </form>
    </div>
  );
}