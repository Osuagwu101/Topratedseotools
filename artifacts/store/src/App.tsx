import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { ClerkProvider, SignIn, SignUp, Show, useClerk } from "@clerk/react";
import { publishableKeyFromHost } from "@clerk/react/internal";
import { shadcn } from "@clerk/themes";
import { Switch, Route, useLocation, Router as WouterRouter, Redirect } from "wouter";
import { QueryClient, QueryClientProvider, QueryCache, useQueryClient } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { CurrencyProvider } from "@/context/currency";
import Home from "@/pages/home";
import ProductDetail from "@/pages/product";
import Checkout from "@/pages/checkout";
import Success from "@/pages/success";
import Dashboard from "@/pages/dashboard";
import AdminPanel from "@/pages/admin";
import NotFound from "@/pages/not-found";
import { setDeviceId, ApiError } from "@workspace/api-client-react";
import { PhoneOff } from "lucide-react";

// ── Device ID ────────────────────────────────────────────────────────────────
function getOrCreateDeviceId(): string {
  const key = "subshub_device_id";
  let id = localStorage.getItem(key);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(key, id);
  }
  return id;
}

setDeviceId(getOrCreateDeviceId());

// ── Suspension store (module-level, subscribed via useSyncExternalStore) ─────
let _isSuspended = false;
let _suspendedListeners: Array<() => void> = [];

function markSuspended() {
  if (_isSuspended) return;
  _isSuspended = true;
  _suspendedListeners.forEach((l) => l());
}

function subscribeToSuspension(listener: () => void) {
  _suspendedListeners.push(listener);
  return () => {
    _suspendedListeners = _suspendedListeners.filter((l) => l !== listener);
  };
}

function useIsSuspended() {
  return useSyncExternalStore(subscribeToSuspension, () => _isSuspended);
}

// ── QueryClient with global suspension detection ──────────────────────────────
const queryClient = new QueryClient({
  queryCache: new QueryCache({
    onError: (error) => {
      if (error instanceof ApiError && error.status === 403) {
        const data = error.data as Record<string, unknown> | null;
        if (data?.error === "account_suspended") markSuspended();
      }
    },
  }),
});

// ── Suspension screen ─────────────────────────────────────────────────────────
function SuspendedScreen() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-[#F7F8F9] px-6 text-center">
      <div className="bg-white rounded-3xl shadow-xl border border-gray-100 p-12 max-w-md w-full">
        <div className="w-16 h-16 rounded-2xl bg-red-100 flex items-center justify-center mx-auto mb-6">
          <PhoneOff className="w-8 h-8 text-red-500" />
        </div>
        <h1 className="text-2xl font-bold text-foreground mb-3">Account Suspended</h1>
        <p className="text-muted-foreground text-sm leading-relaxed mb-6">
          Your account has been suspended because it was accessed from too many devices.
          Please contact the administrator to restore access.
        </p>
        <a
          href="mailto:admin@subshub.com"
          className="inline-block bg-primary hover:bg-primary/90 text-white font-bold rounded-xl px-8 py-3 text-sm transition-colors"
        >
          Contact Administrator
        </a>
      </div>
    </div>
  );
}

const clerkPubKey = publishableKeyFromHost(
  window.location.hostname,
  import.meta.env.VITE_CLERK_PUBLISHABLE_KEY,
);

const clerkProxyUrl = import.meta.env.VITE_CLERK_PROXY_URL;

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

function stripBase(path: string): string {
  return basePath && path.startsWith(basePath)
    ? path.slice(basePath.length) || "/"
    : path;
}

if (!clerkPubKey) {
  throw new Error("Missing VITE_CLERK_PUBLISHABLE_KEY");
}

