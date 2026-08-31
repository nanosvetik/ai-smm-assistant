import { Navigate, Route, Routes } from "react-router-dom";
import { TokenExchangeScreen } from "./screens/TokenExchangeScreen";
import { OnboardingScreen } from "./screens/OnboardingScreen";

function App() {
  return (
    <Routes>
      <Route path="/onboarding/:token" element={<TokenExchangeScreen />} />
      <Route path="/onboarding" element={<OnboardingScreen />} />
      <Route path="*" element={<Navigate to="/onboarding" replace />} />
    </Routes>
  );
}

export default App;
