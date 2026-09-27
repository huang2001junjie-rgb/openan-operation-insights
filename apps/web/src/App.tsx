import { Navigate, Route, Routes } from 'react-router-dom';
import { AppShell } from '@/components/layout/AppShell';
import { NotFoundPage } from '@/components/layout/NotFoundPage';
import { ActivityPage } from '@/pages/ActivityPage';
import { HomePage } from '@/pages/HomePage';
import { MeetingsPage } from '@/pages/MeetingsPage';
import { SummitsPage } from '@/pages/SummitsPage';
import { IdentityConsolePage } from '@/pages/IdentityConsolePage';

export default function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<HomePage />} />
        <Route path="/activity" element={<ActivityPage />} />
        <Route path="/summits" element={<SummitsPage />} />
        <Route path="/meetings" element={<MeetingsPage />} />
        <Route path="/admin/identity" element={<IdentityConsolePage />} />
        <Route path="/404" element={<NotFoundPage />} />
        <Route path="*" element={<Navigate to="/404" replace />} />
      </Route>
    </Routes>
  );
}
