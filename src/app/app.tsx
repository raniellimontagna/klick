import { useAuthBootstrap, useTheme } from '@/shared/hooks';
import AppRouter from './app-router';

function App() {
  // Apply theme on mount
  useTheme();
  useAuthBootstrap();

  return <AppRouter />;
}

export default App;
