import { Refine, Authenticated } from "@refinedev/core";
import { RefineKbar, RefineKbarProvider } from "@refinedev/kbar";
import routerProvider, {
  NavigateToResource,
  UnsavedChangesNotifier,
  DocumentTitleHandler,
} from "@refinedev/react-router";
import { BrowserRouter, Routes, Route, Outlet } from "react-router";

import { dataProvider, liveProvider } from "@refinedev/supabase";
import { supabaseClient } from "./providers/supabase-client";
import { authProvider } from "./providers/auth";
import { accessControlProvider } from "./providers/accessControl";

import { Layout } from "./components/layout";
import { PlatformOperationsPage } from "./pages/platform-operations/list";
import { PlatformSettingsPage } from "./pages/platform-settings/list";
import { Login } from "./pages/login";
import { ProfilesList } from "./pages/profiles/list";
import { LessonsList } from "./pages/lessons/list";
import { BookingsList } from "./pages/bookings/list";
import { PayoutsList } from "./pages/payouts/list";
import { VerificationsList } from "./pages/verifications/list";
import { EscrowList } from "./pages/escrow/list";
import { MessagesList } from "./pages/messages/list";
import { ReviewsList } from "./pages/reviews/list";

import "./styles/admin.css";

function App() {
  return (
    <BrowserRouter>
      <RefineKbarProvider>
        <Refine
          dataProvider={dataProvider(supabaseClient)}
          liveProvider={liveProvider(supabaseClient)}
          authProvider={authProvider}
          accessControlProvider={accessControlProvider}
          routerProvider={routerProvider}
          resources={[
            { name: "platform_operations", list: "/platform-operations", meta: { label: "Platform Operations" } },
            { name: "platform_settings", list: "/platform-settings", meta: { label: "Platform Settings" } },
            { name: "profiles", list: "/profiles", meta: { label: "Users" } },
            { name: "lessons", list: "/lessons", meta: { label: "Lessons" } },
            { name: "bookings", list: "/bookings", meta: { label: "Bookings" } },
            { name: "escrow", list: "/escrow", meta: { label: "Escrow" } },
            { name: "payouts", list: "/payouts", meta: { label: "Payouts" } },
            { name: "verification_requests", list: "/verifications", meta: { label: "Verifications" } },
            { name: "messages", list: "/messages", meta: { label: "Messages" } },
            { name: "reviews", list: "/reviews", meta: { label: "Reviews" } },
          ]}
          options={{ syncWithLocation: true, warnWhenUnsavedChanges: true }}
        >
          <Routes>
            <Route
              element={
                <Authenticated key="authenticated" fallback={<Login />}>
                  <Layout>
                    <Outlet />
                  </Layout>
                </Authenticated>
              }
            >
              <Route index element={<NavigateToResource resource="platform_operations" />} />
              <Route path="/platform-operations" element={<PlatformOperationsPage />} />
              <Route path="/platform-settings" element={<PlatformSettingsPage />} />
              <Route path="/profiles" element={<ProfilesList />} />
              <Route path="/lessons" element={<LessonsList />} />
              <Route path="/bookings" element={<BookingsList />} />
              <Route path="/escrow" element={<EscrowList />} />
              <Route path="/payouts" element={<PayoutsList />} />
              <Route path="/verifications" element={<VerificationsList />} />
              <Route path="/messages" element={<MessagesList />} />
              <Route path="/reviews" element={<ReviewsList />} />
              <Route path="*" element={<NavigateToResource resource="platform_operations" />} />
            </Route>
          </Routes>

          <RefineKbar />
          <UnsavedChangesNotifier />
          <DocumentTitleHandler />
        </Refine>
      </RefineKbarProvider>
    </BrowserRouter>
  );
}

export default App;
