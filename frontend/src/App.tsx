/**
 * App.tsx — Root application component.
 */

import { RouterProvider } from 'react-router-dom';
import { router } from './routes';
import { ToastProvider } from './components/common/Toast';

export default function App() {
  return (
    <ToastProvider>
      <RouterProvider router={router} />
    </ToastProvider>
  );
}
