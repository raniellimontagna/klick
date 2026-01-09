import { useTheme } from './shared/hooks';
import AppRouter from './AppRouter';

function App() {
  // Apply theme on mount
  useTheme();

  return <AppRouter />;
}

export default App;
