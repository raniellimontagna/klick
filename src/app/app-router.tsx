import { lazy, Suspense } from 'react';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { RouteLoader } from '@/shared/components/route-loader';
import { MainLayout } from '@/shared/layouts/main-layout';

// Lazy load route components for code splitting
const Home = lazy(() => import('@/features/home').then((m) => ({ default: m.Home })));
const History = lazy(() => import('@/features/history').then((m) => ({ default: m.History })));
const Stats = lazy(() => import('@/features/stats').then((m) => ({ default: m.Stats })));
const Training = lazy(() => import('@/features/training').then((m) => ({ default: m.Training })));
const Tutorial = lazy(() => import('@/features/tutorial').then((m) => ({ default: m.Tutorial })));
const Settings = lazy(() => import('@/features/settings').then((m) => ({ default: m.Settings })));
const Friends = lazy(() => import('@/features/friends').then((m) => ({ default: m.Friends })));
const Leaderboard = lazy(() =>
  import('@/features/leaderboard').then((m) => ({ default: m.Leaderboard })),
);
const Cube3D = lazy(() => import('@/features/cube-3d').then((m) => ({ default: m.Cube3D })));
const AuthCallback = lazy(() =>
  import('@/features/auth-callback').then((m) => ({ default: m.AuthCallback })),
);
const SharePage = lazy(() => import('@/features/share').then((m) => ({ default: m.SharePage })));

export default function AppRouter() {
  return (
    <BrowserRouter>
      <Routes>
        <Route
          path="/auth/callback"
          element={
            <Suspense fallback={<RouteLoader />}>
              <AuthCallback />
            </Suspense>
          }
        />
        <Route
          path="/share/:slug"
          element={
            <Suspense fallback={<RouteLoader />}>
              <SharePage />
            </Suspense>
          }
        />
        <Route path="/" element={<MainLayout />}>
          <Route
            index
            element={
              <Suspense fallback={<RouteLoader />}>
                <Home />
              </Suspense>
            }
          />
          <Route
            path="history"
            element={
              <Suspense fallback={<RouteLoader />}>
                <History />
              </Suspense>
            }
          />
          <Route
            path="stats"
            element={
              <Suspense fallback={<RouteLoader />}>
                <Stats />
              </Suspense>
            }
          />
          <Route
            path="training"
            element={
              <Suspense fallback={<RouteLoader />}>
                <Training />
              </Suspense>
            }
          />
          <Route
            path="tutorial"
            element={
              <Suspense fallback={<RouteLoader />}>
                <Tutorial />
              </Suspense>
            }
          />
          <Route
            path="settings"
            element={
              <Suspense fallback={<RouteLoader />}>
                <Settings />
              </Suspense>
            }
          />
          <Route
            path="friends"
            element={
              <Suspense fallback={<RouteLoader />}>
                <Friends />
              </Suspense>
            }
          />
          <Route
            path="leaderboard"
            element={
              <Suspense fallback={<RouteLoader />}>
                <Leaderboard />
              </Suspense>
            }
          />
          <Route
            path="cube-3d"
            element={
              <Suspense fallback={<RouteLoader />}>
                <Cube3D />
              </Suspense>
            }
          />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
