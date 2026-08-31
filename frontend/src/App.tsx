import { Navigate, Route, Routes } from "react-router-dom";
import { TokenExchangeScreen } from "./screens/TokenExchangeScreen";
import { OnboardingScreen } from "./screens/OnboardingScreen";
import { DashboardScreen } from "./screens/DashboardScreen";

function App() {
  return (
    <Routes>
      <Route path="/onboarding/:token" element={<TokenExchangeScreen />} />
      <Route path="/onboarding" element={<OnboardingScreen />} />
      <Route path="/dashboard" element={<DashboardScreen />} />
      <Route path="*" element={<Navigate to="/onboarding" replace />} />
    </Routes>
  );
}

export default App;
