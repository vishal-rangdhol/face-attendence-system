import React, { useState, useEffect } from "react";
import { ScreenContainer } from "./src/components/ScreenContainer";
import { HomeScreen } from "./src/screens/HomeScreen";
import { RegisterScreen } from "./src/screens/RegisterScreen";
import { EnrollmentScreen, VerificationScreen, HistoryScreen } from "./src/screens/PlaceholderScreens";
import { UserProfile, ActiveScreen } from "./src/types";
import { storageService } from "./src/services/storage";

export default function App() {
  const [activeScreen, setActiveScreen] = useState<ActiveScreen>("home");
  const [user, setUser] = useState<UserProfile | null>(null);

  const loadUser = async () => {
    const stored = await storageService.getUserProfile();
    setUser(stored);
  };

  useEffect(() => {
    loadUser();
  }, []);

  const handleRegisterSuccess = (newUser: UserProfile) => {
    setUser(newUser);
    setActiveScreen("home");
  };

  return (
    <ScreenContainer>
      {activeScreen === "home" && (
        <HomeScreen
          onNavigate={(screen) => setActiveScreen(screen)}
          user={user}
          onRefreshUser={loadUser}
        />
      )}

      {activeScreen === "register" && (
        <RegisterScreen
          onSuccess={handleRegisterSuccess}
          onCancel={() => setActiveScreen("home")}
        />
      )}

      {activeScreen === "enroll" && (
        <EnrollmentScreen
          user={user}
          onBack={() => setActiveScreen("home")}
        />
      )}

      {activeScreen === "verify" && (
        <VerificationScreen
          user={user}
          onBack={() => setActiveScreen("home")}
        />
      )}

      {activeScreen === "history" && (
        <HistoryScreen
          user={user}
          onBack={() => setActiveScreen("home")}
        />
      )}
    </ScreenContainer>
  );
}
