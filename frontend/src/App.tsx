import { Routes, Route } from 'react-router-dom';
import Layout from './components/layout/Layout';
import DocumentsPage from './pages/DocumentsPage';
import UploadPage from './pages/UploadPage';
import DocumentDetailPage from './pages/DocumentDetailPage';
import QAChatPage from './pages/QAChatPage';
import SettingsPage from './pages/SettingsPage';

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<DocumentsPage />} />
        <Route path="/upload" element={<UploadPage />} />
        <Route path="/documents/:id" element={<DocumentDetailPage />} />
        <Route path="/documents/:id/chat" element={<QAChatPage />} />
        <Route path="/settings" element={<SettingsPage />} />
      </Route>
    </Routes>
  );
}
