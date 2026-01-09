import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { MainLayout } from '@/shared/layouts/main-layout';
import { Home } from '@/features/home';
import { History } from '@/features/history';
import { Stats } from '@/features/stats';
import { Training } from '@/features/training';
import { Settings } from '@/features/settings';
import { Tutorial } from '@/features/tutorial';

export default function AppRouter() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<MainLayout />}>
          <Route index element={<Home />} />
          <Route path="history" element={<History />} />
          <Route path="stats" element={<Stats />} />
          <Route path="training" element={<Training />} />
          <Route path="tutorial" element={<Tutorial />} />
          <Route path="settings" element={<Settings />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
