import { Navigate, Route, Routes } from "react-router-dom";
import { LandingScreen } from "./screens/LandingScreen";
import { TokenExchangeScreen } from "./screens/TokenExchangeScreen";
import { OnboardingScreen } from "./screens/OnboardingScreen";
import { DashboardScreen } from "./screens/DashboardScreen";
import { ResultsScreen } from "./screens/ResultsScreen";

function App() {
  return (
    <Routes>
      <Route path="/" element={<LandingScreen />} />
      <Route path="/onboarding/:token" element={<TokenExchangeScreen />} />
      <Route path="/onboarding" element={<OnboardingScreen />} />
      <Route path="/dashboard" element={<DashboardScreen />} />
      <Route path="/results/:token" element={<ResultsScreen />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default App;
