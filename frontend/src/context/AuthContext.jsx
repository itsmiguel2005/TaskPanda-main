import { createContext, useContext, useState, useCallback, useEffect, useRef } from "react";
import { clearOneSignalIdentity, identifyOneSignalUser, initializeOneSignal } from "../services/oneSignal.js";

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
        const savedVerified = Boolean(parsed.isVerified ?? parsed.user?.isVerified);
        setIsVerified(savedVerified);
        isVerifiedRef.current = savedVerified;
        setUser(parsed.user || null);
        setToken(parsed.token || null);
      } catch {
        localStorage.removeItem("taskpanda_auth");
        sessionStorage.removeItem("taskpanda_auth");
      }
    }
    setIsAuthLoading(false);
  }, []);

  useEffect(() => {
    if (isAuthLoading) return undefined;
    let active = true;

    const syncOneSignalIdentity = async () => {
      const oneSignal = await initializeOneSignal();
      if (!active || !oneSignal) return;
      if (!isLoggedIn || !user) {
        if (oneSignal.User.externalId) await clearOneSignalIdentity();
        return;
      }
      await identifyOneSignalUser(user, role || user.role);
    };

    syncOneSignalIdentity().catch((error) => {
      console.warn("OneSignal identity sync failed:", error.message);
    });
    return () => {
      active = false;
    };
  }, [isAuthLoading, isLoggedIn, role, user]);

  const login = useCallback((userData, authToken, remember = false) => {
    const { role } = userData;
    const newUser = { ...userData, role };
    const newRole = role || "client";
    const newVerified = userData.isVerified === true;
    setIsLoggedIn(true);
    setRole(newRole);
    setIsVerified(newVerified);
    isVerifiedRef.current = newVerified;
    setUser(newUser);
    setToken(authToken || null);
    const authData = JSON.stringify({
      user: newUser,
      role: newRole,
      isVerified: newVerified,
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
    const newVerified = verifiedData?.isVerified === true;
    setIsVerified(newVerified);
    isVerifiedRef.current = newVerified;
    const updatedUser = verifiedData?.user ? { ...(user || {}), ...verifiedData.user } : user;
    if (updatedUser) setUser(updatedUser);
    if (verifiedData?.token) setToken(verifiedData.token);
    setIsLoggedIn(true);
    const currentRole = updatedUser?.role || role || "client";
    const currentToken = verifiedData?.token || token;
    const storage = localStorage.getItem("taskpanda_auth") ? localStorage : sessionStorage;
    storage.setItem(
      "taskpanda_auth",
      JSON.stringify({
        user: updatedUser,
        role: currentRole,
        isVerified: newVerified,
        token: currentToken,
      })
    );
  }, [user, role, token]);

  const updateUser = useCallback((userData) => {
    const storage = localStorage.getItem("taskpanda_auth") ? localStorage : sessionStorage;
    const saved = JSON.parse(storage.getItem("taskpanda_auth") || "{}");
    const updatedUser = { ...(saved.user || {}), ...userData, role: userData.role || role || saved.role };
    setUser(updatedUser);
    const isVerifiedUpdated = typeof userData.isVerified === "boolean";
    if (isVerifiedUpdated) {
      setIsVerified(userData.isVerified);
      isVerifiedRef.current = userData.isVerified;
    }
    storage.setItem("taskpanda_auth", JSON.stringify({
      ...saved,
      user: updatedUser,
      ...(isVerifiedUpdated ? { isVerified: userData.isVerified } : {}),
    }));
  }, [role]);

  const refreshProfile = useCallback(async () => {
    if (!token) return false;
    try {
      const response = await fetch("/api/profile", {
        cache: "no-store",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) return false;
      const data = await response.json();
      if (!data.user) return false;
      updateUser(data.user);
      return true;
    } catch {
      return false;
    }
  }, [token, updateUser]);

  useEffect(() => {
    if (isAuthLoading || !isLoggedIn || !token || !["client", "provider"].includes(role)) return;
    void refreshProfile();
  }, [isAuthLoading, isLoggedIn, token, role, refreshProfile]);

  useEffect(() => {
    if (isAuthLoading || !isLoggedIn || !token || !["client", "provider"].includes(role)) return undefined;
    const intervalId = window.setInterval(() => {
      void refreshProfile();
    }, 30_000);
    return () => window.clearInterval(intervalId);
  }, [isAuthLoading, isLoggedIn, token, role, refreshProfile]);

  return (
    <AuthContext.Provider value={{ isLoggedIn, role, isVerified, user, token, isAuthLoading, login, logout, verify, updateUser, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
