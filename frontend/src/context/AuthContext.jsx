import { createContext, useContext, useState, useCallback, useEffect, useRef } from "react";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [role, setRole] = useState(null);
  const [isVerified, setIsVerified] = useState(false);
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const isVerifiedRef = useRef(false);

  useEffect(() => {
    const saved =
      localStorage.getItem("taskpanda_auth") ||
      sessionStorage.getItem("taskpanda_auth");
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        setIsLoggedIn(true);
        setRole(parsed.role || "client");
        setIsVerified(parsed.isVerified || false);
        isVerifiedRef.current = parsed.isVerified || false;
        setUser(parsed.user || null);
        setToken(parsed.token || null);
      } catch {
        localStorage.removeItem("taskpanda_auth");
        sessionStorage.removeItem("taskpanda_auth");
      }
    }
    setIsAuthLoading(false);
  }, []);

  const login = useCallback((userData, authToken, remember = false) => {
    const { role } = userData;
    const newUser = { ...userData, role };
    const newRole = role || "client";
    setIsLoggedIn(true);
    setRole(newRole);
    setUser(newUser);
    setToken(authToken || null);
    const authData = JSON.stringify({
      user: newUser,
      role: newRole,
      isVerified: isVerifiedRef.current,
      token: authToken || null,
    });
    const storage = remember ? localStorage : sessionStorage;
    const otherStorage = remember ? sessionStorage : localStorage;
    storage.setItem("taskpanda_auth", authData);
    otherStorage.removeItem("taskpanda_auth");
  }, []);

  const logout = useCallback(() => {
    setIsLoggedIn(false);
    setRole(null);
    setUser(null);
    setToken(null);
    setIsVerified(false);
    isVerifiedRef.current = false;
    localStorage.removeItem("taskpanda_auth");
    sessionStorage.removeItem("taskpanda_auth");
  }, []);

  const verify = useCallback((verifiedData) => {
    const newVerified = true;
    setIsVerified(newVerified);
    isVerifiedRef.current = newVerified;
    if (verifiedData?.user) setUser(verifiedData.user);
    if (verifiedData?.token) setToken(verifiedData.token);
    setIsLoggedIn(true);
    const currentUser = verifiedData?.user || user;
    const currentRole = currentUser?.role || role || "client";
    const currentToken = verifiedData?.token || token;
    localStorage.setItem(
      "taskpanda_auth",
      JSON.stringify({
        user: currentUser,
        role: currentRole,
        isVerified: true,
        token: currentToken,
      })
    );
  }, [user, role, token]);

  return (
    <AuthContext.Provider value={{ isLoggedIn, role, isVerified, user, token, isAuthLoading, login, logout, verify }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
