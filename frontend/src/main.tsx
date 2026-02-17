import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import './index.css';
import { Toaster } from '@/components/ui/toaster';
import WorkflowListPage from '@/pages/WorkflowListPage';
import WorkflowEditorPage from '@/pages/WorkflowEditorPage';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<WorkflowListPage />} />
        <Route path="/workflows/:id" element={<WorkflowEditorPage />} />
      </Routes>
      <Toaster />
    </BrowserRouter>
  </React.StrictMode>,
);
