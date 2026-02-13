import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import './index.css';
import { Toaster } from '@/components/ui/toaster';
import PipelineListPage from '@/pages/PipelineListPage';
import PipelineEditorPage from '@/pages/PipelineEditorPage';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<PipelineListPage />} />
        <Route path="/pipelines/:id" element={<PipelineEditorPage />} />
      </Routes>
      <Toaster />
    </BrowserRouter>
  </React.StrictMode>,
);
