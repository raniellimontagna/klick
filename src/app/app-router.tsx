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

export default function AppRouter() {
  return (
    <BrowserRouter>
      <Routes>
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
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
