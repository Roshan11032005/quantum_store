/**
 * routes.tsx — Application routing configuration.
 */

import { lazy, Suspense } from 'react';
import { createBrowserRouter, Navigate } from 'react-router-dom';
import { AppShell } from './components/layout/AppShell';
import { useAuthStore } from './store/authStore';

// Lazy-load pages for code splitting
const Landing = lazy(() => import('./pages/Landing'));
const Register = lazy(() => import('./pages/Register'));
const Login = lazy(() => import('./pages/Login'));
const Dashboard = lazy(() => import('./pages/Dashboard'));
const Files = lazy(() => import('./pages/Files'));
const Upload = lazy(() => import('./pages/Upload'));
const FileDetail = lazy(() => import('./pages/FileDetail'));
const Keys = lazy(() => import('./pages/Keys'));
const Benchmarks = lazy(() => import('./pages/Benchmarks'));
const BenchmarkRun = lazy(() => import('./pages/BenchmarkRun'));
const Compare = lazy(() => import('./pages/Compare'));
const Algorithms = lazy(() => import('./pages/Algorithms'));
const About = lazy(() => import('./pages/About'));

function PageLoader() {
  return (
    <div className="flex items-center justify-center h-full min-h-[200px]">
      <div className="animate-spin w-8 h-8 border-2 border-primary border-t-transparent rounded-full" aria-label="Loading" />
    </div>
  );
}

function RequireAuth({ children }: { children: React.ReactNode }) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  return isAuthenticated ? <>{children}</> : <Navigate to="/login" replace />;
}

export const router = createBrowserRouter([
  {
    path: '/',
    element: <Suspense fallback={<PageLoader />}><Landing /></Suspense>,
  },
  {
    path: '/register',
    element: <Suspense fallback={<PageLoader />}><Register /></Suspense>,
  },
  {
    path: '/login',
    element: <Suspense fallback={<PageLoader />}><Login /></Suspense>,
  },
  {
    path: '/',
    element: <RequireAuth><AppShell /></RequireAuth>,
    children: [
      { path: 'dashboard', element: <Suspense fallback={<PageLoader />}><Dashboard /></Suspense> },
      { path: 'files', element: <Suspense fallback={<PageLoader />}><Files /></Suspense> },
      { path: 'files/:fileId', element: <Suspense fallback={<PageLoader />}><FileDetail /></Suspense> },
      { path: 'upload', element: <Suspense fallback={<PageLoader />}><Upload /></Suspense> },
      { path: 'keys', element: <Suspense fallback={<PageLoader />}><Keys /></Suspense> },
      { path: 'benchmarks', element: <Suspense fallback={<PageLoader />}><Benchmarks /></Suspense> },
      { path: 'benchmarks/run', element: <Suspense fallback={<PageLoader />}><BenchmarkRun /></Suspense> },
      { path: 'compare', element: <Suspense fallback={<PageLoader />}><Compare /></Suspense> },
      { path: 'algorithms', element: <Suspense fallback={<PageLoader />}><Algorithms /></Suspense> },
      { path: 'about', element: <Suspense fallback={<PageLoader />}><About /></Suspense> },
    ],
  },
  {
    path: '*',
    element: <Navigate to="/" replace />,
  },
]);

export { RequireAuth };
