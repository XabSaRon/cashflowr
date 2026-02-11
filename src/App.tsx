import "./App.css";
import { BrowserRouter } from "react-router-dom";
import { AuthGate } from "./features/auth/components/AuthGate";
import { AppRoutes } from "./app/routes";

export default function App() {
  return (
    <AuthGate>
      {(user) => (
        <BrowserRouter>
          <AppRoutes user={user} />
        </BrowserRouter>
      )}
    </AuthGate>
  );
}
