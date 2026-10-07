import { apiFetch } from "../services/api.js";
import { useState, useEffect, useRef } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import { promptForPushPermission } from "../services/oneSignal.js";
import UserOnlineStatus from "./UserOnlineStatus.jsx";

const CONVERSATION_READ_EVENT = "taskpanda:conversation-read";

function MenuIcon({ children, className = "h-4 w-4" }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      {children}
    </svg>
  );
}

function getProfileRejectionNoticeId(user) {
  if (user?.verificationStatus !== "rejected") return null;
  const reason = String(user.verificationRejectionReason || "").trim();
  const userId = String(user._id || user.id || user.email || "account");
  return `verification-rejected:${userId}:${reason}`;
}

export default function Header({ logoColor = "text-primary-700", showNav = false, activeTab = "Home", role = "client" }) {
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [unreadMessageCount, setUnreadMessageCount] = useState(0);
  const [notificationItems, setNotificationItems] = useState([]);
  const [broadcastNotificationItems, setBroadcastNotificationItems] = useState([]);
  const [verificationNotificationItems, setVerificationNotificationItems] = useState([]);
  const [dismissedNotificationIds, setDismissedNotificationIds] = useState([]);
  const [notificationError, setNotificationError] = useState("");
  const [pushPromptStatus, setPushPromptStatus] = useState("");
  const [rewardToast, setRewardToast] = useState(null);
  const navigate = useNavigate();
  const location = useLocation();
  const { isLoggedIn, role: authRole, user, firstName, logout, token, updateUser } = useAuth();
  const dismissedStorageKey = `taskpanda_dismissed_notifications_${authRole || role}_${user?._id || user?.id || user?.email || "guest"}`;
  const notifRef = useRef(null);
  const userRef = useRef(user);
  const shownRewardNotificationIds = useRef(new Set());

  const handleEnablePush = async () => {
    setPushPromptStatus("loading");
    try {
      setPushPromptStatus(await promptForPushPermission());
    } catch (error) {
      console.warn("OneSignal permission prompt failed:", error.message);
      setPushPromptStatus("error");
    }
  };

  const markVerificationNotificationRead = async (notification) => {
    try {
      const response = await apiFetch(`/api/v1/users/verification-notifications/${notification.notificationId}/read`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) {
        const result = await response.json().catch(() => ({}));
        throw new Error(result.message || `Could not update notification (HTTP ${response.status}).`);
      }
      setVerificationNotificationItems((current) => current.filter((item) => item.id !== notification.id));
    } catch (error) {
      console.warn("Verification notification update failed:", error.message);
    }
  };

  const dismissNotification = async (item) => {
    if (item.isSystemAnnouncement) {
      try {
        const broadcastId = String(item.id).replace(/^broadcast:/, "");
        const response = await apiFetch(`/api/broadcasts/${broadcastId}/dismiss`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(result.message || "Could not dismiss this system announcement.");
        setDismissedNotificationIds((current) => current.includes(item.id) ? current : [...current, item.id]);
        setBroadcastNotificationItems((current) => current.filter((notification) => notification.id !== item.id));
        setNotificationError("");
      } catch (error) {
        setNotificationError(error.message || "Could not dismiss this system announcement.");
      }
      return;
    }

    const fallbackId = item.title === "Identity verification rejected"
      ? getProfileRejectionNoticeId(user)
      : null;
    const idsToDismiss = [item.id, fallbackId].filter(Boolean);
    setDismissedNotificationIds((current) => {
      const next = [...new Set([...current, ...idsToDismiss])];
      try {
        localStorage.setItem(dismissedStorageKey, JSON.stringify(next));
      } catch {
        setNotificationError("This notification could not be saved on this device.");
      }
      return next;
    });
    if (item.isVerificationNotice && item.notificationId) {
      void markVerificationNotificationRead(item);
    }
  };

  useEffect(() => {
    let active = true;
    try {
      const savedIds = JSON.parse(localStorage.getItem(dismissedStorageKey) || "[]");
      const safeIds = Array.isArray(savedIds) ? savedIds.filter((id) => typeof id === "string") : [];
      setDismissedNotificationIds(safeIds);
      const legacyBroadcastIds = safeIds
        .filter((id) => id.startsWith("broadcast:"))
        .map((id) => id.slice("broadcast:".length));
      if (legacyBroadcastIds.length && token && ["client", "provider"].includes(authRole)) {
        void (async () => {
          try {
            const validBroadcastIds = legacyBroadcastIds.filter((id) => /^[a-f\d]{24}$/i.test(id));
            if (validBroadcastIds.length) {
              const response = await apiFetch("/api/broadcasts/dismissals", {
                method: "POST",
                headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                body: JSON.stringify({ broadcastIds: validBroadcastIds }),
              });
              const result = await response.json().catch(() => ({}));
              if (!response.ok) throw new Error(result.message || "Could not sync dismissed system announcements.");
            }
            if (!active) return;
            const migratedIds = new Set(legacyBroadcastIds.map((id) => `broadcast:${id}`));
            const remainingIds = safeIds.filter((id) => !migratedIds.has(id));
            try {
              localStorage.setItem(dismissedStorageKey, JSON.stringify(remainingIds));
            } catch {
              setNotificationError("Some notification settings could not be saved on this device.");
            }
            setDismissedNotificationIds(remainingIds);
            setBroadcastNotificationItems((current) => current.filter((item) => !migratedIds.has(item.id)));
          } catch (error) {
            if (active) setNotificationError(error.message || "Could not sync dismissed system announcements.");
          }
        })();
      }
    } catch {
      setDismissedNotificationIds([]);
    }
    return () => { active = false; };
  }, [authRole, dismissedStorageKey, token]);

  useEffect(() => {
    if (!showNav || !isLoggedIn || !token || !["client", "provider"].includes(authRole)) {
      setUnreadMessageCount(0);
      return undefined;
    }

    let active = true;
    let isFetching = false;
    let refreshAfterFetch = false;
    const loadUnreadMessageCount = async () => {
      if (isFetching) {
        refreshAfterFetch = true;
        return;
      }
      isFetching = true;
      try {
        const headers = { Authorization: `Bearer ${token}` };
        const [activeResponse, archivedResponse] = await Promise.all([
          apiFetch("/api/conversations", { headers }),
          apiFetch("/api/conversations?includeArchived=true", { headers }),
        ]);
        if (!activeResponse.ok || !archivedResponse.ok) return;
        const [activeData, archivedData] = await Promise.all([
          activeResponse.json(),
          archivedResponse.json(),
        ]);
        const conversations = [
          ...(Array.isArray(activeData.conversations) ? activeData.conversations : []),
          ...(Array.isArray(archivedData.conversations) ? archivedData.conversations : []),
        ];
        const totalUnread = conversations.reduce((total, conversation) => total + Math.max(0, Number(conversation.unreadCount) || 0), 0);
        const nextNotifications = conversations
          .filter((conversation) => conversation && Number(conversation.unreadCount) > 0)
          .sort((a, b) => new Date(b.lastMessageAt || b.updatedAt || 0) - new Date(a.lastMessageAt || a.updatedAt || 0))
          .map((conversation) => ({
            id: `${conversation.id}:${conversation.lastMessageAt || conversation.updatedAt || conversation.lastMessage || "latest"}`,
            title: conversation.task || "New message",
            detail: conversation.lastMessage || "You have a new message.",
            from: conversation.name || "TaskPanda",
            unreadCount: Math.max(0, Number(conversation.unreadCount) || 0),
            href: authRole === "provider" ? `/provider/messages?conversation=${conversation.id}` : `/client/messages?conversation=${conversation.id}`,
          }));
        if (active) {
          setUnreadMessageCount(totalUnread);
          setNotificationItems(nextNotifications);
        }
      } catch {
        // Keep the last known count when the conversation request is temporarily unavailable.
      } finally {
        isFetching = false;
        if (active && refreshAfterFetch) {
          refreshAfterFetch = false;
          void loadUnreadMessageCount();
        }
      }
    };

    const handleConversationRead = (event) => {
      const count = Math.max(0, Number(event.detail?.unreadCount) || 0);
      if (count > 0) setUnreadMessageCount((current) => Math.max(0, current - count));
      if (event.detail?.refresh) void loadUnreadMessageCount();
    };

    void loadUnreadMessageCount();
    const intervalId = window.setInterval(loadUnreadMessageCount, 8_000);
    window.addEventListener(CONVERSATION_READ_EVENT, handleConversationRead);
    return () => {
      active = false;
      window.clearInterval(intervalId);
      window.removeEventListener(CONVERSATION_READ_EVENT, handleConversationRead);
    };
  }, [authRole, isLoggedIn, showNav, token]);

  useEffect(() => {
    if (!showNav || !isLoggedIn || !token || !["client", "provider"].includes(authRole)) {
      setVerificationNotificationItems([]);
      return undefined;
    }

    let active = true;
    const getProfileRejectionNotice = () => {
      const id = getProfileRejectionNoticeId(user);
      if (!id) return null;
      const reason = String(user.verificationRejectionReason || "").trim();
      return {
        id,
        title: "Identity verification rejected",
        detail: reason
          ? `Your identity verification was rejected. ${reason}`
          : "Your identity verification was rejected. Open your profile to review the feedback.",
        from: "TaskPanda",
        unreadCount: 1,
        href: authRole === "provider" ? "/provider-profile" : "/profile",
        isVerificationNotice: true,
      };
    };
    const loadVerificationNotifications = async () => {
      try {
        const response = await apiFetch("/api/v1/users/verification-notifications", {
          headers: { Authorization: `Bearer ${token}` },
          cache: "no-store",
        });
        if (!response.ok) {
          throw new Error(`Verification notification request failed (HTTP ${response.status}).`);
        }
        const result = await response.json();
        if (!active) return;
        const notifications = (Array.isArray(result.notifications) ? result.notifications : []).map((notification) => ({
            id: `verification:${notification.id}`,
            notificationId: notification.id,
            title: notification.title,
            detail: notification.message,
            from: "TaskPanda",
            unreadCount: 1,
            href: notification.href,
            createdAt: notification.createdAt,
            isVerificationNotice: true,
          }));
        setVerificationNotificationItems(notifications);
      } catch (error) {
        if (active) {
          console.warn("Verification notifications refresh failed:", error.message);
          const rejectionNotice = getProfileRejectionNotice();
          const isDismissed = rejectionNotice
            && (dismissedNotificationIds.includes(rejectionNotice.id)
              || (() => {
                try {
                  const savedIds = JSON.parse(localStorage.getItem(dismissedStorageKey) || "[]");
                  return Array.isArray(savedIds) && savedIds.includes(rejectionNotice.id);
                } catch {
                  return false;
                }
              })());
          setVerificationNotificationItems(rejectionNotice && !isDismissed ? [rejectionNotice] : []);
        }
      }
    };

    void loadVerificationNotifications();
    const intervalId = window.setInterval(loadVerificationNotifications, 30_000);
    return () => {
      active = false;
      window.clearInterval(intervalId);
    };
  }, [
    authRole,
    isLoggedIn,
    showNav,
    token,
    dismissedStorageKey,
    dismissedNotificationIds,
    user?._id,
    user?.id,
    user?.verificationRejectionReason,
    user?.verificationStatus,
  ]);

  useEffect(() => {
    if (!showNav || !isLoggedIn || !token || !["client", "provider"].includes(authRole)) {
      setBroadcastNotificationItems([]);
      return undefined;
    }

    let active = true;
    const loadBroadcasts = async () => {
      try {
        const response = await apiFetch("/api/broadcasts", {
          headers: { Authorization: `Bearer ${token}` },
          cache: "no-store",
        });
        if (!response.ok) throw new Error(`Broadcast request failed (HTTP ${response.status}).`);
        const result = await response.json();
        if (!active) return;
        setBroadcastNotificationItems(
          (Array.isArray(result.broadcasts) ? result.broadcasts : []).map((broadcast) => ({
            id: `broadcast:${broadcast.id}`,
            title: broadcast.title,
            detail: broadcast.message,
            from: "TaskPanda",
            unreadCount: 1,
            href: authRole === "provider" ? "/provider-dashboard" : "/dashboard",
            createdAt: broadcast.createdAt,
            isSystemAnnouncement: true,
          }))
        );
      } catch (error) {
        if (active) console.warn("Broadcast notifications refresh failed:", error.message);
      }
    };

    void loadBroadcasts();
    const intervalId = window.setInterval(loadBroadcasts, 30_000);
    return () => {
      active = false;
      window.clearInterval(intervalId);
    };
  }, [authRole, isLoggedIn, showNav, token]);

  useEffect(() => {
    userRef.current = user;
  }, [user]);

  useEffect(() => {
    if (!isLoggedIn || authRole !== "client" || !token) {
      setRewardToast(null);
      return undefined;
    }

    let active = true;
    const shownIds = shownRewardNotificationIds.current;
    const loadRewards = async () => {
      try {
        const headers = { Authorization: `Bearer ${token}` };
        const [rewardsResponse, notificationResponse] = await Promise.all([
          apiFetch("/api/rewards", { headers }),
          apiFetch("/api/rewards/notifications", { headers }),
        ]);
        if (!rewardsResponse.ok || !notificationResponse.ok) {
          throw new Error("Could not refresh rewards.");
        }
        const [rewards, notificationData] = await Promise.all([
          rewardsResponse.json(),
          notificationResponse.json(),
        ]);
        if (!active) return;
        if (Array.isArray(rewards.vouchers)) {
          const currentUser = userRef.current || {};
          const currentSnapshot = JSON.stringify([
            currentUser.referralCode,
            currentUser.stampProgress,
            currentUser.completedBookings,
            (currentUser.vouchers || []).map((voucher) => [
              voucher.id || voucher._id,
              voucher.status,
              voucher.amount,
            ]),
          ]);
          const nextSnapshot = JSON.stringify([
            rewards.referralCode,
            rewards.stampProgress,
            rewards.completedBookings,
            rewards.vouchers.map((voucher) => [voucher.id, voucher.status, voucher.amount]),
          ]);
          if (currentSnapshot !== nextSnapshot) {
            const updatedRewards = {
              referralCode: rewards.referralCode,
              stampProgress: rewards.stampProgress,
              completedBookings: rewards.completedBookings,
              vouchers: rewards.vouchers,
            };
            userRef.current = { ...currentUser, ...updatedRewards };
            updateUser(updatedRewards);
          }
        }
        const notification = (notificationData.notifications || []).find((item) => !shownIds.has(item.id));
        if (!notification) return;
        shownIds.add(notification.id);
        setRewardToast(notification);
        const readResponse = await apiFetch(`/api/rewards/notifications/${notification.id}/read`, {
          method: "POST",
          headers,
        });
        if (!readResponse.ok) throw new Error("Could not mark the reward notification as read.");
      } catch (error) {
        if (active) console.warn("Reward refresh failed:", error.message);
      }
    };

    void loadRewards();
    const intervalId = window.setInterval(loadRewards, 8_000);
    return () => {
      active = false;
      window.clearInterval(intervalId);
    };
  }, [authRole, isLoggedIn, token, updateUser]);

  useEffect(() => {
    if (!rewardToast) return undefined;
    const timeoutId = window.setTimeout(() => setRewardToast(null), 7000);
    return () => window.clearTimeout(timeoutId);
  }, [rewardToast]);

  useEffect(() => {
    function handleClick(e) {
      if (notifRef.current && !notifRef.current.contains(e.target)) {
        setNotifOpen(false);
      }
    }
    if (notifOpen) {
      document.addEventListener("mousedown", handleClick);
      return () => document.removeEventListener("mousedown", handleClick);
    }
  }, [notifOpen]);

  useEffect(() => {
    setNotifOpen(false);
    setDropdownOpen(false);
    setMobileOpen(false);
  }, [location.pathname]);

  const clientNavLinks = [
    { label: "Home", icon: "🏠", path: "/dashboard" },
    { label: "Explore", icon: "🔍", path: "/explore" },
    { label: "Bookings", icon: "📋", path: "/bookings" },
    { label: "Messages", icon: "💬", path: "/client/messages" },
    { label: "Profile", icon: "👤", path: "/profile" },
  ];

  const providerNavLinks = [
    { label: "Home", icon: "🏠", path: "/provider-dashboard" },
    { label: "Bookings", icon: "📋", path: "/provider-bookings" },
    { label: "Messages", icon: "💬", path: "/provider/messages" },
    { label: "Profile", icon: "👤", path: "/provider-profile" },
  ];

  const adminNavLinks = [
    { label: "Dashboard", icon: "📊", path: "/admin?section=dashboard" },
    { label: "Users", icon: "👥", path: "/admin?section=users" },
    { label: "Verifications", icon: "⏳", path: "/admin?section=verifications" },
    { label: "Bookings", icon: "📋", path: "/admin?section=bookings" },
    { label: "Transactions", icon: "₱", path: "/admin?section=transactions" },
    { label: "Rewards", icon: "🎟️", path: "/admin?section=rewards" },
    { label: "Settings", icon: "⚙️", path: "/admin?section=settings" },
  ];

  const navLinks = role === "provider" ? providerNavLinks : role === "admin" ? adminNavLinks : clientNavLinks;

  const displayName = isLoggedIn ? (user?.fullName || user?.username || firstName || "User") : "Guest";
  const firstNameOnly = isLoggedIn ? (user?.fullName?.split(" ")[0] || user?.username || firstName || "User") : "Guest";
  const userEmail = user?.email || "your@email.com";
  const initials = displayName
    .split(/\s+/)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase() || "G";
  const accountRoleLabel = authRole === "provider" ? "Provider" : authRole === "admin" ? "Admin" : "Client";
  const dashboardPath = authRole === "provider" ? "/provider-dashboard" : authRole === "admin" ? "/admin?section=dashboard" : "/dashboard";
  const profilePath = authRole === "provider" ? "/provider-profile" : "/profile";
  const notificationList = [...verificationNotificationItems, ...broadcastNotificationItems, ...notificationItems];
  const visibleNotificationList = notificationList.filter((item) => !dismissedNotificationIds.includes(item.id));
  const unreadNotificationCount = visibleNotificationList.reduce((total, item) => total + Math.max(0, Number(item.unreadCount) || 0), 0);
  const totalNotificationCount = unreadNotificationCount;
  const availablePerkCount = (user?.vouchers || []).filter((voucher) =>
    voucher.status === "active" && (!voucher.expiresAt || new Date(voucher.expiresAt) > new Date())
  ).length;

  return (
    <header className="fixed inset-x-0 top-0 z-30 bg-white/80 backdrop-blur-md shadow-sm">
      <div className="container mx-auto flex h-16 items-center justify-between gap-2 px-4 sm:px-6 lg:px-8">
        <div className="flex min-w-0 shrink-0 items-center justify-start gap-3">
          <Link to="/" className={`text-2xl font-extrabold tracking-tight ${logoColor}`}>
            <span className="text-black">Task</span>Panda
          </Link>
        </div>

        {showNav && (
          <nav className="hidden min-w-0 flex-1 items-center justify-center gap-1 2xl:flex">
            {navLinks.map((link) => (
              <Link
                key={link.label}
                to={link.path}
                aria-label={link.label === "Messages" && unreadMessageCount > 0 ? `Messages, ${unreadMessageCount} unread` : link.label}
                className={`relative flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition ${
                  activeTab === link.label
                    ? "bg-gray-900 text-white"
                    : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
                }`}
              >
                <span>{link.icon}</span>
                <span>{link.label}</span>
                {link.label === "Messages" && unreadMessageCount > 0 && (
                  <span className="absolute -right-1 -top-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-600 px-1 text-[9px] font-bold leading-none text-white shadow-sm">
                    {unreadMessageCount > 99 ? "99+" : unreadMessageCount}
                  </span>
                )}
              </Link>
            ))}
          </nav>
        )}

        <div className="flex shrink-0 items-center justify-end gap-1 sm:gap-3 xl:gap-4">
          {showNav && isLoggedIn && authRole === "client" && (
            <Link
              to="/profile#rewards"
              aria-label={`Rewards${availablePerkCount ? `, ${availablePerkCount} available` : ""}`}
              title={availablePerkCount ? `${availablePerkCount} travel-fee ${availablePerkCount === 1 ? "voucher" : "vouchers"} available` : "Vouchers and rewards"}
              className="relative hidden h-11 w-11 shrink-0 items-center justify-center rounded-xl text-emerald-800 transition hover:bg-emerald-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700 sm:inline-flex"
            >
              <MenuIcon className="h-5 w-5">
                <path d="M5 7.5h14v13H5z" />
                <path d="M9 7.5V5.8a3 3 0 0 1 6 0v1.7M12 11v5m-2-2 2 2 2-2" />
              </MenuIcon>
              <span className="sr-only">Vouchers &amp; rewards</span>
              {availablePerkCount > 0 && (
                <span className="absolute -right-1 -top-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-emerald-700 px-1 text-[9px] font-bold leading-none text-white">
                  {availablePerkCount > 99 ? "99+" : availablePerkCount}
                </span>
              )}
            </Link>
          )}
          {showNav && (
            <button
              onClick={() => setMobileOpen(!mobileOpen)}
              className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg p-2 text-gray-600 hover:bg-gray-100 2xl:hidden"
              aria-label="Toggle navigation"
              aria-expanded={mobileOpen}
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-6 w-6">
                {mobileOpen ? (
                  <path fillRule="evenodd" d="M5.47 5.47a.75.75 0 011.06 0L12 10.94l5.47-5.47a.75.75 0 111.06 1.06L13.06 12l5.47 5.47a.75.75 0 11-1.06 1.06L12 13.06l-5.47 5.47a.75.75 0 01-1.06-1.06L10.94 12 5.47 6.53a.75.75 0 010-1.06z" clipRule="evenodd" />
                ) : (
                  <path fillRule="evenodd" d="M3 6a.75.75 0 01.75-.75h16.5a.75.75 0 010 1.5H3.75A.75.75 0 013 6zm0 6a.75.75 0 01.75-.75h16.5a.75.75 0 010 1.5H3.75a.75.75 0 01-.75-.75zm0 6a.75.75 0 01.75-.75h16.5a.75.75 0 010 1.5H3.75a.75.75 0 01-.75-.75z" clipRule="evenodd" />
                )}
              </svg>
            </button>
          )}
          {showNav && (
            <div className="relative" ref={notifRef}>
              <button
                onClick={() => {
                  if (!notifOpen) setDropdownOpen(false);
                  setNotifOpen(!notifOpen);
                }}
                className="relative inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg p-2 text-gray-600 hover:bg-gray-100"
                aria-label={`Notifications${totalNotificationCount > 0 ? `, ${totalNotificationCount} unread` : ""}`}
                aria-expanded={notifOpen}
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-6 w-6">
                  <path fillRule="evenodd" d="M12 2a6 6 0 00-6 6v3.586l-.707.707A1 1 0 006 15h12a1 1 0 00.707-1.707L18 11.586V8a6 6 0 00-6-6zM10 20a2 2 0 114 0a2 2 0 01-4 0z" clipRule="evenodd" />
                </svg>
                {totalNotificationCount > 0 && (
                  <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white">
                    {totalNotificationCount > 99 ? "99+" : totalNotificationCount}
                  </span>
                )}
              </button>
              {notifOpen && (
                <div className="absolute right-0 mt-2 w-72 rounded-xl border border-gray-100 bg-white shadow-lg">
                  <div className="border-b border-gray-100 px-4 py-3">
                    <h3 className="text-sm font-semibold text-gray-900">Notifications</h3>
                  </div>
                  {notificationError && <p role="alert" className="border-b border-red-100 bg-red-50 px-4 py-2 text-xs text-red-700">{notificationError}</p>}
                  <div className="max-h-64 overflow-y-auto">
                    {visibleNotificationList.length > 0 ? (
                      visibleNotificationList.map((item) => (
                        <div
                          key={item.id}
                          className={`flex items-start justify-between gap-2 border-b px-4 py-3 last:border-b-0 ${
                            item.isSystemAnnouncement
                              ? "border-blue-100 bg-blue-50/70 hover:bg-blue-50"
                              : "border-gray-50 hover:bg-gray-50"
                          }`}
                        >
                          <Link
                            to={item.href}
                            onClick={() => {
                              setNotifOpen(false);
                              setDropdownOpen(false);
                              if (item.isVerificationNotice) {
                                if (item.notificationId) void markVerificationNotificationRead(item);
                                else dismissNotification(item);
                              }
                            }}
                            className="flex min-w-0 flex-1 gap-3 rounded-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700"
                          >
                            {item.isSystemAnnouncement && (
                              <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-100 text-blue-800" aria-hidden="true">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
                                  <path d="M4 14.5V9.5a1.5 1.5 0 0 1 1.5-1.5H9l8-4v15l-8-4H5.5A1.5 1.5 0 0 1 4 14.5Z" />
                                  <path d="m8 15 1.5 5h3L11 16.5M20 8l2-1M20 16l2 1" />
                                </svg>
                              </span>
                            )}
                            <span className="block min-w-0 flex-1">
                              {item.isSystemAnnouncement ? (
                                <>
                                  <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                                    <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-blue-800">System announcement</span>
                                    {item.createdAt && (
                                      <time dateTime={item.createdAt} className="text-[10px] font-medium text-blue-800/75">
                                        {new Date(item.createdAt).toLocaleDateString()}
                                      </time>
                                    )}
                                  </span>
                                  <span className="mt-1 block wrap-break-word text-sm font-semibold leading-5 text-slate-950">{item.title}</span>
                                  <span className="mt-0.5 block wrap-break-word text-xs leading-5 text-slate-700">{item.detail}</span>
                                </>
                              ) : item.isVerificationNotice ? (
                                <>
                                  <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                                    <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-rose-800">Verification update</span>
                                    {item.createdAt && (
                                      <time dateTime={item.createdAt} className="text-[10px] font-medium text-slate-500">
                                        {new Date(item.createdAt).toLocaleDateString()}
                                      </time>
                                    )}
                                  </span>
                                  <span className="mt-1 block wrap-break-word text-sm font-semibold leading-5 text-slate-950">{item.title}</span>
                                  <span className="mt-0.5 block wrap-break-word text-xs leading-5 text-slate-700">{item.detail}</span>
                                </>
                              ) : (
                                <>
                                  <span className="block text-sm text-gray-700"><span className="font-semibold">{item.from}</span> · {item.title}</span>
                                  <span className="mt-0.5 block text-xs text-gray-500">{item.detail}</span>
                                </>
                              )}
                            </span>
                          </Link>
                          <button
                            type="button"
                            onClick={(event) => {
                              event.preventDefault();
                              event.stopPropagation();
                              dismissNotification(item);
                            }}
                            className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-gray-400 transition hover:bg-gray-200 hover:text-gray-600"
                            aria-label={`Dismiss notification from ${item.from}`}
                          >
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="h-4 w-4" aria-hidden="true">
                              <path d="M6 6l12 12M18 6L6 18" />
                            </svg>
                          </button>
                        </div>
                      ))
                    ) : (
                      <div className="px-4 py-6 text-center text-sm text-gray-500">No new notifications.</div>
                    )}
                  </div>
                  {isLoggedIn && import.meta.env.VITE_ONESIGNAL_APP_ID && (
                    <div className="border-t border-gray-100 px-4 py-3">
                      <button
                        type="button"
                        onClick={handleEnablePush}
                        disabled={pushPromptStatus === "loading"}
                        className="text-sm font-semibold text-primary-700 hover:text-primary-800 disabled:opacity-60"
                      >
                        {pushPromptStatus === "loading" ? "Opening browser prompt…" : "Enable browser alerts"}
                      </button>
                      {pushPromptStatus && pushPromptStatus !== "loading" && (
                        <p className="mt-1 text-xs text-gray-500" role="status">
                          {pushPromptStatus === "prompted" ? "Choose Allow in your browser to receive alerts." :
                            pushPromptStatus === "unsupported" ? "This browser does not support push alerts." :
                              pushPromptStatus === "unavailable" ? "Push alerts are not configured." :
                                "Could not open the browser alert prompt. Try again."}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
          {showNav && (
            <div className="relative">
              <button
                onClick={() => {
                  if (!dropdownOpen) setNotifOpen(false);
                  setDropdownOpen(!dropdownOpen);
                }}
                className="flex min-h-11 min-w-11 items-center justify-center gap-0 rounded-lg text-sm sm:gap-3"
                aria-expanded={dropdownOpen}
              >
                <span className="hidden whitespace-nowrap text-gray-600 2xl:inline">Good morning, {firstNameOnly}!</span>
                <span className="relative inline-flex h-8 w-8 shrink-0">
                  <span className={`avatar-shell h-8 w-8 border border-slate-200 bg-slate-100 text-sm font-bold ${user?.profileImage ? "bg-transparent" : "bg-primary-100 text-primary-700"}`}>
                    {user?.profileImage ? <img src={user.profileImage} alt={`${displayName} profile`} className="avatar-image" /> : displayName.charAt(0).toUpperCase()}
                  </span>
                  {isLoggedIn && <UserOnlineStatus lastActive={user?.lastActive} isOnline className="absolute -bottom-0.5 -right-0.5 z-10" />}
                </span>
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                  className="hidden h-4 w-4 text-gray-400 sm:block"
                >
                  <path
                    fillRule="evenodd"
                    d="M12.53 16.28a.75.75 0 01-1.06 0l-7.5-7.5a.75.75 0 011.06-1.06L12 14.69l6.97-6.97a.75.75 0 111.06 1.06l-7.5 7.5z"
                    clipRule="evenodd"
                  />
                </svg>
              </button>
              {dropdownOpen && (
                <div className="absolute right-0 mt-2 w-80 overflow-hidden rounded-2xl border border-slate-200/80 bg-white/95 shadow-[0_22px_44px_rgba(15,23,42,0.12)] backdrop-blur-xl">
                  <div className="border-b border-slate-200 bg-slate-50/90 px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className={`avatar-shell h-11 w-11 border border-slate-200 bg-slate-100 text-sm font-semibold text-white shadow-sm ${user?.profileImage ? "bg-transparent" : "bg-linear-to-br from-slate-800 to-slate-600"}`}>
                        {user?.profileImage ? <img src={user.profileImage} alt={`${displayName} profile`} className="avatar-image" /> : initials}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-slate-900">{displayName}</p>
                        <p className="truncate text-xs text-slate-500">{userEmail}</p>
                      </div>
                    </div>
                  </div>

                  <div className="p-2">
                    <div className="mb-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                      {accountRoleLabel} account
                    </div>

                    <nav className="space-y-1">
                      <Link
                        to={dashboardPath}
                        className="flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100"
                        onClick={() => setDropdownOpen(false)}
                      >
                        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
                          <MenuIcon className="h-4 w-4">
                            <path d="M3 11.5h7.5M3 6.5h18M3 16.5h12.5" />
                            <path d="M16.5 7.5V17l4.5-2.5-4.5-2.5Z" />
                          </MenuIcon>
                        </span>
                        Dashboard
                      </Link>
                      <Link
                        to={profilePath}
                        className="flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100"
                        onClick={() => setDropdownOpen(false)}
                      >
                        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
                          <MenuIcon className="h-4 w-4">
                            <path d="M12 12a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z" />
                            <path d="M4.5 19.5c1.5-3 4-4.5 7.5-4.5s6 1.5 7.5 4.5" />
                          </MenuIcon>
                        </span>
                        Profile
                      </Link>
                      <Link
                        to="/profile/edit"
                        className="flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100"
                        onClick={() => setDropdownOpen(false)}
                      >
                        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
                          <MenuIcon className="h-4 w-4">
                            <circle cx="12" cy="12" r="3" />
                            <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06A1.7 1.7 0 0 0 15 19.4a1.7 1.7 0 0 0-1 .7 1.7 1.7 0 0 0-.2 1.04V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-.2-1.04 1.7 1.7 0 0 0-1-.7 1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-.7-1 1.7 1.7 0 0 0-1.04-.2H2.75a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.04-.2 1.7 1.7 0 0 0 .7-1A1.7 1.7 0 0 0 4.6 7.27l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-.7 1.7 1.7 0 0 0 .2-1.04V2.75a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 .2 1.04 1.7 1.7 0 0 0 1 .7 1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.7 1.7 0 0 0 19.4 9a1.7 1.7 0 0 0 .7 1 1.7 1.7 0 0 0 1.04.2h.1a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.04.2 1.7 1.7 0 0 0-.7 1Z" />
                          </MenuIcon>
                        </span>
                        Settings
                      </Link>
                    </nav>
                  </div>

                  <div className="border-t border-slate-200 bg-slate-50 px-3 py-3">
                    <button
                      type="button"
                      onClick={() => {
                        setDropdownOpen(false);
                        logout();
                        navigate("/");
                      }}
                      className="flex w-full items-center justify-center gap-2 rounded-xl bg-red-50 px-3 py-2.5 text-sm font-semibold text-red-600 transition hover:bg-red-100"
                    >
                      <MenuIcon className="h-4 w-4">
                        <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                        <path d="M16 17l5-5-5-5" />
                        <path d="M21 12H9" />
                      </MenuIcon>
                      Sign Out
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
      {mobileOpen && showNav && (
        <div className="absolute inset-x-0 top-16 z-20 border-b border-gray-200 bg-white px-4 py-3 shadow-lg 2xl:hidden">
          <nav className="flex flex-col gap-1">
            {navLinks.map((link) => (
              <Link
                key={link.label}
                to={link.path}
                onClick={() => setMobileOpen(false)}
                aria-label={link.label === "Messages" && unreadMessageCount > 0 ? `Messages, ${unreadMessageCount} unread` : link.label}
                className={`flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium transition ${
                  activeTab === link.label
                    ? "bg-gray-900 text-white"
                    : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                }`}
              >
                <span className="text-base">{link.icon}</span>
                <span>{link.label}</span>
                {link.label === "Messages" && unreadMessageCount > 0 && (
                  <span className="ml-auto inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-rose-600 px-1.5 text-[10px] font-bold leading-none text-white">
                    {unreadMessageCount > 99 ? "99+" : unreadMessageCount}
                  </span>
                )}
              </Link>
            ))}
            {authRole === "client" && (
              <Link
                to="/profile#rewards"
                onClick={() => setMobileOpen(false)}
                aria-label={`Rewards wallet${availablePerkCount ? `, ${availablePerkCount} available` : ""}`}
                className="flex min-h-11 items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium text-gray-600 transition hover:bg-gray-50 hover:text-gray-900"
              >
                <MenuIcon className="h-5 w-5 text-emerald-800">
                  <path d="M5 7.5h14v13H5z" />
                  <path d="M9 7.5V5.8a3 3 0 0 1 6 0v1.7M12 11v5m-2-2 2 2 2-2" />
                </MenuIcon>
                <span>Rewards wallet</span>
                {availablePerkCount > 0 && (
                  <span className="ml-auto inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-emerald-700 px-1.5 text-[10px] font-bold leading-none text-white">
                    {availablePerkCount > 99 ? "99+" : availablePerkCount}
                  </span>
                )}
              </Link>
            )}
          </nav>
        </div>
      )}
      {rewardToast && (
        <div className="reward-toast fixed right-4 top-20 z-70 w-[min(22rem,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-emerald-200 bg-white px-4 py-4 shadow-[0_18px_48px_rgba(15,23,42,0.18)]" role="status" aria-live="polite">
          <div className="reward-toast-confetti" aria-hidden="true">
            {Array.from({ length: 9 }, (_, index) => (
              <span key={index} style={{ left: `${8 + ((index * 13) % 84)}%`, animationDelay: `${(index % 4) * 90}ms` }} />
            ))}
          </div>
          <div className="relative flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-800">
              <MenuIcon className="h-5 w-5"><path d="M5 7.5h14v13H5z" /><path d="M9 7.5V5.8a3 3 0 0 1 6 0v1.7M12 11v5m-2-2 2 2 2-2" /></MenuIcon>
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold text-slate-950">{rewardToast.title}</p>
              <p className="mt-1 text-xs leading-5 text-slate-600">{rewardToast.message}</p>
              <Link to="/profile#rewards" onClick={() => setRewardToast(null)} className="mt-2 inline-flex text-xs font-bold text-emerald-800 underline underline-offset-2">
                Open rewards wallet
              </Link>
            </div>
            <button type="button" onClick={() => setRewardToast(null)} className="dashboard-focus rounded-md p-1 text-slate-500 hover:bg-slate-100" aria-label="Dismiss reward notification">
              <MenuIcon className="h-4 w-4"><path d="m6 6 12 12M18 6 6 18" /></MenuIcon>
            </button>
          </div>
        </div>
      )}
    </header>
  );
}