const clerkAppearance = {
  theme: shadcn,
  cssLayerName: "clerk",
  options: {
    logoPlacement: "inside" as const,
    logoLinkUrl: basePath || "/",
    logoImageUrl: `${window.location.origin}${basePath}/logo.svg`,
  },
  variables: {
    colorPrimary: "#24A45A",
    colorForeground: "#0f2217",
    colorMutedForeground: "#6b7280",
    colorDanger: "#ef4444",
    colorBackground: "#ffffff",
    colorInput: "#f9fafb",
    colorInputForeground: "#0f2217",
    colorNeutral: "#e5e7eb",
    fontFamily: "'Inter', ui-sans-serif, system-ui, sans-serif",
    borderRadius: "9px",
  },
  elements: {
    rootBox: "w-full flex justify-center",
    cardBox: "bg-white rounded-2xl w-[440px] max-w-full overflow-hidden shadow-xl border border-gray-100",
    card: "!shadow-none !border-0 !bg-transparent !rounded-none",
    footer: "!shadow-none !border-0 !bg-transparent !rounded-none",
    headerTitle: "text-foreground font-bold text-xl",
    headerSubtitle: "text-gray-500",
    socialButtonsBlockButtonText: "text-gray-700 font-medium",
    formFieldLabel: "text-gray-700 font-semibold text-sm",
    footerActionLink: "text-primary font-semibold hover:text-primary/80",
    footerActionText: "text-gray-500",
    dividerText: "text-gray-400",
    identityPreviewEditButton: "text-primary",
    formFieldSuccessText: "text-primary",
    alertText: "text-gray-700",
    logoBox: "flex justify-center py-2",
    logoImage: "h-10 w-auto",
    socialButtonsBlockButton: "border border-gray-200 hover:bg-gray-50 rounded-lg",
    formButtonPrimary: "bg-primary hover:bg-primary/90 text-white font-bold rounded-lg",
    formFieldInput: "border border-gray-200 rounded-lg bg-gray-50 text-gray-900 placeholder-gray-400 focus:border-primary focus:ring-primary",
    footerAction: "bg-gray-50 border-t border-gray-100",
    dividerLine: "bg-gray-200",
    alert: "border border-red-100 bg-red-50 rounded-lg",
    otpCodeFieldInput: "border border-gray-200 rounded-lg",
    formFieldRow: "",
    main: "",
  },
};

function ClerkQueryClientCacheInvalidator() {
  const { addListener } = useClerk();
  const qc = useQueryClient();
  const prevUserIdRef = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    const unsubscribe = addListener(({ user }) => {
      const userId = user?.id ?? null;
      if (prevUserIdRef.current !== undefined && prevUserIdRef.current !== userId) {
        qc.clear();
      }
      prevUserIdRef.current = userId;
    });
    return unsubscribe;
  }, [addListener, qc]);

  return null;
}

function SignInPage() {
  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-[#F7F8F9] px-4">
      <SignIn routing="path" path={`${basePath}/sign-in`} signUpUrl={`${basePath}/sign-up`} />
    </div>
  );
}

function SignUpPage() {
  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-[#F7F8F9] px-4">
      <SignUp routing="path" path={`${basePath}/sign-up`} signInUrl={`${basePath}/sign-in`} />
    </div>
  );
}

function ProtectedDashboard() {
  return (
    <>
      <Show when="signed-in">
        <Dashboard />
      </Show>
      <Show when="signed-out">
        <Redirect to="/" />
      </Show>
    </>
  );
}

function ProtectedCheckout() {
  return (
    <>
      <Show when="signed-in">
        <Checkout />
      </Show>
      <Show when="signed-out">
        <Redirect to="/sign-in" />
      </Show>
    </>
  );
}

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/dashboard" component={ProtectedDashboard} />
      <Route path="/products/:id" component={ProductDetail} />
      <Route path="/checkout" component={ProtectedCheckout} />
      <Route path="/success" component={Success} />
      <Route path="/sign-in/*?" component={SignInPage} />
      <Route path="/sign-up/*?" component={SignUpPage} />
      <Route path="/admin" component={AdminPanel} />
      <Route component={NotFound} />
    </Switch>
  );
}

function ClerkProviderWithRoutes() {
  const [, setLocation] = useLocation();
  const isSuspended = useIsSuspended();

  return (
    <CurrencyProvider>
    <ClerkProvider
      publishableKey={clerkPubKey}
      proxyUrl={clerkProxyUrl}
      appearance={clerkAppearance}
      signInUrl={`${basePath}/sign-in`}
      signUpUrl={`${basePath}/sign-up`}
      signInFallbackRedirectUrl={`${basePath}/dashboard`}
      signUpFallbackRedirectUrl={`${basePath}/dashboard`}
      localization={{
        signIn: {
          start: {
            title: "Welcome back",
            subtitle: "Sign in to access your Top Rated SEO Tools account",
          },
        },
        signUp: {
          start: {
            title: "Create your account",
            subtitle: "Get affordable access to premium tools",
          },
        },
      }}
      routerPush={(to) => setLocation(stripBase(to))}
      routerReplace={(to) => setLocation(stripBase(to), { replace: true })}
    >
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <ClerkQueryClientCacheInvalidator />
          {isSuspended ? <SuspendedScreen /> : <Router />}
          <Toaster />
        </TooltipProvider>
      </QueryClientProvider>
    </ClerkProvider>
    </CurrencyProvider>
  );
}

function App() {
  return (
    <WouterRouter base={basePath}>
      <ClerkProviderWithRoutes />
    </WouterRouter>
  );
}

export default App;
