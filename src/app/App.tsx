import { RouterProvider, createBrowserRouter } from 'react-router-dom';
import { Providers } from './providers';
import { routeTree } from './routes';
import { useTheme } from '@/lib/hooks/use-theme';

const router = createBrowserRouter(routeTree);

export function App() {
  // Initialise theme on first paint (effect inside the hook applies the class)
  useTheme();
  return (
    <Providers>
      <RouterProvider router={router} />
    </Providers>
  );
}
